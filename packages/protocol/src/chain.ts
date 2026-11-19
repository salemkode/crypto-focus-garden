import { binToHex, hexToBin, sha256 } from '@bitauth/libauth';
import { z } from 'zod';
import { GardenTransactionError, transactionId } from './index';

/**
 * Read and write access to Bitcoin Cash through any Electrum (Fulcrum) server.
 * The server is not trusted with anything that matters: every raw transaction is checked against
 * its id, and everything the app signs is rebuilt and validated from those raw transactions.
 */
export type ElectrumRequest = (method: string, ...params: (string | number | boolean)[]) => Promise<unknown>;

export interface ChainCoin {
  txid: string;
  vout: number;
  satoshis: bigint;
  /** Block height; 0 or less while unconfirmed. */
  height: number;
  token?: { category: string; amount: bigint; nft?: { capability: 'none' | 'mutable' | 'minting'; commitment: string } };
}

const txid = z.string().regex(/^[0-9a-f]{64}$/);
const unspent = z.array(z.object({
  tx_hash: txid,
  tx_pos: z.number().int().nonnegative(),
  height: z.number().int(),
  value: z.number().int().nonnegative(),
  token_data: z.object({
    category: txid,
    amount: z.union([z.string(), z.number()]),
    nft: z.object({ capability: z.enum(['none', 'mutable', 'minting']), commitment: z.string().regex(/^(?:[0-9a-f]{2})*$/) }).optional(),
  }).optional(),
}));
const history = z.array(z.object({ tx_hash: txid, height: z.number().int() }));

/** Electrum's script hash for a locking bytecode: sha256, byte-reversed, hex. */
export function scriptHashOf(lockingBytecode: string) {
  return binToHex(sha256.hash(hexToBin(lockingBytecode)).reverse());
}

/** Median time past of the 11 blocks ending at `height` (BIP113), from 80-byte headers. */
export function medianTimePast(headersHex: string) {
  const bytes = hexToBin(headersHex);
  if (bytes.length !== 80 * 11) throw new GardenTransactionError({ message: 'The server returned an incomplete header range.' });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const times = Array.from({ length: 11 }, (_, index) => view.getUint32(index * 80 + 68, true));
  return times.sort((a, b) => a - b)[5]!;
}

export type TransactionStatus = { state: 'confirmed'; height: number; confirmations: number } | { state: 'mempool' } | { state: 'missing' };

export function chainReader(request: ElectrumRequest) {
  const raws = new Map<string, string>();
  const mtps = new Map<number, number>();
  // Median times are cached only for blocks buried this deep below the last tip seen, so a chain
  // reorganization can never leave a replaced block's time in the cache.
  const SETTLED_DEPTH = 10;
  let lastTip = 0;
  const tipHeight = async () => {
    lastTip = z.object({ height: z.number().int().positive() }).parse(await request('blockchain.headers.get_tip')).height;
    return lastTip;
  };
  return {
    async listUnspent(lockingBytecode: string): Promise<ChainCoin[]> {
      const result = unspent.parse(await request('blockchain.scripthash.listunspent', scriptHashOf(lockingBytecode), 'include_tokens'));
      return result.map((coin) => ({
        txid: coin.tx_hash,
        vout: coin.tx_pos,
        satoshis: BigInt(coin.value),
        height: coin.height,
        ...(coin.token_data ? { token: { category: coin.token_data.category, amount: BigInt(coin.token_data.amount), ...(coin.token_data.nft ? { nft: coin.token_data.nft } : {}) } } : {}),
      }));
    },
    async history(lockingBytecode: string) {
      return history.parse(await request('blockchain.scripthash.get_history', scriptHashOf(lockingBytecode)))
        .map((entry) => ({ txid: entry.tx_hash, height: entry.height }));
    },
    /** Raw transaction, checked against its id. Confirmed transactions never change, so they are cached. */
    async rawTransaction(id: string) {
      const cached = raws.get(id);
      if (cached) return cached;
      const raw = z.string().regex(/^(?:[0-9a-f]{2})+$/).parse(await request('blockchain.transaction.get', txid.parse(id)));
      if (transactionId(raw) !== id) throw new GardenTransactionError({ message: 'The server returned a transaction that does not match its id.' });
      raws.set(id, raw);
      return raw;
    },
    tipHeight,
    async medianTimePast(height: number) {
      const cached = mtps.get(height);
      if (cached !== undefined) return cached;
      const result = z.object({ hex: z.string(), count: z.number().int() }).parse(await request('blockchain.block.headers', height - 10, 11));
      const value = medianTimePast(result.hex);
      if (lastTip > 0 && height <= lastTip - SETTLED_DEPTH) mtps.set(height, value);
      return value;
    },
    async status(id: string): Promise<TransactionStatus> {
      const entry = await request('blockchain.transaction.get', txid.parse(id), true).catch((cause: unknown) => {
        if (/no such|not found|unknown/i.test(String(cause instanceof Error ? cause.message : cause))) return null;
        throw cause;
      });
      if (entry === null) return { state: 'missing' };
      const parsed = z.object({ hex: z.string(), confirmations: z.number().int().optional(), blockhash: z.string().optional() }).parse(entry);
      if (transactionId(parsed.hex) !== id) throw new GardenTransactionError({ message: 'The server returned a transaction that does not match its id.' });
      if (!parsed.blockhash || !parsed.confirmations) return { state: 'mempool' };
      const tip = await tipHeight();
      return { state: 'confirmed', height: tip - parsed.confirmations + 1, confirmations: parsed.confirmations };
    },
    /** Sends a signed transaction. Resolves to the id, or rejects with the server's reason. */
    async broadcast(raw: string) {
      const id = txid.parse(await request('blockchain.transaction.broadcast', raw));
      if (id !== transactionId(raw)) throw new GardenTransactionError({ message: 'The server acknowledged a different transaction.' });
      return id;
    },
  };
}
export type ChainReader = ReturnType<typeof chainReader>;

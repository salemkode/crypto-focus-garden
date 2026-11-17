import { binToHex, cashAddressToLockingBytecode } from '@bitauth/libauth';
import { z } from 'zod';
import { GardenTransactionError, decode, transactionId } from '@focus-garden/protocol';
import type { NetworkProvider } from 'cashscript';

const hash = z.string().regex(/^[0-9a-f]{64}$/);
export const observationSchema = z.object({ state: z.enum(['missing', 'mempool', 'confirming', 'confirmed', 'conflicted']), confirmations: z.number().int().nonnegative(), blockHash: hash.nullable(), blockTime: z.number().int().nullable() });
export const nodeConfigSchema = z.object({
  url: z.url().refine((value) => { const url = new URL(value); return !url.username && !url.password && (url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))); }, 'RPC requires HTTPS or loopback HTTP; credentials belong in the secret file.'),
  genesisHash: hash, checkpointHeight: z.number().int().positive(), checkpointHash: hash,
  minimumConfirmations: z.number().int().min(2).max(144).default(6),
  maximumTipAgeSeconds: z.number().int().min(300).max(86400).default(21600),
});
const blockchain = z.object({ chain: z.literal('chip'), blocks: z.number().int().positive(), headers: z.number().int().positive(), bestblockhash: hash, initialblockdownload: z.literal(false), verificationprogress: z.number().min(0.9999), pruned: z.literal(false) });
const header = z.object({ hash, height: z.number().int().nonnegative(), confirmations: z.number().int(), time: z.number().int(), mediantime: z.number().int() });

export class NodeRpcError extends GardenTransactionError {
  constructor(readonly code: number, message: string) { super({ message }); }
}
export class ValidatedNodeProvider implements NetworkProvider {
  readonly network = 'chipnet' as const;
  readonly config;
  constructor(input: z.input<typeof nodeConfigSchema>, readonly rpc: (method: string, params: (string | number | boolean | string[])[]) => Promise<unknown>, readonly discovery: Pick<NetworkProvider, 'getUtxos'>, readonly writeRpc?: typeof rpc) { this.config = nodeConfigSchema.parse(input); }
  async ready() {
    const chain = blockchain.parse(await this.rpc('getblockchaininfo', []));
    if (chain.headers - chain.blocks > 2 || chain.blocks < this.config.checkpointHeight) throw new GardenTransactionError({ message: 'Validating node is not synchronized.' });
    const genesis = hash.parse(await this.rpc('getblockhash', [0]));
    if (genesis !== this.config.genesisHash) throw new GardenTransactionError({ message: 'Node genesis does not match the shared network agreement.' });
    const checkpoint = hash.parse(await this.rpc('getblockhash', [this.config.checkpointHeight]));
    if (checkpoint !== this.config.checkpointHash) throw new GardenTransactionError({ message: 'Node does not match the independently provisioned Chipnet checkpoint.' });
    const tip = header.parse(await this.rpc('getblockheader', [chain.bestblockhash, true]));
    const age = Math.floor(Date.now() / 1000) - tip.time;
    if (tip.hash !== chain.bestblockhash || tip.height !== chain.blocks || tip.confirmations < 1 || age > this.config.maximumTipAgeSeconds || age < -7200) throw new GardenTransactionError({ message: 'Node tip is stale or inconsistent.' });
    return { chain, tip };
  }
  async sameTip(expected: string) {
    const current = blockchain.parse(await this.rpc('getblockchaininfo', []));
    if (current.bestblockhash !== expected) throw new GardenTransactionError({ message: 'Chain changed during verification. Refresh status before proceeding.' });
  }
  async getBlockHeight() { return (await this.ready()).chain.blocks; }
  async getRawTransaction(txid: string) {
    const raw = z.string().regex(/^(?:[0-9a-f]{2})+$/).parse(await this.rpc('getrawtransaction', [hash.parse(txid), false]));
    if (transactionId(raw) !== txid) throw new GardenTransactionError({ message: 'Node transaction hash mismatch.' });
    return raw;
  }
  async inspectOutput(txid: string, vout: number) {
    const result = z.object({ bestblock: hash, confirmations: z.number().int().nonnegative(), value: z.number().nonnegative().max(21000000), scriptPubKey: z.object({ hex: z.string() }) }).nullable().parse(await this.rpc('gettxout', [hash.parse(txid), z.number().int().nonnegative().parse(vout), true]));
    if (!result) return null;
    const source = decode(await this.getRawTransaction(txid)).outputs[vout];
    if (!source || binToHex(source.lockingBytecode) !== result.scriptPubKey.hex || source.valueSatoshis !== BigInt(Math.round(result.value * 100000000))) throw new GardenTransactionError({ message: 'Node UTXO and transaction disagree.' });
    return { source, confirmations: result.confirmations, bestblock: result.bestblock };
  }
  async getUtxos(address: string) {
    const view = await this.ready();
    const script = cashAddressToLockingBytecode(address);
    if (typeof script === 'string' || !address.startsWith('bchtest:')) throw new GardenTransactionError({ message: 'Expected a Chipnet address.' });
    // Discovery can omit candidates (availability), but cannot invent spendable
    // value, tokens or confirmations: every candidate is resolved by our node.
    const candidates = await this.discovery.getUtxos(address);
    const verified = await Promise.all(candidates.map(async (candidate) => {
      const output = await this.inspectOutput(candidate.txid, candidate.vout);
      if (!output || output.confirmations < this.config.minimumConfirmations) return null;
      if (output.bestblock !== view.chain.bestblockhash || binToHex(output.source.lockingBytecode) !== binToHex(script.bytecode)) throw new GardenTransactionError({ message: 'Address discovery returned an unrelated or inconsistent output.' });
      const token = output.source.token;
      return { txid: candidate.txid, vout: candidate.vout, satoshis: output.source.valueSatoshis, ...(token ? { token: { category: binToHex(token.category), amount: token.amount, ...(token.nft ? { nft: { capability: token.nft.capability, commitment: binToHex(token.nft.commitment) } } : {}) } } : {}) };
    }));
    await this.sameTip(view.chain.bestblockhash);
    return verified.filter((entry) => entry !== null);
  }
  async observe(txid: string) {
    const view = await this.ready();
    const result = await this.rpc('getrawtransaction', [hash.parse(txid), true]).catch((cause: unknown) => {
      if (cause instanceof NodeRpcError && cause.code === -5) return null;
      throw cause;
    });
    if (result === null) return observationSchema.parse({ state: 'missing', confirmations: 0, blockHash: null, blockTime: null });
    const tx = z.object({ hex: z.string(), confirmations: z.number().int().default(0), blockhash: hash.optional(), in_active_chain: z.boolean().optional() }).parse(result);
    if (transactionId(tx.hex) !== txid) throw new GardenTransactionError({ message: 'Node receipt hash mismatch.' });
    if (tx.confirmations < 0 || tx.in_active_chain === false) return observationSchema.parse({ state: 'conflicted', confirmations: 0, blockHash: null, blockTime: null });
    if (!tx.blockhash || tx.confirmations === 0) return observationSchema.parse({ state: 'mempool', confirmations: 0, blockHash: null, blockTime: null });
    const block = header.parse(await this.rpc('getblockheader', [tx.blockhash, true]));
    const canonical = hash.parse(await this.rpc('getblockhash', [block.height]));
    await this.sameTip(view.chain.bestblockhash);
    if (block.hash !== tx.blockhash || canonical !== tx.blockhash || block.confirmations < 1) return observationSchema.parse({ state: 'conflicted', confirmations: 0, blockHash: null, blockTime: null });
    const confirmations = Math.min(tx.confirmations, block.confirmations, view.chain.blocks - block.height + 1);
    return observationSchema.parse({ state: confirmations >= this.config.minimumConfirmations ? 'confirmed' : 'confirming', confirmations, blockHash: tx.blockhash, blockTime: block.time * 1000 });
  }
  async maturity(txid: string, duration: number) {
    const observed = await this.observe(txid);
    if (observed.state !== 'confirmed' || !observed.blockHash) return 'confirming' as const;
    const view = await this.ready();
    const block = header.parse(await this.rpc('getblockheader', [observed.blockHash, true]));
    const canonical = hash.parse(await this.rpc('getblockhash', [block.height]));
    const previous = hash.parse(await this.rpc('getblockhash', [block.height - 1]));
    const origin = header.parse(await this.rpc('getblockheader', [previous, true]));
    await this.sameTip(view.chain.bestblockhash);
    if (canonical !== observed.blockHash || block.confirmations < this.config.minimumConfirmations) return 'confirming' as const;
    return view.tip.mediantime >= origin.mediantime + duration ? 'claimable' as const : 'locked' as const;
  }
  async holdsReward(txid: string, commitment: string, rewardScript: string) {
    const view = await this.ready();
    const output = await this.inspectOutput(txid, 0);
    await this.sameTip(view.chain.bestblockhash);
    if (!output) return false;
    if (output.bestblock !== view.chain.bestblockhash || output.confirmations < this.config.minimumConfirmations) throw new GardenTransactionError({ message: 'Reward ownership is not confirmed.' });
    return binToHex(output.source.lockingBytecode) === rewardScript && output.source.token?.nft?.capability === 'none' && binToHex(output.source.token.nft.commitment) === commitment;
  }
  async sendRawTransaction(raw: string) {
    await this.ready();
    const writer = this.writeRpc;
    if (!writer) throw new GardenTransactionError({ message: 'A bounded dedicated Chipnet test-write route has not been configured.' });
    const genesis = hash.parse(await writer('getblockhash', [0]));
    const checkpoint = hash.parse(await writer('getblockhash', [this.config.checkpointHeight]));
    if (genesis !== this.config.genesisHash || checkpoint !== this.config.checkpointHash) throw new GardenTransactionError({ message: 'Test-write route does not match the verified shared Chipnet environment.' });
    const accepted = z.array(z.object({ allowed: z.boolean() })).length(1).parse(await writer('testmempoolaccept', [[raw]]));
    if (!accepted[0].allowed) throw new GardenTransactionError({ message: 'The validating node rejected the transaction. Preserve the operation for investigation.' });
    return hash.parse(await writer('sendrawtransaction', [raw]));
  }
}

export function createNodeRpc(url: string, credentials: string) {
  const endpoint = nodeConfigSchema.shape.url.parse(url);
  z.string().min(3).refine((value) => value.includes(':') && !/[\r\n]/.test(value)).parse(credentials);
  return async function rpc(method: string, params: (string | number | boolean | string[])[]) {
    const response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { authorization: `Basic ${Buffer.from(credentials).toString('base64')}`, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '1.0', id: 'focus-garden', method, params }) });
    const payload = z.object({ result: z.unknown(), error: z.object({ code: z.number(), message: z.string() }).nullable() }).parse(await response.json());
    if (payload.error) throw new NodeRpcError(payload.error.code, 'Validating node RPC could not complete this request.');
    if (!response.ok) throw new GardenTransactionError({ message: 'Validating node is unavailable.' });
    return payload.result;
  };
}

import Storage from 'expo-sqlite/kv-store';
import { z } from 'zod';
import { GardenTransactionError, intentSchema, transactionId } from '@focus-garden/protocol';
import { buildRewardTransaction } from '@focus-garden/protocol/build';
import { signRewardTransaction } from '../features/rewards/signer';
import { parseRewardAddress } from '../wallet/address';
import { chain } from './chain';
import { DEPLOYMENT, NETWORK } from './network';

/**
 * Wallet actions go straight to Bitcoin Cash: the app builds the transaction from the chain, checks
 * it against the pinned contracts, signs it with the Focus Garden wallet and broadcasts it.
 *
 * The signed bytes are saved before they are sent. If the answer is lost (no network, app closed),
 * the same bytes are kept until the chain shows what happened: nothing is ever rebuilt or replaced
 * automatically, so one tap can never become two transactions.
 */
const pendingKey = `focusgarden.chain.operation.v1:${NETWORK}`;
const pendingSchema = z.object({
  wallet: z.string(),
  intent: intentSchema,
  startedAt: z.number().int().positive(),
  raw: z.string().regex(/^(?:[0-9a-f]{2})+$/),
  txid: z.string().regex(/^[0-9a-f]{64}$/),
  /** Outpoints this transaction spends; the app-wallet coin is the last one. */
  spends: z.array(z.string()).min(1),
});
export type SavedOperation = z.infer<typeof pendingSchema>;

export function savedOperation(): SavedOperation | null {
  const raw = Storage.getItemSync(pendingKey);
  return raw ? pendingSchema.parse(JSON.parse(raw)) : null;
}
function save(operation: SavedOperation) { Storage.setItemSync(pendingKey, JSON.stringify(operation)); }
function clear() { Storage.removeItemSync(pendingKey); }

export type OperationResult = { state: 'sent' | 'seen'; txid: string } | { state: 'pending'; txid: string } | { state: 'idle' } | { state: 'dropped'; txid: string };

/** True when the server explicitly refused the transaction (as opposed to not answering). */
function refused(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause);
  return /rule|reject|missing|conflict|dust|fee|spent|invalid|non-final|mempool/i.test(message);
}

/** Builds, checks, signs and sends one action. The user's tap (after its confirmation) is the approval. */
export async function submit(wallet: string, requested: z.input<typeof intentSchema>): Promise<OperationResult> {
  if (savedOperation()) throw new GardenTransactionError({ message: 'Check the unfinished transaction before starting another.' });
  const intent = intentSchema.parse(requested);
  const startedAt = Math.floor(Date.now() / 1000);
  const built = await buildRewardTransaction({ intent, wallet, deployment: DEPLOYMENT, chain, nowSeconds: startedAt });
  const raw = await signRewardTransaction(wallet, intent, built.prepared, startedAt);
  const operation = { wallet, intent, startedAt, raw, txid: transactionId(raw), spends: built.spends };
  save(operation);
  return send(operation);
}

async function send(operation: SavedOperation): Promise<OperationResult> {
  try {
    await chain.broadcast(operation.raw);
    clear();
    return { state: 'sent', txid: operation.txid };
  } catch (cause) {
    if (!refused(cause)) return { state: 'pending', txid: operation.txid };
    // A refusal can also mean it is already in. Only a transaction the chain does not have is dropped.
    const status = await chain.status(operation.txid).catch(() => null);
    if (status && status.state !== 'missing') { clear(); return { state: 'seen', txid: operation.txid }; }
    if (status) {
      clear();
      throw new GardenTransactionError({ message: `Bitcoin Cash refused this transaction, so nothing was sent: ${cause instanceof Error ? cause.message : String(cause)}` });
    }
    return { state: 'pending', txid: operation.txid };
  }
}

/**
 * Settles the saved transaction from what the chain shows. Seen: done. Its app-wallet coin spent by
 * something else: it can never confirm, so it is dropped. Otherwise it stays, to be sent again as is.
 */
export async function checkSaved(): Promise<OperationResult> {
  const saved = savedOperation();
  if (!saved) return { state: 'idle' };
  const status = await chain.status(saved.txid);
  if (status.state !== 'missing') { clear(); return { state: 'seen', txid: saved.txid }; }
  const [txid, vout] = saved.spends.at(-1)!.split(':');
  const coins = await chain.listUnspent(parseRewardAddress(saved.wallet).lockingBytecode);
  if (!coins.some((coin) => coin.txid === txid && coin.vout === Number(vout))) { clear(); return { state: 'dropped', txid: saved.txid }; }
  return { state: 'pending', txid: saved.txid };
}

/** Sends the exact saved bytes again. Never a new or different transaction. */
export async function resendSaved(): Promise<OperationResult> {
  const saved = savedOperation();
  if (!saved) return { state: 'idle' };
  return send(saved);
}

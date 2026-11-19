import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import { z } from 'zod';
import { recoverableOperationSchema, restoreOperationRecord } from '@focus-garden/protocol/recovery';
import * as Data from 'effect/Data';

import { GardenTransactionError, chainIdentitySchema, intentSchema, preparedSchema } from '@focus-garden/protocol';
import { resolveGardenEndpoint } from './endpoint';
import { proveAppWallet, signRewardTransaction } from '../features/rewards/signer';

class GardenRequestError extends Data.TaggedError('GardenRequestError')<{ message: string; recorded?: boolean }> {}

const credentialKey = 'focusgarden.service.credential.v1';
const pendingKey = 'focusgarden.service.operation.v1';
const operation = z.object({ id: z.string().uuid(), key: z.string().uuid(), state: z.enum(['reserved', 'prepared', 'pending', 'confirming', 'seen', 'cancelled']), payload: z.string().nullable(), txid: z.string().nullable(), confirmations: z.number().int().nonnegative().optional(), confirmedAt: z.number().nullable().optional() });
const pendingSchema = z.object({ account: z.string().optional(), startedAt: z.number().int().positive(), wallet: z.string(), key: z.string().uuid(), intent: intentSchema.optional(), creditAction: z.enum(['plant', 'claim', 'merge', 'register']).optional(), id: z.string().uuid().optional(), raw: z.string().optional() });
export async function rpc(body: object) {
  const endpoint = resolveGardenEndpoint({ configured: process.env.EXPO_PUBLIC_GARDEN_API_URL, development: __DEV__, allowLocalTestHttp: process.env.EXPO_PUBLIC_GARDEN_LOCAL_TEST_HTTP === '1' });
  const token = await SecureStore.getItemAsync(credentialKey);
  if (!token) throw new GardenTransactionError({ message: 'Save your service access token in Wallet first.' });
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/v1/rpc`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const data: unknown = await response.json();
  if (!response.ok) {
    const error = z.object({ error: z.string(), recorded: z.boolean().optional() }).safeParse(data);
    throw new GardenRequestError({ message: error.success ? error.data.error : 'Service request failed. Check the saved operation before trying again.', recorded: error.success ? error.data.recorded : undefined });
  }
  return data;
}
export async function saveServiceCredential(token: string) {

  const parsed = z.string().regex(/^[0-9a-f]{64}$/).safeParse(token.trim());
  if (!parsed.success) throw new GardenTransactionError({ message: 'Use the 64-character access token issued for your account.' });
  const saved = savedOperation();
  if (saved) {
    const endpoint = resolveGardenEndpoint({ configured: process.env.EXPO_PUBLIC_GARDEN_API_URL, development: __DEV__, allowLocalTestHttp: process.env.EXPO_PUBLIC_GARDEN_LOCAL_TEST_HTTP === '1' });
    const response = await fetch(`${endpoint.replace(/\/$/, '')}/v1/rpc`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${parsed.data}` }, body: JSON.stringify({ method: 'whoami' }), signal: AbortSignal.timeout(15000) });
    const identity = z.object({ account: z.string() }).parse(await response.json());
    if (!response.ok || !saved.account || identity.account !== saved.account) throw new GardenTransactionError({ message: 'A pending operation can only use a rotated credential for its original account.' });
  }
  await SecureStore.setItemAsync(credentialKey, parsed.data, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}
export function savedOperation() {
  const raw = Storage.getItemSync(pendingKey);
  return raw ? pendingSchema.parse(JSON.parse(raw)) : null;
}
export async function verifyWallet(wallet: string) {
  const identity = z.object({ account: z.string(), minimumConfirmations: z.number().int().min(2), network: z.literal('chipnet'), category: z.string(), chainIdentity: chainIdentitySchema }).parse(await rpc({ method: 'whoami' }));
  const minimum = Number(process.env.EXPO_PUBLIC_GARDEN_MIN_CONFIRMATIONS ?? '6');
  if (!Number.isInteger(minimum) || minimum < 2 || identity.minimumConfirmations < minimum) throw new GardenTransactionError({ message: 'Service confirmation policy is weaker than this build requires.' });
  const expected = chainIdentitySchema.safeParse({ genesisHash: process.env.EXPO_PUBLIC_GARDEN_GENESIS_HASH, checkpointHeight: Number(process.env.EXPO_PUBLIC_GARDEN_CHECKPOINT_HEIGHT), checkpointHash: process.env.EXPO_PUBLIC_GARDEN_CHECKPOINT_HASH });
  if (!expected.success || identity.chainIdentity.genesisHash !== expected.data.genesisHash || identity.chainIdentity.checkpointHash !== expected.data.checkpointHash || identity.chainIdentity.checkpointHeight !== expected.data.checkpointHeight || identity.category !== process.env.EXPO_PUBLIC_GARDEN_CATEGORY) throw new GardenTransactionError({ message: 'This service does not match the Chipnet checkpoint and garden configured for this build.' });
  const challenge = z.object({ account: z.string(), nonce: z.string().uuid() }).parse(await rpc({ method: 'challenge', wallet }));
  const unlockingBytecode = await proveAppWallet(wallet, challenge.account, challenge.nonce);
  z.object({ state: z.literal('verified') }).parse(await rpc({ method: 'prove', wallet, nonce: challenge.nonce, unlockingBytecode }));
  return challenge.account;
}
export async function recoverOperation(wallet?: string) {
  const local = savedOperation();
  const restored = !local && wallet ? await (async () => {
    const records = z.object({ operations: z.array(recoverableOperationSchema) }).parse(await rpc({ method: 'recover', wallet }));
    const requests = records.operations.map((entry) => restoreOperationRecord(entry, wallet)).filter((entry) => entry !== null);
    if (requests.length > 1) throw new GardenTransactionError({ message: 'Multiple unresolved wallet operations need service reconciliation. No request was signed or replaced.' });
    return requests[0] ?? null;
  })() : null;
  if (restored) Storage.setItemSync(pendingKey, JSON.stringify(restored));
  const saved = local ?? restored;
  if (!saved) return { state: 'idle' as const };
  const response = z.object({ operations: z.array(operation) }).parse(await rpc({ method: 'recover', key: saved.key }));
  const found = response.operations.find((entry) => entry.key === saved.key);
  if (!found) return { state: 'unrecorded' as const };
  const current = operation.parse(await rpc({ method: 'reconcile', id: found.id }));
  if (current.state === 'seen') {
    Storage.removeItemSync(pendingKey);
    return { state: 'seen' as const, txid: current.txid };
  }
  Storage.setItemSync(pendingKey, JSON.stringify({ ...saved, id: current.id }));
  return current;
}
export async function beginOperation(wallet: string, intent: z.input<typeof intentSchema> | 'credit-plant' | 'credit-claim' | 'credit-merge' | 'credit-register') {
  if (savedOperation()) throw new GardenTransactionError({ message: 'Recover the saved operation before starting another.' });
  if (typeof intent !== 'string' && !intentSchema.safeParse(intent).success) throw new GardenTransactionError({ message: 'Set a valid external reward address, and pick a tree whose lock rule this session meets.' });
  const account = await verifyWallet(wallet);
  await recoverOperation(wallet);
  if (savedOperation()) throw new GardenTransactionError({ message: 'An existing operation was recovered from the service. Check its saved status before starting another.' });
  const key = crypto.randomUUID();
  const startedAt = Math.floor(Date.now() / 1000);
  const credit = typeof intent === 'string';
  Storage.setItemSync(pendingKey, JSON.stringify({ account, wallet, key, startedAt, ...(credit ? { creditAction: creditActionOf(intent) } : { intent }) }));
  const result = await (async () => {
    try {   return await rpc(credit ? { method: 'credit', wallet, key, action: creditActionOf(intent) } : { method: 'prepare', wallet, key, intent }); }
    catch (cause) {
      if (cause instanceof GardenRequestError && cause.recorded === false) Storage.removeItemSync(pendingKey);
      throw cause;
    }
  })();
  const funded = z.object({ state: z.literal('funded') }).safeParse(result);
  if (funded.success) { Storage.removeItemSync(pendingKey); return funded.data; }
  const current = operation.parse(result);
  if (current.state === 'seen') Storage.removeItemSync(pendingKey);
  else Storage.setItemSync(pendingKey, JSON.stringify({ account, wallet, key, startedAt, creditAction: credit ? creditActionOf(intent) : undefined, intent: credit ? undefined : intent, id: current.id }));
  return current;
}
function creditActionOf(intent: 'credit-plant' | 'credit-claim' | 'credit-merge' | 'credit-register') {
  return intent === 'credit-plant' ? 'plant' as const : intent === 'credit-merge' ? 'merge' as const : 'claim' as const;
}
export async function finishPreparedOperation() {
  const saved = savedOperation();
  if (!saved?.id || !saved.intent) throw new GardenTransactionError({ message: 'This operation needs status recovery, not another signature.' });
  const current = operation.parse(await rpc({ method: 'reconcile', id: saved.id }));
  if (current.state !== 'prepared' || !current.payload) throw new GardenTransactionError({ message: 'The saved operation is not ready for signing.' });
  const prepared = preparedSchema.parse(JSON.parse(current.payload));
  if (prepared.id !== saved.id) throw new GardenTransactionError({ message: 'Saved operation identifier mismatch.' });
  const raw = saved.raw ?? await signRewardTransaction(saved.wallet, saved.intent, prepared, saved.startedAt);
  // Save before the network write. Reloads can only reconcile this tx, never
  // automatically sign or broadcast a replacement after an ambiguous response.
  Storage.setItemSync(pendingKey, JSON.stringify({ ...saved, raw }));
  const result = operation.parse(await rpc({ method: 'submit', id: saved.id, raw }));
  if (result.state === 'seen') Storage.removeItemSync(pendingKey);
  return result;
}

// Explicit user recovery of the same request and idempotency key; never a
// background retry and never a replacement for a recorded/signed transaction.
export async function resumeSavedRequest() {
  const saved = savedOperation();
  if (!saved || saved.id || saved.raw) throw new GardenTransactionError({ message: 'Check the recorded operation status instead.' });
  const result = await rpc(saved.intent ? { method: 'prepare', wallet: saved.wallet, key: saved.key, intent: saved.intent } : { method: 'credit', wallet: saved.wallet, key: saved.key, action: saved.creditAction });
  const funded = z.object({ state: z.literal('funded') }).safeParse(result);
  if (funded.success) { Storage.removeItemSync(pendingKey); return funded.data; }
  const current = operation.parse(result);
  if (current.state === 'seen') Storage.removeItemSync(pendingKey);
  else Storage.setItemSync(pendingKey, JSON.stringify({ ...saved, id: current.id }));
  return current;
}

export async function rebroadcastSaved() {
  const saved = savedOperation();
  if (!saved?.id) throw new GardenTransactionError({ message: 'Recover the saved operation first.' });
  const result = operation.parse(await rpc({ method: 'rebroadcast', id: saved.id }));
  if (result.state === 'seen') Storage.removeItemSync(pendingKey);
  return result;
}

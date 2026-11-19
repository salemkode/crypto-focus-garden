import { z } from 'zod';
import { decode, GardenTransactionError, intentSchema, preparedSchema } from './index';

export const recoverableOperationSchema = z.object({ id: z.string().uuid(), account: z.string(), key: z.string().uuid(), wallet: z.string(), kind: z.enum(['credit', 'plant', 'claim', 'merge', 'register', 'tip']), state: z.enum(['reserved', 'prepared', 'pending', 'confirming', 'seen', 'cancelled']), intent: z.string(), payload: z.string().nullable(), raw: z.string().nullable() });
export function restoreOperationRecord(input: z.input<typeof recoverableOperationSchema>, wallet: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  const row = recoverableOperationSchema.parse(input);
  if (row.wallet !== wallet || row.state === 'seen' || row.state === 'cancelled') return null;
  const prepared = row.payload ? preparedSchema.parse(JSON.parse(row.payload)) : null;
  if (prepared && prepared.id !== row.id) throw new GardenTransactionError({ message: 'Recovered preparation does not match its operation.' });
  const intent = row.kind === 'credit' ? null : intentSchema.parse(JSON.parse(row.intent));
  if (intent && intent.action !== row.kind) throw new GardenTransactionError({ message: 'Recovered operation intent differs from its recorded action.' });
  const credit = row.kind === 'credit' ? z.object({ action: z.enum(['plant', 'claim', 'merge', 'register', 'tip']) }).parse(JSON.parse(row.intent)) : null;
  const startedAt = prepared && intent?.action === 'plant' ? decode(prepared.transaction).locktime : nowSeconds;
  return { account: row.account, wallet: row.wallet, key: row.key, id: row.id, startedAt, ...(intent ? { intent } : {}), ...(credit ? { creditAction: credit.action } : {}), ...(row.raw ? { raw: row.raw } : {}) };
}

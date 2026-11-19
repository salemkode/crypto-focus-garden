import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { binToHex, encodeTransaction } from '@bitauth/libauth';
import { Ledger } from '../src/ledger';

test('service restart preserves authentication, pending txid, reservations and idempotency', () => {
  const directory = mkdtempSync(join(tmpdir(), 'focus-garden-ledger-'));
  const first = new Ledger(join(directory, 'ledger.sqlite'));
  const token = first.createAccount('persisted-account');
  const input = { account: 'persisted-account', wallet: 'test-wallet', key: 'stable-key', kind: 'credit' as const, intent: 'plant', amount: 8000, budget: 10000 };
  const operation = first.reserve(input);
  first.reserveCoins(operation.id, ['outpoint:0']);
  first.db.run("UPDATE operations SET state='pending',raw=?,txid=? WHERE id=?", [binToHex(encodeTransaction({ version: 2, locktime: 0, inputs: [{ outpointTransactionHash: new Uint8Array(32).fill(1), outpointIndex: 0, sequenceNumber: 0xffffffff, unlockingBytecode: new Uint8Array() }], outputs: [] })), 'ab'.repeat(32), operation.id]);
  first.db.close();
  const restored = new Ledger(join(directory, 'ledger.sqlite'));
  try {
    expect(restored.authenticate(token)).toBe('persisted-account');
    expect(restored.reserve(input).id).toBe(operation.id);
    expect(restored.operation(input.account, operation.id).txid).toBe('ab'.repeat(32));
    expect(restored.available('outpoint:0')).toBe(false);
    expect(() => restored.reserve({ ...input, account: 'another-account', key: 'another-key' })).toThrow();
  } finally { restored.db.close(); rmSync(directory, { recursive: true }); }
});

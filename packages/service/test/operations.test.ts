import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Ledger } from '../src/ledger';
import { backupLedger } from '../src/backup';

test('revocation and rotation preserve the same account and operations, invalidate old credentials and challenges', () => {
  const ledger = new Ledger(':memory:');
  try {
    const token = ledger.createAccount('person');
    ledger.db.run('INSERT INTO challenges VALUES(?,?,?,?)', ['nonce', 'person', 'wallet', Date.now() + 120000]);
    ledger.revokeAccount('person');
    expect(() => ledger.authenticate(token)).toThrow();
    const replacement = ledger.rotateAccount('person');
    expect(ledger.authenticate(replacement)).toBe('person');
    expect(() => ledger.authenticate(token)).toThrow();
    expect(ledger.db.query('SELECT * FROM challenges').all()).toEqual([]);
    expect(ledger.db.query('SELECT * FROM audit').all().length).toBe(2);
  } finally { ledger.db.close(); }
});
test('rate limits survive reopen, reset by window and do not count key rotations as new identities', () => {
  const directory = mkdtempSync(join(tmpdir(), 'focus-garden-rate-'));
  const path = join(directory, 'ledger.sqlite');
  const first = new Ledger(path);
  first.throttle('account:a', 2, 120000); first.throttle('account:a', 2, 120001); first.db.close();
  const second = new Ledger(path);
  try {
    expect(() => second.throttle('account:a', 2, 120002)).toThrow();
    expect(() => second.throttle('account:a', 2, 180001)).not.toThrow();
  } finally { second.db.close(); rmSync(directory, { recursive: true }); }
});
test('treasury pause and daily allowances do not bypass lifetime/account limits', () => {
  const ledger = new Ledger(':memory:');
  try {
    ledger.setControl('treasury.paused', true);
    const request = { account: 'a', key: 'key', wallet: 'wallet', kind: 'credit' as const, intent: 'plant', amount: 8000, budget: 30000, dailyBudget: 9999 };
    expect(() => ledger.reserve(request)).toThrow();
    ledger.setControl('treasury.paused', false);
    expect(() => ledger.reserve(request)).toThrow();
    const grant = ledger.reserve({ ...request, dailyBudget: 10000 });
    ledger.markSeen(grant.id);
    expect(() => ledger.reserve({ ...request, account: 'b', key: 'other', dailyBudget: 10000 })).toThrow();
    ledger.setControl('broadcasts.paused', true);
    expect(() => ledger.requireWrites()).toThrow();
  } finally { ledger.db.close(); }
});
test('online WAL backup is consistent, private, refuses overwrite and restores authenticated pending reservations', () => {
  const directory = mkdtempSync(join(tmpdir(), 'focus-garden-backup-'));
  const source = new Ledger(join(directory, 'source.sqlite'));
  const token = source.createAccount('person');
  const operation = source.reserve({ account: 'person', key: 'key', wallet: 'wallet', kind: 'credit', intent: 'claim', amount: 4000, budget: 10000 });
  source.reserveCoins(operation.id, ['input:1']);
  const destination = join(directory, 'backup.sqlite');
  try {
    backupLedger(join(directory, 'source.sqlite'), destination);
    expect(statSync(destination).mode & 0o077).toBe(0);
    expect(() => backupLedger(join(directory, 'source.sqlite'), destination)).toThrow();
    const restored = new Ledger(destination);
    try {
      expect(restored.authenticate(token)).toBe('person');
      expect(restored.operation('person', operation.id).state).toBe('reserved');
      expect(restored.available('input:1')).toBe(false);
    } finally { restored.db.close(); }
  } finally { source.db.close(); rmSync(directory, { recursive: true }); }
});

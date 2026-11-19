import { chmodSync } from 'node:fs';
import { Database } from 'bun:sqlite';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { binToHex } from '@bitauth/libauth';
import { decode, GardenTransactionError, type GardenNetwork } from '@focus-garden/protocol';

export const operationSchema = z.object({
  id: z.string(), account: z.string(), key: z.string(), kind: z.enum(['credit', 'plant', 'claim', 'merge', 'register', 'tip']),
  intent: z.string(), wallet: z.string(), day: z.string(), amount: z.number(),
  state: z.enum(['reserved', 'prepared', 'pending', 'confirming', 'seen', 'cancelled']),
  payload: z.string().nullable(), raw: z.string().nullable(), txid: z.string().nullable(),
});
export class Ledger {
  readonly db;
  constructor(path: string) {
    this.db = new Database(path, { create: true });
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, hash TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS wallets(address TEXT PRIMARY KEY, account TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS challenges(nonce TEXT PRIMARY KEY, account TEXT NOT NULL, address TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY, account TEXT NOT NULL, key TEXT NOT NULL, kind TEXT NOT NULL, intent TEXT NOT NULL, wallet TEXT NOT NULL, day TEXT NOT NULL, amount INTEGER NOT NULL, state TEXT NOT NULL, payload TEXT, raw TEXT, txid TEXT, UNIQUE(account,key));
      CREATE TABLE IF NOT EXISTS coins(outpoint TEXT PRIMARY KEY, operation TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS account_security(account TEXT PRIMARY KEY, revoked INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS rate_limits(bucket TEXT PRIMARY KEY, window INTEGER NOT NULL, count INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, at INTEGER NOT NULL, account TEXT NOT NULL, action TEXT NOT NULL, operation TEXT);
      CREATE TABLE IF NOT EXISTS observations(operation TEXT PRIMARY KEY, state TEXT NOT NULL, confirmations INTEGER NOT NULL, blockHash TEXT, blockTime INTEGER, checkedAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS profiles(wallet TEXT PRIMARY KEY, account TEXT NOT NULL, name TEXT NOT NULL, about TEXT NOT NULL, operation TEXT NOT NULL, registeredAt INTEGER NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS profiles_name ON profiles(lower(name));
      CREATE TABLE IF NOT EXISTS sessions(commitment TEXT PRIMARY KEY, account TEXT NOT NULL, wallet TEXT NOT NULL, reward TEXT NOT NULL, duration INTEGER NOT NULL, plantedAt INTEGER NOT NULL, plant TEXT NOT NULL, claim TEXT);
    `);
    // v4: trees merged away point at the merge operation that burned them.
    const columns = z.array(z.object({ name: z.string() })).parse(this.db.query('PRAGMA table_info(sessions)').all());
    if (!columns.some((column) => column.name === 'mergedInto')) this.db.exec('ALTER TABLE sessions ADD COLUMN mergedInto TEXT');
    // Migrate input locks from earlier checkpoints that released them on first
    // observation. Retain them across confirmation regressions and restarts.
    const recorded = z.array(operationSchema).parse(this.db.query('SELECT * FROM operations WHERE raw IS NOT NULL').all());
    this.db.transaction(() => recorded.forEach((operation) => decode(operation.raw!).inputs.forEach((input) => {
      this.db.run('INSERT OR IGNORE INTO coins VALUES(?,?)', [`${binToHex(input.outpointTransactionHash)}:${input.outpointIndex}`, operation.id]);
    }))).immediate();
  }
  audit(account: string, action: string, operation?: string) {
    this.db.run('INSERT INTO audit(at,account,action,operation) VALUES(?,?,?,?)', [Date.now(), account, action, operation ?? null]);
  }
  throttle(bucket: string, limit: number, now = Date.now()) {
    this.db.transaction(() => {
      const window = Math.floor(now / 60000);
      this.db.run('DELETE FROM rate_limits WHERE window<?', [window - 2]);
      this.db.run('INSERT INTO rate_limits VALUES(?,?,1) ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window', [bucket, window]);
      const row = z.object({ count: z.number() }).parse(this.db.query('SELECT count FROM rate_limits WHERE bucket=?').get(bucket));
      if (row.count > limit) throw new GardenTransactionError({ message: 'Request limit reached. Wait one minute before trying again.' });
    }).immediate();
  }
  setting(key: string) { return z.object({ value: z.string() }).nullable().parse(this.db.query('SELECT value FROM settings WHERE key=?').get(key))?.value; }
  bindNetwork(network: GardenNetwork) {
    this.db.transaction(() => {
      const existing = this.setting('network');
      if (existing === network) return;
      const legacyActivity = this.db.query('SELECT 1 FROM accounts UNION ALL SELECT 1 FROM wallets UNION ALL SELECT 1 FROM operations LIMIT 1').get();
      if (existing || (network === 'mainnet' && legacyActivity)) {
        throw new GardenTransactionError({ message: 'Use a separate ledger for this network.' });
      }
      this.db.run('INSERT INTO settings VALUES(?,?)', ['network', network]);
    }).immediate();
  }
  requireWrites() {
    if (this.setting('broadcasts.paused') === 'true') throw new GardenTransactionError({ message: 'Transaction submissions are temporarily paused. Saved operations are preserved.' });
  }
  setControl(key: 'treasury.paused' | 'broadcasts.paused', paused: boolean) {
    this.db.transaction(() => {
      this.db.run('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, String(paused)]);
      this.audit('operator', `${key}:${paused}`);
    }).immediate();
  }
  rotateAccount(account: string) {
    const token = randomBytes(32).toString('hex');
    this.db.transaction(() => {
      if (this.db.run('UPDATE accounts SET hash=? WHERE id=?', [this.hash(token), account]).changes !== 1) throw new GardenTransactionError({ message: 'Unknown account.' });
      this.db.run('INSERT INTO account_security VALUES(?,0) ON CONFLICT(account) DO UPDATE SET revoked=0', [account]);
      this.db.run('DELETE FROM challenges WHERE account=?', [account]);
      this.audit(account, 'credential_rotated');
    }).immediate();
    return token;
  }
  revokeAccount(account: string) {
    this.db.transaction(() => {
      if (!this.db.query('SELECT 1 FROM accounts WHERE id=?').get(account)) throw new GardenTransactionError({ message: 'Unknown account.' });
      this.db.run('INSERT INTO account_security VALUES(?,1) ON CONFLICT(account) DO UPDATE SET revoked=1', [account]);
      this.db.run('DELETE FROM challenges WHERE account=?', [account]);
      this.audit(account, 'credential_revoked');
    }).immediate();
  }
  createAccount(id: string) {
    z.string().min(1).max(128).parse(id);
    const token = randomBytes(32).toString('hex');
    this.db.run('INSERT INTO accounts VALUES(?,?)', [id, this.hash(token)]);
    return token;
  }
  hash(token: string) { return createHash('sha256').update(token).digest('hex'); }
  authenticate(token: string) {
    const hash = this.hash(token);
    const row = z.object({ id: z.string(), hash: z.string() }).nullable().parse(this.db.query('SELECT * FROM accounts WHERE hash=?').get(hash));
    if (!row || this.db.query('SELECT 1 FROM account_security WHERE account=? AND revoked=1').get(row.id) || !timingSafeEqual(Buffer.from(row.hash), Buffer.from(hash))) throw new GardenTransactionError({ message: 'Unauthorized account.' });
    return row.id;
  }
  bound(account: string, address: string) {
    if (!this.db.query('SELECT 1 FROM wallets WHERE address=? AND account=?').get(address, account)) throw new GardenTransactionError({ message: 'Prove ownership of this app wallet first.' });
  }
  get(account: string, key: string) {
    return operationSchema.nullable().parse(this.db.query('SELECT * FROM operations WHERE account=? AND key=?').get(account, key));
  }
  operation(account: string, id: string) {
    const row = operationSchema.nullable().parse(this.db.query('SELECT * FROM operations WHERE account=? AND id=?').get(account, id));
    if (!row) throw new GardenTransactionError({ message: 'Unknown operation.' });
    return row;
  }
  reserve(input: { account: string; key: string; wallet: string; kind: 'credit' | 'plant' | 'claim' | 'merge' | 'register' | 'tip'; intent: string; amount: number; budget: number; dailyBudget?: number }) {
    return this.db.transaction(() => {
      const previous = this.get(input.account, input.key);
      if (previous) {
        if (previous.wallet !== input.wallet || previous.kind !== input.kind || previous.intent !== input.intent) throw new GardenTransactionError({ message: 'Idempotency key is already bound to another request.' });
        return previous;
      }
      if (this.db.query("SELECT 1 FROM operations WHERE account=? AND state NOT IN ('seen','cancelled')").get(input.account)) throw new GardenTransactionError({ message: 'An unresolved operation already exists. Reconcile it before requesting another.' });
      const day = new Date().toISOString().slice(0, 10);
      const total = z.object({ total: z.number() });
      const daily = total.parse(this.db.query("SELECT COALESCE(SUM(amount),0) total FROM operations WHERE account=? AND day=? AND kind='credit'").get(input.account, day)).total;
      if (input.amount > 0 && this.setting('treasury.paused') === 'true') throw new GardenTransactionError({ message: 'New transaction-credit grants are temporarily paused.' });
      const treasuryToday = total.parse(this.db.query("SELECT COALESCE(SUM(CASE WHEN amount>0 THEN amount+2000 ELSE 0 END),0) total FROM operations WHERE kind='credit' AND day=? AND state!='cancelled'").get(day)).total;
      if (input.amount > 0 && treasuryToday + input.amount + 2000 > (input.dailyBudget ?? input.budget)) throw new GardenTransactionError({ message: 'Daily treasury allowance exhausted.' });
      const spent = total.parse(this.db.query("SELECT COALESCE(SUM(CASE WHEN amount>0 THEN amount+2000 ELSE 0 END),0) total FROM operations WHERE kind='credit'").get()).total;
      if (daily + input.amount > 16000 || spent + (input.amount > 0 ? input.amount + 2000 : 0) > input.budget) throw new GardenTransactionError({ message: 'Account or treasury credit budget exhausted.' });
      const id = crypto.randomUUID();
      this.db.run("INSERT INTO operations(id,account,key,kind,intent,wallet,day,amount,state) VALUES(?,?,?,?,?,?,?,?,'reserved')", [id, input.account, input.key, input.kind, input.intent, input.wallet, day, input.amount]);
      this.audit(input.account, 'operation_reserved', id);
      return this.operation(input.account, id);
    }).immediate();
  }
  reserveCoins(id: string, outpoints: string[]) {
    this.db.transaction(() => {
      if (!this.db.query("SELECT 1 FROM operations WHERE id=? AND state='reserved'").get(id)) throw new GardenTransactionError({ message: 'Operation is no longer reserved.' });
      outpoints.forEach((outpoint) => this.db.run('INSERT INTO coins VALUES(?,?)', [outpoint, id]));
    }).immediate();
  }
  available(outpoint: string) { return !this.db.query('SELECT 1 FROM coins WHERE outpoint=?').get(outpoint); }
  markSeen(id: string) {
    this.db.transaction(() => {
      this.db.run("UPDATE operations SET state='seen' WHERE id=?", [id]);
      // Keep input reservations: a later reorg must not make an old grant's
      // funding coin available to a replacement operation.
    }).immediate();
  }
}

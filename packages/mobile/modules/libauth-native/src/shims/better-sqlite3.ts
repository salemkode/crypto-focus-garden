/**
 * A `better-sqlite3`-compatible subset implemented on expo-sqlite's native,
 * synchronous API. Enables `StorageType.SQLITE` in @xo-cash/state on React Native.
 *
 * Supported: `new Database(path)`, `exec`, `prepare` (`run`/`get`/`all`/`iterate`/
 * `pluck`/`raw`), `pragma` (incl. `{ simple: true }`), `transaction`, `close`.
 */
import { openDatabaseSync, type SQLiteBindValue, type SQLiteDatabase, type SQLiteStatement } from 'expo-sqlite';

import { resolveDatabaseLocation } from '../storage/location';

type BindArgs = unknown[];

const toBindValue = (value: unknown): SQLiteBindValue => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return String(value);
};

/** better-sqlite3 accepts positional args, an array, or one named-parameter object. */
const normalizeArgs = (args: BindArgs): SQLiteBindValue[] | Record<string, SQLiteBindValue> => {
  if (args.length === 1 && args[0] !== null && typeof args[0] === 'object' && !(args[0] instanceof Uint8Array)) {
    if (Array.isArray(args[0])) return args[0].map(toBindValue);
    const named: Record<string, SQLiteBindValue> = {};
    for (const [key, value] of Object.entries(args[0] as Record<string, unknown>)) {
      named[/^[:@$]/.test(key) ? key : `@${key}`] = toBindValue(value);
      named[`:${key.replace(/^[:@$]/, '')}`] = toBindValue(value);
      named[`$${key.replace(/^[:@$]/, '')}`] = toBindValue(value);
    }
    return named;
  }
  return args.map(toBindValue);
};

export type RunResult = { changes: number; lastInsertRowid: number };

export class Statement {
  #pluck = false;
  #raw = false;

  constructor(
    private readonly database: Database,
    private readonly statement: SQLiteStatement,
    public readonly source: string
  ) {}

  get reader() {
    return /^\s*(SELECT|PRAGMA|WITH|VALUES|EXPLAIN)\b/i.test(this.source) || /\bRETURNING\b/i.test(this.source);
  }

  pluck(toggle = true) {
    this.#pluck = toggle;
    if (toggle) this.#raw = false;
    return this;
  }

  raw(toggle = true) {
    this.#raw = toggle;
    if (toggle) this.#pluck = false;
    return this;
  }

  #shape(row: Record<string, unknown> | undefined): unknown {
    if (row === undefined || row === null) return undefined;
    if (this.#pluck) return Object.values(row)[0];
    if (this.#raw) return Object.values(row);
    return row;
  }

  run(...args: BindArgs): RunResult {
    this.database.assertOpen();
    const result = this.statement.executeSync(normalizeArgs(args) as never);
    try {
      return { changes: result.changes, lastInsertRowid: Number(result.lastInsertRowId) };
    } finally {
      result.resetSync();
    }
  }

  get(...args: BindArgs): unknown {
    this.database.assertOpen();
    const result = this.statement.executeSync<Record<string, unknown>>(normalizeArgs(args) as never);
    try {
      return this.#shape(result.getFirstSync() ?? undefined);
    } finally {
      result.resetSync();
    }
  }

  all(...args: BindArgs): unknown[] {
    this.database.assertOpen();
    const result = this.statement.executeSync<Record<string, unknown>>(normalizeArgs(args) as never);
    try {
      return result.getAllSync().map((row) => this.#shape(row));
    } finally {
      result.resetSync();
    }
  }

  *iterate(...args: BindArgs): IterableIterator<unknown> {
    yield* this.all(...args);
  }

  finalize() {
    this.statement.finalizeSync();
  }
}

export default class Database {
  readonly name: string;
  #db: SQLiteDatabase | null;
  #statements = new Set<Statement>();
  inTransaction = false;

  constructor(filename = ':memory:', _options?: Record<string, unknown>) {
    const location = resolveDatabaseLocation(filename);
    this.#db = openDatabaseSync(location.fileName, { useNewConnection: true }, location.directory);
    this.name = this.#db.databasePath;
  }

  get open() {
    return this.#db !== null;
  }

  get memory() {
    return this.name === ':memory:';
  }

  /** @internal */
  assertOpen(): SQLiteDatabase {
    if (this.#db === null) throw new TypeError('The database connection is not open');
    return this.#db;
  }

  exec(source: string) {
    this.assertOpen().execSync(source);
    return this;
  }

  prepare(source: string) {
    const statement = new Statement(this, this.assertOpen().prepareSync(source), source);
    this.#statements.add(statement);
    return statement;
  }

  pragma(source: string, options?: { simple?: boolean }) {
    const rows = this.assertOpen().getAllSync<Record<string, unknown>>(`PRAGMA ${source}`);
    if (options?.simple) {
      const first = rows[0];
      return first === undefined ? undefined : Object.values(first)[0];
    }
    return rows;
  }

  transaction<Args extends unknown[], Result>(fn: (...args: Args) => Result) {
    const run = (mode: string) => (...args: Args): Result => {
      const db = this.assertOpen();
      if (this.inTransaction) return fn(...args);
      db.execSync(`BEGIN ${mode}`);
      this.inTransaction = true;
      try {
        const result = fn(...args);
        db.execSync('COMMIT');
        return result;
      } catch (error) {
        db.execSync('ROLLBACK');
        throw error;
      } finally {
        this.inTransaction = false;
      }
    };
    const wrapped = run('') as ((...args: Args) => Result) & Record<string, (...args: Args) => Result>;
    wrapped.deferred = run('DEFERRED');
    wrapped.immediate = run('IMMEDIATE');
    wrapped.exclusive = run('EXCLUSIVE');
    return wrapped;
  }

  close() {
    if (this.#db === null) return this;
    for (const statement of this.#statements) {
      try {
        statement.finalize();
      } catch {
        // already finalized
      }
    }
    this.#statements.clear();
    this.#db.closeSync();
    this.#db = null;
    return this;
  }
}

export { Database };

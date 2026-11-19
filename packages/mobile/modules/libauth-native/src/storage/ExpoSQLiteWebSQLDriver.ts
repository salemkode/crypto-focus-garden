/**
 * A `websql-configurable` SQL driver backed by expo-sqlite's native, synchronous API.
 *
 * This is a port of websql-configurable's own `better-sqlite3` driver
 * (lib/sqlite/SQLiteDatabase.js), which is what indexeddbshim uses under Node.
 * Keeping the same contract — including the per-file reader/writer lock and the
 * macrotask-deferred callback — means IndexedDB on React Native goes through
 * exactly the code path @xo-cash/state and @electrum-cash/application are
 * tested against on Node.
 */
import { openDatabaseSync, type SQLiteBindValue, type SQLiteDatabase } from 'expo-sqlite';

import { resolveDatabaseLocation } from './location';

type SqlQuery = { sql: string; args?: unknown[] };

class SQLiteResult {
  constructor(
    public error: Error | null,
    public insertId?: number,
    public rowsAffected?: number,
    public rows?: unknown[]
  ) {}
}

type Waiter = { isReader: boolean; resume: () => void };

const READ_ONLY_ERROR = new Error('could not prepare statement (23 not authorized)');

const fileReaders = new Map<string, Set<ExpoSQLiteWebSQLDriver>>();
const fileWriter = new Map<string, ExpoSQLiteWebSQLDriver>();
const fileWaiters = new Map<string, Waiter[]>();
const beginRe = /^\s*BEGIN\b/i;
const endRe = /^\s*(?:END|COMMIT|ROLLBACK)\b/i;
const selectRe = /^\s*SELECT\b/i;

const defer: (callback: () => void) => void =
  typeof setImmediate === 'function' ? (callback) => setImmediate(callback) : (callback) => setTimeout(callback, 0);

const toBindValue = (value: unknown): SQLiteBindValue => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return String(value);
};

export type ExpoSQLiteDriverOptions = {
  /** Called with each SQL statement before execution. */
  trace?: (sql: string) => void;
};

export class ExpoSQLiteWebSQLDriver {
  private readonly filePath: string | null;
  private db: SQLiteDatabase | null;
  private trace?: (sql: string) => void;

  constructor(name: string, options?: ExpoSQLiteDriverOptions) {
    const location = resolveDatabaseLocation(name);
    this.db = openDatabaseSync(location.fileName, { useNewConnection: true }, location.directory);
    this.filePath = location.fileName === ':memory:' ? null : this.db.databasePath;
    this.trace = options?.trace;
  }

  /** node-sqlite3 compatibility. */
  configure(option: string, value: unknown) {
    if (option === 'trace') this.trace = value as (sql: string) => void;
  }

  close(callback?: (error?: Error | null) => void) {
    try {
      this.db?.closeSync();
      this.db = null;
      callback?.(null);
    } catch (error) {
      callback?.(error as Error);
    }
  }

  exec(queries: SqlQuery[], readOnly: boolean, callback: (error: Error | null, results?: SQLiteResult[]) => void) {
    const filePath = this.filePath;
    if (filePath && queries[0] && beginRe.test(queries[0].sql)) {
      const activeReaders = fileReaders.get(filePath);
      const activeWriter = fileWriter.get(filePath);
      const blockedByWriter = Boolean(activeWriter && activeWriter !== this);
      const blocked = blockedByWriter || (!readOnly && activeReaders !== undefined);
      if (blocked) {
        const waiters = fileWaiters.get(filePath) ?? [];
        waiters.push({ isReader: readOnly, resume: () => this.exec(queries, readOnly, callback) });
        fileWaiters.set(filePath, waiters);
        return;
      }
      if (readOnly) {
        if (activeReaders) activeReaders.add(this);
        else fileReaders.set(filePath, new Set([this]));
      } else {
        fileWriter.set(filePath, this);
      }
    }

    const results: SQLiteResult[] = new Array(queries.length);
    for (let i = 0; i < queries.length; i++) {
      const { sql, args = [] } = queries[i]!;
      const isSelect = selectRe.test(sql);
      if (readOnly && !isSelect) {
        results[i] = new SQLiteResult(READ_ONLY_ERROR);
        continue;
      }
      try {
        if (this.db === null) throw new Error('Database is closed');
        this.trace?.(sql);
        const params = args.map(toBindValue);
        if (isSelect) {
          results[i] = new SQLiteResult(null, undefined, 0, this.db.getAllSync(sql, params));
        } else {
          const { lastInsertRowId, changes } = this.db.runSync(sql, params);
          results[i] = new SQLiteResult(null, Number(lastInsertRowId), changes, []);
        }
      } catch (error) {
        results[i] = new SQLiteResult(error instanceof Error ? error : new Error(String(error)));
      }
    }

    // Defer to a macrotask exactly like the Node driver, then release the file lock.
    defer(() => {
      if (filePath && queries.some((query) => endRe.test(query.sql))) {
        const activeReaders = fileReaders.get(filePath);
        if (activeReaders) {
          activeReaders.delete(this);
          if (!activeReaders.size) fileReaders.delete(filePath);
        }
        if (fileWriter.get(filePath) === this) fileWriter.delete(filePath);
        const waiters = fileWaiters.get(filePath);
        if (waiters) {
          while (waiters.length) {
            const next = waiters[0]!;
            if (!next.isReader && fileReaders.has(filePath)) break;
            waiters.shift();
            next.resume();
            if (!next.isReader) break;
          }
          if (!waiters.length) fileWaiters.delete(filePath);
        }
      }
      callback(null, results);
    });
  }
}

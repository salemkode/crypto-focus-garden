/**
 * Replaces the `indexeddbshim` package for React Native.
 *
 * @xo-cash/state and @electrum-cash/application call
 * `setGlobalVars(global, { checkOrigin, escapeDatabaseName, databaseBasePath })`
 * to install IndexedDB on Node. Here the same (real) indexeddbshim is installed,
 * but with a WebSQL backend persisted via native SQLite (expo-sqlite) instead of
 * Node's sqlite3 bindings.
 */
// Resolved to the real package: Metro does not redirect imports made from these shims.
import realSetGlobalVars from 'indexeddbshim';

import { deleteDatabaseSync } from 'expo-sqlite';

import { resolveDatabaseLocation } from '../storage/location';
import { getOpenDatabase } from '../storage/openDatabase';

/**
 * Lets indexeddbshim remove the SQLite file on `indexedDB.deleteDatabase()`
 * (it closes its cached connections before calling this).
 */
const nativeFs = {
  unlink(path: string, callback: (error: (Error & { code?: string }) | null) => void) {
    try {
      const { fileName, directory } = resolveDatabaseLocation(path);
      deleteDatabaseSync(fileName, directory);
      callback(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const wrapped: Error & { code?: string } = new Error(message);
      if (/not found|does not exist|no such file/i.test(message)) wrapped.code = 'ENOENT';
      callback(wrapped);
    }
  },
};

type ShimConfig = Record<string, unknown>;

const setGlobalVars = (target?: object, config: ShimConfig = {}) => {
  const openDatabase = getOpenDatabase();
  return realSetGlobalVars(target as never, {
    checkOrigin: false,
    ...config,
    // The WebSQL implementation indexeddbshim builds IndexedDB on.
    win: { openDatabase },
    fs: nativeFs,
  } as never);
};

export default setGlobalVars;

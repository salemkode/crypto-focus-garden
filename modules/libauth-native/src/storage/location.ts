import { defaultDatabaseDirectory } from 'expo-sqlite';

export type DatabaseLocation = {
  /** File name (may contain sub-directories) passed to `openDatabaseSync`. */
  fileName: string;
  /** Directory passed to `openDatabaseSync`; `undefined` means expo-sqlite's default directory. */
  directory?: string;
};

const stripFileScheme = (value: string) => value.replace(/^file:\/\//, '');

/**
 * Maps the Node-style database paths used by @xo-cash/state, @electrum-cash/application
 * and indexeddbshim (e.g. `./XO-<hash>.sqlite`, `/Electrum_<hash>.sqlite`) to a file
 * inside the app sandbox.
 *
 * - `:memory:` stays in memory.
 * - Absolute paths inside the app sandbox (anything under expo-sqlite's default
 *   directory's container, or any `file://` URI) are honored as-is.
 * - Every other path is treated as relative to expo-sqlite's default directory;
 *   sub-directories are created automatically.
 */
export const resolveDatabaseLocation = (name: string): DatabaseLocation => {
  if (name === ':memory:' || name === '') return { fileName: ':memory:' };

  const isFileUri = name.startsWith('file://');
  const path = stripFileScheme(name);
  const sandboxRoot = defaultDatabaseDirectory
    ? stripFileScheme(defaultDatabaseDirectory).replace(/\/(Documents|files)\/SQLite\/?$|\/SQLite\/?$/, '')
    : undefined;

  if (path.startsWith('/') && (isFileUri || (sandboxRoot !== undefined && path.startsWith(sandboxRoot)))) {
    const index = path.lastIndexOf('/');
    return { directory: path.slice(0, index) || '/', fileName: path.slice(index + 1) };
  }

  const segments: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  if (segments.length === 0) {
    throw new Error(`libauth-native: invalid database path "${name}"`);
  }
  return { fileName: segments.join('/') };
};

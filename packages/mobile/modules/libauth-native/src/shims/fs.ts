/**
 * Minimal `fs` for React Native: the directory helpers @xo-cash/state's SQLite
 * storage uses before opening a database. Paths are interpreted the same way as
 * database paths (see storage/location.ts), backed by expo-file-system.
 */
import { Directory, File } from 'expo-file-system';
import { defaultDatabaseDirectory } from 'expo-sqlite';

import { resolveDatabaseLocation } from '../storage/location';

const toUri = (path: string): string => {
  const { fileName, directory } = resolveDatabaseLocation(path);
  const base = directory ?? defaultDatabaseDirectory ?? '';
  const joined = `${base.replace(/\/+$/, '')}/${fileName}`;
  return joined.startsWith('file://') ? joined : `file://${joined}`;
};

const isRoot = (path: string) => /^(\.?\/?)*$/.test(path);

export const existsSync = (path: string): boolean => {
  if (isRoot(path)) return true;
  const uri = toUri(path);
  return new Directory(uri).exists || new File(uri).exists;
};

export const mkdirSync = (path: string, options?: { recursive?: boolean }) => {
  if (isRoot(path)) return undefined;
  new Directory(toUri(path)).create({ intermediates: options?.recursive ?? false, idempotent: options?.recursive ?? false });
  return undefined;
};

const unsupported = (name: string) => () => {
  throw new Error(`fs.${name} is not available in React Native (libauth-native fs shim)`);
};

export const readFileSync = unsupported('readFileSync');
export const writeFileSync = unsupported('writeFileSync');
export const unlink = unsupported('unlink');

export default { existsSync, mkdirSync, readFileSync, writeFileSync, unlink };

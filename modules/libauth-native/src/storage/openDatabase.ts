import customOpenDatabase from 'websql-configurable/custom/index.js';

import { ExpoSQLiteWebSQLDriver } from './ExpoSQLiteWebSQLDriver';

type OpenDatabase = (name: string, version: string, description: string, size: number) => unknown;

let openDatabase: OpenDatabase | undefined;

/**
 * A WebSQL `openDatabase` implementation persisted with native SQLite (expo-sqlite).
 * Uses the same websql-configurable front end indexeddbshim uses on Node.
 */
export const getOpenDatabase = (): OpenDatabase => {
  openDatabase ??= customOpenDatabase(ExpoSQLiteWebSQLDriver as never) as OpenDatabase;
  return openDatabase;
};

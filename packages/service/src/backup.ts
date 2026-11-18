import { Database } from 'bun:sqlite';
import { chmodSync, existsSync, openSync, closeSync, mkdtempSync, linkSync, rmSync, fsyncSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { z } from 'zod';
import { GardenTransactionError } from '@focus-garden/protocol';

export function backupLedger(source: string, destination: string) {
  if (resolve(source) === resolve(destination) || existsSync(destination)) throw new GardenTransactionError({ message: 'Backup destination must be a new, separate file.' });
  // SQLite requires a nonexistent VACUUM target. A private staging directory
  // keeps the whole snapshot inaccessible until checked, chmodded and synced.
  const staging = mkdtempSync(join(dirname(resolve(destination)), '.focus-garden-backup-'));
  const snapshot = join(staging, 'snapshot.sqlite');
  const db = new Database(source, { readonly: true });
  try {
    db.exec('PRAGMA busy_timeout=5000');
    z.object({ integrity_check: z.literal('ok') }).parse(db.query('PRAGMA integrity_check').get());
    db.query('VACUUM INTO ?').run(snapshot);
    chmodSync(snapshot, 0o600);
    const copy = new Database(snapshot, { readonly: true });
    try { z.object({ integrity_check: z.literal('ok') }).parse(copy.query('PRAGMA integrity_check').get()); }
    finally { copy.close(); }
    const file = openSync(snapshot, 'r');
    try { fsyncSync(file); } finally { closeSync(file); }
    linkSync(snapshot, destination); // Atomic, exclusive; never overwrites.
    const directory = openSync(dirname(resolve(destination)), 'r');
    try { fsyncSync(directory); } finally { closeSync(directory); }
  } finally { db.close(); rmSync(staging, { recursive: true, force: true }); }
}
if (import.meta.main) {
  const [source, destination] = z.tuple([z.string().min(1), z.string().min(1)]).parse(process.argv.slice(2));
  backupLedger(source, destination);
  console.log('Consistent SQLite backup created and integrity checked. No keys or tokens were printed.');
}

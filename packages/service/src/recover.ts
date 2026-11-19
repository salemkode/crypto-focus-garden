import { z } from 'zod';
import { GardenTransactionError } from '@focus-garden/protocol';
import { Ledger, operationSchema } from './ledger';

// Explicit operator maintenance; no broadcast or replacement transfer.
const [database, id, action] = z.tuple([z.string().min(1), z.string().uuid(), z.literal('--cancel-prepared').optional()]).parse(process.argv.slice(2));
const ledger = new Ledger(database);
if (action === '--cancel-prepared') {
  const operation = operationSchema.parse(ledger.db.query('SELECT * FROM operations WHERE id=?').get(id));
  ledger.cancelPreparation(operation.account, id);
  console.log('Mainnet preparation cancelled. The original operation remains in the ledger.');
} else {
  ledger.db.transaction(() => {
    const operation = operationSchema.parse(ledger.db.query('SELECT * FROM operations WHERE id=?').get(id));
    if (operation.state !== 'reserved' || operation.raw || operation.payload || operation.txid) throw new GardenTransactionError({ message: 'Only an unprepared, never-broadcast reservation can be released.' });
    ledger.db.run('DELETE FROM coins WHERE operation=?', [id]);
    ledger.db.run('DELETE FROM sessions WHERE plant=?', [id]);
    ledger.db.run('UPDATE sessions SET mergedInto=NULL WHERE mergedInto=?', [id]);
    ledger.db.run('DELETE FROM operations WHERE id=?', [id]);
  }).immediate();
  console.log('Unprepared reservation released. No transaction was sent.');
}
ledger.db.close();

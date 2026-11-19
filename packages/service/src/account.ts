import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { Ledger } from './ledger';

// Operator provisions one token per real account. There is no public signup or
// client-supplied verified flag. Write the credential to a private file, not logs.
const [database, account, destination] = z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]).parse(process.argv.slice(2));
const ledger = new Ledger(database);
ledger.db.transaction(() => {
  const token = ledger.createAccount(account);
  writeFileSync(destination, token, { mode: 0o600, flag: 'wx' });
}).immediate();
console.log('Account created; access token written to the requested private file.');
ledger.db.close();

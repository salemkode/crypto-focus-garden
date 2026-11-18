import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { Ledger } from './ledger';
const args = z.discriminatedUnion('command', [
  z.object({ command: z.literal('revoke'), database: z.string(), target: z.string() }),
  z.object({ command: z.literal('rotate'), database: z.string(), target: z.string(), destination: z.string() }),
  z.object({ command: z.literal('pause'), database: z.string(), target: z.enum(['treasury.paused', 'broadcasts.paused']) }),
  z.object({ command: z.literal('resume'), database: z.string(), target: z.enum(['treasury.paused', 'broadcasts.paused']) }),
]).parse({ command: process.argv[2], database: process.argv[3], target: process.argv[4], destination: process.argv[5] });
const ledger = new Ledger(args.database);
ledger.db.transaction(() => {
  if (args.command === 'rotate') writeFileSync(args.destination, ledger.rotateAccount(args.target), { mode: 0o600, flag: 'wx' });
  else if (args.command === 'revoke') ledger.revokeAccount(args.target);
  else ledger.setControl(args.target, args.command === 'pause');
}).immediate();
ledger.db.close();
console.log('Requested account/control change recorded. No financial transaction was sent.');

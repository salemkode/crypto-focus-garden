import { ElectrumNetworkProvider } from 'cashscript';
import { readFileSync, statSync, openSync, closeSync, rmSync } from 'node:fs';
import { z } from 'zod';
import { GardenTransactionError, transactionId } from '@focus-garden/protocol';
import { createNodeRpc, ValidatedNodeProvider } from './chain';
import { createDedicatedIdentity, persistSetup, prepareTestnetSetup, setupRecordSchema } from './testnet-setup';

const settings = z.object({
  GARDEN_TEST_WRITE_RPC_URL: z.string().optional(), GARDEN_TEST_WRITE_CREDENTIAL_FILE: z.string().optional(),
  GARDEN_NODE_RPC_URL: z.string(), GARDEN_NODE_CREDENTIAL_FILE: z.string(), GARDEN_NODE_GENESIS_HASH: z.string(), GARDEN_NODE_CHECKPOINT_HEIGHT: z.coerce.number(), GARDEN_NODE_CHECKPOINT_HASH: z.string(), GARDEN_MIN_CONFIRMATIONS: z.coerce.number().default(6),
}).parse(process.env);
if ((statSync(settings.GARDEN_NODE_CREDENTIAL_FILE).mode & 0o077) !== 0) throw new GardenTransactionError({ message: 'Node credential file must be private.' });
const writeCredentials = settings.GARDEN_TEST_WRITE_CREDENTIAL_FILE;
if (writeCredentials && (statSync(writeCredentials).mode & 0o077) !== 0) throw new GardenTransactionError({ message: 'Test-write credential file must be private.' });
const writeRpc = settings.GARDEN_TEST_WRITE_RPC_URL && writeCredentials ? createNodeRpc(settings.GARDEN_TEST_WRITE_RPC_URL, readFileSync(writeCredentials, 'utf8').trim()) : undefined;
const provider = new ValidatedNodeProvider({ url: settings.GARDEN_NODE_RPC_URL, genesisHash: settings.GARDEN_NODE_GENESIS_HASH, checkpointHeight: settings.GARDEN_NODE_CHECKPOINT_HEIGHT, checkpointHash: settings.GARDEN_NODE_CHECKPOINT_HASH, minimumConfirmations: settings.GARDEN_MIN_CONFIRMATIONS }, createNodeRpc(settings.GARDEN_NODE_RPC_URL, readFileSync(settings.GARDEN_NODE_CREDENTIAL_FILE, 'utf8').trim()), new ElectrumNetworkProvider('chipnet'), writeRpc);
await provider.ready();
const chainIdentity = { genesisHash: provider.config.genesisHash, checkpointHeight: provider.config.checkpointHeight, checkpointHash: provider.config.checkpointHash };
const [command, file, destination] = z.tuple([z.enum(['identity', 'prepare-genesis-input', 'prepare-baton', 'prepare-directory-baton', 'broadcast-once', 'reconcile']), z.string().min(1), z.string().optional()]).parse(process.argv.slice(2));
if (command === 'identity') {
  const role = z.enum(['treasury', 'recipient']).parse(destination);
  console.log(JSON.stringify(createDedicatedIdentity(role, chainIdentity, file)));
} else if (command === 'prepare-genesis-input' || command === 'prepare-baton' || command === 'prepare-directory-baton') {
  const output = z.string().min(1).parse(destination);
  const record = await prepareTestnetSetup(provider, chainIdentity, file, command === 'prepare-baton' ? 'forest-baton' : command === 'prepare-directory-baton' ? 'directory-baton' : 'genesis-input');
  persistSetup(output, record);
  console.log(JSON.stringify({ state: record.state, txid: record.txid, category: record.category, contractAddress: record.contractAddress, artifactSha256: record.artifactSha256 }));
} else {
  const lockFile = `${file}.request-lock`;
  const lock = openSync(lockFile, 'wx', 0o600);
  try {
  const record = setupRecordSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  if (transactionId(record.raw) !== record.txid) throw new GardenTransactionError({ message: 'Saved transaction bytes do not match their recorded txid.' });
  if (JSON.stringify(record.chainIdentity) !== JSON.stringify(chainIdentity)) throw new GardenTransactionError({ message: 'Saved setup belongs to another network agreement.' });
  if (command === 'broadcast-once') {
    if (record.state !== 'prepared') throw new GardenTransactionError({ message: 'This setup may already have been submitted. Reconcile its exact txid; no automatic retry is allowed.' });
    persistSetup(file, { ...record, state: 'pending' }, true);
    // Failure leaves exact bytes/txid pending. Never construct/retry another tx.
    await provider.sendRawTransaction(record.raw);
  }
  const observed = await provider.observe(record.txid);
  if (observed.state === 'confirmed') persistSetup(file, { ...record, state: 'confirmed' }, true);
  console.log(JSON.stringify({ txid: record.txid, ...observed, category: record.category, contractAddress: record.contractAddress }));
  } finally { closeSync(lock); rmSync(lockFile); }
}

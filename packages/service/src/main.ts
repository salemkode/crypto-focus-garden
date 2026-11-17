import { ElectrumNetworkProvider } from 'cashscript';
import { binToHex, cashAddressToLockingBytecode } from '@bitauth/libauth';
import { z } from 'zod';
import { GardenTransactionError } from '@focus-garden/protocol';
import { closeSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Ledger } from './ledger';
import { createGardenService } from './api';
import { contractFor } from './transactions';
import { dedicatedIdentitySchema } from './testnet-setup';
import { createNodeRpc, ValidatedNodeProvider } from './chain';

const env = z.object({
  GARDEN_DATABASE: z.string().min(1),
  GARDEN_CATEGORY: z.string().regex(/^[0-9a-f]{64}$/),
  GARDEN_DIRECTORY_CATEGORY: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  GARDEN_TEST_WRITE_RPC_URL: z.url().optional(), GARDEN_TEST_WRITE_CREDENTIAL_FILE: z.string().optional(),
  GARDEN_NODE_RPC_URL: z.url(), GARDEN_NODE_CREDENTIAL_FILE: z.string().min(1),
  GARDEN_NODE_GENESIS_HASH: z.string().regex(/^[0-9a-f]{64}$/),
  GARDEN_NODE_CHECKPOINT_HEIGHT: z.coerce.number().int().positive(), GARDEN_NODE_CHECKPOINT_HASH: z.string().regex(/^[0-9a-f]{64}$/),
  GARDEN_MIN_CONFIRMATIONS: z.coerce.number().int().min(2).max(144).default(6),
  GARDEN_MAX_TIP_AGE_SECONDS: z.coerce.number().int().min(300).max(86400).default(21600),
  GARDEN_TREASURY_KEY_FILE: z.string().optional(),
  GARDEN_TREASURY_BUDGET_SATS: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
  GARDEN_TREASURY_DAILY_SATS: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
  PORT: z.coerce.number().int().min(1024).max(65535).default(3487),
}).parse(process.env);
function secretFile(path: string) {
  if ((statSync(path).mode & 0o077) !== 0) throw new GardenTransactionError({ message: 'Credential files must be readable only by their owner.' });
  return readFileSync(path, 'utf8').trim();
}
const writeRpc = env.GARDEN_TEST_WRITE_RPC_URL && env.GARDEN_TEST_WRITE_CREDENTIAL_FILE ? createNodeRpc(env.GARDEN_TEST_WRITE_RPC_URL, secretFile(env.GARDEN_TEST_WRITE_CREDENTIAL_FILE)) : undefined;
const provider = new ValidatedNodeProvider({ url: env.GARDEN_NODE_RPC_URL, genesisHash: env.GARDEN_NODE_GENESIS_HASH, checkpointHeight: env.GARDEN_NODE_CHECKPOINT_HEIGHT, checkpointHash: env.GARDEN_NODE_CHECKPOINT_HASH, minimumConfirmations: env.GARDEN_MIN_CONFIRMATIONS, maximumTipAgeSeconds: env.GARDEN_MAX_TIP_AGE_SECONDS }, createNodeRpc(env.GARDEN_NODE_RPC_URL, secretFile(env.GARDEN_NODE_CREDENTIAL_FILE)), new ElectrumNetworkProvider('chipnet'), writeRpc);
// Startup is read-only on the node. No fallback to public Electrum authority.
await provider.ready();
const lockPath = `${resolve(env.GARDEN_DATABASE)}.service-lock`;
const lock = openSync(lockPath, 'wx', 0o600);
writeFileSync(lock, JSON.stringify({ pid: process.pid, database: resolve(env.GARDEN_DATABASE), startedAt: new Date().toISOString() }));
closeSync(lock);
process.once('exit', () => rmSync(lockPath, { force: true }));
const ledger = new Ledger(env.GARDEN_DATABASE);
const contract = contractFor(provider, env.GARDEN_CATEGORY);
const decoded = cashAddressToLockingBytecode(contract.address);
if (typeof decoded === 'string') throw new GardenTransactionError({ message: decoded });
const treasury = env.GARDEN_TREASURY_KEY_FILE ? dedicatedIdentitySchema.parse(JSON.parse(secretFile(env.GARDEN_TREASURY_KEY_FILE))) : null;
if (treasury && (treasury.role !== 'treasury' || treasury.chainIdentity.genesisHash !== provider.config.genesisHash || treasury.chainIdentity.checkpointHash !== provider.config.checkpointHash || treasury.chainIdentity.checkpointHeight !== provider.config.checkpointHeight)) throw new GardenTransactionError({ message: 'Treasury must be a dedicated test identity for this exact Chipnet agreement.' });
const app = createGardenService({ ledger, minimumConfirmations: provider.config.minimumConfirmations, writesEnabled: writeRpc !== undefined, chainIdentity: { genesisHash: env.GARDEN_NODE_GENESIS_HASH, checkpointHeight: provider.config.checkpointHeight, checkpointHash: provider.config.checkpointHash }, provider, category: env.GARDEN_CATEGORY, directoryCategory: env.GARDEN_DIRECTORY_CATEGORY, budget: env.GARDEN_TREASURY_BUDGET_SATS, dailyBudget: env.GARDEN_TREASURY_DAILY_SATS, treasuryKey: treasury?.wif, observe: (txid) => provider.observe(txid), rewardHeld: (txid, commitment, script) => provider.holdsReward(txid, commitment, script), maturity: (txid, duration) => provider.maturity(txid, duration) });
const lifecycle = { state: 'running' as 'running' | 'closing' };
const server = Bun.serve({ hostname: '127.0.0.1', port: env.PORT, maxRequestBodySize: 250000, idleTimeout: 60,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path === '/healthz') return Response.json({ service: 'Focus Garden', testnetFunctionalReady: false, publicReleaseReady: false, state: lifecycle.state }, { headers: { 'cache-control': 'no-store' } });
    if (lifecycle.state !== 'running') return Response.json({ error: 'Service is draining. Preserve saved requests.' }, { status: 503 });
    if (request.method === 'GET' && path === '/readyz') {
      try { await provider.ready(); ledger.db.query('SELECT 1').get(); return Response.json({ ready: true, publicReleaseReady: false, minimumConfirmations: provider.config.minimumConfirmations }); }
      catch { return Response.json({ ready: false, publicReleaseReady: false }, { status: 503 }); }
    }
    return app(request);
  },
});
async function shutdown() {
  if (lifecycle.state === 'closing') return;
  lifecycle.state = 'closing';
  await server.stop(false);
  ledger.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  ledger.db.close();
  rmSync(lockPath);
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
console.log(`Focus Garden chipnet service listening on ${server.url}; publicReleaseReady=false`);
console.log(`Pinned FocusForest contract: ${contract.address}`);
console.log(`EXPO_PUBLIC_GARDEN_CATEGORY=${env.GARDEN_CATEGORY}`);
console.log(`EXPO_PUBLIC_GARDEN_CONTRACT_BYTECODE=${binToHex(decoded.bytecode)}`);

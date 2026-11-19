import { ElectrumNetworkProvider } from 'cashscript';
import { binToHex, cashAddressToLockingBytecode } from '@bitauth/libauth';
import { z } from 'zod';
import { GardenTransactionError, gardenNetwork } from '@focus-garden/protocol';
import { closeSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Ledger } from './ledger';
import { createGardenService } from './api';
import { contractFor, directoryFor } from './transactions';
import { dedicatedIdentitySchema } from './testnet-setup';
import { createNodeRpc, ValidatedNodeProvider } from './chain';
import mainnetDeployment from '../../contracts/deployments/mainnet.json';

const env = z.object({
  GARDEN_NETWORK: gardenNetwork.default('chipnet'),
  GARDEN_ENABLE_MAINNET: z.literal('1').optional(),
  GARDEN_MAINNET_WRITE_RPC_URL: z.url().optional(), GARDEN_MAINNET_WRITE_CREDENTIAL_FILE: z.string().optional(),
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
const mainnet = env.GARDEN_NETWORK === 'mainnet';
if (mainnet) {
  if (env.GARDEN_ENABLE_MAINNET !== '1' || env.GARDEN_CATEGORY !== mainnetDeployment.forest.category || env.GARDEN_DIRECTORY_CATEGORY !== mainnetDeployment.directory.category) {
    throw new GardenTransactionError({ message: 'Mainnet requires explicit activation and the published Forest and Directory categories.' });
  }
  if (env.GARDEN_TREASURY_KEY_FILE || env.GARDEN_TREASURY_BUDGET_SATS !== 0 || env.GARDEN_TREASURY_DAILY_SATS !== 0) {
    throw new GardenTransactionError({ message: 'Mainnet sessions must use wallet-funded BCH.' });
  }
}
const writeUrl = mainnet ? env.GARDEN_MAINNET_WRITE_RPC_URL : env.GARDEN_TEST_WRITE_RPC_URL;
const writeCredential = mainnet ? env.GARDEN_MAINNET_WRITE_CREDENTIAL_FILE : env.GARDEN_TEST_WRITE_CREDENTIAL_FILE;
if (mainnet && Boolean(writeUrl) !== Boolean(writeCredential)) throw new GardenTransactionError({ message: 'Configure both the Mainnet write endpoint and its credential file.' });
const writeRpc = writeUrl && writeCredential ? createNodeRpc(writeUrl, secretFile(writeCredential)) : undefined;
const provider = new ValidatedNodeProvider({ network: env.GARDEN_NETWORK, url: env.GARDEN_NODE_RPC_URL, genesisHash: env.GARDEN_NODE_GENESIS_HASH, checkpointHeight: env.GARDEN_NODE_CHECKPOINT_HEIGHT, checkpointHash: env.GARDEN_NODE_CHECKPOINT_HASH, minimumConfirmations: env.GARDEN_MIN_CONFIRMATIONS, maximumTipAgeSeconds: env.GARDEN_MAX_TIP_AGE_SECONDS }, createNodeRpc(env.GARDEN_NODE_RPC_URL, secretFile(env.GARDEN_NODE_CREDENTIAL_FILE)), new ElectrumNetworkProvider(env.GARDEN_NETWORK), writeRpc);
// Each transaction is independently verified by the operator-owned node.
await provider.ready();
if (mainnet && writeRpc) await provider.readyWriter();
const contract = contractFor(provider, env.GARDEN_CATEGORY);
if (mainnet) {
  if (contract.address !== mainnetDeployment.forest.address || directoryFor(provider, mainnetDeployment.directory.category).address !== mainnetDeployment.directory.address) {
    throw new GardenTransactionError({ message: 'This build does not match the published Mainnet contract addresses.' });
  }
  for (const deployment of [mainnetDeployment.forest, mainnetDeployment.directory]) {
    const [txid] = deployment.batonOutpoint.split(':');
    if ((await provider.observe(txid)).state !== 'confirmed') throw new GardenTransactionError({ message: 'Wait for the published Mainnet deployments to reach the configured confirmation depth.' });
  }
}
const lockPath = `${resolve(env.GARDEN_DATABASE)}.service-lock`;
const lock = openSync(lockPath, 'wx', 0o600);
writeFileSync(lock, JSON.stringify({ pid: process.pid, database: resolve(env.GARDEN_DATABASE), startedAt: new Date().toISOString() }));
closeSync(lock);
process.once('exit', () => rmSync(lockPath, { force: true }));
const ledger = new Ledger(env.GARDEN_DATABASE);
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
console.log(`Focus Garden ${provider.network} service listening on ${server.url}; publicReleaseReady=false`);
console.log(`Pinned v3 contract: ${contract.address}`);
console.log(`EXPO_PUBLIC_GARDEN_CATEGORY=${env.GARDEN_CATEGORY}`);
console.log(`EXPO_PUBLIC_GARDEN_CONTRACT_BYTECODE=${binToHex(decoded.bytecode)}`);

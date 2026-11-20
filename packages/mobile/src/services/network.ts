import { deploymentFromRecord, ELECTRUM_SERVERS, type Deployment } from '@focus-garden/protocol/network';
import mainnet from '../../../contracts/deployments/mainnet.json';

/**
 * The one network this build talks to, and the shared contracts on it. There is no Focus Garden
 * server: the app reads and writes these contracts directly through public Electrum servers.
 * EXPO_PUBLIC_ELECTRUM_SERVER pins one server (hostname) instead of the public list.
 */
const records: Record<string, unknown> = { mainnet };

function load(): Deployment {
  const name = process.env.EXPO_PUBLIC_FOCUS_NETWORK || 'mainnet';
  const record = records[name];
  if (!record) throw new Error(`No Focus Garden deployment for "${name}" in this build.`);
  return deploymentFromRecord(record);
}
export const DEPLOYMENT = load();
export const NETWORK = DEPLOYMENT.network;
export const PREFIX = DEPLOYMENT.prefix;
export const IS_MAINNET = NETWORK === 'mainnet';
export const ELECTRUM_HOSTS: readonly string[] = process.env.EXPO_PUBLIC_ELECTRUM_SERVER ? [process.env.EXPO_PUBLIC_ELECTRUM_SERVER] : ELECTRUM_SERVERS[NETWORK];
/** How confirmation copy names the money involved. */
export const MONEY_NOTE = IS_MAINNET ? 'paid in real BCH from your Focus Garden wallet' : 'in test coins with no cash value';

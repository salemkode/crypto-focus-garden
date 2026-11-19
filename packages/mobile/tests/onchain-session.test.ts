import { expect, test } from 'bun:test';
import { gardenSchema, claimedSessions } from '../src/services/garden';
import { onchainSessionView } from '../src/features/focus/onchain-session';
import { rawKeySchema, restoreRawWallet } from '../src/features/wallet/raw-recovery';

const commitment = `05${'01'.repeat(20)}${'aa'.repeat(12)}${'01'.repeat(4)}0321`;
function sessions(state: string) {
  return gardenSchema.parse({ network: 'mainnet', balanceSatoshis: 0, sessions: [{ commitment, plantedAt: 1000, releaseAt: 1537000, duration: 1536, state, confirmations: 6 }] }).sessions;
}
test('a restarted/backgrounded blockchain session derives progress from its deadline without granting a tree', () => {
  const view = onchainSessionView(sessions('locked'), 769000);
  expect(view?.progress).toBe(0.5);
  expect(view?.session.state).toBe('locked');
  expect(onchainSessionView(sessions('locked'), 9999999999)?.session.state).toBe('locked');
  expect(claimedSessions(sessions('claiming'))).toHaveLength(0);
  expect(claimedSessions(sessions('transferred'))).toHaveLength(0);
  expect(onchainSessionView(sessions('claimed'), 0)).toBe(null);
  expect(onchainSessionView(sessions('confirming'), 9999999999)?.progress).toBe(0);
});
test('reorg regression removes a claimed tree and restores confirming session state', () => {
  expect(claimedSessions(sessions('claimed'))).toHaveLength(1);
  expect(claimedSessions(sessions('confirming'))).toHaveLength(0);
  expect(onchainSessionView(sessions('confirming'), 0)?.message).toContain('confirmations');
});
test('legacy backup restoration validates keys and never overwrites an existing vault', async () => {
  const key = '01'.repeat(32);
  expect(rawKeySchema.safeParse('00'.repeat(32)).success).toBe(false);
  expect(rawKeySchema.safeParse('not a backup').success).toBe(false);
  const saved: string[] = [];
  await restoreRawWallet(key, { read: async () => null, save: async (value) => { saved.push(value); } });
  expect(saved).toEqual([key]);
  await expect(restoreRawWallet(key, { read: async () => 'existing', save: async (value) => { saved.push(value); } })).rejects.toThrow();
  expect(saved).toEqual([key]);
});
test('offline garden caches are bound to the wallet and the contract category', async () => {
  const { gardenCacheKey, cachedGardenSchema } = await import('../src/services/garden');
  const config = { address: 'bitcoincash:example', category: '11'.repeat(32) };
  expect(gardenCacheKey(config)).not.toBe(gardenCacheKey({ ...config, category: '33'.repeat(32) }));
  expect(gardenCacheKey(config)).not.toBe(gardenCacheKey({ ...config, address: 'bitcoincash:another' }));
  expect(gardenCacheKey({ ...config, category: '' })).toBe(null);
  expect(cachedGardenSchema.safeParse({ checkedAt: 1234, garden: { network: 'mainnet', balanceSatoshis: 0, sessions: sessions('locked') } }).success).toBe(true);
});

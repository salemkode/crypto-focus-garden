import { expect, test } from 'bun:test';
import { gardenSchema, claimedSessions } from '../src/services/garden';
import { onchainSessionView } from '../src/features/focus/onchain-session';
import { rawKeySchema, restoreRawWallet } from '../src/features/wallet/raw-recovery';

const commitment = `05${'01'.repeat(20)}${'aa'.repeat(12)}${'01'.repeat(4)}0321`;
function sessions(state: string) {
  return gardenSchema.parse({ network: 'chipnet', creditSatoshis: 0, sessions: [{ commitment, plantedAt: 1000, releaseAt: 1537000, duration: 1536, state, confirmations: 6 }] }).sessions;
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
test('offline garden caches are bound to wallet, category and post-fork checkpoint', async () => {
  const { gardenCacheKey, cachedGardenSchema } = await import('../src/services/garden');
  const config = { address: 'bchtest:example', category: '11'.repeat(32), checkpointHash: '22'.repeat(32) };
  expect(gardenCacheKey(config)).not.toBe(gardenCacheKey({ ...config, checkpointHash: '33'.repeat(32) }));
  expect(gardenCacheKey(config)).not.toBe(gardenCacheKey({ ...config, address: 'bchtest:another' }));
  expect(gardenCacheKey({ ...config, checkpointHash: '' })).toBe(null);
  expect(cachedGardenSchema.safeParse({ checkedAt: 1234, garden: { network: 'chipnet', creditSatoshis: 0, sessions: sessions('locked') } }).success).toBe(true);
});
test('server recovery restores the original wallet and intent after local operation storage is lost', async () => {
  const { restoreOperationRecord } = await import('@focus-garden/protocol/recovery');
  const row = { id: crypto.randomUUID(), account: 'test-person', key: crypto.randomUUID(), wallet: 'bchtest:original', kind: 'claim' as const, state: 'confirming' as const, intent: JSON.stringify({ action: 'claim', commitment }), payload: null, raw: 'public-signed-bytes' };
  const recovered = restoreOperationRecord(row, row.wallet, 12345);
  expect(recovered?.intent?.action).toBe('claim');
  expect(recovered?.raw).toBe(row.raw);
  expect(recovered?.id).toBe(row.id);
  expect(restoreOperationRecord(row, 'bchtest:another')).toBe(null);
  expect(restoreOperationRecord({ ...row, state: 'seen' }, row.wallet)).toBe(null);
});

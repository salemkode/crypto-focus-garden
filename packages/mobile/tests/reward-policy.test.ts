import { describe, expect, test } from 'bun:test';
import { claimedSessions, gardenSchema } from '../src/services/garden';
import { initialGarden, settleGarden, gardenSchema as focusSchema } from '../src/features/focus/session';

const reward = {
  commitment: `05${'01'.repeat(20)}${'aa'.repeat(12)}${'01'.repeat(4)}0321`, plantedAt: 1000, releaseAt: 1_537_000,
  duration: 1536, confirmations: 6, state: 'claimed',
};
describe('merged local sessions and v5 rewards', () => {
  test('a local completed session never becomes a claimed tree', () => {
    const local = settleGarden(focusSchema.parse({ ...initialGarden(), timer: { status: 'growing', id: 'local', duration: 60, species: 'oak', tag: 'focus', startedAt: 1000, endsAt: 61000, leftAt: null, seenAt: 1000 } }), 90000);
    expect(local.records.length).toBe(1);
    expect(local.timer.status).toBe('grown');
    expect(claimedSessions([]).length).toBe(0);
  });
  test('only claimed rewards are counted, never locked, confirming or claimable', () => {
    const data = gardenSchema.parse({ network: 'mainnet', balanceSatoshis: 0, sessions: ['confirming', 'locked', 'claimable', 'claimed'].map((state, index) => ({ ...reward, commitment: `05${String(index + 1).padStart(2, '0').repeat(20)}${'aa'.repeat(12)}${'01'.repeat(4)}0321`, state })) });
    expect(claimedSessions(data.sessions).length).toBe(1);
  });
  test('rejects duplicate rewards, legacy commitments, early estimates and wrong network', () => {
    const data = { network: 'mainnet', balanceSatoshis: 0, sessions: [reward] };
    expect(gardenSchema.safeParse(data).success).toBe(true);
    expect(gardenSchema.safeParse({ ...data, sessions: [reward, reward] }).success).toBe(false);
    expect(gardenSchema.safeParse({ ...data, sessions: [{ ...reward, commitment: `01${'00'.repeat(29)}03` }] }).success).toBe(false);
    expect(gardenSchema.safeParse({ ...data, sessions: [{ ...reward, releaseAt: 2000 }] }).success).toBe(false);
    expect(gardenSchema.safeParse({ ...data, network: 'testnet4' }).success).toBe(false);
  });
});

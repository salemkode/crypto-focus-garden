import { expect, test } from 'bun:test';
import { mergedCommitment, plantedCommitment } from '@focus-garden/protocol/forest';
import { newConsent, nextRelease, PLANT_WINDOW_MS, RELEASE_FEE_CEILING_SATS, spendConsent } from '../src/features/rewards/auto-release';

const wallet = `76a914${'5f'.repeat(20)}88ac`;
const stranger = `76a914${'7a'.repeat(20)}88ac`;
const planter = `76a914${'3c'.repeat(20)}88ac`;
const tapAt = 1_800_000_000_000;
const tree = (owner: string, units = 3, seconds = tapAt / 1000, tier = 2) => plantedCommitment(owner, planter, seconds, units, tier, 1);
const consent = (overrides: Partial<{ units: number; approvedAt: number; recipientBytecode: string }> = {}) =>
  newConsent({ id: 'plant-1', recipientBytecode: wallet, units: 3, approvedAt: tapAt, ...overrides });
const fee = { networkFeeSats: RELEASE_FEE_CEILING_SATS, busy: false };

test('a grown tree planted under a Plant-time consent is released to the linked wallet, once', () => {
  const sessions = [{ commitment: tree(wallet), state: 'claimable', plantedAt: tapAt + 30_000 }];
  const first = nextRelease([consent()], sessions, fee);
  expect(first?.commitment).toBe(sessions[0].commitment);
  const spent = spendConsent([consent()], first!.consent.id, first!.commitment);
  expect(nextRelease(spent, sessions, fee)).toBeNull();
  // A spent consent stays spent, even if asked again.
  expect(spendConsent(spent, 'plant-1', 'other')).toEqual(spent);
});

test('nothing is released without a matching consent', () => {
  const grown = { commitment: tree(wallet), state: 'claimable', plantedAt: tapAt + 30_000 };
  expect(nextRelease([], [grown], fee)).toBeNull();
  expect(nextRelease([consent({ recipientBytecode: stranger })], [grown], fee)).toBeNull();
  expect(nextRelease([consent({ units: 6 })], [grown], fee)).toBeNull();
  expect(nextRelease([consent({ approvedAt: tapAt - PLANT_WINDOW_MS - 120_000 })], [grown], fee)).toBeNull();
  expect(nextRelease([consent({ approvedAt: tapAt + 10 * 60_000 })], [grown], fee)).toBeNull();
});

test('only matured, unmerged trees in the contract are released, never while another operation runs', () => {
  for (const state of ['confirming', 'locked', 'claiming', 'claimed', 'merging', 'transferred']) {
    expect(nextRelease([consent()], [{ commitment: tree(wallet), state, plantedAt: tapAt }], fee)).toBeNull();
  }
  const sprout = (offset: number) => tree(wallet, 1, tapAt / 1000 + offset, 1);
  const merged = mergedCommitment([sprout(0), sprout(1), sprout(2)]);
  expect(nextRelease([consent()], [{ commitment: merged, state: 'claimable', plantedAt: tapAt }], fee)).toBeNull();
  expect(nextRelease([consent()], [{ commitment: tree(wallet), state: 'claimable', plantedAt: tapAt }], { ...fee, busy: true })).toBeNull();
});

test('a fee above the approved ceiling is not paid automatically', () => {
  const grown = { commitment: tree(wallet), state: 'claimable', plantedAt: tapAt };
  expect(nextRelease([consent()], [grown], { networkFeeSats: RELEASE_FEE_CEILING_SATS + 1, busy: false })).toBeNull();
});

test('the oldest grown tree goes first and each consent covers one tree', () => {
  const older = { commitment: tree(wallet, 3, tapAt / 1000 - 5), state: 'claimable', plantedAt: tapAt };
  const newer = { commitment: tree(wallet, 3, tapAt / 1000 + 5), state: 'claimable', plantedAt: tapAt + 60_000 };
  const pick = nextRelease([consent()], [newer, older], fee);
  expect(pick?.commitment).toBe(older.commitment);
  expect(nextRelease(spendConsent([consent()], 'plant-1', older.commitment), [newer, older], fee)).toBeNull();
});

import { describe, expect, test } from 'bun:test';
import { binToHex, encodeTransaction, hexToBin, type Output } from '@bitauth/libauth';
import { aboutOutputBytecode, mergedCommitment, plantedCommitment, profileCommitment } from '../src/forest';
import { electrumScriptHash, parseAbout, rankLeaders, scanForest, type ChainTransaction, type ContractRef } from '../src/leaderboard';

const forest: ContractRef = { category: 'aa'.repeat(31) + '01', lockingBytecode: `aa20${'11'.repeat(32)}87` };
const directory: ContractRef = { category: 'bb'.repeat(31) + '02', lockingBytecode: `aa20${'22'.repeat(32)}87` };
const p2pkh = (byte: string) => `76a914${byte.repeat(20)}88ac`;
const alice = { app: p2pkh('a1'), reward: p2pkh('a2') };
const bob = { app: p2pkh('b1'), reward: p2pkh('b2') };
const NOW = 1_800_000_000;
const DAY = 86_400;

const token = (contract: ContractRef, capability: 'none' | 'mutable' | 'minting', commitment = '') =>
  ({ category: hexToBin(contract.category), amount: 0n, nft: { capability, commitment: hexToBin(commitment) } });
const output = (lockingBytecode: string, extra: Partial<Output> = {}): Output => ({ lockingBytecode: hexToBin(lockingBytecode), valueSatoshis: 1000n, ...extra });
let counter = 0;
function tx(outputs: Output[], height = 100): ChainTransaction {
  counter += 1;
  const raw = binToHex(encodeTransaction({ version: 2, locktime: 0, inputs: [{ outpointIndex: 0, outpointTransactionHash: new Uint8Array(32).fill(counter), sequenceNumber: 0xffffffff, unlockingBytecode: new Uint8Array() }], outputs }));
  return { txid: counter.toString(16).padStart(64, '0'), height, raw };
}
const baton = (contract: ContractRef) => output(contract.lockingBytecode, { token: token(contract, 'minting') });
function plant(who: typeof alice, stamp: number, units: number, tier: number, height = 100) {
  const commitment = plantedCommitment(who.reward, who.app, stamp, units, tier, 1);
  return { commitment, transaction: tx([baton(forest), output(forest.lockingBytecode, { token: token(forest, 'mutable', commitment) })], height) };
}
function register(who: typeof alice, name: string, about = '', height = 100) {
  const outputs = [baton(directory), output(who.app, { token: token(directory, 'none', profileCommitment(name)) })];
  if (about) outputs.push({ lockingBytecode: hexToBin(aboutOutputBytecode(about)), valueSatoshis: 0n });
  return tx(outputs, height);
}

describe('on-chain leaderboard', () => {
  test('scores planted trees for members with a profile card', () => {
    const history = [
      register(alice, 'Alice', 'Deep work in the mornings'),
      register(bob, 'Bob'),
      plant(alice, NOW - DAY, 3, 2).transaction, // Tree, 3 points
      plant(alice, NOW - 2 * DAY, 11, 4).transaction, // House, 12 points
      plant(bob, NOW - DAY, 1, 1).transaction, // Sprout, 1 point
    ];
    const ranked = rankLeaders(scanForest(history, forest, directory), 'all', NOW);
    expect(ranked.map((entry) => [entry.rank, entry.name, entry.points, entry.trees, entry.bestTier])).toEqual([[1, 'Alice', 15, 2, 4], [2, 'Bob', 1, 1, 1]]);
    expect(ranked[0].about).toBe('Deep work in the mornings');
    expect(ranked[0].tipAddress).toStartWith('bchtest:');
  });

  test('merges, claims and unconfirmed or foreign transactions add no points', () => {
    const a = plant(alice, NOW - DAY, 1, 1);
    const b = plant(alice, NOW - DAY + 1, 1, 1);
    const c = plant(alice, NOW - DAY + 2, 1, 1);
    const merged = mergedCommitment([a.commitment, b.commitment, c.commitment]);
    const history = [
      register(alice, 'Alice'),
      a.transaction, b.transaction, c.transaction,
      // Merge: a 0-unit tree back at the contract, no baton.
      tx([output(forest.lockingBytecode, { token: token(forest, 'mutable', merged) })]),
      // Claim: the same tree moves to its owner.
      tx([output(alice.reward, { token: token(forest, 'none', a.commitment) })]),
      // A planting still in the mempool.
      plant(alice, NOW, 11, 4, 0).transaction,
      // A look-alike tree from another category.
      tx([baton({ ...forest, category: 'cc'.repeat(32) }), output(forest.lockingBytecode, { token: token({ ...forest, category: 'cc'.repeat(32) }, 'mutable', plant(alice, NOW, 11, 4).commitment) })]),
    ];
    const [entry] = rankLeaders(scanForest(history, forest, directory), 'all', NOW);
    expect(entry.points).toBe(3);
    expect(entry.trees).toBe(3);
  });

  test('the week view only counts the last seven days', () => {
    const history = [register(alice, 'Alice'), plant(alice, NOW - 8 * DAY, 11, 4).transaction, plant(alice, NOW - DAY, 3, 2).transaction];
    const scan = scanForest(history, forest, directory);
    expect(rankLeaders(scan, 'week', NOW)[0].points).toBe(3);
    expect(rankLeaders(scan, 'all', NOW)[0].points).toBe(15);
  });

  test('members without a profile card stay private', () => {
    const history = [register(alice, 'Alice'), plant(alice, NOW, 3, 2).transaction, plant(bob, NOW, 11, 4).transaction];
    expect(rankLeaders(scanForest(history, forest, directory), 'all', NOW).map((entry) => entry.name)).toEqual(['Alice']);
  });

  test('a name belongs to whoever registered it first', () => {
    const history = [register(alice, 'Maple'), register(bob, 'maple'), plant(alice, NOW, 3, 2).transaction, plant(bob, NOW, 3, 2).transaction];
    const ranked = rankLeaders(scanForest(history, forest, directory), 'all', NOW);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].id).toBe(scanForest(history, forest, directory).profiles.keys().next().value!);
  });

  test('reads the about text and Electrum script hash', () => {
    expect(parseAbout(aboutOutputBytecode('Hello garden'))).toBe('Hello garden');
    expect(parseAbout(aboutOutputBytecode('x'.repeat(120)))).toBe('x'.repeat(120));
    expect(parseAbout('6a0400000000')).toBe('');
    // sha256 of an empty script, byte-reversed.
    expect(electrumScriptHash('')).toBe('55b852781b9995a44c939b64e441ae2724b96f99c8f4fb9a141cfc9842c4b0e3');
  });
});

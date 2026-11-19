import { describe, expect, test } from 'bun:test';
import { binToHex, createVirtualMachineBch2023, createVirtualMachineBch2026, hexToBin, sha256, utf8ToBin, type Output, type TransactionCommon } from '@bitauth/libauth';
import {
  bcmrPublicationBytecode, buildRegistry, focusMinutes, FOREST_PARSE_BYTECODE, isRegistry, PROFILE_PARSE_BYTECODE, profileMetadata,
  registryContentHash, serializeRegistry, treeMetadata, treeTypeKey,
} from '../src/bcmr';
import { FOREST_SPECIES, FOREST_TIERS, mergedCommitment, plantedCommitment, profileCommitment } from '../src/forest';

const forestCategory = 'cd'.repeat(32);
const directoryCategory = '4b'.repeat(32);
const site = 'https://focus.salemkode.com';
const registry = buildRegistry({ forestCategory, directoryCategory, site, revision: '2026-11-19T08:00:00.000Z' });
const p2pkh = (byte: string) => `76a914${byte.repeat(20)}88ac`;

/**
 * Evaluates a BCMR parse bytecode the way wallets do (Cashonize's nftParsing.ts): input 0 holds
 * the NFT, input 1 runs the parse bytecode as its locking bytecode with OP_1 as unlocking bytecode.
 */
function parse(bytecode: string, category: string, commitment: string, vm = createVirtualMachineBch2026()) {
  const nft: Output = { lockingBytecode: hexToBin(p2pkh('aa')), valueSatoshis: 1000n, token: { category: hexToBin(category), amount: 0n, nft: { capability: 'none', commitment: hexToBin(commitment) } } };
  const transaction: TransactionCommon = {
    version: 2,
    locktime: 0,
    inputs: [
      { outpointIndex: 0, outpointTransactionHash: new Uint8Array(32), sequenceNumber: 0, unlockingBytecode: new Uint8Array() },
      { outpointIndex: 0, outpointTransactionHash: new Uint8Array(32), sequenceNumber: 0, unlockingBytecode: hexToBin('51') },
    ],
    outputs: [{ lockingBytecode: hexToBin('6a'), valueSatoshis: 0n }],
  };
  const state = vm.evaluate({ inputIndex: 1, sourceOutputs: [nft, { lockingBytecode: hexToBin(bytecode), valueSatoshis: 0n }], transaction });
  return { error: state.error, altstack: state.alternateStack.map(binToHex) };
}
const vmNumber = (hex: string) => { const bytes = hexToBin(hex); return bytes.reduce((sum, byte, index) => sum + byte * 256 ** index, 0); };

describe('tree parse bytecode', () => {
  const plantedAt = 1_795_000_000;
  for (const vm of [createVirtualMachineBch2023(), createVirtualMachineBch2026()]) {
    test('every planted tier and style yields its type, focus minutes and planting time', () => {
      for (const tier of FOREST_TIERS) {
        for (const species of FOREST_SPECIES) {
          for (const units of [tier.minUnits, 24]) {
            const commitment = plantedCommitment(p2pkh('a2'), p2pkh('a1'), plantedAt, units, tier.code, species.code);
            const { error, altstack } = parse(FOREST_PARSE_BYTECODE, forestCategory, commitment, vm);
            expect(error).toBeUndefined();
            expect(altstack[0]).toBe(treeTypeKey(commitment)!);
            expect(registry.identities[forestCategory]['2026-11-19T08:00:00.000Z'].token.nfts.parse.types[altstack[0]]).toBeDefined();
            expect(vmNumber(altstack[1]) / 10).toBe(focusMinutes(units));
            expect(vmNumber(altstack[2])).toBe(plantedAt);
          }
        }
      }
    });

    test('merged trees yield a merged type and their lineage', () => {
      const sprouts = [0, 1, 2].map((i) => plantedCommitment(p2pkh('a2'), p2pkh('a1'), plantedAt + i, 1, 1, 4));
      const merged = mergedCommitment(sprouts);
      const { error, altstack } = parse(FOREST_PARSE_BYTECODE, forestCategory, merged, vm);
      expect(error).toBeUndefined();
      expect(altstack).toEqual(['246d', merged.slice(66, 74)]);
      expect(treeTypeKey(merged)).toBe('246d');
      expect(treeMetadata(registry, forestCategory, merged)).toMatchObject({ name: 'Ember Maple · Tree (merged)', focusMinutes: null });
    });
  }

  test('a non-tree commitment fails to parse, so wallets fall back to the collection metadata', () => {
    expect(parse(FOREST_PARSE_BYTECODE, forestCategory, '0102').error).toBeDefined();
  });

  test('the shown minutes match the contract tiers (8.5, 25.6, 51.2, 93.9)', () => {
    expect(FOREST_TIERS.map((tier) => focusMinutes(tier.minUnits))).toEqual([8.5, 25.6, 51.2, 93.9]);
  });
});

describe('profile parse bytecode', () => {
  test('yields the card type and the UTF-8 name', () => {
    const commitment = profileCommitment('Salem');
    const { error, altstack } = parse(PROFILE_PARSE_BYTECODE, directoryCategory, commitment);
    expect(error).toBeUndefined();
    expect(altstack).toEqual(['01', binToHex(utf8ToBin('Salem'))]);
    expect(profileMetadata(registry, directoryCategory, commitment)).toMatchObject({ name: 'Salem', card: 'Profile card' });
  });
});

describe('registry', () => {
  test('lists 24 planted and 18 merged tree types, each with its own picture', () => {
    const types = registry.identities[forestCategory]['2026-11-19T08:00:00.000Z'].token.nfts.parse.types;
    expect(Object.keys(types)).toHaveLength(42);
    expect(types['46'].uris.image).toBe(`${site}/bcmr/trees/house-cash.png`);
    expect(types['11'].name).toBe('Meadow Oak · Sprout');
    expect(new Set(Object.values(types).map((type) => type.uris.image)).size).toBe(24);
  });

  test('known trees also get an entry keyed by their exact commitment, for indexers that cannot parse', () => {
    const trees = [plantedCommitment(p2pkh('a2'), p2pkh('a1'), 1_795_000_000, 11, 4, 6), plantedCommitment(p2pkh('a2'), p2pkh('a1'), 1_795_000_001, 1, 1, 2)];
    const withTrees = buildRegistry({ forestCategory, directoryCategory, site, revision: '2026-11-19T08:00:00.000Z', trees: [...trees, trees[0], '0102'] });
    const types = withTrees.identities[forestCategory]['2026-11-19T08:00:00.000Z'].token.nfts.parse.types;
    expect(Object.keys(types)).toHaveLength(44);
    expect(types[trees[0]]).toEqual(types['46']);
    expect(types[trees[1]].uris.icon).toBe(`${site}/bcmr/trees/sprout-cherry.png`);
    // Parsing still resolves the style key, so names and fields are unchanged.
    expect(parse(FOREST_PARSE_BYTECODE, forestCategory, trees[0]).altstack[0]).toBe('46');
  });

  test('tree metadata for an app tree comes from the registry', () => {
    const commitment = plantedCommitment(p2pkh('a2'), p2pkh('a1'), 1_795_000_000, 11, 4, 6);
    expect(treeMetadata(registry, forestCategory, commitment)).toEqual({
      name: 'Cash Tree · House',
      description: expect.stringContaining('93.9 minutes'),
      image: `${site}/bcmr/trees/house-cash.png`,
      focusMinutes: 93.9,
    });
    expect(treeMetadata(registry, 'ff'.repeat(32), commitment)).toBeNull();
  });

  test('serializes deterministically and hashes the exact hosted bytes', () => {
    const text = serializeRegistry(registry);
    expect(serializeRegistry(JSON.parse(text))).toBe(text);
    expect(registryContentHash(text)).toBe(binToHex(sha256.hash(utf8ToBin(text))));
    expect(isRegistry(JSON.parse(text))).toBe(true);
  });

  test('publication output is OP_RETURN <BCMR> <hash> <uri without scheme>', () => {
    const hash = 'ab'.repeat(32);
    const uri = 'focus.salemkode.com/.well-known/bitcoin-cash-metadata-registry.json';
    const bytecode = bcmrPublicationBytecode(hash, `https://${uri}`);
    expect(bytecode).toBe(`6a04${binToHex(utf8ToBin('BCMR'))}20${hash}${uri.length.toString(16)}${binToHex(utf8ToBin(uri))}`);
    expect(bytecode.length / 2).toBeLessThanOrEqual(223);
  });
});

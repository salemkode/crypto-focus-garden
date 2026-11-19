import { binToHex, hexToBin, sha256, utf8ToBin } from '@bitauth/libauth';
import { FOREST_SPECIES, FOREST_TIERS, UNIT_SECONDS, parseProfile, parseTree } from './forest';

/**
 * Bitcoin Cash Metadata Registry (BCMR v2) for the Focus Garden token categories.
 *
 * Wallets (Cashonize, Paytaca, ...) find a category's registry by following its authchain
 * and reading the latest `OP_RETURN <"BCMR"> <sha256> <uri>` output. Each category's genesis
 * transaction publishes this registry, so trees and profile cards show their names, pictures
 * and attributes in any wallet. The app reads the same registry, so it carries no copy of it.
 *
 * Trees use a parsable NFT collection: the `bytecode` below runs in the BCH VM against the
 * NFT's commitment (layout in contracts/FocusForest.cash) and leaves on the altstack:
 *   [0] the NFT type: the look byte (tier * 16 + species), followed by 6d ("m") for merged trees
 *   [1] planted trees: verified focus in tenths of a minute;  merged trees: the lineage stamp
 *   [2] planted trees: the planting time (seconds)
 */

export const BCMR_SCHEMA = 'https://cashtokens.org/bcmr-v2.schema.json';
export const BCMR_WELL_KNOWN_PATH = '/.well-known/bitcoin-cash-metadata-registry.json';

/** One push per op; hand-assembled and covered by test/bcmr.test.ts against the BCH VM. */
export const FOREST_PARSE_BYTECODE = [
  '00cf', //            OP_0 OP_UTXOTOKENCOMMITMENT             [c]
  '82012788', //        OP_SIZE <39> OP_EQUALVERIFY
  '0121', '7f77', //    <33> OP_SPLIT OP_NIP                    [stamp|units|look]
  '547f', //            <4> OP_SPLIT                            [stamp, units|look]
  '517f', //            <1> OP_SPLIT                            [stamp, units, look]
  '7c817c', //          OP_SWAP OP_BIN2NUM OP_SWAP              [stamp, units#, look]
  '7863', //            OP_OVER OP_IF                           planted (units > 0)
  '6b', //                OP_TOALTSTACK                         type = look
  '020014', '95', //      <5120> OP_MUL                         units * 512 s * 10 / 60 s
  '011e', '93', //        <30> OP_ADD                           rounded
  '013c', '96', //        <60> OP_DIV
  '6b6b', //              OP_TOALTSTACK OP_TOALTSTACK           focus, planted
  '67', //              OP_ELSE                                 merged (units = 0)
  '016d7e6b', //          <"m"> OP_CAT OP_TOALTSTACK            type = look + "m"
  '756b', //              OP_DROP OP_TOALTSTACK                 lineage
  '68', //              OP_ENDIF
].join('');

/** Profile card: 01 | display name. */
export const PROFILE_PARSE_BYTECODE = [
  '00cf', //   OP_0 OP_UTXOTOKENCOMMITMENT  [c]
  '517f', //   <1> OP_SPLIT                 [01, name]
  '7c6b6b', // OP_SWAP OP_TOALTSTACK OP_TOALTSTACK
].join('');

const byteHex = (value: number) => value.toString(16).padStart(2, '0');

/** The type key the parse bytecode yields for a tree commitment, or null if it isn't a tree. */
export function treeTypeKey(commitment: string) {
  const tree = parseTree(commitment);
  if (!tree) return null;
  const look = byteHex(tree.tier * 16 + tree.species);
  return tree.merged ? `${look}6d` : look;
}

/** Verified focus in minutes, exactly as the registry shows it (one decimal). */
export const focusMinutes = (units: number) => Math.floor((units * UNIT_SECONDS * 10 + 30) / 60) / 10;

export interface NftType { name: string; description: string; fields: string[]; uris: { icon: string; image: string } }
export interface IdentitySnapshot {
  name: string;
  description: string;
  token: {
    category: string;
    symbol: string;
    decimals: number;
    nfts: {
      description: string;
      fields: Record<string, { name: string; description: string; encoding: { type: string; decimals?: number; unit?: string } }>;
      parse: { bytecode: string; types: Record<string, NftType> };
    };
  };
  uris: Record<string, string>;
}
export interface Registry {
  $schema: string;
  version: { major: number; minor: number; patch: number };
  latestRevision: string;
  registryIdentity: { name: string; description: string; uris: Record<string, string> };
  identities: Record<string, Record<string, IdentitySnapshot>>;
}

export interface RegistryOptions {
  forestCategory: string;
  directoryCategory: string;
  /** Site that hosts the registry and the tree pictures, e.g. https://focus.salemkode.com */
  site: string;
  /** ISO time of this revision (normally the deployment time). */
  revision: string;
  /**
   * Commitments of trees already minted. Each gets its own entry keyed by the full commitment,
   * a copy of its style type, because wallets that read metadata through an indexer (Cashonize
   * and Paytaca use bcmr.paytaca.com) look types up by exact commitment and do not run the
   * parse bytecode yet; with these entries they show each tree's own picture too.
   */
  trees?: readonly string[];
}

/** Tree pictures live at <site>/bcmr/trees/<tier>-<species>.png. */
export const treeImagePath = (tierKey: string, speciesKey: string) => `/bcmr/trees/${tierKey}-${speciesKey}.png`;

const typeName = (tier: (typeof FOREST_TIERS)[number], species: (typeof FOREST_SPECIES)[number], merged: boolean) =>
  `${species.name} · ${tier.name}${merged ? ' (merged)' : ''}`;

/**
 * The name wallets show for a tree (from this registry), e.g. "Meadow Oak · Sprout", with
 * " (merged)" for merged trees unless `markMerged` is false; null if not a tree.
 */
export function treeName(commitment: string, markMerged = true) {
  const tree = parseTree(commitment);
  if (!tree) return null;
  return typeName(FOREST_TIERS[tree.tier - 1], FOREST_SPECIES[tree.species - 1], markMerged && tree.merged);
}

function treeTypes(site: string) {
  const types: Record<string, NftType> = {};
  for (const tier of FOREST_TIERS) {
    for (const species of FOREST_SPECIES) {
      const look = byteHex(tier.code * 16 + species.code);
      const picture = `${site}${treeImagePath(tier.key, species.key)}`;
      const uris = { icon: picture, image: picture };
      const minimum = focusMinutes(tier.minUnits);
      types[look] = {
        name: typeName(tier, species, false),
        description: `A ${tier.name} grown from at least ${minimum} minutes of verified focus. Its deposit stays with the tree.`,
        fields: ['focus', 'planted'],
        uris,
      };
      // Merges only produce the three upper tiers (3 Sprouts -> Tree, 2 Trees -> Big Tree, 2 Big Trees -> House).
      if (tier.code > 1) {
        const from = FOREST_TIERS[tier.code - 2];
        types[`${look}6d`] = {
          name: typeName(tier, species, true),
          description: `A ${tier.name} grown by merging ${from.mergeCount} ${from.name}s. It carries their deposits.`,
          fields: ['lineage'],
          uris,
        };
      }
    }
  }
  return types;
}

export function buildRegistry({ forestCategory, directoryCategory, site, revision, trees = [] }: RegistryOptions): Registry {
  for (const category of [forestCategory, directoryCategory]) if (!/^[0-9a-f]{64}$/.test(category)) throw new Error('A category id is 64 hex characters.');
  if (!/^https:\/\/[^/]+$/.test(site)) throw new Error('The site is an https origin without a trailing slash.');
  const icon = `${site}/icon.png`;
  const types = treeTypes(site);
  for (const commitment of [...new Set(trees)].sort()) {
    const key = treeTypeKey(commitment);
    if (key) types[commitment] = types[key];
  }
  return {
    $schema: BCMR_SCHEMA,
    version: { major: 1, minor: 0, patch: 0 },
    latestRevision: revision,
    registryIdentity: {
      name: 'Focus Garden',
      description: 'Metadata for the Focus Garden collections on Bitcoin Cash: trees grown by verified focus, and member profile cards.',
      uris: { icon, web: site, registry: `${site}${BCMR_WELL_KNOWN_PATH}` },
    },
    identities: {
      [forestCategory]: {
        [revision]: {
          name: 'Focus Forest',
          description: 'Trees grown in Focus Garden. Every tree is minted by the Focus Forest contract for a verified focus session, keeps a BCH deposit, and can be merged into a bigger tree.',
          token: {
            category: forestCategory,
            symbol: 'TREE',
            decimals: 0,
            nfts: {
              description: 'Each tree records its owner, planting wallet, planting time, verified focus and look.',
              fields: {
                focus: { name: 'Verified focus', description: 'Focus time locked on chain to grow this tree.', encoding: { type: 'number', decimals: 1, unit: 'min' } },
                planted: { name: 'Planted', description: 'When the tree was planted.', encoding: { type: 'locktime' } },
                lineage: { name: 'Lineage', description: 'Fingerprint of the trees merged into this one.', encoding: { type: 'hex' } },
              },
              parse: { bytecode: FOREST_PARSE_BYTECODE, types },
            },
          },
          uris: { icon, image: `${site}${treeImagePath('house', 'cash')}`, web: site },
        },
      },
      [directoryCategory]: {
        [revision]: {
          name: 'Focus Garden Profiles',
          description: 'Profile cards of Focus Garden members, so friends can find and tip each other by name.',
          token: {
            category: directoryCategory,
            symbol: 'FOCUSID',
            decimals: 0,
            nfts: {
              description: 'An immutable card holding a member display name.',
              fields: { name: { name: 'Name', description: 'Display name chosen by the member.', encoding: { type: 'utf8' } } },
              parse: { bytecode: PROFILE_PARSE_BYTECODE, types: { '01': { name: 'Profile card', description: 'A Focus Garden member card.', fields: ['name'], uris: { icon, image: icon } } } },
            },
          },
          uris: { icon, web: site },
        },
      },
    },
  };
}

/** The exact bytes to host. Wallets hash what they download, so publish this text unchanged. */
export const serializeRegistry = (registry: Registry) => `${JSON.stringify(registry, null, 2)}\n`;

/** SHA-256 of the hosted bytes, in OP_SHA256 byte order (as BCMR publications carry it). */
export const registryContentHash = (text: string) => binToHex(sha256.hash(utf8ToBin(text)));

/** `OP_RETURN <"BCMR"> <sha256> <uri>`; the uri omits "https://", as the BCMR spec recommends. */
export function bcmrPublicationBytecode(contentHash: string, uri: string) {
  if (!/^[0-9a-f]{64}$/.test(contentHash)) throw new Error('The content hash is 32 bytes of hex.');
  const location = utf8ToBin(uri.replace(/^https:\/\//, ''));
  if (location.length < 1 || location.length > 75) throw new Error('The registry URI must be 1 to 75 bytes.');
  return binToHex(new Uint8Array([0x6a, 0x04, ...utf8ToBin('BCMR'), 0x20, ...hexToBin(contentHash), location.length, ...location]));
}

export interface TreeMetadata { name: string; description: string; image: string; focusMinutes: number | null }

/** Name, picture and description of a tree from the published registry; null when unknown. */
export function treeMetadata(registry: Registry, category: string, commitment: string): TreeMetadata | null {
  const snapshot = latestSnapshot(registry, category);
  const key = treeTypeKey(commitment);
  const type = key ? snapshot?.token.nfts.parse.types[key] : undefined;
  if (!type) return null;
  const tree = parseTree(commitment)!;
  return { name: type.name, description: type.description, image: type.uris.image, focusMinutes: tree.merged ? null : focusMinutes(tree.units) };
}

export function profileMetadata(registry: Registry, category: string, commitment: string) {
  const snapshot = latestSnapshot(registry, category);
  const profile = parseProfile(commitment);
  const type = profile ? snapshot?.token.nfts.parse.types['01'] : undefined;
  return type && profile ? { name: profile.name, card: type.name, image: type.uris.image } : null;
}

/** The newest snapshot not later than now. */
export function latestSnapshot(registry: Registry, category: string, now = new Date()) {
  const history = registry.identities[category];
  if (!history) return null;
  const current = Object.keys(history).filter((time) => Date.parse(time) <= now.getTime()).sort().at(-1);
  return current ? history[current] : null;
}

/** Light shape check for a downloaded registry before the app trusts it. */
export function isRegistry(value: unknown): value is Registry {
  const candidate = value as Registry;
  return Boolean(candidate && typeof candidate === 'object' && candidate.$schema === BCMR_SCHEMA && candidate.identities && typeof candidate.identities === 'object');
}

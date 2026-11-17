/**
 * The Focus Garden ladder: ten levels. One session grows a level 1–3 tree (sessions are capped at
 * one hour); everything above comes from merging. Trees merge into groves, groves become a cabin
 * (the trees become timber), and buildings merge into bigger buildings up to the legendary
 * Sky Citadel, which floats above the island. Every merged item is unique: the ingredients' lineage seeds its colours, details
 * and name, so no two Mills look alike.
 */
import { buildTierModel, type SpeciesKey } from './tiers';
import { hash3, mulberry32, VoxelModel } from './voxel';

import { LADDER, levelInfo, type Level } from './rules';
export { LADDER, MAX_SESSION_UNITS, levelInfo, levelForUnits, minimumUnits, type Level, type LevelInfo } from './rules';

// ---------------------------------------------------------------- style and uniqueness

const STYLE: Record<SpeciesKey, { leaves: number[]; roof: number[]; wall: number[]; banner: number }> = {
  oak: { leaves: [0x37853d, 0x51a846, 0x79c957, 0x9fdb69], roof: [0x3f6f3a, 0x4f8a45, 0x5f9d50], wall: [0xf2dfb7, 0xe7d0a5], banner: 0x4f8a45 },
  cherry: { leaves: [0xc65d88, 0xea8faf, 0xffb5ce, 0xffe1e5], roof: [0xc0577f, 0xd96f95, 0xe88aac], wall: [0xfbe7e1, 0xf2d6cf], banner: 0xd96f95 },
  pine: { leaves: [0x1e5949, 0x287652, 0x389468, 0x65ae7c], roof: [0x2d4f63, 0x3b6479, 0x4a7891], wall: [0xe6e0d2, 0xd8d0be], banner: 0x3b6479 },
  maple: { leaves: [0xad4133, 0xd65a32, 0xef893b, 0xffbb56], roof: [0xa8452e, 0xc6583a, 0xd96c45], wall: [0xf3dcc0, 0xe9cba8], banner: 0xd65a32 },
  birch: { leaves: [0x79a94b, 0xa4c85e, 0xc3de7c, 0xe1eaa0], roof: [0x8a8f5a, 0xa1a66a, 0xb7bb7c], wall: [0xf8f4ea, 0xece6d6], banner: 0xa4c85e },
  cash: { leaves: [0x08785e, 0x079f78, 0x0ac18e, 0x64dfae], roof: [0x0a7d61, 0x0a9a76, 0x0db48a], wall: [0xf5efd9, 0xeadfbf], banner: 0xf5c542 },
};
const ACCENTS = [0xf2c94c, 0xf06292, 0x9b6bd6, 0x4fc3f7, 0xff8a65, 0xffffff];
const STONE = [0x8f8f88, 0xa3a39b, 0x7b7b74];
const TIMBER = [0x6b4428, 0x7f5432, 0x93653d];
const GLASS = 0xffd87e;

class Builder extends VoxelModel {
  readonly voxels = new Map<string, { x: number; y: number; z: number; color: number }>();
  override set(x: number, y: number, z: number, color: number) { super.set(x, y, z, color); this.voxels.set(`${x},${y},${z}`, { x, y, z, color }); }
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: (x: number, y: number, z: number) => number, hollow = false) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      if (hollow && x > x0 && x < x1 && z > z0 && z < z1) continue;
      this.set(x, y, z, color(x, y, z));
    }
  }
  /** Pastes another model at an offset (and optional scale). */
  paste(model: { voxels?: Map<string, { x: number; y: number; z: number; color: number }> }, ox: number, oy: number, oz: number, scale = 1) {
    for (const v of model.voxels?.values() ?? []) this.set(ox + Math.round(v.x * scale), oy + Math.round(v.y * scale), oz + Math.round(v.z * scale), v.color);
  }
}

/** A turf plinth with a few flowers; every building stands on one. */
function plinth(m: Builder, rx: number, rz: number, seed: number) {
  for (let x = -rx; x <= rx; x++) for (let z = -rz; z <= rz; z++) {
    if (Math.abs(x) === rx && Math.abs(z) === rz) continue;
    m.set(x, 0, z, hash3(x, seed, z) > 0.72 ? 0x95bd64 : 0x7da458);
    if ((Math.abs(x) === rx || Math.abs(z) === rz) && hash3(x * 3, seed, z * 5) > 0.82) m.set(x, 1, z, ACCENTS[Math.floor(hash3(z, x, seed) * ACCENTS.length)]);
  }
}

/** A gable roof over [x0..x1] × [z0..z1], ridge along x, starting at height y. */
function gable(m: Builder, x0: number, x1: number, z0: number, z1: number, y: number, palette: number[]) {
  const half = Math.ceil((z1 - z0 + 2) / 2);
  for (let i = 0; i < half; i++) {
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      const c = palette[(x + i) % palette.length];
      m.set(x, y + i, z0 - 1 + i, c);
      m.set(x, y + i, z1 + 1 - i, c);
    }
  }
}

function windows(m: Builder, xs: number[], ys: number[], z: number) { for (const x of xs) for (const y of ys) m.set(x, y, z, GLASS); }

function flag(m: Builder, x: number, y: number, z: number, color: number) {
  for (let h = 0; h < 4; h++) m.set(x, y + h, z, 0x5a4636);
  m.set(x + 1, y + 3, z, color); m.set(x + 2, y + 3, z, color); m.set(x + 1, y + 2, z, color);
}

// ---------------------------------------------------------------- level models

function grove(style: SpeciesKey, seed: number) {
  const m = new Builder();
  const rng = mulberry32(seed);
  plinth(m, 9, 9, seed);
  // Three trees of the style, a stone circle and a lantern at the heart of the grove.
  const spots: [number, number][] = [[-4, -3], [4, -2], [0, 4]];
  spots.forEach(([x, z], i) => m.paste(buildTierModel(i === 2 ? 'bigTree' : 'tree', style, seed + i) as Builder, x, 0, z, i === 2 ? 0.7 : 0.85));
  for (let a = 0; a < 10; a++) {
    const t = (a / 10) * Math.PI * 2;
    if (rng() > 0.25) m.set(Math.round(Math.cos(t) * 8), 1, Math.round(Math.sin(t) * 8), STONE[a % 3]);
  }
  m.set(0, 1, 0, STONE[0]); m.set(0, 2, 0, 0x5a4636); m.set(0, 3, 0, GLASS);
  return m;
}

function cabin(style: SpeciesKey, seed: number) {
  const m = new Builder();
  const s = STYLE[style];
  plinth(m, 9, 7, seed);
  // Log walls: the grove's trees became timber.
  m.box(-6, 1, -4, 3, 6, 3, (x, y) => TIMBER[(y + (x & 1)) % 3], true);
  for (let x = -6; x <= 3; x++) for (let z = -4; z <= 3; z++) if (x === -6 || x === 3 || z === -4 || z === 3) if ((x + z) % 3 === 0) m.set(x, 6, z, 0x5a3a22);
  gable(m, -6, 3, -4, 3, 7, s.roof);
  for (const y of [2, 3, 4]) m.set(-2, y, 3, 0x5a3a22);
  windows(m, [0, 1], [3, 4], 3);
  // Chimney with a puff of smoke, a woodpile, and one tree of the style beside it.
  m.box(1, 7, -3, 2, 12, -2, () => STONE[1]);
  m.set(1, 13, -2, 0xe8eef2); m.set(2, 14, -3, 0xf4f7f9);
  m.box(5, 1, 2, 7, 2, 3, (x, y) => (y === 2 && x === 6 ? 0xb07a4a : TIMBER[x % 3]));
  m.paste(buildTierModel('tree', style, seed + 3) as Builder, 6, 0, -3, 0.7);
  return m;
}

function cottage(style: SpeciesKey, seed: number) {
  return buildTierModel('house', style, seed);
}

function mill(style: SpeciesKey, seed: number) {
  const m = new Builder();
  const s = STYLE[style];
  plinth(m, 9, 9, seed);
  // A tapering stone tower with a cap, and four sails set at a jaunty angle.
  for (let y = 1; y <= 16; y++) {
    const r = y < 6 ? 4 : y < 12 ? 3 : 2;
    for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) {
      if (Math.abs(x) + Math.abs(z) > r + 1) continue;
      const edge = Math.abs(x) === r || Math.abs(z) === r || Math.abs(x) + Math.abs(z) === r + 1;
      if (edge) m.set(x, y, z, y % 4 === 0 ? s.wall[1] : s.wall[0]);
    }
  }
  for (let y = 17; y <= 20; y++) { const r = 20 - y; for (let x = -r - 1; x <= r + 1; x++) for (let z = -r - 1; z <= r + 1; z++) if (Math.abs(x) + Math.abs(z) <= r + 1) m.set(x, y, z, s.roof[(x + z + 9) % 3]); }
  windows(m, [0], [8, 12], 3); m.box(-1, 1, 4, 0, 4, 4, () => 0x7f5432);
  const hubY = 15, hubZ = 4;
  m.set(0, hubY, hubZ, 0x5a4636);
  const tilt = mulberry32(seed)() * 0.6;
  for (let arm = 0; arm < 4; arm++) {
    const t = tilt + (arm * Math.PI) / 2;
    for (let r = 1; r <= 9; r++) {
      const x = Math.round(Math.cos(t) * r), y = hubY + Math.round(Math.sin(t) * r);
      m.set(x, y, hubZ, 0x6b4428);
      if (r > 2) { const px = Math.round(Math.cos(t + 0.18) * r), py = hubY + Math.round(Math.sin(t + 0.18) * r); m.set(px, py, hubZ, 0xf3ead8); }
    }
  }
  // Wheat field at the foot of the mill.
  for (let x = -8; x <= -5; x++) for (let z = -8; z <= 2; z++) if (hash3(x, z, seed) > 0.2) m.set(x, 1, z, hash3(z, x, seed) > 0.5 ? 0xe8c15a : 0xd8ac43);
  return m;
}

function manor(style: SpeciesKey, seed: number) {
  const m = new Builder();
  const s = STYLE[style];
  const rng = mulberry32(seed);
  plinth(m, 10, 9, seed);
  // Two storeys, a central wing and a front garden with a little fountain.
  m.box(-8, 1, -5, 8, 10, 1, (x, y) => (y === 5 || y === 10 ? s.wall[1] : x === -8 || x === 8 ? 0xc9b49a : s.wall[0]), true);
  m.box(-2, 1, 1, 2, 12, 3, (x, y) => (y > 10 ? s.wall[1] : s.wall[0]), true);
  gable(m, -8, 8, -5, 1, 11, s.roof);
  gable(m, -2, 2, 1, 3, 13, s.roof);
  for (const z of [1]) windows(m, [-6, -5, -3, 3, 5, 6], [3, 4, 7, 8], z);
  windows(m, [-1, 1], [7, 8], 3);
  m.box(-1, 1, 3, 1, 4, 3, () => 0x7f5432);
  m.set(0, 5, 4, s.banner);
  // Fountain and hedges.
  m.box(-2, 1, 6, 2, 1, 8, () => STONE[1], true); m.set(0, 2, 7, STONE[0]); m.set(0, 3, 7, 0x6cc7ee); m.set(0, 1, 7, 0x4aa8d8);
  for (const x of [-9, -7, 7, 9]) for (let z = 4; z <= 8; z++) m.set(x, 1, z, 0x3f7f35);
  if (rng() > 0.4) { m.box(-7, 11, -3, -6, 14, -2, () => STONE[2]); }
  if (rng() > 0.5) { m.box(6, 11, -3, 7, 14, -2, () => STONE[2]); }
  return m;
}

function castle(style: SpeciesKey, seed: number) {
  const m = new Builder();
  const s = STYLE[style];
  plinth(m, 10, 10, seed);
  const wall = (x: number, y: number, z: number) => STONE[(x * 3 + y + z * 7) % 3];
  // Curtain wall with crenellations, four corner towers, and a central keep.
  m.box(-8, 1, -8, 8, 6, 8, wall, true);
  for (let x = -8; x <= 8; x += 2) { m.set(x, 7, -8, STONE[0]); m.set(x, 7, 8, STONE[0]); }
  for (let z = -8; z <= 8; z += 2) { m.set(-8, 7, z, STONE[0]); m.set(8, 7, z, STONE[0]); }
  for (const [cx, cz] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) {
    m.box(cx - 2, 1, cz - 2, cx + 2, 10, cz + 2, wall, true);
    for (let y = 11; y <= 14; y++) { const r = 14 - y; m.box(cx - r, y, cz - r, cx + r, y, cz + r, () => s.roof[y % 3]); }
  }
  m.box(-4, 1, -4, 4, 16, 4, wall, true);
  for (let x = -4; x <= 4; x += 2) { m.set(x, 17, -4, STONE[0]); m.set(x, 17, 4, STONE[0]); }
  windows(m, [-2, 2], [8, 12], 4);
  m.box(-1, 1, 8, 1, 4, 8, () => 0x6b4428);
  flag(m, 0, 17, 0, s.banner);
  flag(m, -8, 15, -8, ACCENTS[seed % ACCENTS.length]);
  flag(m, 8, 15, 8, ACCENTS[(seed + 2) % ACCENTS.length]);
  // A moat ring.
  for (let x = -10; x <= 10; x++) for (const z of [-10, 10]) if (Math.abs(x) > 1) m.set(x, 0, z, 0x4aa8d8);
  for (let z = -10; z <= 10; z++) for (const x of [-10, 10]) m.set(x, 0, z, 0x4aa8d8);
  return m;
}

/**
 * The legend: a white-stone citadel floating high above a rune-ringed plaza, joined to it by a
 * beam of light. It is not the biggest object in the valley; it is the one that changes the sky.
 */
export const CITADEL_LIFT = 30;
function skyCitadel(style: SpeciesKey, seed: number) {
  const m = new Builder();
  const s = STYLE[style];
  const rng = mulberry32(seed);
  // The plaza on the ground: a stone circle with glowing runes and a small spring.
  for (let x = -10; x <= 10; x++) for (let z = -10; z <= 10; z++) {
    const d = Math.hypot(x, z);
    if (d > 10.5) continue;
    m.set(x, 0, z, d > 9 ? STONE[1] : d > 8 ? 0xf2b53c : hash3(x, seed, z) > 0.5 ? 0xd9d2c1 : 0xc9c1ae);
    if (d > 8 && d <= 9 && (x + z) % 3 === 0) m.set(x, 1, z, 0xfff1b8);
  }
  for (let y = 1; y <= 3; y++) for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) m.set(x, y, z, STONE[0]);
  for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) m.set(x, 4, z, GLASS);
  // The floating rock: an inverted, ragged cone.
  const L = CITADEL_LIFT;
  for (let y = 0; y <= 9; y++) {
    const r = 9 - y * 0.9;
    for (let x = -10; x <= 10; x++) for (let z = -10; z <= 10; z++) {
      if (Math.hypot(x, z) > r + (hash3(x, y, z + seed) - 0.5) * 1.6) continue;
      m.set(x, L - y, z, y === 0 ? (hash3(x, seed, z) > 0.3 ? 0x86c95b : 0x74bd4d) : y < 2 ? 0x8a5a33 : STONE[(x + y + z + 9) % 3]);
    }
  }
  // The citadel: a ring wall, four slender towers and a tall central spire with gold caps.
  const white = (x: number, y: number, z: number) => (hash3(x, y, z) > 0.85 ? 0xe9e4d8 : 0xf7f4ec);
  for (let a = 0; a < 48; a++) {
    const t = (a / 48) * Math.PI * 2;
    const x = Math.round(Math.cos(t) * 7), z = Math.round(Math.sin(t) * 7);
    for (let y = 1; y <= 3; y++) m.set(x, L + y, z, white(x, y, z));
    if (a % 2 === 0) m.set(x, L + 4, z, white(x, 4, z));
  }
  for (const [tx, tz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) {
    m.box(tx - 1, L + 1, tz - 1, tx + 1, L + 10, tz + 1, white);
    m.set(tx, L + 7, tz + 2, GLASS);
    for (let y = 0; y < 4; y++) { const r = 2 - Math.floor(y / 2); m.box(tx - r, L + 11 + y, tz - r, tx + r, L + 11 + y, tz + r, () => 0xf2b53c); }
  }
  m.box(-2, L + 1, -2, 2, L + 16, 2, white);
  for (const y of [6, 10, 14]) for (const [x, z] of [[0, 3], [3, 0], [0, -3], [-3, 0]]) m.set(x, L + y, z, GLASS);
  for (let y = 0; y < 7; y++) { const r = Math.max(0, 3 - Math.floor(y / 2)); m.box(-r, L + 17 + y, -r, r, L + 17 + y, r, () => (y === 6 ? 0xfff1b8 : 0xf2b53c)); }
  // Banners in the style colour, a garden of the style's trees, and lanterns.
  for (const [x, z] of [[-7, 0], [7, 0], [0, -7], [0, 7]]) { for (let y = 5; y <= 8; y++) m.set(x, L + y, z, 0x5a4636); m.set(x, L + 8, z + (x === 0 ? 0 : 1), s.banner); m.set(x + (x === 0 ? 1 : 0), L + 7, z, s.banner); }
  for (let i = 0; i < 6; i++) { const t = rng() * Math.PI * 2, r = 3.5 + rng() * 2; m.blob(Math.cos(t) * r, L + 3, Math.sin(t) * r, 1.4, 1.2, 1.4, (dy) => s.leaves[dy > 0 ? 2 : 1], 0.2, seed + i); }
  return m;
}

/** The model for any ladder level. `seed` comes from the NFT's lineage, so merged items are unique. */
export function buildLevelModel(level: Level, style: SpeciesKey, seed: number): VoxelModel {
  switch (level) {
    case 1: return buildTierModel('sprout', style, seed);
    case 2: return buildTierModel('tree', style, seed);
    case 3: return buildTierModel('bigTree', style, seed);
    case 4: return grove(style, seed);
    case 5: return cabin(style, seed);
    case 6: return cottage(style, seed);
    case 7: return mill(style, seed);
    case 8: return manor(style, seed);
    case 9: return castle(style, seed);
    default: return skyCitadel(style, seed);
  }
}

// ---------------------------------------------------------------- unique names

const PLACES = ['Dawnhollow', 'Mossbrook', 'Ember Vale', 'Stillwater', 'Larkfield', 'Cinderglen', 'Fernmere', 'Quietreach', 'Brightford', 'Hollowmere', 'Amberlea', 'Sunmeadow'];
const EPITHETS: Record<string, string[]> = {
  oak: ['Old', 'Steadfast', 'Green'], cherry: ['Blossom', 'Rosy', 'Spring'], pine: ['High', 'Evergreen', 'Misty'],
  maple: ['Ember', 'Autumn', 'Copper'], birch: ['Silver', 'Pale', 'Whispering'], cash: ['Golden', 'Lucky', 'Coin'],
};

/** A unique, readable name for a merged item, e.g. "Ember Mill of Dawnhollow". */
export function uniqueName(level: Level, style: SpeciesKey, seed: number) {
  const info = levelInfo(level);
  if (level <= 3) return info.name;
  const rng = mulberry32(seed * 7 + level);
  const epithet = EPITHETS[style][Math.floor(rng() * 3)];
  const place = PLACES[Math.floor(rng() * PLACES.length)];
  return `${epithet} ${info.name} of ${place}`;
}

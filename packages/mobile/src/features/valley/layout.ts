import type { SpeciesKey, Tier } from '@focus-garden/garden/tiers';

/** World units per plot. The widest model (a house) is 17 blocks, so a plot leaves room for a border. */
export const PLOT = 20;
/** Visual variants per model kind; matching the icon variants keeps geometry reusable. */
export const VARIANTS = 12;

export interface ValleyItem {
  id: string;
  tier: Tier;
  species: SpeciesKey;
  seed: number;
  /** A tree that withered recently: shown as a stump. */
  withered?: boolean;
  /** 0..1 while this item is growing right now. */
  progress?: number;
}

export type TileKind = 'grass' | 'meadow' | 'water' | 'sand';
export interface Tile { gx: number; gz: number; kind: TileKind }
export interface Plot { item: ValleyItem; gx: number; gz: number }

/** The nth cell of a square spiral starting at the centre: (0,0), (1,0), (1,1), (0,1), (-1,1)… */
export function spiral(index: number): { gx: number; gz: number } {
  if (index === 0) return { gx: 0, gz: 0 };
  const ring = Math.ceil((Math.sqrt(index + 1) - 1) / 2);
  const side = ring * 2;
  const start = (side - 1) * (side - 1);
  const offset = index - start;
  const leg = Math.floor(offset / side);
  const step = offset % side;
  // Walk the ring counter-clockwise from its bottom-right corner.
  if (leg === 0) return { gx: ring, gz: -ring + 1 + step };
  if (leg === 1) return { gx: ring - 1 - step, gz: ring };
  if (leg === 2) return { gx: -ring, gz: ring - 1 - step };
  return { gx: -ring + 1 + step, gz: -ring };
}

function hash(a: number, b: number, seed: number) {
  let h = (a * 374761393 + b * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Places every item on its own plot, oldest at the centre, spiralling outwards. The land is the
 * square that holds them plus a ring of shore, so the valley visibly grows with every session.
 */
export function valleyLayout(items: readonly ValleyItem[], seed = 7) {
  const plots: Plot[] = items.map((item, index) => ({ item, ...spiral(index) }));
  const used = plots.reduce((max, plot) => Math.max(max, Math.abs(plot.gx), Math.abs(plot.gz)), 0);
  // Always leave the next ring of plots open, so there is room to grow.
  const radius = Math.max(2, used + 1);
  const tiles: Tile[] = [];
  for (let gx = -radius - 1; gx <= radius + 1; gx++) {
    for (let gz = -radius - 1; gz <= radius + 1; gz++) {
      const edge = Math.max(Math.abs(gx), Math.abs(gz)) === radius + 1;
      const kind: TileKind = edge ? (hash(gx, gz, seed) < 0.55 ? 'water' : 'sand') : hash(gx, gz, seed + 1) < 0.25 ? 'meadow' : 'grass';
      tiles.push({ gx, gz, kind });
    }
  }
  return { plots, tiles, radius, used, next: spiral(items.length) };
}

/** Small decorations (flowers, tufts, stones) on a tile's border, away from the plot's model. */
export function decorations(tile: Tile, seed = 7) {
  if (tile.kind === 'water') return [];
  const count = tile.kind === 'meadow' ? 3 : tile.kind === 'sand' ? 1 : 2;
  const out: { x: number; z: number; kind: 'flower' | 'tuft' | 'stone'; tint: number }[] = [];
  for (let i = 0; i < count; i++) {
    const side = Math.floor(hash(tile.gx * 7 + i, tile.gz * 13, seed) * 4);
    const along = (hash(tile.gx + i * 3, tile.gz - i, seed + 2) - 0.5) * (PLOT - 2);
    const inset = PLOT / 2 - 1 - Math.floor(hash(i, tile.gx * tile.gz, seed + 3) * 1.5);
    const [x, z] = side === 0 ? [along, -inset] : side === 1 ? [inset, along] : side === 2 ? [along, inset] : [-inset, along];
    const roll = hash(tile.gx - i, tile.gz + i * 5, seed + 4);
    const kind = tile.kind === 'sand' ? 'stone' : roll < 0.45 ? 'flower' : roll < 0.85 ? 'tuft' : 'stone';
    out.push({ x: Math.round(x), z: Math.round(z), kind, tint: hash(i, tile.gx + tile.gz, seed + 5) });
  }
  return out;
}

/** A stable variant (1..VARIANTS) for an id, so the same session always looks the same. */
export function variantOf(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % VARIANTS) + 1;
}

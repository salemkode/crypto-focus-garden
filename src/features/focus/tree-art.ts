import { speciesById, type CanopyShape, type SpeciesId } from './catalog';

/** Pixel canvas used by every tree sprite. */
export const ART_WIDTH = 16;
export const ART_HEIGHT = 20;

export interface Run { x: number; y: number; w: number; color: string }

const WITHERED_LEAVES = ['#6b5a45', '#8a7558', '#a8957a'] as const;
const WITHERED_TRUNK = '#5b4a3a';
const GRASS = ['#55a530', '#6dba3b', '#84cd4e'] as const;
const DRY_GRASS = ['#9c8e62', '#b5a77a', '#c7bb92'] as const;
const SOIL = ['#74482a', '#8b5a33'] as const;

function hash(x: number, y: number, seed: number) {
  let h = Math.imul(x * 374761393 + y * 668265263 + seed * 1442695041, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const SHAPES = {
  round: { rx: 6, ry: 5, trunk: 5 },
  cone: { rx: 5, ry: 5, trunk: 4 },
  oval: { rx: 4, ry: 6, trunk: 5 },
  wide: { rx: 7, ry: 4, trunk: 6 },
} as const;
const STAGE_SCALE = [0, 0, 0.45, 0.72, 1] as const;

/** Everything the renderer needs to draw one tree. Species and NFTs both map to this. */
export interface TreeStyle {
  shape: CanopyShape;
  trunk: string;
  leaves: readonly [string, string, string];
  accent?: string;
  /** Share of mature canopy pixels drawn in the accent colour. */
  accentRate?: number;
  /** Pale trunk with dark marks. */
  barkMarks?: boolean;
  /** Mature size multiplier, 0.8–1. */
  scale?: number;
  ground?: 'grass' | 'flowers' | 'mushrooms' | 'stones';
}

export function speciesStyle(speciesId: SpeciesId): TreeStyle {
  const species = speciesById(speciesId);
  return { shape: species.shape, trunk: species.trunk, leaves: species.leaves, accent: species.accent, accentRate: 0.1, barkMarks: species.id === 'birch' };
}

/**
 * Builds a deterministic pixel tree. Stage 0 seed, 1 sprout, 2 sapling, 3 young, 4 mature.
 * Rows are returned as horizontal runs so a sprite costs tens of SVG nodes, not hundreds.
 */
export function treeArt(speciesId: SpeciesId, stage: number, withered = false, seed = 1): Run[] {
  return styledTreeArt(speciesStyle(speciesId), stage, withered, seed);
}

const GROUND_DECOR = {
  flowers: ['#f48fb1', '#ffd23f', '#ffffff', '#9b6dd6'],
  mushrooms: ['#d94a3d', '#f2e6d0'],
  stones: ['#9aa0a6', '#c3c7cb'],
} as const;

export function styledTreeArt(style: TreeStyle, stage: number, withered = false, seed = 1): Run[] {
  const leaves = withered ? WITHERED_LEAVES : style.leaves;
  const trunk = withered ? WITHERED_TRUNK : style.trunk;
  const grid: (string | null)[][] = Array.from({ length: ART_HEIGHT }, () => Array<string | null>(ART_WIDTH).fill(null));
  const set = (x: number, y: number, color: string) => { if (x >= 0 && x < ART_WIDTH && y >= 0 && y < ART_HEIGHT) grid[y][x] = color; };

  const grass = withered ? DRY_GRASS : GRASS;
  for (let x = 2; x <= 13; x += 1) set(x, 18, grass[Math.floor(hash(x, 18, seed) * grass.length)]);
  for (let x = 3; x <= 12; x += 1) set(x, 19, SOIL[x % 2]);
  if (!withered && style.ground && style.ground !== 'grass') {
    const decor = GROUND_DECOR[style.ground];
    for (const x of [3, 11, 12]) if (hash(x, 17, seed + 11) < 0.75) {
      if (style.ground === 'mushrooms') { set(x, 17, decor[0]); set(x, 18, decor[1]); }
      else set(x, 17, decor[Math.floor(hash(x, 5, seed) * decor.length)]);
    }
  }
  const level = Math.max(0, Math.min(4, Math.round(stage)));

  if (level === 0) {
    for (let x = 6; x <= 9; x += 1) set(x, 17, SOIL[1]);
    set(7, 16, withered ? WITHERED_TRUNK : '#c99a5b');
    set(8, 16, withered ? WITHERED_TRUNK : '#b5844a');
    return toRuns(grid);
  }
  if (level === 1) {
    set(7, 17, trunk); set(7, 16, leaves[1]); set(7, 15, leaves[1]);
    set(6, 14, leaves[2]); set(5, 14, leaves[1]); set(8, 13, leaves[2]); set(9, 13, leaves[1]);
    if (withered) { grid[13][9] = null; set(9, 16, leaves[0]); }
    return toRuns(grid);
  }

  const shape = SHAPES[style.shape];
  const scale = STAGE_SCALE[level] * (level === 4 ? style.scale ?? 1 : 1);
  const trunkHeight = Math.max(level === 2 ? 3 : 2, Math.round(shape.trunk * scale));
  const rx = Math.max(2, Math.round(shape.rx * scale));
  const ry = Math.max(2, Math.round(shape.ry * scale));
  const wideTrunk = level >= 3;
  const trunkTop = 17 - trunkHeight + 1;
  const cy = trunkTop - ry + (level === 2 ? 0 : 1);
  const cx = 8;

  for (let y = trunkTop - 1; y <= 17; y += 1) {
    if (wideTrunk) { set(7, y, trunk); set(8, y, shade(trunk)); }
    else set(7, y, trunk);
    if (style.barkMarks && !withered && hash(7, y, seed) < 0.3) set(7, y, '#3b3530');
  }

  for (let y = cy - ry; y <= cy + ry; y += 1) {
    for (let x = 0; x < ART_WIDTH; x += 1) {
      const px = x + 0.5 - cx;
      const py = y - cy;
      let inside: boolean;
      if (style.shape === 'cone') {
        const row = y - (cy - ry);
        const half = Math.min(rx + 1, 1 + (row % 3) + Math.floor(row / 3) * (level === 4 ? 1 : 0.7));
        inside = Math.abs(px) <= half && row >= 0;
      } else {
        inside = (px / (rx + 0.4)) ** 2 + (py / (ry + 0.4)) ** 2 <= 1;
      }
      if (!inside) continue;
      if (withered && hash(x, y, seed + 7) < 0.38) continue;
      const light = px / (rx + 1) * 0.55 + py / (ry + 1) * 0.75 + (hash(x, y, seed) - 0.5) * 0.35;
      const color = light < -0.3 ? leaves[2] : light > 0.3 ? leaves[0] : leaves[1];
      set(x, y, style.accent && !withered && level >= 3 && hash(x, y, seed + 3) < (style.accentRate ?? 0.1) ? style.accent : color);
    }
  }
  if (withered) for (let i = 0; i < 4; i += 1) {
    const x = 3 + Math.floor(hash(i, 1, seed) * 10);
    set(x, 17, leaves[Math.floor(hash(i, 2, seed) * 3)]);
  }
  return toRuns(grid);
}

function shade(hex: string) {
  const value = parseInt(hex.slice(1), 16);
  const r = Math.round(((value >> 16) & 255) * 0.78);
  const g = Math.round(((value >> 8) & 255) * 0.78);
  const b = Math.round((value & 255) * 0.78);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function toRuns(grid: (string | null)[][]): Run[] {
  const runs: Run[] = [];
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const color = row[x];
      if (!color) { x += 1; continue; }
      let w = 1;
      while (x + w < row.length && row[x + w] === color) w += 1;
      runs.push({ x, y, w, color });
      x += w;
    }
  });
  return runs;
}

/**
 * Seasons: the valley follows the real calendar. Recolouring works on any voxel geometry's vertex
 * colours, so every model (trees, buildings, terrain) changes with the season without new art:
 * winter caps upward faces with snow and freezes water, spring freshens greens and sprinkles
 * blossoms, autumn turns broadleaf greens to amber and red (dark evergreens stay green).
 */
import * as THREE from 'three';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];

/** The season for a date. Southern-hemisphere viewers get the opposite season. */
export function seasonFor(date: Date, southern = false): Season {
  const month = date.getMonth(); // 0 = January
  const north: Season = month <= 1 || month === 11 ? 'winter' : month <= 4 ? 'spring' : month <= 7 ? 'summer' : 'autumn';
  if (!southern) return north;
  return ({ winter: 'summer', summer: 'winter', spring: 'autumn', autumn: 'spring' } as const)[north];
}

function hash(x: number, y: number, z: number) {
  let h = (Math.imul(Math.round(x * 2), 374761393) + Math.imul(Math.round(y * 2), 668265263) + Math.imul(Math.round(z * 2), 974634713)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const AUTUMN = [0xd9822b, 0xe8a33d, 0xc0502e, 0xb8742f, 0xe6b84a].map((c) => new THREE.Color(c));
const SNOW = new THREE.Color(0xf3f7fb);
const SNOW_SHADE = new THREE.Color(0xdde7f0);
const ICE = new THREE.Color(0xcfe9f4);
const BLOSSOM = [0xffd1e0, 0xfff4f7, 0xf7b6cf].map((c) => new THREE.Color(c));
const GROUND_AUTUMN = [0xb3a24a, 0xa8913f].map((c) => new THREE.Color(c));

export type Material = 'foliage' | 'evergreen' | 'water' | 'other';

/** What a vertex colour most likely is: broadleaf foliage or grass, an evergreen, water, or anything else. */
export function classify(color: THREE.Color): Material {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  if (hsl.h > 0.52 && hsl.h < 0.62 && hsl.s > 0.4 && hsl.l > 0.35) return 'water';
  if (hsl.h > 0.17 && hsl.h < 0.48 && hsl.s > 0.25) return hsl.l < 0.3 && hsl.h > 0.36 ? 'evergreen' : 'foliage';
  return 'other';
}

/**
 * Returns a recoloured copy of a geometry for the season (summer is the original). Snow lands only
 * on faces that look up; autumn picks a warm colour per block, so canopies read as mixed leaves.
 */
export function seasonal(geometry: THREE.BufferGeometry, season: Season, options: { ground?: boolean } = {}): THREE.BufferGeometry {
  if (season === 'summer') return geometry;
  const copy = geometry.clone();
  const colors = copy.getAttribute('color') as THREE.BufferAttribute;
  const normals = copy.getAttribute('normal') as THREE.BufferAttribute;
  const positions = copy.getAttribute('position') as THREE.BufferAttribute;
  const c = new THREE.Color();
  for (let i = 0; i < colors.count; i++) {
    c.setRGB(colors.getX(i), colors.getY(i), colors.getZ(i));
    const kind = classify(c);
    const up = normals.getY(i) > 0.6;
    // Block identity: the voxel this vertex belongs to, so a whole face shares one choice.
    const bx = Math.floor(positions.getX(i) - normals.getX(i) * 0.5), by = Math.floor(positions.getY(i) - normals.getY(i) * 0.5), bz = Math.floor(positions.getZ(i) - normals.getZ(i) * 0.5);
    const roll = hash(bx, by, bz);
    const shade = c.getHSL({ h: 0, s: 0, l: 0 }).l; // keep the baked block shading
    let next: THREE.Color | null = null;
    if (season === 'winter') {
      if (kind === 'water') next = ICE.clone();
      else if (up && (kind === 'foliage' || kind === 'evergreen' || roll > 0.35)) next = (roll > 0.5 ? SNOW : SNOW_SHADE).clone();
      else if (kind === 'foliage') next = c.clone().lerp(new THREE.Color(0x7a8a6a), 0.55);
    } else if (season === 'autumn') {
      // Grass only warms toward straw; broadleaf canopies turn amber and red.
      if (kind === 'foliage') next = options.ground ? c.clone().lerp(GROUND_AUTUMN[Math.floor(roll * 2)], 0.38 + roll * 0.15) : AUTUMN[Math.floor(roll * AUTUMN.length)].clone().lerp(c, roll > 0.8 ? 0.5 : 0.12);
    } else if (season === 'spring') {
      if (kind === 'foliage') next = !options.ground && up && roll > 0.93 ? BLOSSOM[Math.floor(roll * 97) % 3].clone() : options.ground && up && roll > 0.985 ? BLOSSOM[1].clone() : c.clone().offsetHSL(0.015, 0.08, 0.04);
    }
    if (next) {
      // Preserve the original shading so cubes still read as cubes.
      next.multiplyScalar(0.72 + Math.min(0.4, shade * 0.6));
      colors.setXYZ(i, next.r, next.g, next.b);
    }
  }
  colors.needsUpdate = true;
  return copy;
}

/** Ambient particles for the season: what falls through the air, and its colours. */
export const WEATHER: Record<Season, { kind: 'petals' | 'pollen' | 'leaves' | 'snow'; colors: number[]; fall: number; sway: number; count: number }> = {
  spring: { kind: 'petals', colors: [0xffd1e0, 0xfff4f7, 0xf7b6cf], fall: 6, sway: 5, count: 140 },
  summer: { kind: 'pollen', colors: [0xfff3a0, 0xffffff], fall: 1.5, sway: 3, count: 90 },
  autumn: { kind: 'leaves', colors: [0xd9822b, 0xe8a33d, 0xc0502e, 0xb8742f], fall: 9, sway: 7, count: 160 },
  winter: { kind: 'snow', colors: [0xffffff, 0xeef4fa], fall: 11, sway: 3, count: 420 },
};

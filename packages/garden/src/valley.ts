/**
 * The valley world: terrain and item placement, computed only from numbers.
 *
 * Anyone with the same valley seed and the same ordered list of items (for example the owner's
 * NFTs in chain order) gets exactly the same valley. Placement is stable: item i's position
 * depends only on the seed and items 0..i-1, so a new tree never moves an old one. It looks
 * random (scattered across hills, never on the river) but it is a pure calculation.
 */
import { buildLevelModel, levelInfo, type Level } from './ladder';
import type { SpeciesKey } from './tiers';
import * as THREE from 'three';
import { mulberry32, VoxelModel } from './voxel';

export interface ValleyEntity { id: string; level: Level; style: SpeciesKey; seed: number }
export interface Placed { id: string; x: number; z: number; y: number; turn: number; radius: number; entity: ValleyEntity }

/** Terrain block size in world units. */
export const CELL = 2;
/** Model scale per level, so small rewards still read clearly. */
export const LEVEL_SCALE: Record<Level, number> = { 1: 2.4, 2: 1.8, 3: 1.3, 4: 1.15, 5: 1.15, 6: 1.15, 7: 1.15, 8: 1.15, 9: 1.15, 10: 1.15 };
/** Ground each level needs (radius, world units). */
const FOOTPRINT: Record<Level, number> = { 1: 4, 2: 6, 3: 8, 4: 12, 5: 11, 6: 11, 7: 12, 8: 13, 9: 14, 10: 16 };

// ---------------------------------------------------------------- deterministic noise

export function hash2(a: number, b: number, s: number) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(s | 0, 974634713)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x: number, z: number, scale: number, s: number) {
  const fx = x / scale, fz = z / scale, x0 = Math.floor(fx), z0 = Math.floor(fz), tx = fx - x0, tz = fz - z0;
  const u = tx * tx * (3 - 2 * tx), v = tz * tz * (3 - 2 * tz);
  const a = hash2(x0, z0, s), b = hash2(x0 + 1, z0, s), c = hash2(x0, z0 + 1, s), d = hash2(x0 + 1, z0 + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** A stable 32-bit seed from any string (an owner address, an NFT id). */
export function seedOf(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ---------------------------------------------------------------- the land

/** Island radius (world units) once `count` items live there: it grows with the square root. */
export function islandRadius(count: number) { return 44 + 12 * Math.sqrt(count); }

/** Whether (x, z) is on the island of radius `r`: a wobbly, rounded outline. */
export function onIsland(x: number, z: number, r: number, seed: number) {
  const angle = Math.atan2(z, x);
  const wobble = (noise(Math.cos(angle) * 30 + 100, Math.sin(angle) * 30 + 100, 9, seed + 1) - 0.5) * 0.22;
  return Math.hypot(x, z) <= r * (1 + wobble);
}

/** The river: rises near the centre and meanders out to the rim, where it falls as a waterfall. */
export function river(seed: number) {
  const rng = mulberry32(seed ^ 0x51a7);
  const angle = rng() * Math.PI * 2, phase = rng() * 6.28, bend = 7 + rng() * 6;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  /** Distance from (x, z) to the river's centre line, and how far along the river it is. */
  const measure = (x: number, z: number) => {
    const along = x * cos + z * sin;
    const across = -x * sin + z * cos;
    return { along, offset: Math.abs(across - Math.sin(along / 22 + phase) * bend) };
  };
  /** The world (x, z) at a distance along the river, `side` units off its centre line. */
  const point = (along: number, side: number) => {
    const across = Math.sin(along / 22 + phase) * bend + side;
    return { x: along * cos - across * sin, z: along * sin + across * cos };
  };
  /** The downstream direction (unit x, z) at a distance along the river. */
  const heading = (along: number) => {
    const slope = (Math.cos(along / 22 + phase) * bend) / 22;
    const length = Math.hypot(1, slope);
    return { x: (cos - slope * sin) / length, z: (sin + slope * cos) / length };
  };
  return { angle, measure, point, heading, width: 3.2, spring: -6 };
}

/** Ground height in blocks: a gentle valley floor rising into hills toward the rim. */
export function groundHeight(x: number, z: number, r: number, seed: number) {
  const d = Math.hypot(x, z) / r;
  const hills = Math.pow(Math.max(0, (d - 0.5) / 0.45), 1.6) * 4.5;
  const roll = (noise(x, z, 34, seed + 7) - 0.45) * 2.2 + (noise(x, z, 12, seed + 9) - 0.5) * 0.8;
  return Math.max(0, Math.round(hills + roll));
}

// ---------------------------------------------------------------- placement

/** What happened in the valley, in chain order: a session planted an item, or items were merged. */
export type ValleyEvent =
  | { type: 'plant'; entity: ValleyEntity }
  | { type: 'merge'; ingredients: readonly string[]; result: ValleyEntity };

export interface ValleyState { placed: Placed[]; plants: number }

/** Finds a spot for a new item among the items standing now. */
function findSpot(entity: ValleyEntity, ordinal: number, standing: readonly Placed[], valleySeed: number) {
  const flow = river(valleySeed);
  const r = islandRadius(ordinal + 1);
  const footprint = FOOTPRINT[entity.level];
  const building = levelInfo(entity.level).kind !== 'tree';
  const rng = mulberry32((valleySeed ^ Math.imul(ordinal + 1, 2654435761)) >>> 0);
  let best: { x: number; z: number; score: number } | null = null;
  for (let attempt = 0; attempt < 90; attempt++) {
    const reach = r * (attempt < 60 ? 0.82 : 0.92);
    const radius = reach * Math.sqrt(rng());
    const theta = rng() * Math.PI * 2;
    const x = Math.round(Math.cos(theta) * radius), z = Math.round(Math.sin(theta) * radius);
    if (!onIsland(x * 1.12, z * 1.12, r, valleySeed)) continue;
    const water = flow.measure(x, z);
    if (water.along > flow.spring && water.offset < flow.width + footprint + 1) continue;
    if (standing.some((p) => Math.hypot(p.x - x, p.z - z) < p.radius + footprint + 1.5)) continue;
    const h = groundHeight(x, z, r, valleySeed);
    const rough = Math.max(...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => Math.abs(groundHeight(x + dx * footprint, z + dz * footprint, r, valleySeed) - h)));
    if (rough > (building ? 1 : 2)) continue;
    // Trees take the first good spot; buildings look for low ground near the river.
    const score = building ? h * 4 + Math.max(0, water.offset - flow.width - footprint) / 6 : 0;
    if (!best || score < best.score) best = { x, z, score };
    if (!building || attempt > 24) break;
  }
  // Fallback: walk outward on a seeded spiral until a free spot appears (always terminates).
  for (let k = 0; k < 600 && !best; k++) {
    const t = k * 2.399, rr = 6 + k * 1.1;
    const x = Math.round(Math.cos(t) * rr), z = Math.round(Math.sin(t) * rr);
    const water = flow.measure(x, z);
    if (water.along > flow.spring && water.offset < flow.width + footprint + 1) continue;
    if (!standing.some((p) => Math.hypot(p.x - x, p.z - z) < p.radius + footprint + 1)) best = { x, z, score: 0 };
  }
  return { x: best!.x, z: best!.z, y: groundHeight(best!.x, best!.z, r, valleySeed), turn: Math.floor(rng() * 4) * (Math.PI / 2), radius: footprint };
}

/**
 * Replays the valley's history. A planted item takes a seeded spot among the items standing at
 * that moment. A merge removes its ingredients and puts the result on the first ingredient's spot,
 * so nothing else ever moves, and the freed ground is open for future items. Anyone replaying the
 * same events with the same seed gets the same valley.
 */
export function replayValley(events: readonly ValleyEvent[], valleySeed: number): ValleyState {
  const standing: Placed[] = [];
  let plants = 0;
  for (const event of events) {
    if (event.type === 'plant') {
      const spot = findSpot(event.entity, plants, standing, valleySeed);
      standing.push({ id: event.entity.id, ...spot, entity: event.entity });
      plants++;
      continue;
    }
    const first = standing.find((p) => p.id === event.ingredients[0]);
    if (!first || !event.ingredients.every((id) => standing.some((p) => p.id === id))) continue; // invalid merges are ignored
    for (const id of event.ingredients) standing.splice(standing.findIndex((p) => p.id === id), 1);
    standing.push({ ...first, id: event.result.id, entity: event.result, radius: Math.max(first.radius, FOOTPRINT[event.result.level]) });
  }
  return { placed: standing, plants };
}

/** Places items planted in order (no merges). */
export function placeAll(entities: readonly ValleyEntity[], valleySeed: number): Placed[] {
  return replayValley(entities.map((entity) => ({ type: 'plant' as const, entity })), valleySeed).placed;
}

// ---------------------------------------------------------------- terrain mesh

const GRASS = [0x74bd4d, 0x6db446, 0x84c95a, 0x7cc35a];
export interface Terrain { model: VoxelModel; radius: number; waterfall: { x: number; z: number; y: number; angle: number } }

/**
 * Voxel terrain for the whole island (one block = CELL units): grass that varies with height,
 * the river with sandy banks, flattened pads under every item, and rock strata below that taper
 * into a floating island.
 */
export interface TerrainOptions {
  /** Stone roads between buildings (a Manor or higher lays them). */
  roads?: boolean;
  /** Bridges where roads cross the river (a Castle or higher builds them). */
  bridges?: boolean;
}

/** Road segments joining every building to its nearest neighbour (a tidy spanning tree). */
export function roadSegments(placed: readonly Placed[]) {
  const buildings = placed.filter((p) => levelInfo(p.entity.level).kind !== 'tree');
  const segments: [Placed, Placed][] = [];
  const joined = buildings.slice(0, 1);
  const rest = buildings.slice(1);
  while (rest.length) {
    let pick = { a: joined[0], b: rest[0], d: Infinity, index: 0 };
    for (const a of joined) rest.forEach((b, index) => { const d = Math.hypot(a.x - b.x, a.z - b.z); if (d < pick.d) pick = { a, b, d, index }; });
    segments.push([pick.a, pick.b]);
    joined.push(pick.b); rest.splice(pick.index, 1);
  }
  return segments;
}

export function buildTerrain(placed: readonly Placed[], count: number, seed: number, options: TerrainOptions = {}): Terrain {
  const r = islandRadius(Math.max(1, count));
  const flow = river(seed);
  const model = new VoxelModel();
  const pads = placed.map((p) => ({ x: p.x, z: p.z, r: p.radius + 2, y: p.y }));
  const n = Math.ceil((r * 1.25) / CELL);
  const roads = options.roads ? roadSegments(placed) : [];
  const onRoad = (x: number, z: number) => roads.some(([a, b]) => {
    const dx = b.x - a.x, dz = b.z - a.z, len = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len));
    const px = a.x + dx * t, pz = a.z + dz * t;
    return Math.hypot(x - px, z - pz) < 2.2 && Math.hypot(x - a.x, z - a.z) > a.radius - 1 && Math.hypot(x - b.x, z - b.z) > b.radius - 1;
  });
  let fall = { x: 0, z: 0, y: 0, angle: flow.angle, along: -Infinity };
  for (let i = -n; i <= n; i++) {
    for (let k = -n; k <= n; k++) {
      const x = i * CELL, z = k * CELL;
      if (!onIsland(x, z, r, seed)) continue;
      const rim = Math.hypot(x, z) / r;
      const pad = pads.find((p) => Math.hypot(p.x - x, p.z - z) <= p.r);
      let h = pad ? pad.y : groundHeight(x, z, r, seed);
      const water = flow.measure(x, z);
      const inRiver = water.along > flow.spring && water.offset < flow.width;
      const bank = water.along > flow.spring && water.offset < flow.width + 2.5;
      if (inRiver) h = 0;
      const road = !pad && onRoad(x, z);
      const bridge = road && inRiver && options.bridges;
      const top = bridge ? 0x93653d : inRiver ? 0x4fb0db : road ? (hash2(i, k, seed + 11) > 0.5 ? 0xcdbb94 : 0xbfae88) : bank && !pad ? 0xe6d39b : h >= 5 ? 0x8fbf5a : GRASS[Math.floor(hash2(i, k, seed) * 4)];
      const surface = inRiver && !bridge ? h - 1 : h;
      model.set(i, surface, k, top);
      if (inRiver && water.along > fall.along) fall = { x, z, y: surface, angle: flow.angle, along: water.along };
      // Strata: soil, then stone, tapering to a point under the island's centre.
      const depth = Math.floor(3 + Math.pow(1 - Math.min(1, rim), 0.75) * 20 + hash2(i, k, seed + 3) * 4);
      for (let y = 1; y <= depth + surface; y++) {
        const c = y <= 1 ? 0x9a6a3e : y <= 3 ? 0x7e5532 : hash2(i, k + y, seed + 5) > 0.72 ? 0x8d8d86 : 0x76766f;
        model.set(i, surface - y, k, c);
      }
    }
  }
  return { model, radius: r, waterfall: { x: fall.x, z: fall.z, y: fall.y, angle: fall.angle } };
}

/** How many villagers live in a building of this level (up to five). Trees house none. */
export function villagersFor(level: Level): number {
  return ({ 5: 1, 6: 2, 7: 2, 8: 3, 9: 4, 10: 5 } as Partial<Record<Level, number>>)[level] ?? 0;
}

export { buildLevelModel };

// ---------------------------------------------------------------- fast terrain mesh


/** Rock and soil bands under the grass, top to bottom (depth in blocks, colour). */
const BANDS: { until: number; color: number }[] = [
  { until: 1, color: 0x6b4a2e }, { until: 3, color: 0x7e5532 }, { until: 5, color: 0xc77d3a },
  { until: 7, color: 0xd9b98a }, { until: 10, color: 0x9a6a3e }, { until: Infinity, color: 0x76766f },
];

export interface Waterfall { x: number; z: number; y: number; angle: number; river: boolean }
export interface TerrainMesh {
  geometry: THREE.BufferGeometry;
  /** The river as a body of water: its surface plus the faces where it spills over the rim. */
  water: THREE.BufferGeometry;
  /** Where the river runs on this island, as distances along it (for ripples that flow downstream). */
  stream: { from: number; to: number };
  radius: number;
  waterfalls: Waterfall[];
  heightAt: (x: number, z: number) => number;
}

/** The river bed (in blocks) and the world height of the water surface above it. */
export const RIVER_BED = -2;
export const WATER_Y = CELL * 0.5 - 1.5; // well below the top of the surrounding valley floor (block 0)
const BED_COLOR = 0x2f7f9c;
const WATER_COLOR = 0x46aee0;

/**
 * The island as height columns, meshed directly: one quad per column top, cliff sides only where
 * they are exposed (as tall quads split into colour bands), vines hanging over the rim, and the
 * underside. Far fewer vertices than meshing every block, and fast enough to rebuild on a phone.
 */
export function valleyTerrain(placed: readonly Placed[], count: number, seed: number, options: TerrainOptions = {}): TerrainMesh {
  const r = islandRadius(Math.max(1, count));
  const flow = river(seed);
  const n = Math.ceil((r * 1.25) / CELL);
  const size = n * 2 + 1;
  const index = (i: number, k: number) => (i + n) * size + (k + n);
  const top = new Int16Array(size * size).fill(-999);
  const bottom = new Int16Array(size * size);
  const color = new Uint32Array(size * size);
  // Spatial grid of item pads, so each column checks only nearby items.
  const GRID = 24;
  const pads = new Map<string, Placed[]>();
  for (const p of placed) {
    for (let gx = Math.floor((p.x - p.radius - 2) / GRID); gx <= Math.floor((p.x + p.radius + 2) / GRID); gx++)
      for (let gz = Math.floor((p.z - p.radius - 2) / GRID); gz <= Math.floor((p.z + p.radius + 2) / GRID); gz++) {
        const key = `${gx},${gz}`; (pads.get(key) ?? pads.set(key, []).get(key)!).push(p);
      }
  }
  const padAt = (x: number, z: number) => (pads.get(`${Math.floor(x / GRID)},${Math.floor(z / GRID)}`) ?? []).find((p) => Math.hypot(p.x - x, p.z - z) <= p.radius + 2);
  const roads = options.roads ? roadSegments(placed) : [];
  const onRoad = (x: number, z: number) => roads.some(([a, b]) => {
    const dx = b.x - a.x, dz = b.z - a.z, len = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len));
    return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)) < 2.2 && Math.hypot(x - a.x, z - a.z) > a.radius - 1 && Math.hypot(x - b.x, z - b.z) > b.radius - 1;
  });
  let fall: Waterfall & { along: number } = { x: 0, z: 0, y: 0, angle: flow.angle, river: true, along: -Infinity };
  for (let i = -n; i <= n; i++) for (let k = -n; k <= n; k++) {
    const x = i * CELL, z = k * CELL;
    if (!onIsland(x, z, r, seed)) continue;
    const pad = padAt(x, z);
    let h = pad ? pad.y : groundHeight(x, z, r, seed);
    const water = flow.measure(x, z);
    const inRiver = water.along > flow.spring && water.offset < flow.width;
    const bank = water.along > flow.spring && water.offset < flow.width + 2.5;
    if (inRiver) h = 0;
    const road = !pad && onRoad(x, z);
    const bridge = road && inRiver && options.bridges;
    const patch = Math.min(3, Math.floor(noise(x, z, 14, seed + 41) * 4));
    const c = bridge ? 0x93653d : inRiver ? BED_COLOR : road ? 0xc8b68e : bank && !pad ? 0xe6d39b : h >= 5 ? 0x8fbf5a : GRASS[patch];
    const surface = inRiver && !bridge ? RIVER_BED : h;
    // The underside varies per 2×2 block: rocky, but far fewer faces.
    const bx = i >> 1, bz = k >> 1;
    const rim = Math.hypot(bx * 2 * CELL, bz * 2 * CELL) / r;
    const depth = Math.floor(9 + Math.pow(1 - Math.min(1, rim), 0.75) * 22 + hash2(bx, bz, seed + 3) * 6) + (surface - h);
    const at = index(i, k);
    top[at] = surface; bottom[at] = surface - depth; color[at] = c;
    if (inRiver && water.along > fall.along) fall = { x, z, y: surface, angle: flow.angle, river: true, along: water.along };
  }

  const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
  const tint = new THREE.Color();
  const quad = (a: number[], b: number[], c: number[], d: number[], normal: number[], hex: number, shade: number) => {
    const base = positions.length / 3;
    tint.setHex(hex).multiplyScalar(shade);
    // Wind every face counter-clockwise as seen from its normal, so no face is culled by mistake.
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const facing = (uy * vz - uz * vy) * normal[0] + (uz * vx - ux * vz) * normal[1] + (ux * vy - uy * vx) * normal[2];
    const corners = facing >= 0 ? [a, b, c, d] : [a, d, c, b];
    for (const p of corners) { positions.push(p[0], p[1], p[2]); normals.push(normal[0], normal[1], normal[2]); colors.push(tint.r, tint.g, tint.b); }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const worldY = (h: number) => h * CELL + CELL / 2; // top face of block h
  const half = CELL / 2;
  const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  for (let i = -n; i <= n; i++) for (let k = -n; k <= n; k++) {
    const at = index(i, k);
    if (top[at] === -999) continue;
    const x = i * CELL, z = k * CELL, t = worldY(top[at]), b = worldY(bottom[at]);
    const jitter = 1;
    for (const [dx, dz] of SIDES) {
      const ni = i + dx, nk = k + dz;
      const inside = Math.abs(ni) <= n && Math.abs(nk) <= n && top[index(ni, nk)] !== -999;
      const nTop = inside ? worldY(top[index(ni, nk)]) : -Infinity;
      const nBottom = inside ? worldY(bottom[index(ni, nk)]) : Infinity;
      // Corners of this side (counter-clockwise seen from outside).
      const ex = x + dx * half, ez = z + dz * half;
      const ax = dz !== 0 ? -dz * half : 0, az = dx !== 0 ? dx * half : 0;
      const p = (y: number, s: number) => [ex + ax * s, y, ez + az * s];
      const shade = dx !== 0 ? 0.86 : 0.76;
      const strip = (from: number, to: number) => {
        if (to <= from) return;
        // Split the exposed strip into the strata bands, measured down from this column's top.
        let upper = to;
        for (const band of BANDS) {
          const lower = Math.max(from, t - band.until * CELL);
          if (lower < upper) { quad(p(lower, -1), p(lower, 1), p(upper, 1), p(upper, -1), [dx, 0, dz], upper === t ? color[at] === BED_COLOR ? 0x6b4a2e : 0x5f9e3c : band.color, shade * jitter); upper = lower; }
          if (upper <= from) break;
        }
      };
      strip(Math.max(nTop, b), t);           // the cliff above a lower neighbour (or the open rim)
      if (inside && nBottom > b) strip(b, Math.min(nBottom, t)); // the jagged underside below a shallower neighbour
      // Vines hang over the rim.
      if (!inside && hash2(i * 3 + dx, k * 5 + dz, seed + 31) > 0.55) {
        const length = (1 + Math.floor(hash2(i, k + dz, seed + 33) * 6)) * CELL;
        const out = 0.06;
        const v = (y: number, s: number) => [ex + dx * out + ax * s * 0.45, y, ez + dz * out + az * s * 0.45];
        quad(v(t - length, -1), v(t - length, 1), v(t, 1), v(t, -1), [dx, 0, dz], hash2(i, k, seed + 35) > 0.5 ? 0x4f9a35 : 0x6cb847, 0.95);
      }
    }
  }
  // Tops and bottoms, merged along each row where height and colour match (greedy meshing).
  for (let k = -n; k <= n; k++) {
    for (const face of ['top', 'bottom'] as const) {
      let start = -n, run: { h: number; c: number } | null = null;
      for (let i = -n; i <= n + 1; i++) {
        const at = i <= n ? index(i, k) : -1;
        const here = at >= 0 && top[at] !== -999 ? { h: face === 'top' ? top[at] : bottom[at], c: face === 'top' ? color[at] : 0x5e5e58 } : null;
        if (run && (!here || here.h !== run.h || here.c !== run.c)) {
          const x0 = start * CELL - half, x1 = (i - 1) * CELL + half, z = k * CELL, y = worldY(run.h);
          if (face === 'top') quad([x0, y, z + half], [x1, y, z + half], [x1, y, z - half], [x0, y, z - half], [0, 1, 0], run.c, 1);
          else quad([x0, y, z - half], [x1, y, z - half], [x1, y, z + half], [x0, y, z + half], [0, -1, 0], run.c, 0.8);
          run = null;
        }
        if (here && !run) { run = here; start = i; }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);

  // The water: one surface over every river column (merged along rows), and side faces where the
  // river meets open air (the rim), so it reads as a body of water spilling over the edge.
  positions.length = 0; normals.length = 0; colors.length = 0; indices.length = 0;
  const wet = (i: number, k: number) => Math.abs(i) <= n && Math.abs(k) <= n && color[index(i, k)] === BED_COLOR && top[index(i, k)] === RIVER_BED;
  let reach = { from: Infinity, to: -Infinity };
  for (let k = -n; k <= n; k++) {
    let start = 0, open = false;
    for (let i = -n; i <= n + 1; i++) {
      const here = i <= n && wet(i, k);
      if (open && !here) { quad([start * CELL - half, WATER_Y, k * CELL + half], [(i - 1) * CELL + half, WATER_Y, k * CELL + half], [(i - 1) * CELL + half, WATER_Y, k * CELL - half], [start * CELL - half, WATER_Y, k * CELL - half], [0, 1, 0], WATER_COLOR, 1); open = false; }
      if (here && !open) { start = i; open = true; }
      if (!here) continue;
      const along = flow.measure(i * CELL, k * CELL).along;
      reach = { from: Math.min(reach.from, along), to: Math.max(reach.to, along) };
      for (const [dx, dz] of SIDES) {
        const ni = i + dx, nk = k + dz;
        const inside = Math.abs(ni) <= n && Math.abs(nk) <= n && top[index(ni, nk)] !== -999;
        if (inside) continue;
        const ex = i * CELL + dx * half, ez = k * CELL + dz * half;
        const ax = dz !== 0 ? -dz * half : 0, az = dx !== 0 ? dx * half : 0;
        const p = (y: number, s: number) => [ex + ax * s, y, ez + az * s];
        quad(p(worldY(RIVER_BED), -1), p(worldY(RIVER_BED), 1), p(WATER_Y, 1), p(WATER_Y, -1), [dx, 0, dz], 0x3a9fd4, 0.9);
      }
    }
  }
  const water = new THREE.BufferGeometry();
  water.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  water.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  water.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  water.setIndex(indices);

  // Extra waterfalls: springs that pour from the cliff at seeded points on the rim.
  const mouth = flow.heading(fall.along);
  const waterfalls: Waterfall[] = Number.isFinite(fall.along) ? [{ x: fall.x, z: fall.z, y: fall.y, angle: Math.atan2(mouth.z, mouth.x), river: true }] : [];
  const rng = mulberry32(seed ^ 0xfa11);
  for (let s = 0; s < 2 + Math.floor(count / 40); s++) {
    const angle = rng() * Math.PI * 2;
    let x = 0, z = 0;
    for (let d = r * 0.6; d < r * 1.3; d += CELL) { const tx = Math.cos(angle) * d, tz = Math.sin(angle) * d; if (!onIsland(tx, tz, r, seed)) break; x = tx; z = tz; }
    const i = Math.round(x / CELL), k = Math.round(z / CELL);
    if (top[index(i, k)] === -999) continue;
    waterfalls.push({ x, z, y: top[index(i, k)] - 2, angle, river: false });
  }
  const heightAt = (x: number, z: number) => {
    const i = Math.round(x / CELL), k = Math.round(z / CELL);
    if (Math.abs(i) > n || Math.abs(k) > n) return worldY(0);
    const h = top[index(i, k)];
    return worldY(h === -999 ? 0 : h);
  };
  return { geometry, water, stream: Number.isFinite(reach.from) ? reach : { from: 0, to: 0 }, radius: r, waterfalls, heightAt };
}

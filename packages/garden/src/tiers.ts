import { hash3, mulberry32, VoxelModel } from "./voxel";

export type SpeciesKey = "oak" | "cherry" | "pine" | "maple" | "birch" | "cash";
export type Tier = "sprout" | "tree" | "bigTree" | "house";

export const TIER_HEIGHT: Record<Tier, number> = { sprout: 5, tree: 12, bigTree: 22, house: 15 };

const COLORS = {
 oak: [0x37853d, 0x51a846, 0x79c957, 0x9fdb69],
 cherry: [0xc65d88, 0xea8faf, 0xffb5ce, 0xffe1e5],
 pine: [0x1e5949, 0x287652, 0x389468, 0x65ae7c],
 maple: [0xad4133, 0xd65a32, 0xef893b, 0xffbb56],
 birch: [0x79a94b, 0xa4c85e, 0xc3de7c, 0xe1eaa0],
 cash: [0x08785e, 0x079f78, 0x0ac18e, 0x64dfae],
};
const range = (lo: number, hi: number) => Array.from({ length: Math.max(0, hi - lo + 1) }, (_, i) => lo + i);
const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Keep a construction ledger without reaching into VoxelModel's private storage.
// This is also the source of truth for the deterministic growth reveal.
class RewardModel extends VoxelModel {
 readonly voxels = new Map<string, { x: number; y: number; z: number; color: number }>();
 override set(x: number, y: number, z: number, color: number) {
  super.set(x, y, z, color);
  this.voxels.set(`${x},${y},${z}`, { x, y, z, color });
 }
}

function soil(model: VoxelModel, radius = 2) {
 for (const x of range(-radius, radius)) for (const z of range(-radius, radius)) {
  if (x*x + z*z <= radius*radius) model.set(x, 0, z, hash3(x, 2, z) > .5 ? 0x8d6243 : 0x765039);
 }
}

function plant(model: VoxelModel, species: SpeciesKey, seed: number, large: boolean, ox = 0, oz = 0) {
 const rng = mulberry32(seed);
 const p = COLORS[species];
 const trunk = species === "birch" ? 0xf4ead5 : 0x815334;
 const height = large ? 10 : 5;
 const breadth = large ? 5.2 : 3.2;
 const crown = large ? 14 : 8;
 const pick = (dy: number, h: number) => p[Math.max(0, Math.min(3, Math.floor(1 + dy + h * 1.8)))];
 for (const y of range(1, height + 2)) {
  for (const x of range(large ? -1 : 0, large ? 1 : 0)) for (const z of range(large ? -1 : 0, large ? 1 : 0)) {
   if (large && Math.abs(x) + Math.abs(z) > 1) continue;
   model.set(ox+x, y, oz+z, species === "birch" && hash3(x+seed,y,z) > .76 ? 0x615a50 : trunk);
  }
 }
 for (const [dx,dz] of directions) {
  for (const i of range(1,large ? 3 : 1)) model.set(ox+dx*i, 1, oz+dz*i, trunk);
  if (large) model.set(ox+dx, 2, oz+dz, trunk);
  for (const i of range(1,large ? 4 : 2)) {
   model.set(ox+dx*i, height-2+i, oz+dz*i, trunk);
   model.set(ox+dx*i, height-3+i, oz+dz*i, trunk);
  }
 }
 if (species === "pine") {
  // Overlapping skirts keep a clear evergreen silhouette at thumbnail size.
  for (const layer of range(0,large ? 4 : 2)) {
   const bottom = (large ? 4 : 3) + layer * 3;
   const radius = (large ? 6 : 4) - layer;
   for (const dy of range(0,3)) for (const x of range(-radius,radius)) for (const z of range(-radius,radius)) {
    const r = Math.max(0,radius-dy);
    if (Math.max(Math.abs(x),Math.abs(z)) <= r && Math.abs(x)+Math.abs(z) <= r+Math.floor(r*.65)) {
     model.set(ox+x,bottom+dy,oz+z,p[Math.min(3,dy === 0 ? 1 : 2 + Math.floor(hash3(x+seed,dy,z)*2))]);
    }
   }
  }
  model.set(ox,large ? 20 : 12,oz,p[3]);
 } else {
  const oval = species === "birch";
  const wide = species === "maple";
  model.blob(ox,crown,oz,breadth*(oval ? .72 : wide ? 1.2 : 1),large ? (oval ? 6 : 4.5) : (oval ? 3.8 : 3),breadth*(oval ? .8 : 1),pick,.22,seed);
  for (const [i,[dx,dz]] of directions.entries()) {
   const offset = (large ? 3.5 : 1.8) * (oval ? .55 : 1);
   model.blob(ox+dx*offset,crown-(large ? 2 : 1)+rng(),oz+dz*offset,
    breadth*.72, breadth*.65,breadth*.72,pick,.25,seed+i+1);
  }
  if (large) model.blob(ox-1,18,oz,oval ? 2 : 3,2.5,2.5,pick,.2,seed+8);
  // Surface blossoms/coins are sparse accents, never noisy all-over confetti.
  for (const x of range(-8,8)) for (const y of range(5,21)) for (const z of range(-8,8)) {
   if (!model.has(ox+x,y,oz+z) || model.has(ox+x,y+1,oz+z)) continue;
   const h = hash3(x+seed,y,z);
   if (species === "cherry" && h > .94) model.set(ox+x,y,oz+z,0xfff4e9);
   if (species === "cash" && h > .97) model.set(ox+x,y,oz+z,0xffd263);
  }
 }
 if (large && species !== "pine") {
  // A tiny nest sits on the front branch, with a single cream egg.
  for (const x of range(2,4)) for (const z of range(1,3)) model.set(ox+x,9,oz+z,0xb8854e);
  model.set(ox+3,10,oz+2,0xffeac2);
 }
}

function sprout(species: SpeciesKey, seed: number) {
 const m = new RewardModel();
 soil(m,1);
 m.set(0,1,0,0x8caa49);
 m.set(0,2,0,0x719343);
 const flip = mulberry32(seed)() > .5 ? 1 : -1;
 m.set(-1,3,0,COLORS[species][2]);
 m.set(1,3,0,COLORS[species][2]);
 m.set(0,3,flip,COLORS[species][3]);
 m.set(0,4,0,COLORS[species][3]);
 return m;
}

function cottage(species: SpeciesKey, seed: number) {
 const m = new RewardModel();
 const p = COLORS[species];
 // Low, rounded turf plinth; front is +Z. House is left, orchard is right.
 for (const x of range(-8,8)) for (const z of range(-6,6)) {
  if (Math.abs(x) === 8 && Math.abs(z) === 6) continue;
  m.set(x,0,z,hash3(x,seed,z) > .7 ? 0x95bd64 : 0x7da458);
 }
 for (const x of range(-6,2)) for (const z of range(-4,3)) {
  m.set(x,1,z,0xb6a28b);
  for (const y of range(2,7)) {
   if (x !== -6 && x !== 2 && z !== -4 && z !== 3) continue;
   const beam = x === -6 || x === 2 || y === 7;
   m.set(x,y,z,beam ? 0x785039 : (y%2 ? 0xf2dfb7 : 0xe7d0a5));
  }
 }
 // Gable ends with timber trim; shingled roof overhangs on every side.
 for (const x of range(-7,3)) {
  const roofY = 8 + 5-Math.abs(x+2);
  for (const z of range(-5,4)) {
   m.set(x,roofY,z,(z === -5 || z === 4) ? 0x684833 : p[(x+z+24)%3]);
   if (x%2 === 0) m.set(x,roofY-1,z,p[0]);
  }
  for (const y of range(8,roofY-1)) for (const z of [-4,3]) m.set(x,y,z,0xefdbb3);
 }
 for (const z of range(-5,4)) m.set(-2,14,z,p[2]);
 // Door and golden handle, porch, lantern, divided glowing windows.
 for (const x of [-3,-2]) for (const y of range(2,5)) m.set(x,y,3,0x97613e);
 m.set(-2,3,4,0xe8ba5a);
 for (const x of range(-4,-1)) m.set(x,1,4,0xd6bb8e);
 for (const z of [5,6]) for (const x of [-3,-2]) m.set(x,0,z,0xd6bb8e);
 for (const x of [0,1]) for (const y of [4,5]) m.set(x,y,3,0xffd87e);
 for (const z of [-2,-1,1]) for (const y of [4,5]) m.set(2,y,z,0xffd87e);
 for (const x of [0,1]) { m.set(x,3,4,0x97613e); m.set(x,4,4,p[2]); }
 m.set(-5,5,4,0xffd87e); m.set(-5,6,4,0x685441);
 for (const y of range(9,14)) for (const x of [0,1]) for (const z of [-3,-2]) m.set(x,y,z,(x+y)%3 ? 0xa56e54 : 0xc38d70);
 for (const x of [-1,0,1,2]) for (const z of [-4,-3,-2,-1]) m.set(x,15,z,0x756a61);
 // A miniature species tree with its own unambiguous silhouette.
 const tree = new RewardModel();
 plant(tree,species,seed,false);
 for (const v of tree.voxels.values()) m.set(5+Math.round(v.x*.6),1+Math.round(v.y*.65),-1+Math.round(v.z*.6),v.color);
 for (const x of [4,6,8]) for (const y of range(1,3)) m.set(x,y,5,0xe9d6ad);
 for (const x of range(4,8)) m.set(x,2,5,0xe9d6ad);
 for (const x of [4,6,7]) {
  m.set(x,1,3,0x4f843e);
  m.set(x,2,3,hash3(x,seed,3) > .5 ? p[3] : 0xffd781);
 }
 return m;
}

function reward(tier: Tier, species: SpeciesKey, seed: number) {
 const builders = {
  sprout: () => sprout(species,seed),
  tree: () => { const m = new RewardModel(); soil(m); plant(m,species,seed,false); return m; },
  bigTree: () => { const m = new RewardModel(); soil(m,3); plant(m,species,seed,true); return m; },
  house: () => cottage(species,seed),
 };
 return builders[tier]();
}

export function buildTierModel(tier: Tier, species: SpeciesKey, seed: number): VoxelModel {
 return reward(tier,species,seed);
}

/** Continuous, additive construction: roots/trunk before canopy; foundation before roof.
 * Coordinates are voxel centres, so the bottom face is y=-0.5, as in existing models.
 * NaN acts as zero; infinities and finite progress are clamped to the endpoints.
 */
export function buildGrowthModel(species: SpeciesKey, progress: number, seed: number, target: Tier): VoxelModel {
 const full = reward(target,species,seed);
 const p = Number.isNaN(progress) ? 0 : Math.max(0,Math.min(1,progress));
 if (p === 1) return full;
 const m = new VoxelModel();
 const age = (v: { x: number; y: number; z: number }) => v.y + (target === "house" ? 0 : Math.hypot(v.x,v.z)*1.3);
 const cells = [...full.voxels.values()].sort((a,b) => age(a)-age(b) || Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z) || a.x-b.x || a.z-b.z);
 // Begin with soil and a planted seed; its cell is part of every finished model.
 const start = 1;
 const count = start + Math.floor((cells.length-start)*p);
 for (const v of cells.slice(0,count)) m.set(v.x,v.y,v.z,v.color);
 if (!m.has(0,1,0)) m.set(0,1,0,0xb58a4e);
 return m;
}

export function buildWitheredModel(species: SpeciesKey, seed: number): VoxelModel {
 const m = new VoxelModel();
 soil(m);
 const bark = species === "birch" ? 0xb3aaa0 : 0x79644f;
 for (const y of range(1,7)) m.set(0,y,0,bark);
 const flip = mulberry32(seed)() > .5 ? 1 : -1;
 for (const [x,y,z] of [[1,4,0],[2,4,0],[2,5,0],[3,5,0],[3,4,0],[-1,6,0],[-2,6,0],[-2,5,0],[0,5,-1],[0,6,-1]]) {
  m.set(x*flip,y,z,bark);
 }
 m.set(3*flip,3,0,0x9a875c);
 m.set(-2*flip,4,0,0x8c795c);
 return m;
}

export function buildPedestal(rank: 1 | 2 | 3): VoxelModel {
 const m = new VoxelModel();
 const accent = { 1:0xe9bb51, 2:0xbecbd1, 3:0xbd855a }[rank];
 const height = 7-rank*2;
 for (const y of range(0,height)) for (const x of range(-3,3)) for (const z of range(-3,3)) {
  m.set(x,y,z,y === 0 || y === height ? accent : 0xeee3c9);
 }
 // Front medal has one, two or three dark tally marks.
 for (const x of range(-rank+1,rank-1)) m.set(x,Math.max(1,height-1),4,accent);
 for (const i of range(0,rank-1)) m.set(-rank+1+i*2,Math.max(1,height-1),4,0x795e42);
 return m;
}

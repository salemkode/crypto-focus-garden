/**
 * Design prototype: "Your Valley" (web), on the real valley calculation (src/valley.ts), the ladder
 * (src/ladder.ts) and seasons (src/season.ts).
 *
 * Performance rules (what keeps it smooth on phones):
 * - Terrain is meshed as height columns and rebuilt only when the land changes (a plant, a merge,
 *   the island growing), never for a growth step. A merge rebuilds it under the flash.
 * - Items are instanced per model, villagers and chickens per body part: a handful of draw calls.
 * - Shadows are rendered only when the scene changes, not every frame.
 * - Low-power devices get a lower pixel ratio, smaller shadows and lighter weather.
 */
import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { buildBalloon, buildCloud, buildIslet, type IsletKind } from '../src/models';
import { buildLevelModel, CITADEL_LIFT, levelForUnits, levelInfo, minimumUnits, uniqueName, type Level } from '../src/ladder';
import { seasonal, seasonFor, WEATHER, type Season } from '../src/season';
import { mergeEvents, mergeOptions, planMerges, type PlannedMerge } from '../src/merge-plan';
import { buildGrowthModel, type SpeciesKey } from '../src/tiers';
import { LEVEL_SCALE, replayValley, seedOf, valleyTerrain, villagersFor, type Placed, type TerrainMesh, type ValleyEntity, type ValleyEvent } from '../src/valley';

const STYLES: { key: SpeciesKey; name: string; leaf: string }[] = [
  { key: 'oak', name: 'Meadow oak', leaf: '#5cab35' }, { key: 'pine', name: 'Ridge pine', leaf: '#2f7a4a' },
  { key: 'birch', name: 'Silver birch', leaf: '#9cc94a' }, { key: 'cherry', name: 'Blossom cherry', leaf: '#f2a7c1' },
  { key: 'maple', name: 'Ember maple', leaf: '#de6a2b' }, { key: 'cash', name: 'Cash tree', leaf: '#0ac18e' },
];
const VALLEY_SEED = seedOf('bchtest:qq-demo-owner-focus-garden');
const rand = Math.random;
const LOW_POWER = matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency ?? 8) <= 4;
const INIT = (globalThis as { __INIT?: { season?: Season; age?: number; planner?: boolean; card?: boolean } }).__INIT ?? {};

function history(count: number): ValleyEntity[] {
  const out: ValleyEntity[] = [];
  for (let n = 0; n < count; n++) {
    const roll = ((n * 2654435761) >>> 0) / 4294967296;
    const level = (roll < 0.22 ? 1 : roll < 0.48 ? 2 : roll < 0.68 ? 3 : roll < 0.78 ? 4 : roll < 0.85 ? 5 : roll < 0.9 ? 6 : roll < 0.94 ? 7 : roll < 0.97 ? 8 : roll < 0.99 ? 9 : 10) as Level;
    out.push({ id: `nft-${n}`, level: count < 12 && level > 6 ? 5 : level, style: STYLES[(n * 7 + 3) % STYLES.length].key, seed: n * 31 + 7 });
  }
  return out;
}

// ---------- renderer, scene, camera ----------
const canvas = document.querySelector('canvas')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW_POWER, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(LOW_POWER ? 1.5 : 2, devicePixelRatio));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // re-rendered only when the scene changes
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe8ee, 700, 1800);
const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 5000);

// Free, map-style movement: drag to travel, pinch or scroll to zoom toward a point,
// two fingers (or right-drag) to turn and tilt, double-tap to fly somewhere.
const controls = new MapControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.09;
controls.zoomToCursor = true; controls.screenSpacePanning = false;
controls.minDistance = 18; controls.maxDistance = 1400;
controls.maxPolarAngle = 1.38; controls.minPolarAngle = 0.15;
controls.autoRotate = true; controls.autoRotateSpeed = 0.3;
let idleTimer = 0;
let flight: { from: THREE.Vector3; to: THREE.Vector3; camFrom: THREE.Vector3; camTo: THREE.Vector3; start: number; length: number } | null = null;
controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(idleTimer); flight = null; });
controls.addEventListener('end', () => { idleTimer = window.setTimeout(() => { if (!growing && !ceremony) controls.autoRotate = true; }, 9000); });

const hemi = new THREE.HemisphereLight(0xfff4e0, 0x6b5a4a, 1.5);
const sun = new THREE.DirectionalLight(0xffe2b0, 3.2);
sun.castShadow = true; sun.shadow.mapSize.setScalar(LOW_POWER ? 1024 : 2048); sun.shadow.radius = 4; sun.shadow.bias = -0.0004;
scene.add(hemi, sun, sun.target);
const material = new THREE.MeshLambertMaterial({ vertexColors: true });
const terrainMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
const flatMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
const items = new THREE.Group(); const effects = new THREE.Group(); const scenery = new THREE.Group();
scene.add(items, effects, scenery);
const shadowsChanged = () => { renderer.shadowMap.needsUpdate = true; };

// ---------- state ----------
let events: ValleyEvent[] = history(INIT.age ?? 10).map((entity) => ({ type: 'plant' as const, entity }));
let placed: Placed[] = [];
let plants = 0;
let season: Season = INIT.season ?? seasonFor(new Date());
let growing: { entity: ValleyEntity; progress: number } | null = null;
let land: TerrainMesh | null = null;
let terrainKey = '';
let terrain: THREE.Mesh | null = null;
const hidden = new Set<string>();
/** Picking: each instanced mesh maps its instances back to placed items. */
const picks = new Map<THREE.Object3D, string[]>();
let growingMesh: THREE.Mesh | null = null;

const models = new Map<string, THREE.BufferGeometry>();
function geometryFor(e: ValleyEntity) {
  const key = `${e.level}:${e.style}:${e.seed}:${season}`;
  if (!models.has(key)) models.set(key, seasonal(buildLevelModel(e.level, e.style, e.seed).toGeometry(), season));
  return models.get(key)!;
}
const groundAt = (x: number, z: number) => land ? land.heightAt(x, z) : 0;
const radius = () => land?.radius ?? 60;

// ---------- building the world ----------
function replay() {
  const all: ValleyEvent[] = growing ? [...events, { type: 'plant', entity: growing.entity }] : events;
  const state = replayValley(all, VALLEY_SEED);
  placed = state.placed; plants = state.plants;
}

/** Rebuilds the terrain only if the land changed (pads, size, roads, season). */
function rebuildTerrain() {
  const topLevel = Math.max(0, ...placed.map((p) => p.entity.level));
  const key = `${plants}|${season}|${topLevel >= 8}|${topLevel >= 9}|${placed.map((p) => `${p.x},${p.z},${p.radius}`).join(';')}`;
  if (key === terrainKey) return;
  terrainKey = key;
  land = valleyTerrain(placed, plants, VALLEY_SEED, { roads: topLevel >= 8, bridges: topLevel >= 9 });
  if (terrain) { scene.remove(terrain); terrain.geometry.dispose(); }
  terrain = new THREE.Mesh(seasonal(land.geometry, season, { ground: true }), terrainMaterial);
  terrain.receiveShadow = true; terrain.castShadow = true;
  scene.add(terrain);
  const span = land.radius * 1.4;
  Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, far: 3000 });
  sun.shadow.camera.updateProjectionMatrix();
  buildWaterfalls();
  buildScenery();
}

/** Items as instanced meshes, one per model variant. */
function rebuildItems() {
  for (const child of items.children) if (child instanceof THREE.InstancedMesh) child.dispose();
  items.clear(); picks.clear();
  const groups = new Map<string, Placed[]>();
  for (const p of placed) {
    if (hidden.has(p.id) || (growing && p.id === growing.entity.id)) continue;
    const key = `${p.entity.level}:${p.entity.style}:${p.entity.seed}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(p);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (const list of groups.values()) {
    const mesh = new THREE.InstancedMesh(geometryFor(list[0].entity), material, list.length);
    list.forEach((p, i) => {
      const s = LEVEL_SCALE[p.entity.level];
      m.compose(new THREE.Vector3(p.x, groundAt(p.x, p.z) + 0.5 * s, p.z), q.setFromAxisAngle(up, p.turn), new THREE.Vector3(s, s, s));
      mesh.setMatrixAt(i, m);
    });
    mesh.castShadow = true; mesh.receiveShadow = true;
    items.add(mesh); picks.set(mesh, list.map((p) => p.id));
  }
  updateGrowing();
  buildEffects();
  populate();
  shadowsChanged();
  const people = placed.reduce((sum, p) => sum + villagersFor(p.entity.level), 0);
  document.getElementById('count')!.textContent = `${placed.length} items · ${people} villagers`;
}

/** Only the growing tree changes during a session. */
function updateGrowing() {
  if (growingMesh) { scene.remove(growingMesh); growingMesh.geometry.dispose(); picks.delete(growingMesh); growingMesh = null; }
  if (!growing) return;
  const p = placed.find((x) => x.id === growing!.entity.id);
  if (!p) return;
  const tier = (['sprout', 'tree', 'bigTree'] as const)[Math.min(2, p.entity.level - 1)];
  growingMesh = new THREE.Mesh(seasonal(buildGrowthModel(p.entity.style, growing.progress, p.entity.seed, tier).toGeometry(), season), material);
  const s = LEVEL_SCALE[p.entity.level];
  growingMesh.position.set(p.x, groundAt(p.x, p.z) + 0.5 * s, p.z); growingMesh.rotation.y = p.turn; growingMesh.scale.setScalar(s);
  growingMesh.castShadow = true;
  scene.add(growingMesh); picks.set(growingMesh, [p.id]);
  shadowsChanged();
}

function rebuild() { replay(); rebuildTerrain(); rebuildItems(); }

// ---------- scenery: floating islets, balloons, clouds (always around the island) ----------
const clouds = new THREE.Group(); scene.add(clouds);
for (let i = 0; i < 9; i++) {
  const cloud = new THREE.Mesh(buildCloud(40 + i).toGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.93 }));
  cloud.scale.setScalar(2 + rand() * 2);
  cloud.position.set((rand() - 0.5) * 1100, 100 + rand() * 90, (rand() - 0.5) * 1100);
  cloud.userData.speed = 2 + rand() * 4;
  clouds.add(cloud);
}
function buildScenery() {
  scenery.clear();
  const r = radius();
  const kinds: IsletKind[] = ['oak', 'pine', 'flowers', 'hut'];
  const count = Math.min(10, 4 + Math.floor(plants / 20));
  for (let i = 0; i < count; i++) {
    const islet = new THREE.Mesh(seasonal(buildIslet(70 + i, 4 + (i % 3), kinds[i % 4]).toGeometry(), season, { ground: true }), material);
    const angle = (i / count) * Math.PI * 2 + 0.3;
    islet.scale.setScalar(2.2);
    islet.userData = { angle, distance: r + 50 + (i % 3) * 28, height: -10 + (i % 4) * 22, bob: rand() * 6 };
    scenery.add(islet);
  }
  for (let i = 0; i < 3; i++) {
    const balloon = new THREE.Mesh(buildBalloon([0xe0413a, 0x2e5fa8, 0xf2c94c][i], 0xffffff, [0x3a5fa8, 0xe0413a, 0x8a5a33][i]).toGeometry(), material);
    balloon.scale.setScalar(2.4);
    balloon.userData = { angle: rand() * 6.28, distance: r * (1.35 + rand() * 0.5), height: 90 + i * 30, speed: 0.02 + rand() * 0.02, bob: rand() * 6 };
    scenery.add(balloon);
  }
}

// ---------- levels that change the island ----------
let citadel: { beam: THREE.Mesh } | null = null;
function buildEffects() {
  effects.clear(); citadel = null;
  const legend = placed.find((p) => p.entity.level === 10 && !hidden.has(p.id));
  document.getElementById('app')!.classList.toggle('legend', Boolean(legend));
  if (!legend) return;
  const base = groundAt(legend.x, legend.z), lift = CITADEL_LIFT * LEVEL_SCALE[10];
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, lift, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.set(legend.x, base + lift / 2, legend.z);
  const rainbow = new THREE.Group();
  [0xe0413a, 0xf2a23c, 0xf2d43c, 0x5fbf4a, 0x4aa8d8, 0x6a5acd].forEach((color, i) => rainbow.add(new THREE.Mesh(new THREE.TorusGeometry(radius() * 1.25 - i * 2.2, 1.1, 6, 64, Math.PI), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, depthWrite: false }))));
  rainbow.position.set(0, -10, -radius() * 0.35); rainbow.rotation.y = 0.5;
  effects.add(beam, rainbow);
  citadel = { beam };
}

// ---------- waterfalls ----------
const DROPS_EACH = LOW_POWER ? 70 : 140;
let falls: { mesh: THREE.InstancedMesh; state: { t: number; spread: number; lane: number }[]; lip: THREE.Vector3; out: THREE.Vector3; side: THREE.Vector3; width: number }[] = [];
const dropGeometry = new THREE.BoxGeometry(1.2, 2.4, 1.2);
const dropMaterial = new THREE.MeshLambertMaterial({ color: 0xb9e6f6, transparent: true, opacity: 0.88 });
function buildWaterfalls() {
  for (const f of falls) { scene.remove(f.mesh); f.mesh.dispose(); }
  falls = (land?.waterfalls ?? []).map((w) => {
    const mesh = new THREE.InstancedMesh(dropGeometry, dropMaterial, DROPS_EACH);
    scene.add(mesh);
    const out = new THREE.Vector3(Math.cos(w.angle), 0, Math.sin(w.angle));
    return { mesh, state: Array.from({ length: DROPS_EACH }, () => ({ t: rand(), spread: rand() - 0.5, lane: rand() - 0.5 })), lip: new THREE.Vector3(w.x, w.y * 2 + 0.5, w.z).addScaledVector(out, w.river ? 2 : 1.5), out, side: new THREE.Vector3(-out.z, 0, out.x), width: w.river ? 6 : 2.5 };
  });
}
function animateWaterfalls(dt: number) {
  const m = new THREE.Matrix4();
  for (const f of falls) {
    f.state.forEach((d, i) => {
      d.t += dt * 0.5; if (d.t > 1) { d.t = 0; d.spread = rand() - 0.5; d.lane = rand() - 0.5; }
      const p = f.lip.clone().addScaledVector(f.out, d.t * 7 + d.spread * 1.5).addScaledVector(f.side, d.lane * f.width);
      p.y -= d.t * d.t * 170;
      m.makeTranslation(p.x, p.y, p.z); f.mesh.setMatrixAt(i, m);
    });
    f.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------- villagers and chickens (instanced by body part) ----------
type Villager = { home: Placed; pos: THREE.Vector3; target: THREE.Vector3; yaw: number; task: 'walk' | 'chop' | 'fish' | 'rest'; until: number; carrying: boolean; name: string };
let villagers: Villager[] = [];
let chickens: { home: Placed; pos: THREE.Vector3; target: THREE.Vector3; yaw: number; peck: number }[] = [];
const PART = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const parts = {
  leg: PART(0.9, 1.8, 0.9), body: PART(2, 2.2, 1.2), head: PART(1.6, 1.6, 1.6), hat: PART(1.8, 0.5, 1.8), arm: PART(0.6, 1.8, 0.6), log: PART(2.4, 0.8, 0.8),
  chickenBody: PART(1.6, 1.3, 2), chickenHead: PART(0.9, 0.9, 0.9), comb: PART(0.3, 0.4, 0.5),
};
let crowd: Record<string, THREE.InstancedMesh> = {};
const SHIRTS = [0xd65a32, 0x3b6479, 0xf2c94c, 0x9b6bd6, 0x4f8a45, 0xe88aac, 0x2e2640];
const SKIN = [0xf1c8a3, 0xd9a47a, 0xa8714a, 0x7a4b2e];
const NAMES = ['Ada', 'Bram', 'Cleo', 'Dov', 'Esme', 'Finn', 'Greta', 'Hugo', 'Iris', 'Jun', 'Kaia', 'Leo', 'Mira', 'Nico', 'Oona', 'Pip', 'Rafa', 'Sana', 'Teo', 'Uma'];

function populate() {
  for (const mesh of Object.values(crowd)) { scene.remove(mesh); mesh.dispose(); }
  villagers = []; chickens = [];
  for (const home of placed) {
    if (hidden.has(home.id)) continue;
    for (let v = 0; v < villagersFor(home.entity.level); v++) {
      const pos = new THREE.Vector3(home.x + (rand() - 0.5) * 8, 0, home.z + home.radius + 2);
      villagers.push({ home, pos, target: pos.clone(), yaw: 0, task: 'rest', until: 0, carrying: false, name: NAMES[Math.floor(rand() * NAMES.length)] });
    }
    if (home.entity.level >= 6 && home.entity.level <= 8) for (let c = 0; c < 2; c++) {
      const pos = new THREE.Vector3(home.x + home.radius + 3 + rand() * 4, 0, home.z + (rand() - 0.5) * 10);
      chickens.push({ home, pos, target: pos.clone(), yaw: 0, peck: rand() * 10 });
    }
  }
  const make = (geometry: THREE.BufferGeometry, count: number, colorOf: (i: number) => number) => {
    const mesh = new THREE.InstancedMesh(geometry, flatMaterial, Math.max(1, count));
    mesh.count = count;
    const c = new THREE.Color();
    for (let i = 0; i < Math.max(1, count); i++) mesh.setColorAt(i, c.setHex(count ? colorOf(i) : 0xffffff));
    scene.add(mesh);
    return mesh;
  };
  const shirts = villagers.map(() => SHIRTS[Math.floor(rand() * SHIRTS.length)]), skins = villagers.map(() => SKIN[Math.floor(rand() * SKIN.length)]);
  crowd = {
    leg: make(parts.leg, villagers.length * 2, () => 0x4a3b2f),
    body: make(parts.body, villagers.length, (i) => shirts[i]),
    head: make(parts.head, villagers.length, (i) => skins[i]),
    hat: make(parts.hat, villagers.length, (i) => (i % 2 ? 0x8a5a33 : 0xf2dfb7)),
    arm: make(parts.arm, villagers.length, (i) => skins[i]),
    log: make(parts.log, villagers.length, () => 0x93653d),
    hen: make(parts.chickenBody, chickens.length, () => 0xffffff),
    henHead: make(parts.chickenHead, chickens.length, () => 0xffffff),
    comb: make(parts.comb, chickens.length, () => 0xe0413a),
  };
}

function pickTask(v: Villager, now: number) {
  const roll = rand();
  const nearTrees = placed.filter((p) => p.entity.level <= 4 && Math.hypot(p.x - v.home.x, p.z - v.home.z) < 70);
  if (roll < 0.35 && nearTrees.length) {
    const t = nearTrees[Math.floor(rand() * nearTrees.length)];
    v.target.set(t.x + (rand() - 0.5) * 4, 0, t.z + t.radius + 1); v.task = 'chop';
  } else if (roll < 0.85) { v.target.set(v.home.x + (rand() - 0.5) * 34, 0, v.home.z + (rand() - 0.5) * 34); v.task = 'walk'; }
  else { v.target.set(v.home.x, 0, v.home.z + v.home.radius + 2); v.task = 'rest'; }
  v.until = now + 4000 + rand() * 5000; v.carrying = false;
}

const M = new THREE.Matrix4(), L = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), ONE = new THREE.Vector3(1, 1, 1), ZERO = new THREE.Vector3(0, 0, 0), V = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const ROOT = new THREE.Matrix4(), PQ = new THREE.Quaternion();
function placePart(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, pitch = 0, hide = false) {
  L.compose(V.set(x, y, z), PQ.setFromEuler(E.set(pitch, 0, 0)), hide ? ZERO : ONE);
  mesh.setMatrixAt(i, M.multiplyMatrices(ROOT, L));
}
function animateLife(now: number, dt: number) {
  villagers.forEach((v, i) => {
    const dx = v.target.x - v.pos.x, dz = v.target.z - v.pos.z, d = Math.hypot(dx, dz);
    const moving = d > 0.6;
    let swing = 0, arm = 0;
    if (moving) { v.pos.x += (dx / d) * 7 * dt; v.pos.z += (dz / d) * 7 * dt; v.yaw = Math.atan2(dx, dz); swing = Math.sin(now / 90) * 0.6; arm = -swing; }
    else {
      if (v.task === 'chop') arm = -1.2 + Math.abs(Math.sin(now / 160)) * 1.6;
      if (now > v.until) { if (v.task === 'chop') { v.target.set(v.home.x, 0, v.home.z + v.home.radius + 2); v.task = 'walk'; v.carrying = true; v.until = now + 3000; } else pickTask(v, now); }
    }
    v.pos.y = groundAt(v.pos.x, v.pos.z) + (moving ? Math.abs(Math.sin(now / 90)) * 0.3 : 0);
    ROOT.compose(v.pos, Q.setFromAxisAngle(UP, v.yaw), V.set(0.85, 0.85, 0.85));
    placePart(crowd.leg, i * 2, -0.5, 0.9, 0, swing); placePart(crowd.leg, i * 2 + 1, 0.5, 0.9, 0, -swing);
    placePart(crowd.body, i, 0, 2.9, 0); placePart(crowd.head, i, 0, 4.8, 0); placePart(crowd.hat, i, 0, 5.8, 0);
    placePart(crowd.arm, i, 1.3, 3, 0, arm); placePart(crowd.log, i, 0, 4.2, 1.1, 0, !v.carrying);
  });
  chickens.forEach((c, i) => {
    const dx = c.target.x - c.pos.x, dz = c.target.z - c.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.5) { c.pos.x += (dx / d) * 3 * dt; c.pos.z += (dz / d) * 3 * dt; c.yaw = Math.atan2(dx, dz); }
    else if (rand() < 0.01) c.target.set(c.home.x + c.home.radius + (rand() - 0.2) * 10, 0, c.home.z + (rand() - 0.5) * 14);
    c.pos.y = groundAt(c.pos.x, c.pos.z);
    ROOT.compose(c.pos, Q.setFromAxisAngle(UP, c.yaw), V.set(0.7, 0.7, 0.7));
    const peck = Math.max(0, Math.sin(now / 180 + c.peck)) * 0.9;
    placePart(crowd.hen, i, 0, 1, 0); placePart(crowd.henHead, i, 0, 2 - peck * 0.6, 0.9 + peck * 0.4, peck); placePart(crowd.comb, i, 0, 2.6 - peck * 0.6, 0.9 + peck * 0.4, peck);
  });
  for (const mesh of Object.values(crowd)) mesh.instanceMatrix.needsUpdate = true;
  scenery.children.forEach((s) => {
    const u = s.userData;
    u.angle += (u.speed ?? 0.004) * dt;
    s.position.set(Math.cos(u.angle) * u.distance, u.height + Math.sin(now / 1800 + u.bob) * 3, Math.sin(u.angle) * u.distance);
  });
}

// ---------- weather ----------
let weather: { mesh: THREE.InstancedMesh; state: { x: number; y: number; z: number; phase: number; spin: number }[] } | null = null;
function buildWeather() {
  if (weather) { scene.remove(weather.mesh); weather.mesh.geometry.dispose(); weather.mesh.dispose(); }
  const w = WEATHER[season];
  const count = Math.round(w.count * (LOW_POWER ? 0.45 : 1));
  const size = w.kind === 'snow' ? [0.9, 0.9, 0.9] : w.kind === 'pollen' ? [0.5, 0.5, 0.5] : [1.4, 0.2, 1.1];
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(size[0], size[1], size[2]), new THREE.MeshBasicMaterial({ color: 0xffffff }), count);
  const state = Array.from({ length: count }, () => ({ x: (rand() - 0.5) * 2, y: rand() * 170 - 10, z: (rand() - 0.5) * 2, phase: rand() * 6.28, spin: rand() * 3 }));
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) mesh.setColorAt(i, c.setHex(w.colors[i % w.colors.length]));
  scene.add(mesh); weather = { mesh, state };
}
function animateWeather(now: number, dt: number) {
  if (!weather) return;
  const w = WEATHER[season], r = radius();
  weather.state.forEach((d, i) => {
    d.y -= w.fall * dt * (0.7 + (i % 5) * 0.12);
    if (d.y < -15) d.y = 160;
    E.set(now / 900 * d.spin, now / 1100 * d.spin, 0);
    M.compose(V.set(d.x * r * 1.3 + Math.sin(now / 1400 + d.phase) * w.sway, d.y, d.z * r * 1.3 + Math.cos(now / 1700 + d.phase) * w.sway), Q.setFromEuler(E), ONE);
    weather!.mesh.setMatrixAt(i, M);
  });
  weather.mesh.instanceMatrix.needsUpdate = true;
}

// ---------- time is light ----------
function setDaylight(t: number) {
  const angle = -0.9 + t * 1.9, height = 0.95 - t * 0.62;
  sun.position.set(Math.cos(angle) * 600, 140 + height * 420, Math.sin(angle) * 600);
  sun.color.copy(new THREE.Color(0xffe6b8).lerp(new THREE.Color(0xff9a5c), t)); sun.intensity = 3.2 - t * 1.1;
  hemi.intensity = 1.5 - t * 0.45; hemi.color.copy(new THREE.Color(0xfff4e0).lerp(new THREE.Color(0xc9b6e8), t));
  const app = document.getElementById('app')!;
  app.style.setProperty('--sky-top', new THREE.Color(0xffd9b3).lerp(new THREE.Color(0xb39ad6), t).getStyle());
  app.style.setProperty('--sky-bottom', new THREE.Color(0xcfe8ee).lerp(new THREE.Color(0xffc89a), t).getStyle());
  (scene.fog as THREE.Fog).color.copy(new THREE.Color(0xcfe8ee).lerp(new THREE.Color(0xffc89a), t));
  shadowsChanged();
}

// ---------- camera helpers ----------
function flyTo(point: THREE.Vector3, distance: number, length = 900) {
  const offset = camera.position.clone().sub(controls.target).setLength(distance);
  flight = { from: controls.target.clone(), to: point.clone(), camFrom: camera.position.clone(), camTo: point.clone().add(offset), start: performance.now(), length };
  controls.autoRotate = false;
}
const frameAll = () => flyTo(new THREE.Vector3(0, 0, 0), 260 + radius() * 4.2, 1100);
function resize() { const r = canvas.parentElement!.getBoundingClientRect(); renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ---------- picking: tap anything to see what it is ----------
const raycaster = new THREE.Raycaster();
let down: { x: number; y: number; t: number } | null = null;
const ndc = (clientX: number, clientY: number) => { const r = canvas.getBoundingClientRect(); return new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1); };
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || performance.now() - down.t > 350) return;
  const hit = pick(e.clientX, e.clientY);
  if (hit) showCard(hit); else hideCard();
});
canvas.addEventListener('dblclick', (e) => {
  raycaster.setFromCamera(ndc(e.clientX, e.clientY), camera);
  const ground = terrain ? raycaster.intersectObject(terrain)[0] : null;
  if (ground) flyTo(ground.point, 90);
});
/** Anything you can tap, with a live anchor point so its card can follow it. */
type Hit =
  | { kind: 'item'; placed: Placed }
  | { kind: 'villager'; villager: Villager }
  | { kind: 'chicken'; index: number }
  | { kind: 'waterfall'; river: boolean; point: THREE.Vector3 }
  | { kind: 'islet' | 'balloon' | 'cloud'; object: THREE.Object3D }
  | { kind: 'ground'; point: THREE.Vector3 };

function pick(clientX: number, clientY: number): Hit | null {
  raycaster.setFromCamera(ndc(clientX, clientY), camera);
  const groups: [THREE.Object3D[], (hit: THREE.Intersection) => Hit | null][] = [
    [[...picks.keys()], (hit) => { const id = picks.get(hit.object)?.[hit.instanceId ?? 0]; const p = placed.find((x) => x.id === id); return p ? { kind: 'item', placed: p } : null; }],
    [[crowd.body, crowd.head, crowd.hat].filter(Boolean), (hit) => villagers[hit.instanceId!] ? { kind: 'villager', villager: villagers[hit.instanceId!] } : null],
    [[crowd.hen, crowd.henHead].filter(Boolean), (hit) => chickens[hit.instanceId!] ? { kind: 'chicken', index: hit.instanceId! } : null],
    [falls.map((f) => f.mesh), (hit) => ({ kind: 'waterfall', river: falls.find((f) => f.mesh === hit.object)!.width > 4, point: hit.point.clone() })],
    [scenery.children, (hit) => ({ kind: hit.object.userData.speed ? 'balloon' : 'islet', object: hit.object })],
    [clouds.children, (hit) => ({ kind: 'cloud', object: hit.object })],
    [terrain ? [terrain] : [], (hit) => ({ kind: 'ground', point: hit.point.clone() })],
  ];
  // The nearest thing under your finger wins, whatever it is.
  let best: { distance: number; hit: Hit } | null = null;
  for (const [objects, read] of groups) {
    const hit = raycaster.intersectObjects(objects, false)[0];
    if (!hit || (best && hit.distance >= best.distance)) continue;
    const value = read(hit);
    if (value) best = { distance: hit.distance, hit: value };
  }
  return best?.hit ?? null;
}

// ---------- the floating card ----------
const card = document.getElementById('card')!;
let anchor: (() => THREE.Vector3 | null) | null = null;
const heightOf = (e: ValleyEntity) => { const g = geometryFor(e); if (!g.boundingBox) g.computeBoundingBox(); return g.boundingBox!.max.y * LEVEL_SCALE[e.level]; };
const doing = (v: Villager) => v.task === 'chop' ? 'gathering wood' : v.task === 'walk' ? (v.carrying ? 'carrying logs home' : 'out for a walk') : 'resting at home';
const SEASON_NAME: Record<Season, string> = { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' };

function showCard(hit: Hit) {
  let html = '';
  if (hit.kind === 'item') {
    const p = hit.placed, e = p.entity, info = levelInfo(e.level);
    const hours = (minimumUnits(e.level) * 512) / 3600;
    const ordinal = Math.max(0, events.findIndex((ev) => ev.type === 'plant' ? ev.entity.id === e.id : ev.result.id === e.id));
    const growingNow = growing && growing.entity.id === e.id;
    html = `<div class="eyebrow">Level ${e.level} · ${info.kind === 'tree' ? 'Tree' : info.kind === 'legend' ? 'Legend' : 'Building'}</div>
      <div class="name">${uniqueName(e.level, e.style, e.seed)}</div>
      <div class="facts">${STYLES.find((s) => s.key === e.style)!.name} · ${hours < 1 ? Math.round(hours * 60) + ' min' : hours.toFixed(1) + ' h'} of focus${villagersFor(e.level) ? ` · ${villagersFor(e.level)} villagers` : ''}<br>
      ${growingNow ? 'Growing now' : `Planted ${Math.max(1, (events.length - ordinal) * 2)} days ago · in your wallet`}</div>
      <label class="note">Your note<textarea placeholder="What did you focus on?" rows="2"></textarea></label>`;
    const top = heightOf(e);
    anchor = () => new THREE.Vector3(p.x, groundAt(p.x, p.z) + top + 2, p.z);
    flyTo(new THREE.Vector3(p.x, groundAt(p.x, p.z) + top * 0.4, p.z), Math.max(150, top * 8));
  } else if (hit.kind === 'villager') {
    const v = hit.villager;
    html = `<div class="eyebrow">Villager</div><div class="name">${v.name}</div>
      <div class="facts">Lives in the ${uniqueName(v.home.entity.level, v.home.entity.style, v.home.entity.seed)}<br><span class="live">${doing(v)}</span></div>`;
    anchor = () => v.pos.clone().setY(v.pos.y + 7);
  } else if (hit.kind === 'chicken') {
    const c = chickens[hit.index];
    html = `<div class="eyebrow">Hen</div><div class="name">Pecking around</div><div class="facts">Lives by the ${uniqueName(c.home.entity.level, c.home.entity.style, c.home.entity.seed)}</div>`;
    anchor = () => chickens[hit.index] ? chickens[hit.index].pos.clone().setY(chickens[hit.index].pos.y + 3) : null;
  } else if (hit.kind === 'waterfall') {
    html = `<div class="eyebrow">Waterfall</div><div class="name">${hit.river ? 'Where the river falls' : 'A cliff spring'}</div><div class="facts">${hit.river ? 'Your river runs off the edge of the island here.' : 'More springs appear as your valley grows.'}</div>`;
    const point = hit.point; anchor = () => point;
  } else if (hit.kind === 'islet' || hit.kind === 'balloon' || hit.kind === 'cloud') {
    const object = hit.object;
    html = hit.kind === 'islet' ? `<div class="eyebrow">Floating islet</div><div class="name">A little neighbour</div><div class="facts">Islets gather around your valley as it grows. ${scenery.children.filter((c) => !c.userData.speed).length} so far.</div>`
      : hit.kind === 'balloon' ? `<div class="eyebrow">Hot-air balloon</div><div class="name">Drifting by</div><div class="facts">Visitors floating over your valley.</div>`
      : `<div class="eyebrow">Cloud</div><div class="name">Passing over</div><div class="facts">${SEASON_NAME[season]} weather.</div>`;
    anchor = () => object.position.clone().setY(object.position.y + 14);
  } else {
    const point = hit.point;
    const flow = river(VALLEY_SEED).measure(point.x, point.z);
    const where = flow.along > -6 && flow.offset < 4 ? 'The river' : flow.along > -6 && flow.offset < 7 ? 'Riverbank' : point.y > 9 ? 'Hills' : 'Valley floor';
    html = `<div class="eyebrow">Land</div><div class="name">${where}</div><div class="facts">${SEASON_NAME[season]} · your valley is ${Math.round(radius() * 2)} blocks across and holds ${placed.length} items</div>`;
    anchor = () => point.clone().setY(point.y + 3);
  }
  card.innerHTML = `<div class="bubble"><button class="close" aria-label="Close">×</button>${html}</div><div class="stem"></div>`;
  const area = card.querySelector('textarea');
  if (area && hit.kind === 'item') {
    const key = `valley.note.${hit.placed.id}`;
    area.value = localStorage.getItem(key) ?? '';
    area.addEventListener('input', () => localStorage.setItem(key, area.value));
  }
  card.querySelector('.close')!.addEventListener('click', hideCard);
  // Restart the spring so every tap feels fresh, even on the same object.
  card.classList.remove('show'); void card.offsetWidth; card.classList.add('show');
  positionCard();
}
function hideCard() { card.classList.remove('show'); setTimeout(() => { if (!card.classList.contains('show')) anchor = null; }, 350); }

/** Keeps the card attached to its object every frame, flipping below it near the top edge. */
function positionCard() {
  if (!anchor) return;
  const point = anchor();
  const box = canvas.getBoundingClientRect();
  if (!point) { hideCard(); return; }
  const p = point.clone().project(camera);
  const behind = p.z > 1;
  let x = (p.x + 1) / 2 * box.width, y = (1 - p.y) / 2 * box.height;
  const w = card.offsetWidth || 260, h = card.offsetHeight || 120;
  const below = y - h - 18 < 70;
  x = Math.max(w / 2 + 10, Math.min(box.width - w / 2 - 10, x));
  card.classList.toggle('below', below);
  card.style.left = `${x}px`; card.style.top = `${below ? y + 18 : y - 12}px`;
  card.style.visibility = behind ? 'hidden' : 'visible';
}

// ---------- the merge ceremony ----------
function nextMerge() {
  for (let level = 1; level <= 9; level++) {
    const need = levelInfo((level + 1) as Level).merge;
    const group = placed.filter((p) => p.entity.level === level && !(growing && p.id === growing.entity.id));
    if (group.length < need) continue;
    const first = group[0];
    return { level: level as Level, picks: [first, ...group.slice(1).sort((a, b) => Math.hypot(a.x - first.x, a.z - first.z) - Math.hypot(b.x - first.x, b.z - first.z)).slice(0, need - 1)] };
  }
  return null;
}
type Drop = { mesh: THREE.InstancedMesh; index: number; y: number };
let ceremony: { start: number; meshes: { mesh: THREE.Mesh; from: THREE.Vector3; spin: number }[]; result: ValleyEntity; ids: string[]; flash: THREE.Mesh; burst: THREE.InstancedMesh; sparks: { v: THREE.Vector3; p: THREE.Vector3 }[]; landed: boolean; drop?: Drop } | null = null;

function mergeNow() {
  const merge = nextMerge();
  if (!merge || ceremony || renewal || growing) return;
  hideCard();
  const ids = merge.picks.map((p) => p.id);
  const lineage = seedOf(ids.join('|'));
  const result: ValleyEntity = { id: `merged-${lineage}`, level: (merge.level + 1) as Level, style: merge.picks[0].entity.style, seed: lineage % 100000 };
  const meshes = merge.picks.map((p) => {
    const mesh = new THREE.Mesh(geometryFor(p.entity), material);
    const s = LEVEL_SCALE[p.entity.level];
    mesh.position.set(p.x, groundAt(p.x, p.z) + 0.5 * s, p.z); mesh.rotation.y = p.turn; mesh.scale.setScalar(s);
    scene.add(mesh); hidden.add(p.id);
    return { mesh, from: mesh.position.clone(), spin: rand() > 0.5 ? 1 : -1 };
  });
  rebuildItems(); // hides the ingredients; the terrain is untouched, so this is cheap
  const centre = new THREE.Vector3(merge.picks[0].x, groundAt(merge.picks[0].x, merge.picks[0].z), merge.picks[0].z);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xfff6d6, transparent: true, opacity: 0 }));
  flash.position.copy(centre).setY(centre.y + 34); scene.add(flash);
  const tints = [0xf2b53c, 0xffffff, STYLES.find((x) => x.key === result.style)!.leaf].map((c) => new THREE.Color(c));
  const burst = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), new THREE.MeshBasicMaterial({ color: 0xffffff }), 120);
  const sparks = Array.from({ length: 120 }, (_, i) => { burst.setColorAt(i, tints[i % 3]); return { v: new THREE.Vector3((rand() - 0.5) * 70, rand() * 60, (rand() - 0.5) * 70), p: flash.position.clone() }; });
  burst.visible = false; scene.add(burst);
  ceremony = { start: performance.now(), meshes, result, ids, flash, burst, sparks, landed: false };
  flyTo(centre.clone().setY(centre.y + 12), 200, 700);
  renderDock();
}
function setDropY(drop: Drop, y: number) {
  drop.mesh.getMatrixAt(drop.index, M);
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  M.decompose(p, q, s); p.y = y;
  drop.mesh.setMatrixAt(drop.index, M.compose(p, q, s)); drop.mesh.instanceMatrix.needsUpdate = true;
}
function animateCeremony(now: number) {
  if (!ceremony) return;
  const t = (now - ceremony.start) / 1000;
  const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  const top = ceremony.flash.position;
  ceremony.meshes.forEach((m, i) => {
    if (t < 1.2) { m.mesh.position.copy(m.from).setY(m.from.y + ease(t / 1.2) * 34); m.mesh.rotation.y += 0.04 * m.spin * (1 + t * 3); }
    else if (t < 2.0) {
      const k = ease((t - 1.2) / 0.8), a = k * Math.PI * 2 + (i * Math.PI * 2) / ceremony!.meshes.length;
      const lifted = m.from.clone().setY(m.from.y + 34), r = (1 - k) * Math.hypot(lifted.x - top.x, lifted.z - top.z);
      m.mesh.position.set(top.x + Math.cos(a) * r, lifted.y + (top.y - lifted.y) * k, top.z + Math.sin(a) * r);
      m.mesh.scale.setScalar(Math.max(0.05, 1.2 * (1 - k))); m.mesh.rotation.y += 0.25 * m.spin;
    } else m.mesh.visible = false;
  });
  if (t >= 2.0 && !ceremony.landed) {
    ceremony.landed = true;
    events = [...events, { type: 'merge', ingredients: ceremony.ids, result: ceremony.result }];
    hidden.clear();
    rebuild(); // the terrain rebuilds under the flash, where a short pause is invisible
    for (const [mesh, ids] of picks) {
      const index = ids.indexOf(ceremony.result.id);
      if (index >= 0 && mesh instanceof THREE.InstancedMesh) {
        mesh.getMatrixAt(index, M); const p = new THREE.Vector3(); M.decompose(p, new THREE.Quaternion(), new THREE.Vector3());
        ceremony.drop = { mesh, index, y: p.y };
      }
    }
    ceremony.meshes.forEach((m) => scene.remove(m.mesh));
    reveal(ceremony.result, ceremony.ids.length);
  }
  if (t >= 2.0 && t < 2.9) {
    const k = (t - 2.0) / 0.9;
    ceremony.flash.scale.setScalar(4 + k * 38); (ceremony.flash.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9;
    camera.position.x += (rand() - 0.5) * (1 - k) * 2.2; camera.position.y += (rand() - 0.5) * (1 - k) * 2.2;
    ceremony.burst.visible = true;
    ceremony.sparks.forEach((s, i) => { s.p.addScaledVector(s.v, 0.016); s.v.y -= 1.6; M.makeTranslation(s.p.x, s.p.y, s.p.z); ceremony!.burst.setMatrixAt(i, M); });
    ceremony.burst.instanceMatrix.needsUpdate = true;
  }
  if (ceremony.drop && t < 3.4) {
    const k = Math.min(1, (t - 2.0) / 1.0);
    setDropY(ceremony.drop, ceremony.drop.y + (1 - ease(k)) * 60 * (1 - k) + (k < 1 ? Math.abs(Math.cos(k * Math.PI * 1.5)) * (1 - k) * 6 : 0));
  }
  if (t >= 3.4) {
    if (ceremony.drop) setDropY(ceremony.drop, ceremony.drop.y);
    scene.remove(ceremony.flash, ceremony.burst); ceremony.burst.dispose();
    ceremony = null; shadowsChanged(); renderDock();
  }
}
function reveal(entity: ValleyEntity, ingredients: number) {
  const info = levelInfo(entity.level), people = villagersFor(entity.level);
  const el = document.getElementById('reveal')!;
  el.innerHTML = `<div class="badge">Level ${entity.level}</div><div class="title">${uniqueName(entity.level, entity.style, entity.seed)}</div>
    <div class="sub">${ingredients} became one ${info.name.toLowerCase()}${people ? ` · ${people} ${people === 1 ? 'villager moves' : 'villagers move'} in` : ''}${entity.level === 10 ? ' · the sky changes' : ''}</div>`;
  el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3800);
}


// ---------- batch merging: one renewal instead of many ceremonies ----------
const planner = document.getElementById('planner')!;
let choice: Partial<Record<Level, number>> = {};
let cascade = true;
function openPlanner() {
  hideCard();
  const options = mergeOptions(placed);
  choice = Object.fromEntries(options.map((o) => [o.level, o.available]));
  renderPlanner();
  planner.classList.add('show');
}
function renderPlanner() {
  const options = mergeOptions(placed);
  const plan = planMerges(placed, choice, { cascade });
  // Count only what you end up with: results that are not merged again further up.
  const finals = new Set(plan.map((m) => m.result.id));
  for (const m of plan) for (const id of m.ingredients) finals.delete(id);
  const made = new Map<Level, number>();
  for (const m of plan) if (finals.has(m.result.id)) made.set(m.result.level, (made.get(m.result.level) ?? 0) + 1);
  const keep = [...made.entries()].map(([level, n]) => `${n} ${levelInfo(level).name.toLowerCase()}${n > 1 ? 's' : ''}`).join(', ');
  planner.innerHTML = `<div class="head"><div><div class="eyebrow">Merge planner</div><div class="name">Grow your valley in one go</div></div><button class="close" aria-label="Close">×</button></div>
    ${options.map((o) => `<div class="option"><div><b>${o.need} ${levelInfo(o.level).name.toLowerCase()}s → ${levelInfo(o.next).name.toLowerCase()}</b><small>${o.available} possible</small></div>
      <div class="stepper"><button data-level="${o.level}" data-step="-1" aria-label="Fewer">−</button><span>${choice[o.level] ?? 0}</span><button data-level="${o.level}" data-step="1" aria-label="More">+</button></div></div>`).join('')}
    <label class="cascade"><input type="checkbox" ${cascade ? 'checked' : ''}> Keep merging upward with the new ones</label>
    <div class="actions"><button class="all">Everything</button><button class="go" ${plan.length ? '' : 'disabled'}>Merge ${plan.length}</button></div>
    <div class="preview">${plan.length ? `You end up with ${keep}.` : 'Choose what to merge.'}</div>`;
  planner.querySelector('.close')!.addEventListener('click', () => planner.classList.remove('show'));
  planner.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((b) => b.onclick = () => {
    const level = Number(b.dataset.level) as Level, max = options.find((o) => o.level === level)!.available;
    choice[level] = Math.max(0, Math.min(max, (choice[level] ?? 0) + Number(b.dataset.step))); renderPlanner();
  });
  planner.querySelector<HTMLInputElement>('.cascade input')!.onchange = (e) => { cascade = (e.target as HTMLInputElement).checked; renderPlanner(); };
  planner.querySelector<HTMLButtonElement>('.all')!.onclick = () => { choice = Object.fromEntries(options.map((o) => [o.level, Infinity])); renderPlanner(); };
  planner.querySelector<HTMLButtonElement>('.go')!.onclick = () => { planner.classList.remove('show'); if (plan.length === 1) mergeNow(); else renew(plan); };
}

type Pop = { mesh: THREE.InstancedMesh; index: number; matrix: THREE.Matrix4; delay: number };
let renewal: { start: number; plan: PlannedMerge[]; sparkles: THREE.InstancedMesh; seeds: { p: THREE.Vector3; v: THREE.Vector3 }[]; wave: THREE.Mesh; applied: boolean; pops: Pop[] } | null = null;

function renew(plan: PlannedMerge[]) {
  if (renewal || ceremony || growing) return;
  const ingredientIds = new Set(plan.flatMap((m) => m.ingredients));
  const sources = placed.filter((p) => ingredientIds.has(p.id));
  for (const p of sources) hidden.add(p.id);
  rebuildItems(); // hide the ingredients: cheap, the land is untouched
  // Every ingredient dissolves into rising sparkles at once.
  const perItem = Math.max(2, Math.min(8, Math.floor(600 / Math.max(1, sources.length))));
  const sparkles = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }), sources.length * perItem);
  const tint = new THREE.Color();
  const seeds = sources.flatMap((p, i) => Array.from({ length: perItem }, (_, k) => {
    sparkles.setColorAt(i * perItem + k, tint.set(k % 3 === 0 ? 0xf2b53c : STYLES.find((s) => s.key === p.entity.style)!.leaf));
    return { p: new THREE.Vector3(p.x + (rand() - 0.5) * 8, groundAt(p.x, p.z) + rand() * 14, p.z + (rand() - 0.5) * 8), v: new THREE.Vector3((rand() - 0.5) * 6, 14 + rand() * 18, (rand() - 0.5) * 6) };
  }));
  scene.add(sparkles);
  // A ring of light sweeps across the island; the world regenerates under it.
  const wave = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 96), new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  wave.rotation.x = -Math.PI / 2; wave.position.y = groundAt(0, 0) + 6; wave.scale.setScalar(0.01);
  scene.add(wave);
  renewal = { start: performance.now(), plan, sparkles, seeds, wave, applied: false, pops: [] };
  frameAll(); renderDock();
}

function animateRenewal(now: number, dt: number) {
  if (!renewal) return;
  const t = (now - renewal.start) / 1000, r = radius();
  // Sparkles rise and fade over the first 1.4 s.
  const fade = Math.max(0, 1 - t / 1.4);
  (renewal.sparkles.material as THREE.MeshBasicMaterial).opacity = fade;
  renewal.seeds.forEach((s, i) => { s.p.addScaledVector(s.v, dt); s.v.multiplyScalar(0.985); M.makeScale(fade, fade, fade).setPosition(s.p); renewal!.sparkles.setMatrixAt(i, M); });
  renewal.sparkles.instanceMatrix.needsUpdate = true;
  // The wave sweeps outward from the centre between 0.5 s and 2.3 s.
  const w = Math.min(1, Math.max(0, (t - 0.5) / 1.8));
  renewal.wave.scale.setScalar(Math.max(0.01, w * r * 1.35));
  (renewal.wave.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - w);
  // Regenerate the valley exactly once, early in the sweep.
  if (t >= 0.9 && !renewal.applied) {
    renewal.applied = true;
    events = [...events, ...mergeEvents(renewal.plan)];
    hidden.clear();
    rebuild();
    const results = new Set(renewal.plan.map((m) => m.result.id));
    for (const [mesh, ids] of picks) {
      if (!(mesh instanceof THREE.InstancedMesh)) continue;
      ids.forEach((id, index) => {
        if (!results.has(id)) return;
        const matrix = new THREE.Matrix4(); mesh.getMatrixAt(index, matrix);
        const p = new THREE.Vector3().setFromMatrixPosition(matrix);
        renewal!.pops.push({ mesh, index, matrix, delay: 0.5 + (Math.hypot(p.x, p.z) / (r * 1.35)) * 1.8 });
        mesh.setMatrixAt(index, new THREE.Matrix4().makeScale(0, 0, 0).setPosition(p)); mesh.instanceMatrix.needsUpdate = true;
      });
    }
  }
  // Each new item pops up when the wave reaches it, with a little overshoot.
  for (const pop of renewal.pops) {
    const k = Math.min(1, Math.max(0, (t - pop.delay) / 0.45));
    const scale = k <= 0 ? 0 : k < 1 ? Math.sin(k * Math.PI * 0.75) * 1.18 : 1;
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    pop.matrix.decompose(p, q, s);
    pop.mesh.setMatrixAt(pop.index, M.compose(p, q, s.multiplyScalar(Math.max(0, k >= 1 ? 1 : scale)))); pop.mesh.instanceMatrix.needsUpdate = true;
  }
  if (t >= 3.0) {
    for (const pop of renewal.pops) { pop.mesh.setMatrixAt(pop.index, pop.matrix); pop.mesh.instanceMatrix.needsUpdate = true; }
    scene.remove(renewal.sparkles, renewal.wave); renewal.sparkles.dispose();
    summary(renewal.plan);
    renewal = null; shadowsChanged(); renderDock();
  }
}

function summary(plan: PlannedMerge[]) {
  const finals = new Set(plan.map((m) => m.result.id));
  for (const m of plan) for (const id of m.ingredients) finals.delete(id);
  const made = new Map<Level, number>();
  for (const m of plan) if (finals.has(m.result.id)) made.set(m.result.level, (made.get(m.result.level) ?? 0) + 1);
  const people = [...made.entries()].reduce((n, [level, count]) => n + villagersFor(level) * count, 0);
  const el = document.getElementById('reveal')!;
  el.innerHTML = `<div class="badge">${plan.length} merges</div><div class="title">Your valley grew</div>
    <div class="sub">${[...made.entries()].sort((a, b) => b[0] - a[0]).map(([level, n]) => `${n} ${levelInfo(level).name.toLowerCase()}${n > 1 ? 's' : ''}`).join(' · ')}${people ? ` · ${people} villagers moved in` : ''}</div>`;
  el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 4200);
}

// ---------- frame loop ----------
let last = performance.now();
let frames = 0, fpsAt = performance.now(), worst = 0;
function tick(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); worst = Math.max(worst, now - last); last = now;
  if (flight) {
    const k = Math.min(1, (now - flight.start) / flight.length), e = 1 - Math.pow(1 - k, 3);
    controls.target.lerpVectors(flight.from, flight.to, e); camera.position.lerpVectors(flight.camFrom, flight.camTo, e);
    if (k >= 1) flight = null;
  }
  controls.update();
  const r = radius();
  // Haze scales with how far away you are, so big valleys never wash out.
  const away = camera.position.distanceTo(controls.target);
  (scene.fog as THREE.Fog).near = away * 1.1; (scene.fog as THREE.Fog).far = away * 2.6 + r * 2;
  controls.target.x = Math.max(-r, Math.min(r, controls.target.x)); controls.target.z = Math.max(-r, Math.min(r, controls.target.z));
  for (const cloud of clouds.children) { cloud.position.x += cloud.userData.speed * dt; if (cloud.position.x > 560) cloud.position.x = -560; }
  animateLife(now, dt); animateWeather(now, dt); animateWaterfalls(dt);
  if (citadel) (citadel.beam.material as THREE.MeshBasicMaterial).opacity = 0.28 + Math.sin(now / 500) * 0.08;
  animateCeremony(now);
  animateRenewal(now, dt);
  positionCard();
  renderer.render(scene, camera);
  frames++;
  if (now - fpsAt > 1000) { document.getElementById('fps')!.textContent = `${frames} fps · worst frame ${Math.round(worst)} ms${LOW_POWER ? ' · low power' : ''}`; frames = 0; worst = 0; fpsAt = now; }
  requestAnimationFrame(tick);
}

// ---------- dock ----------
const dock = document.getElementById('dock')!;
let chosen: SpeciesKey = 'oak';
let units = 3;
let clock = '';
function renderDock() {
  if (growing) {
    dock.innerHTML = `<div class="growing"><div class="eyebrow">Growing your ${levelInfo(growing.entity.level).name.toLowerCase()} · ${Math.round(growing.progress * 100)}%</div>
      <div class="clock">${clock}</div><button class="ghost" id="giveup">Give up</button></div>`;
    document.getElementById('giveup')!.onclick = () => finish(false);
    return;
  }
  const level = levelForUnits(units)!, minutes = Math.round((units * 512) / 60), busy = Boolean(ceremony || renewal);
  const possible = busy ? 0 : mergeOptions(placed).reduce((n, o) => n + o.available, 0);
  const merge = possible === 1 ? nextMerge() : null;
  dock.innerHTML = `<div class="styles">${STYLES.map((s) => `<button class="style ${s.key === chosen ? 'on' : ''}" data-key="${s.key}"><i style="background:${s.leaf}"></i>${s.name}</button>`).join('')}</div>
    <div class="row"><button class="length" id="length"><span class="mins">${String(minutes).padStart(2, '0')}:00</span><span class="grows">grows a ${levelInfo(level).name.toLowerCase()}<br><small>tap to change · max 1 h</small></span></button>
    <button class="plant" id="plant">Plant</button></div>
    ${merge ? `<button class="merge" id="merge">✦ Merge ${levelInfo((merge.level + 1) as Level).merge} ${levelInfo(merge.level).name.toLowerCase()}s into a ${levelInfo((merge.level + 1) as Level).name.toLowerCase()}</button>`
      : possible > 1 ? `<button class="merge" id="planner-open">✦ Merge… ${possible} merges possible</button>` : ''}`;
  dock.querySelectorAll<HTMLButtonElement>('.style').forEach((b) => { b.onclick = () => { chosen = b.dataset.key as SpeciesKey; renderDock(); }; });
  document.getElementById('length')!.onclick = () => { units = units === 1 ? 3 : units === 3 ? 5 : units === 5 ? 7 : 1; renderDock(); };
  document.getElementById('plant')!.onclick = plantNow;
  const mergeButton = document.getElementById('merge'); if (mergeButton) mergeButton.onclick = mergeNow;
  const plannerButton = document.getElementById('planner-open'); if (plannerButton) plannerButton.onclick = openPlanner;
}
let timer = 0;
function plantNow() {
  hideCard();
  growing = { entity: { id: `new-${Date.now()}`, level: levelForUnits(units)!, style: chosen, seed: Math.floor(rand() * 1e6) }, progress: 0.04 };
  rebuild();
  const spot = placed.find((p) => p.id === growing!.entity.id)!;
  flyTo(new THREE.Vector3(spot.x, groundAt(spot.x, spot.z), spot.z), 120);
  const start = performance.now(), length = 24000, minutes = (units * 512) / 60;
  clearInterval(timer);
  timer = window.setInterval(() => {
    const p = Math.min(1, (performance.now() - start) / length), left = Math.ceil((1 - p) * minutes * 60);
    clock = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
    setDaylight(p);
    const stepped = Math.max(0.04, Math.floor(p * 16) / 16);
    if (growing && stepped !== growing.progress) { growing.progress = stepped; updateGrowing(); }
    renderDock();
    if (p >= 1) finish(true);
  }, 250);
  renderDock();
}
function finish(grown: boolean) {
  clearInterval(timer);
  if (growing && grown) events = [...events, { type: 'plant', entity: growing.entity }];
  growing = null; rebuild(); renderDock();
  toast(grown ? 'It joined your valley' : 'It withered');
  setTimeout(() => { setDaylight(0); frameAll(); controls.autoRotate = true; }, 2200);
}
function toast(text: string) { const t = document.getElementById('toast')!; t.textContent = text; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2000); }

document.querySelectorAll<HTMLButtonElement>('[data-age]').forEach((b) => {
  if (Number(b.dataset.age) === (INIT.age ?? 10)) { document.querySelectorAll('[data-age]').forEach((o) => o.classList.remove('on')); b.classList.add('on'); }
  b.onclick = () => {
    document.querySelectorAll('[data-age]').forEach((o) => o.classList.remove('on')); b.classList.add('on');
    events = history(Number(b.dataset.age)).map((entity) => ({ type: 'plant' as const, entity })); growing = null; clearInterval(timer); hideCard();
    rebuild(); frameAll(); renderDock();
  };
});
document.querySelectorAll<HTMLButtonElement>('[data-season]').forEach((b) => {
  if (b.dataset.season === season) b.classList.add('on');
  b.onclick = () => {
    document.querySelectorAll('[data-season]').forEach((o) => o.classList.remove('on')); b.classList.add('on');
    season = b.dataset.season as Season; rebuild(); buildWeather();
  };
});

setDaylight(0);
rebuild(); buildWeather();
camera.position.set(0, 300, 420).setLength(260 + radius() * 4.2); controls.target.set(0, 0, 0);
renderDock();
if (INIT.planner) openPlanner();
if (INIT.card) { const building = placed.find((p) => p.entity.level >= 5) ?? placed[0]; if (building) showCard({ kind: 'item', placed: building }); }
requestAnimationFrame(tick);

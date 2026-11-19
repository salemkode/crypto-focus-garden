/**
 * The valley as a three.js scene, with no browser or React Native code: the web prototype and the
 * app's WebGPU view both drive this class. The host owns the renderer, the camera and the UI.
 *
 * Performance rules:
 * - Terrain is meshed as height columns and rebuilt only when the land changes (never for a
 *   growth step; a merge rebuilds it under its flash, a batch renewal under its wave).
 * - Items are instanced per model variant; villagers and hens per body part.
 * - `shadowsDirty` tells the host when shadows need re-rendering (not every frame).
 */
import * as THREE from 'three';
import { buildBalloon, buildCloud, buildIslet, type IsletKind } from '../models';
import { buildLevelModel, CITADEL_LIFT, levelInfo, type Level } from '../ladder';
import { mergeEvents, mergeOptions, mergeResult, planMerges, type PlannedMerge } from '../merge-plan';
import { seasonal, WEATHER, type Season } from '../season';
import { buildGrowthModel, type SpeciesKey } from '../tiers';
import { LEVEL_SCALE, replayValley, river, valleyTerrain, WATER_Y, villagersFor, type Placed, type TerrainMesh, type ValleyEntity, type ValleyEvent } from '../valley';

export const STYLE_LEAF: Record<SpeciesKey, string> = { oak: '#5cab35', pine: '#2f7a4a', birch: '#9cc94a', cherry: '#f2a7c1', maple: '#de6a2b', cash: '#0ac18e' };

export type Villager = { home: Placed; pos: THREE.Vector3; target: THREE.Vector3; yaw: number; task: 'walk' | 'chop' | 'rest'; until: number; carrying: boolean; name: string };
export type Hen = { home: Placed; pos: THREE.Vector3; target: THREE.Vector3; yaw: number; peck: number };

/** Anything that can be tapped, with a live anchor point so a card can follow it. */
export type Hit =
  | { kind: 'item'; placed: Placed; anchor: () => THREE.Vector3 }
  | { kind: 'villager'; villager: Villager; anchor: () => THREE.Vector3 }
  | { kind: 'hen'; hen: Hen; anchor: () => THREE.Vector3 }
  | { kind: 'waterfall'; river: boolean; anchor: () => THREE.Vector3 }
  | { kind: 'islet'; anchor: () => THREE.Vector3 }
  | { kind: 'balloon'; anchor: () => THREE.Vector3 }
  | { kind: 'cloud'; anchor: () => THREE.Vector3 }
  | { kind: 'ground'; where: 'river' | 'riverbank' | 'hills' | 'valley floor'; anchor: () => THREE.Vector3 };

export type SceneEvent =
  | { type: 'changed' }
  | { type: 'reveal'; entity: ValleyEntity; ingredients: number }
  | { type: 'summary'; plan: PlannedMerge[]; made: [Level, number][]; villagers: number }
  | { type: 'busy'; busy: boolean };

export interface SceneOptions {
  seed: number; lowPower?: boolean; random?: () => number; onEvent?: (event: SceneEvent) => void;
  /**
   * For renderers that draw every instance of an InstancedMesh as its own object (the native
   * Filament mirror): weather is baked into a few moving layers, and waterfalls and ripples use
   * fewer particles in fewer colours. WebGL draws instances in one call and does not need this.
   */
  lean?: boolean;
}

/** Lean weather: flakes are baked into this many layers, each moving as one piece. */
const WEATHER_LAYERS = 6;
const WEATHER_TOP = 160, WEATHER_BOTTOM = -15, WEATHER_SPAN = WEATHER_TOP - WEATHER_BOTTOM;

const SHIRTS = [0xd65a32, 0x3b6479, 0xf2c94c, 0x9b6bd6, 0x4f8a45, 0xe88aac, 0x2e2640];
const SKIN = [0xf1c8a3, 0xd9a47a, 0xa8714a, 0x7a4b2e];
const NAMES = ['Ada', 'Bram', 'Cleo', 'Dov', 'Esme', 'Finn', 'Greta', 'Hugo', 'Iris', 'Jun', 'Kaia', 'Leo', 'Mira', 'Nico', 'Oona', 'Pip', 'Rafa', 'Sana', 'Teo', 'Uma'];

export class ValleyScene {
  readonly scene = new THREE.Scene();
  readonly sun = new THREE.DirectionalLight(0xffe2b0, 3.2);
  /** True when the host should re-render shadows (the world changed). */
  shadowsDirty = true;
  /** Sky colours for the host's background, following the daylight. */
  sky = { top: '#ffd9b3', bottom: '#cfe8ee' };

  events: ValleyEvent[] = [];
  placed: Placed[] = [];
  plants = 0;
  season: Season = 'summer';
  growing: { entity: ValleyEntity; progress: number } | null = null;
  villagers: Villager[] = [];
  hens: Hen[] = [];

  private readonly rand: () => number;
  private readonly hemi = new THREE.HemisphereLight(0xfff4e0, 0x6b5a4a, 1.5);
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true });
  private readonly flat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  private readonly items = new THREE.Group();
  private readonly effects = new THREE.Group();
  private readonly scenery = new THREE.Group();
  private readonly clouds = new THREE.Group();
  private land: TerrainMesh | null = null;
  private terrain: THREE.Mesh | null = null;
  private terrainKey = '';
  private readonly hidden = new Set<string>();
  private readonly picks = new Map<THREE.Object3D, string[]>();
  private growingMesh: THREE.Mesh | null = null;
  private readonly models = new Map<string, THREE.BufferGeometry>();
  private crowd: Record<string, THREE.InstancedMesh> = {};
  private falls: { mesh: THREE.InstancedMesh | null; curtain: THREE.Mesh; state: { t: number; spread: number; lane: number; size: number }[]; lip: THREE.Vector3; out: THREE.Vector3; side: THREE.Vector3; width: number; river: boolean }[] = [];
  private water: THREE.Mesh | null = null;
  private ripples: { mesh: THREE.InstancedMesh; state: { along: number; side: number; age: number; life: number; speed: number }[] } | null = null;
  private readonly flow: ReturnType<typeof river>;
  private weather: { mesh: THREE.InstancedMesh; state: { x: number; y: number; z: number; phase: number; spin: number }[] } | null = null;
  private weatherLayers: { meshes: THREE.Mesh[]; radius: number; layers: { offset: number; speed: number; phase: number }[] } | null = null;
  private beam: THREE.Mesh | null = null;
  private ceremony: { start: number; meshes: { mesh: THREE.Mesh; from: THREE.Vector3; spin: number }[]; result: ValleyEntity; ids: string[]; flash: THREE.Mesh; burst: THREE.InstancedMesh; sparks: { v: THREE.Vector3; p: THREE.Vector3 }[]; landed: boolean; drop?: { mesh: THREE.InstancedMesh; index: number; y: number } } | null = null;
  private renewal: { start: number; plan: PlannedMerge[]; sparkles: THREE.InstancedMesh; seeds: { p: THREE.Vector3; v: THREE.Vector3 }[]; wave: THREE.Mesh; applied: boolean; pops: { mesh: THREE.InstancedMesh; index: number; matrix: THREE.Matrix4; delay: number }[] } | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly dropGeometry = new THREE.BoxGeometry(1.6, 1.6, 1.6);
  private readonly dropMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  /** Water is glossy and see-through, so the deeper bed shows under it. */
  private readonly waterMaterial = new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, opacity: 0.8, shininess: 90, specular: 0xd8f1ff, depthWrite: false });
  private readonly curtainMaterial = new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, opacity: 0.82, shininess: 70, specular: 0xd8f1ff, depthWrite: false });
  private readonly rippleGeometry = new THREE.BoxGeometry(2.4, 0.1, 0.5);
  private readonly rippleMaterial = new THREE.MeshLambertMaterial({ color: 0xeefaff, transparent: true, opacity: 0.75 });
  private readonly parts = {
    leg: new THREE.BoxGeometry(0.9, 1.8, 0.9), body: new THREE.BoxGeometry(2, 2.2, 1.2), head: new THREE.BoxGeometry(1.6, 1.6, 1.6), hat: new THREE.BoxGeometry(1.8, 0.5, 1.8),
    arm: new THREE.BoxGeometry(0.6, 1.8, 0.6), log: new THREE.BoxGeometry(2.4, 0.8, 0.8), hen: new THREE.BoxGeometry(1.6, 1.3, 2), henHead: new THREE.BoxGeometry(0.9, 0.9, 0.9), comb: new THREE.BoxGeometry(0.3, 0.4, 0.5),
  };
  // Scratch objects reused every frame (no garbage in the render loop).
  private readonly M = new THREE.Matrix4(); private readonly L = new THREE.Matrix4(); private readonly ROOT = new THREE.Matrix4();
  private readonly Q = new THREE.Quaternion(); private readonly PQ = new THREE.Quaternion(); private readonly E = new THREE.Euler();
  private readonly V = new THREE.Vector3(); private readonly S = new THREE.Vector3(); private readonly ONE = new THREE.Vector3(1, 1, 1); private readonly ZERO = new THREE.Vector3(0, 0, 0); private readonly UP = new THREE.Vector3(0, 1, 0);

  constructor(readonly options: SceneOptions) {
    this.rand = options.random ?? Math.random;
    this.flow = river(options.seed);
    this.scene.fog = new THREE.Fog(0xcfe8ee, 700, 1800);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.setScalar(options.lowPower ? 1024 : 2048);
    this.sun.shadow.radius = 4; this.sun.shadow.bias = -0.0004;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.items, this.effects, this.scenery, this.clouds);
    for (let i = 0; i < 9; i++) {
      const cloud = new THREE.Mesh(buildCloud(40 + i).toGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.93 }));
      cloud.scale.setScalar(2 + this.rand() * 2);
      cloud.position.set((this.rand() - 0.5) * 1100, 100 + this.rand() * 90, (this.rand() - 0.5) * 1100);
      cloud.userData.speed = 2 + this.rand() * 4;
      this.clouds.add(cloud);
    }
    this.setDaylight(0);
  }

  get radius() { return this.land?.radius ?? 60; }
  get busy() { return Boolean(this.ceremony || this.renewal); }
  groundAt(x: number, z: number) { return this.land ? this.land.heightAt(x, z) : 0; }
  private emit(event: SceneEvent) { this.options.onEvent?.(event); }

  // ---------------------------------------------------------------- inputs

  setHistory(events: ValleyEvent[]) { this.events = events; this.rebuild(); }
  setSeason(season: Season) { if (season === this.season) return; this.season = season; this.rebuild(); this.buildWeather(); }
  /** Starts, updates (progress 0..1) or clears the item growing right now. */
  setGrowing(growing: { entity: ValleyEntity; progress: number } | null) {
    const same = growing && this.growing && growing.entity.id === this.growing.entity.id;
    this.growing = growing;
    if (same) this.updateGrowing(); else this.rebuild();
  }

  // ---------------------------------------------------------------- building

  private geometryFor(e: ValleyEntity) {
    const key = `${e.level}:${e.style}:${e.seed}:${this.season}`;
    if (!this.models.has(key)) this.models.set(key, seasonal(buildLevelModel(e.level, e.style, e.seed).toGeometry(), this.season));
    return this.models.get(key)!;
  }
  /** Height of an item's model above the ground, for anchoring its card. */
  heightOf(e: ValleyEntity) { const g = this.geometryFor(e); if (!g.boundingBox) g.computeBoundingBox(); return g.boundingBox!.max.y * LEVEL_SCALE[e.level]; }

  private rebuild() {
    const all: ValleyEvent[] = this.growing ? [...this.events, { type: 'plant', entity: this.growing.entity }] : this.events;
    const state = replayValley(all, this.options.seed);
    this.placed = state.placed; this.plants = state.plants;
    this.rebuildTerrain();
    this.rebuildItems();
    this.emit({ type: 'changed' });
  }

  private rebuildTerrain() {
    const topLevel = Math.max(0, ...this.placed.map((p) => p.entity.level));
    const key = `${this.plants}|${this.season}|${topLevel >= 8}|${topLevel >= 9}|${this.placed.map((p) => `${p.x},${p.z},${p.radius}`).join(';')}`;
    if (key === this.terrainKey) return;
    this.terrainKey = key;
    this.land = valleyTerrain(this.placed, this.plants, this.options.seed, { roads: topLevel >= 8, bridges: topLevel >= 9 });
    if (this.terrain) { this.scene.remove(this.terrain); this.terrain.geometry.dispose(); }
    this.terrain = new THREE.Mesh(seasonal(this.land.geometry, this.season, { ground: true }), this.material);
    this.terrain.receiveShadow = true; this.terrain.castShadow = true;
    this.scene.add(this.terrain);
    if (this.water) { this.scene.remove(this.water); this.water.geometry.dispose(); }
    const frozen = this.season === 'winter';
    Object.assign(this.waterMaterial, { opacity: frozen ? 0.94 : 0.8, shininess: frozen ? 30 : 90 });
    this.water = new THREE.Mesh(seasonal(this.land.water, this.season), this.waterMaterial);
    this.water.receiveShadow = true; this.water.renderOrder = 1;
    this.scene.add(this.water);
    const span = this.land.radius * 1.4;
    Object.assign(this.sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, far: 3000 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.buildWaterfalls();
    this.buildScenery();
  }

  private rebuildItems() {
    for (const child of this.items.children) if (child instanceof THREE.InstancedMesh) child.dispose();
    this.items.clear(); this.picks.clear();
    const groups = new Map<string, Placed[]>();
    for (const p of this.placed) {
      if (this.hidden.has(p.id) || (this.growing && p.id === this.growing.entity.id)) continue;
      const key = `${p.entity.level}:${p.entity.style}:${p.entity.seed}`;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(p);
    }
    for (const list of groups.values()) {
      const mesh = new THREE.InstancedMesh(this.geometryFor(list[0].entity), this.material, list.length);
      list.forEach((p, i) => {
        const s = LEVEL_SCALE[p.entity.level];
        mesh.setMatrixAt(i, this.M.compose(this.V.set(p.x, this.groundAt(p.x, p.z) + 0.5 * s, p.z), this.Q.setFromAxisAngle(this.UP, p.turn), this.S.set(s, s, s)));
      });
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.items.add(mesh); this.picks.set(mesh, list.map((p) => p.id));
    }
    this.updateGrowing();
    this.buildEffects();
    this.populate();
    this.shadowsDirty = true;
  }

  private updateGrowing() {
    if (this.growingMesh) { this.scene.remove(this.growingMesh); this.growingMesh.geometry.dispose(); this.picks.delete(this.growingMesh); this.growingMesh = null; }
    const g = this.growing;
    if (!g) return;
    const p = this.placed.find((x) => x.id === g.entity.id);
    if (!p) return;
    const tier = (['sprout', 'tree', 'bigTree'] as const)[Math.min(2, p.entity.level - 1)];
    const mesh = new THREE.Mesh(seasonal(buildGrowthModel(p.entity.style, Math.max(0.04, g.progress), p.entity.seed, tier).toGeometry(), this.season), this.material);
    const s = LEVEL_SCALE[p.entity.level];
    mesh.position.set(p.x, this.groundAt(p.x, p.z) + 0.5 * s, p.z); mesh.rotation.y = p.turn; mesh.scale.setScalar(s);
    mesh.castShadow = true;
    this.scene.add(mesh); this.picks.set(mesh, [p.id]); this.growingMesh = mesh;
    this.shadowsDirty = true;
  }

  private buildScenery() {
    this.scenery.clear();
    const r = this.radius;
    const kinds: IsletKind[] = ['oak', 'pine', 'flowers', 'hut'];
    const count = Math.min(10, 4 + Math.floor(this.plants / 20));
    for (let i = 0; i < count; i++) {
      const islet = new THREE.Mesh(seasonal(buildIslet(70 + i, 4 + (i % 3), kinds[i % 4]).toGeometry(), this.season, { ground: true }), this.material);
      islet.scale.setScalar(2.2);
      islet.userData = { kind: 'islet', angle: (i / count) * Math.PI * 2 + 0.3, distance: r + 50 + (i % 3) * 28, height: -10 + (i % 4) * 22, bob: this.rand() * 6, speed: 0.004 };
      this.scenery.add(islet);
    }
    for (let i = 0; i < 3; i++) {
      const balloon = new THREE.Mesh(buildBalloon([0xe0413a, 0x2e5fa8, 0xf2c94c][i], 0xffffff, [0x3a5fa8, 0xe0413a, 0x8a5a33][i]).toGeometry(), this.material);
      balloon.scale.setScalar(2.4);
      balloon.userData = { kind: 'balloon', angle: this.rand() * 6.28, distance: r * (1.35 + this.rand() * 0.5), height: 90 + i * 30, speed: 0.02 + this.rand() * 0.02, bob: this.rand() * 6 };
      this.scenery.add(balloon);
    }
  }

  private buildEffects() {
    this.effects.clear(); this.beam = null;
    const legend = this.placed.find((p) => p.entity.level === 10 && !this.hidden.has(p.id));
    if (!legend) return;
    const base = this.groundAt(legend.x, legend.z), lift = CITADEL_LIFT * LEVEL_SCALE[10];
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, lift, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
    this.beam.position.set(legend.x, base + lift / 2, legend.z);
    const rainbow = new THREE.Group();
    [0xe0413a, 0xf2a23c, 0xf2d43c, 0x5fbf4a, 0x4aa8d8, 0x6a5acd].forEach((color, i) => rainbow.add(new THREE.Mesh(new THREE.TorusGeometry(this.radius * 1.25 - i * 2.2, 1.1, 6, 64, Math.PI), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, depthWrite: false }))));
    rainbow.position.set(0, -10, -this.radius * 0.35); rainbow.rotation.y = 0.5;
    this.effects.add(this.beam, rainbow);
  }
  get hasLegend() { return Boolean(this.beam); }

  private buildWaterfalls() {
    for (const f of this.falls) { if (f.mesh) { this.scene.remove(f.mesh); f.mesh.dispose(); } this.scene.remove(f.curtain); f.curtain.geometry.dispose(); }
    const frozen = this.season === 'winter';
    const each = frozen ? 0 : this.options.lean ? 32 : this.options.lowPower ? 60 : 110;
    const shades = this.options.lean ? LEAN_FALL_SHADES : FALL_SHADES;
    this.falls = (this.land?.waterfalls ?? []).map((w) => {
      const out = new THREE.Vector3(Math.cos(w.angle), 0, Math.sin(w.angle));
      const width = w.river ? this.flow.width * 2 : 2.6;
      // The river leaves at its surface, just past the rim; springs pour from the cliff face.
      const lip = w.river ? new THREE.Vector3(w.x, WATER_Y, w.z).addScaledVector(out, 1.1) : new THREE.Vector3(w.x, w.y * 2 + 0.5, w.z).addScaledVector(out, 1.5);
      const curtain = new THREE.Mesh(curtainGeometry(width, frozen), this.curtainMaterial);
      curtain.position.copy(lip); curtain.rotation.y = -w.angle; curtain.renderOrder = 2;
      this.scene.add(curtain);
      let mesh: THREE.InstancedMesh | null = null;
      if (each) {
        mesh = new THREE.InstancedMesh(this.dropGeometry, this.dropMaterial, each);
        for (let i = 0; i < each; i++) mesh.setColorAt(i, FALL_TINT.setHex(shades[i % shades.length]));
        mesh.renderOrder = 3;
        this.scene.add(mesh);
      }
      const state = Array.from({ length: each }, () => ({ t: this.rand(), spread: this.rand(), lane: this.rand() - 0.5, size: 0.7 + this.rand() * 0.6 }));
      return { mesh, curtain, state, lip, out, side: new THREE.Vector3(-out.z, 0, out.x), width, river: w.river };
    });
    this.buildRipples();
  }

  /** Light streaks that drift downstream on the river's surface, so the water visibly flows. */
  private buildRipples() {
    if (this.ripples) { this.scene.remove(this.ripples.mesh); this.ripples.mesh.dispose(); this.ripples = null; }
    const stream = this.land?.stream;
    if (!stream || this.season === 'winter' || stream.to - stream.from < 4) return;
    const count = Math.round(Math.min(this.options.lean ? 24 : this.options.lowPower ? 40 : 80, Math.max(10, (stream.to - stream.from) * 0.9)));
    const mesh = new THREE.InstancedMesh(this.rippleGeometry, this.rippleMaterial, count);
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    const state = Array.from({ length: count }, () => this.spawnRipple({ along: 0, side: 0, age: 0, life: 0, speed: 0 }, true));
    this.ripples = { mesh, state };
  }
  private spawnRipple(r: { along: number; side: number; age: number; life: number; speed: number }, anywhere = false) {
    const stream = this.land!.stream;
    r.along = stream.from + this.rand() * (stream.to - stream.from) * (anywhere ? 1 : 0.85);
    r.side = (this.rand() - 0.5) * (this.flow.width * 2 - 1.6);
    r.life = 1.4 + this.rand() * 1.8; r.age = anywhere ? this.rand() * r.life : 0;
    r.speed = 5 + this.rand() * 4;
    return r;
  }

  private populate() {
    for (const mesh of Object.values(this.crowd)) { this.scene.remove(mesh); mesh.dispose(); }
    this.villagers = []; this.hens = [];
    for (const home of this.placed) {
      if (this.hidden.has(home.id)) continue;
      for (let v = 0; v < villagersFor(home.entity.level); v++) {
        const pos = new THREE.Vector3(home.x + (this.rand() - 0.5) * 8, 0, home.z + home.radius + 2);
        this.villagers.push({ home, pos, target: pos.clone(), yaw: 0, task: 'rest', until: 0, carrying: false, name: NAMES[Math.floor(this.rand() * NAMES.length)] });
      }
      if (home.entity.level >= 6 && home.entity.level <= 8) for (let c = 0; c < 2; c++) {
        const pos = new THREE.Vector3(home.x + home.radius + 3 + this.rand() * 4, 0, home.z + (this.rand() - 0.5) * 10);
        this.hens.push({ home, pos, target: pos.clone(), yaw: 0, peck: this.rand() * 10 });
      }
    }
    const make = (geometry: THREE.BufferGeometry, count: number, colorOf: (i: number) => number) => {
      const mesh = new THREE.InstancedMesh(geometry, this.flat, Math.max(1, count));
      mesh.count = count;
      const c = new THREE.Color();
      for (let i = 0; i < Math.max(1, count); i++) mesh.setColorAt(i, c.setHex(count ? colorOf(i) : 0xffffff));
      this.scene.add(mesh);
      return mesh;
    };
    const shirts = this.villagers.map(() => SHIRTS[Math.floor(this.rand() * SHIRTS.length)]), skins = this.villagers.map(() => SKIN[Math.floor(this.rand() * SKIN.length)]);
    const n = this.villagers.length, h = this.hens.length;
    this.crowd = {
      leg: make(this.parts.leg, n * 2, () => 0x4a3b2f), body: make(this.parts.body, n, (i) => shirts[i]), head: make(this.parts.head, n, (i) => skins[i]),
      hat: make(this.parts.hat, n, (i) => (i % 2 ? 0x8a5a33 : 0xf2dfb7)), arm: make(this.parts.arm, n, (i) => skins[i]), log: make(this.parts.log, n, () => 0x93653d),
      hen: make(this.parts.hen, h, () => 0xffffff), henHead: make(this.parts.henHead, h, () => 0xffffff), comb: make(this.parts.comb, h, () => 0xe0413a),
    };
  }

  buildWeather() {
    if (this.weather) { this.scene.remove(this.weather.mesh); this.weather.mesh.geometry.dispose(); this.weather.mesh.dispose(); this.weather = null; }
    if (this.weatherLayers) { for (const mesh of this.weatherLayers.meshes) { this.scene.remove(mesh); mesh.geometry.dispose(); } this.weatherLayers = null; }
    const w = WEATHER[this.season];
    const count = Math.round(w.count * (this.options.lowPower ? 0.45 : 1));
    const size = w.kind === 'snow' ? [0.9, 0.9, 0.9] : w.kind === 'pollen' ? [0.5, 0.5, 0.5] : [1.4, 0.2, 1.1];
    if (this.options.lean) { this.buildWeatherLayers(count, size); return; }
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(size[0], size[1], size[2]), new THREE.MeshBasicMaterial({ color: 0xffffff }), count);
    const state = Array.from({ length: count }, () => ({ x: (this.rand() - 0.5) * 2, y: this.rand() * 170 - 10, z: (this.rand() - 0.5) * 2, phase: this.rand() * 6.28, spin: this.rand() * 3 }));
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) mesh.setColorAt(i, c.setHex(w.colors[i % w.colors.length]));
    this.scene.add(mesh); this.weather = { mesh, state };
  }

  /**
   * Lean weather: every flake is baked, at a fixed random turn and colour, into one of a few layer
   * meshes. Each layer holds its flakes twice, one weather span apart, so sliding it down by up to a
   * span and wrapping keeps the band between WEATHER_BOTTOM and WEATHER_TOP evenly filled. Layers
   * fall at different speeds and sway on their own, so it still reads as loose flakes.
   */
  private buildWeatherLayers(count: number, size: number[]) {
    const w = WEATHER[this.season], r = this.radius;
    const flake = new THREE.BoxGeometry(size[0], size[1], size[2]);
    const fp = flake.getAttribute('position'), fn = flake.getAttribute('normal'), fi = flake.getIndex()!;
    const color = new THREE.Color(), m = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
    const meshes: THREE.Mesh[] = [], layers: { offset: number; speed: number; phase: number }[] = [];
    const material = new THREE.MeshBasicMaterial({ vertexColors: true });
    for (let k = 0; k < WEATHER_LAYERS; k++) {
      const flakes = Math.ceil((count - k) / WEATHER_LAYERS) * 2;
      const position = new Float32Array(flakes * fp.count * 3), normal = new Float32Array(flakes * fp.count * 3), colors = new Float32Array(flakes * fp.count * 3);
      const index: number[] = [];
      let at = 0;
      for (let i = k; i < count; i += WEATHER_LAYERS) {
        const x = (this.rand() - 0.5) * 2 * r * 1.3, z = (this.rand() - 0.5) * 2 * r * 1.3, y = WEATHER_BOTTOM + this.rand() * WEATHER_SPAN;
        this.E.set(this.rand() * 6.28, this.rand() * 6.28, 0);
        color.setHex(w.colors[i % w.colors.length]);
        for (const lift of [0, WEATHER_SPAN]) {
          m.compose(this.V.set(x, y + lift, z), this.Q.setFromEuler(this.E), this.ONE); nm.getNormalMatrix(m);
          for (let j = 0; j < fi.count; j++) index.push(at + fi.getX(j));
          for (let j = 0; j < fp.count; j++, at++) {
            v.fromBufferAttribute(fp, j).applyMatrix4(m); position.set([v.x, v.y, v.z], at * 3);
            v.fromBufferAttribute(fn, j).applyMatrix3(nm).normalize(); normal.set([v.x, v.y, v.z], at * 3);
            colors.set([color.r, color.g, color.b], at * 3);
          }
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(position.subarray(0, at * 3), 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(normal.subarray(0, at * 3), 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors.subarray(0, at * 3), 3));
      geometry.setIndex(index);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      this.scene.add(mesh); meshes.push(mesh);
      layers.push({ offset: -this.rand() * WEATHER_SPAN, speed: 0.7 + (k % 5) * 0.12, phase: this.rand() * 6.28 });
    }
    flake.dispose();
    this.weatherLayers = { meshes, radius: r, layers };
  }
  private animateWeatherLayers(now: number, dt: number) {
    const lw = this.weatherLayers!, w = WEATHER[this.season];
    // The valley grew or shrank: spread the flakes over its new size.
    if (Math.abs(lw.radius - this.radius) > 4) { this.buildWeather(); return; }
    lw.meshes.forEach((mesh, k) => {
      const layer = lw.layers[k];
      layer.offset -= w.fall * dt * layer.speed;
      if (layer.offset <= -WEATHER_SPAN) layer.offset += WEATHER_SPAN;
      mesh.position.set(Math.sin(now / 1400 + layer.phase) * w.sway, layer.offset, Math.cos(now / 1700 + layer.phase) * w.sway);
    });
  }

  /** Time is light: 0 = golden afternoon, 1 = dusk. The sun swings across the valley. */
  setDaylight(t: number) {
    const angle = -0.9 + t * 1.9, height = 0.95 - t * 0.62;
    this.sun.position.set(Math.cos(angle) * 600, 140 + height * 420, Math.sin(angle) * 600);
    this.sun.color.copy(new THREE.Color(0xffe6b8).lerp(new THREE.Color(0xff9a5c), t)); this.sun.intensity = 3.2 - t * 1.1;
    this.hemi.intensity = 1.5 - t * 0.45; this.hemi.color.copy(new THREE.Color(0xfff4e0).lerp(new THREE.Color(0xc9b6e8), t));
    this.sky = { top: '#' + new THREE.Color(0xffd9b3).lerp(new THREE.Color(0xb39ad6), t).getHexString(), bottom: '#' + new THREE.Color(0xcfe8ee).lerp(new THREE.Color(0xffc89a), t).getHexString() };
    (this.scene.fog as THREE.Fog).color.copy(new THREE.Color(0xcfe8ee).lerp(new THREE.Color(0xffc89a), t));
    this.shadowsDirty = true;
  }

  // ---------------------------------------------------------------- the frame

  /** Advances life, weather, waterfalls and any merge animation. Call once per frame. */
  update(now: number, dt: number, camera: THREE.Camera) {
    const away = camera.position.distanceTo(new THREE.Vector3(0, 0, 0));
    const fog = this.scene.fog as THREE.Fog; fog.near = away * 1.1; fog.far = away * 2.6 + this.radius * 2;
    for (const cloud of this.clouds.children) { cloud.position.x += cloud.userData.speed * dt; if (cloud.position.x > 560) cloud.position.x = -560; }
    this.animateLife(now, dt); this.animateWeather(now, dt); this.animateWaterfalls(dt); this.animateRipples(dt);
    if (this.beam) (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.28 + Math.sin(now / 500) * 0.08;
    this.animateCeremony(now, camera);
    this.animateRenewal(now, dt);
  }

  private placePart(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, pitch = 0, hide = false) {
    this.L.compose(this.V.set(x, y, z), this.PQ.setFromEuler(this.E.set(pitch, 0, 0)), hide ? this.ZERO : this.ONE);
    mesh.setMatrixAt(i, this.M.multiplyMatrices(this.ROOT, this.L));
  }
  private pickTask(v: Villager, now: number) {
    const roll = this.rand();
    const nearTrees = this.placed.filter((p) => p.entity.level <= 4 && Math.hypot(p.x - v.home.x, p.z - v.home.z) < 70);
    if (roll < 0.35 && nearTrees.length) { const t = nearTrees[Math.floor(this.rand() * nearTrees.length)]; v.target.set(t.x + (this.rand() - 0.5) * 4, 0, t.z + t.radius + 1); v.task = 'chop'; }
    else if (roll < 0.85) { v.target.set(v.home.x + (this.rand() - 0.5) * 34, 0, v.home.z + (this.rand() - 0.5) * 34); v.task = 'walk'; }
    else { v.target.set(v.home.x, 0, v.home.z + v.home.radius + 2); v.task = 'rest'; }
    v.until = now + 4000 + this.rand() * 5000; v.carrying = false;
  }
  private animateLife(now: number, dt: number) {
    const c = this.crowd;
    this.villagers.forEach((v, i) => {
      const dx = v.target.x - v.pos.x, dz = v.target.z - v.pos.z, d = Math.hypot(dx, dz);
      const moving = d > 0.6;
      let swing = 0, arm = 0;
      if (moving) { v.pos.x += (dx / d) * 7 * dt; v.pos.z += (dz / d) * 7 * dt; v.yaw = Math.atan2(dx, dz); swing = Math.sin(now / 90) * 0.6; arm = -swing; }
      else {
        if (v.task === 'chop') arm = -1.2 + Math.abs(Math.sin(now / 160)) * 1.6;
        if (now > v.until) { if (v.task === 'chop') { v.target.set(v.home.x, 0, v.home.z + v.home.radius + 2); v.task = 'walk'; v.carrying = true; v.until = now + 3000; } else this.pickTask(v, now); }
      }
      v.pos.y = this.groundAt(v.pos.x, v.pos.z) + (moving ? Math.abs(Math.sin(now / 90)) * 0.3 : 0);
      this.ROOT.compose(v.pos, this.Q.setFromAxisAngle(this.UP, v.yaw), this.S.set(0.85, 0.85, 0.85));
      this.placePart(c.leg, i * 2, -0.5, 0.9, 0, swing); this.placePart(c.leg, i * 2 + 1, 0.5, 0.9, 0, -swing);
      this.placePart(c.body, i, 0, 2.9, 0); this.placePart(c.head, i, 0, 4.8, 0); this.placePart(c.hat, i, 0, 5.8, 0);
      this.placePart(c.arm, i, 1.3, 3, 0, arm); this.placePart(c.log, i, 0, 4.2, 1.1, 0, !v.carrying);
    });
    this.hens.forEach((hen, i) => {
      const dx = hen.target.x - hen.pos.x, dz = hen.target.z - hen.pos.z, d = Math.hypot(dx, dz);
      if (d > 0.5) { hen.pos.x += (dx / d) * 3 * dt; hen.pos.z += (dz / d) * 3 * dt; hen.yaw = Math.atan2(dx, dz); }
      else if (this.rand() < 0.01) hen.target.set(hen.home.x + hen.home.radius + (this.rand() - 0.2) * 10, 0, hen.home.z + (this.rand() - 0.5) * 14);
      hen.pos.y = this.groundAt(hen.pos.x, hen.pos.z);
      this.ROOT.compose(hen.pos, this.Q.setFromAxisAngle(this.UP, hen.yaw), this.S.set(0.7, 0.7, 0.7));
      const peck = Math.max(0, Math.sin(now / 180 + hen.peck)) * 0.9;
      this.placePart(c.hen, i, 0, 1, 0); this.placePart(c.henHead, i, 0, 2 - peck * 0.6, 0.9 + peck * 0.4, peck); this.placePart(c.comb, i, 0, 2.6 - peck * 0.6, 0.9 + peck * 0.4, peck);
    });
    for (const mesh of Object.values(c)) mesh.instanceMatrix.needsUpdate = true;
    for (const s of this.scenery.children) {
      const u = s.userData;
      u.angle += u.speed * dt;
      s.position.set(Math.cos(u.angle) * u.distance, u.height + Math.sin(now / 1800 + u.bob) * 3, Math.sin(u.angle) * u.distance);
    }
  }
  private animateWeather(now: number, dt: number) {
    if (this.weatherLayers) { this.animateWeatherLayers(now, dt); return; }
    if (!this.weather) return;
    const w = WEATHER[this.season], r = this.radius;
    this.weather.state.forEach((d, i) => {
      d.y -= w.fall * dt * (0.7 + (i % 5) * 0.12);
      if (d.y < -15) d.y = 160;
      this.E.set(now / 900 * d.spin, now / 1100 * d.spin, 0);
      this.M.compose(this.V.set(d.x * r * 1.3 + Math.sin(now / 1400 + d.phase) * w.sway, d.y, d.z * r * 1.3 + Math.cos(now / 1700 + d.phase) * w.sway), this.Q.setFromEuler(this.E), this.ONE);
      this.weather!.mesh.setMatrixAt(i, this.M);
    });
    this.weather.mesh.instanceMatrix.needsUpdate = true;
  }
  private animateWaterfalls(dt: number) {
    for (const f of this.falls) {
      const mesh = f.mesh;
      if (!mesh) continue;
      f.state.forEach((d, i) => {
        d.t += dt * 0.45; if (d.t > 1) { d.t = 0; d.spread = this.rand(); d.lane = this.rand() - 0.5; d.size = 0.7 + this.rand() * 0.6; }
        // Blocks ride just in front of the curtain and break up into spray as they fall.
        this.V.copy(f.lip).addScaledVector(f.out, d.t * 7 + 0.6 + d.spread * (0.4 + d.t * 3)).addScaledVector(f.side, d.lane * f.width * (1 + d.t * 0.5));
        this.V.y -= d.t * d.t * 170;
        const size = d.size * (d.t < 0.05 ? d.t / 0.05 : 1 - Math.max(0, d.t - 0.55) * 1.9);
        mesh.setMatrixAt(i, this.M.compose(this.V, this.Q.identity(), this.S.setScalar(Math.max(0.02, size))));
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  private animateRipples(dt: number) {
    const r = this.ripples;
    if (!r || !this.land) return;
    const end = this.land.stream.to + 1;
    r.state.forEach((d, i) => {
      d.age += dt; d.along += d.speed * dt;
      if (d.age > d.life || d.along > end) this.spawnRipple(d);
      const p = this.flow.point(d.along, d.side), h = this.flow.heading(d.along);
      // Hidden under bridges and past the rim (anything not open water).
      const open = this.groundAt(p.x, p.z) < WATER_Y;
      const fade = open ? Math.sin(Math.PI * Math.min(1, d.age / d.life)) : 0;
      this.V.set(p.x, WATER_Y + 0.06, p.z);
      r.mesh.setMatrixAt(i, this.M.compose(this.V, this.Q.setFromAxisAngle(this.UP, Math.atan2(-h.z, h.x)), this.S.set(Math.max(0.02, fade), 1, Math.max(0.02, fade))));
    });
    r.mesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- tapping

  /** The nearest thing at a point on screen (normalized device coordinates). */
  pick(ndc: THREE.Vector2, camera: THREE.Camera): Hit | null {
    this.raycaster.setFromCamera(ndc, camera);
    const c = this.crowd;
    const groups: [THREE.Object3D[], (hit: THREE.Intersection) => Hit | null][] = [
      [[...this.picks.keys()], (hit) => {
        const id = this.picks.get(hit.object)?.[hit.instanceId ?? 0]; const p = this.placed.find((x) => x.id === id);
        if (!p) return null;
        const top = this.heightOf(p.entity);
        return { kind: 'item', placed: p, anchor: () => new THREE.Vector3(p.x, this.groundAt(p.x, p.z) + top + 2, p.z) };
      }],
      [[c.body, c.head, c.hat].filter(Boolean), (hit) => { const v = this.villagers[hit.instanceId!]; return v ? { kind: 'villager', villager: v, anchor: () => v.pos.clone().setY(v.pos.y + 7) } : null; }],
      [[c.hen, c.henHead].filter(Boolean), (hit) => { const h = this.hens[hit.instanceId!]; return h ? { kind: 'hen', hen: h, anchor: () => h.pos.clone().setY(h.pos.y + 3) } : null; }],
      [this.falls.flatMap((f) => (f.mesh ? [f.mesh, f.curtain] : [f.curtain])), (hit) => { const point = hit.point.clone(); return { kind: 'waterfall', river: this.falls.find((f) => f.mesh === hit.object || f.curtain === hit.object)!.river, anchor: () => point }; }],
      [this.scenery.children, (hit): Hit => { const o = hit.object; const anchor = () => o.position.clone().setY(o.position.y + 14); return o.userData.kind === 'balloon' ? { kind: 'balloon', anchor } : { kind: 'islet', anchor }; }],
      [this.clouds.children, (hit) => { const o = hit.object; return { kind: 'cloud', anchor: () => o.position.clone().setY(o.position.y + 14) }; }],
      [[this.terrain, this.water].filter((o): o is THREE.Mesh => Boolean(o)), (hit) => {
        const point = hit.point.clone();
        const flow = this.flow.measure(point.x, point.z);
        const where = flow.along > -6 && flow.offset < 4 ? 'river' : flow.along > -6 && flow.offset < 7 ? 'riverbank' : point.y > 9 ? 'hills' : 'valley floor';
        return { kind: 'ground', where, anchor: () => point.clone().setY(point.y + 3) };
      }],
    ];
    let best: { distance: number; hit: Hit } | null = null;
    for (const [objects, read] of groups) {
      if (!objects.length) continue;
      const hit = this.raycaster.intersectObjects(objects, false)[0];
      if (!hit || (best && hit.distance >= best.distance)) continue;
      const value = read(hit);
      if (value) best = { distance: hit.distance, hit: value };
    }
    return best?.hit ?? null;
  }
  /** A world point projected to view pixels, or null when it is behind the camera. */
  project(point: THREE.Vector3, camera: THREE.Camera, width: number, height: number) {
    const p = point.clone().project(camera);
    if (p.z > 1) return null;
    return { x: ((p.x + 1) / 2) * width, y: ((1 - p.y) / 2) * height };
  }
  /** Ground point under the screen point, for double-tap fly-to. */
  groundPoint(ndc: THREE.Vector2, camera: THREE.Camera) {
    if (!this.terrain) return null;
    this.raycaster.setFromCamera(ndc, camera);
    return this.raycaster.intersectObject(this.terrain)[0]?.point ?? null;
  }

  // ---------------------------------------------------------------- merging

  mergeOptions() { return this.busy ? [] : mergeOptions(this.placed, this.growing ? new Set([this.growing.entity.id]) : new Set()); }
  planMerges(counts: Partial<Record<Level, number>>, cascade: boolean) { return planMerges(this.placed, counts, { cascade, exclude: this.growing ? new Set([this.growing.entity.id]) : undefined }); }

  /** One merge, with the full ceremony. Returns the focal point for the camera. */
  mergeOne(merge: PlannedMerge, now: number) {
    if (this.busy) return null;
    const picks = merge.ingredients.map((id) => this.placed.find((p) => p.id === id)!).filter(Boolean);
    const meshes = picks.map((p) => {
      const mesh = new THREE.Mesh(this.geometryFor(p.entity), this.material);
      const s = LEVEL_SCALE[p.entity.level];
      mesh.position.set(p.x, this.groundAt(p.x, p.z) + 0.5 * s, p.z); mesh.rotation.y = p.turn; mesh.scale.setScalar(s);
      this.scene.add(mesh); this.hidden.add(p.id);
      return { mesh, from: mesh.position.clone(), spin: this.rand() > 0.5 ? 1 : -1 };
    });
    this.rebuildItems();
    const centre = new THREE.Vector3(picks[0].x, this.groundAt(picks[0].x, picks[0].z), picks[0].z);
    const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xfff6d6, transparent: true, opacity: 0 }));
    flash.position.copy(centre).setY(centre.y + 34); this.scene.add(flash);
    const tints = [0xf2b53c, 0xffffff, STYLE_LEAF[merge.result.style]].map((c) => new THREE.Color(c));
    const burst = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), new THREE.MeshBasicMaterial({ color: 0xffffff }), 120);
    const sparks = Array.from({ length: 120 }, (_, i) => { burst.setColorAt(i, tints[i % 3]); return { v: new THREE.Vector3((this.rand() - 0.5) * 70, this.rand() * 60, (this.rand() - 0.5) * 70), p: flash.position.clone() }; });
    burst.visible = false; this.scene.add(burst);
    this.ceremony = { start: now, meshes, result: merge.result, ids: merge.ingredients, flash, burst, sparks, landed: false };
    this.emit({ type: 'busy', busy: true });
    return centre;
  }
  /** The next single merge available (lowest level first), for the one-tap button. */
  nextMerge(): PlannedMerge | null {
    const option = this.mergeOptions()[0];
    return option ? this.planMerges({ [option.level]: 1 }, false)[0] ?? null : null;
  }

  private setDrop(drop: { mesh: THREE.InstancedMesh; index: number }, y: number) {
    drop.mesh.getMatrixAt(drop.index, this.M);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    this.M.decompose(p, q, s); p.y = y;
    drop.mesh.setMatrixAt(drop.index, this.M.compose(p, q, s)); drop.mesh.instanceMatrix.needsUpdate = true;
  }
  private animateCeremony(now: number, camera: THREE.Camera) {
    const c = this.ceremony;
    if (!c) return;
    const t = (now - c.start) / 1000;
    const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    const top = c.flash.position;
    c.meshes.forEach((m, i) => {
      if (t < 1.2) { m.mesh.position.copy(m.from).setY(m.from.y + ease(t / 1.2) * 34); m.mesh.rotation.y += 0.04 * m.spin * (1 + t * 3); }
      else if (t < 2.0) {
        const k = ease((t - 1.2) / 0.8), a = k * Math.PI * 2 + (i * Math.PI * 2) / c.meshes.length;
        const lifted = m.from.clone().setY(m.from.y + 34), r = (1 - k) * Math.hypot(lifted.x - top.x, lifted.z - top.z);
        m.mesh.position.set(top.x + Math.cos(a) * r, lifted.y + (top.y - lifted.y) * k, top.z + Math.sin(a) * r);
        m.mesh.scale.setScalar(Math.max(0.05, 1.2 * (1 - k))); m.mesh.rotation.y += 0.25 * m.spin;
      } else m.mesh.visible = false;
    });
    if (t >= 2.0 && !c.landed) {
      c.landed = true;
      this.events = [...this.events, { type: 'merge', ingredients: c.ids, result: c.result }];
      this.hidden.clear();
      this.rebuild(); // under the flash, a short pause is invisible
      for (const [mesh, ids] of this.picks) {
        const index = ids.indexOf(c.result.id);
        if (index >= 0 && mesh instanceof THREE.InstancedMesh) { mesh.getMatrixAt(index, this.M); c.drop = { mesh, index, y: new THREE.Vector3().setFromMatrixPosition(this.M).y }; }
      }
      c.meshes.forEach((m) => this.scene.remove(m.mesh));
      this.emit({ type: 'reveal', entity: c.result, ingredients: c.ids.length });
    }
    if (t >= 2.0 && t < 2.9) {
      const k = (t - 2.0) / 0.9;
      c.flash.scale.setScalar(4 + k * 38); (c.flash.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9;
      camera.position.x += (this.rand() - 0.5) * (1 - k) * 2.2; camera.position.y += (this.rand() - 0.5) * (1 - k) * 2.2;
      c.burst.visible = true;
      c.sparks.forEach((s, i) => { s.p.addScaledVector(s.v, 0.016); s.v.y -= 1.6; c.burst.setMatrixAt(i, this.M.makeTranslation(s.p.x, s.p.y, s.p.z)); });
      c.burst.instanceMatrix.needsUpdate = true;
    }
    if (c.drop && t < 3.4) {
      const k = Math.min(1, (t - 2.0) / 1.0);
      this.setDrop(c.drop, c.drop.y + (1 - ease(k)) * 60 * (1 - k) + (k < 1 ? Math.abs(Math.cos(k * Math.PI * 1.5)) * (1 - k) * 6 : 0));
    }
    if (t >= 3.4) {
      if (c.drop) this.setDrop(c.drop, c.drop.y);
      this.scene.remove(c.flash, c.burst); c.burst.dispose();
      this.ceremony = null; this.shadowsDirty = true;
      this.emit({ type: 'busy', busy: false });
    }
  }

  /** Many merges at once: everything dissolves, a wave sweeps the island, the valley regenerates once. */
  renew(plan: PlannedMerge[], now: number) {
    if (this.busy || !plan.length) return;
    const ingredientIds = new Set(plan.flatMap((m) => m.ingredients));
    const sources = this.placed.filter((p) => ingredientIds.has(p.id));
    for (const p of sources) this.hidden.add(p.id);
    this.rebuildItems();
    const perItem = Math.max(2, Math.min(8, Math.floor(600 / Math.max(1, sources.length))));
    const sparkles = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }), Math.max(1, sources.length * perItem));
    const tint = new THREE.Color();
    const seeds = sources.flatMap((p, i) => Array.from({ length: perItem }, (_, k) => {
      sparkles.setColorAt(i * perItem + k, tint.set(k % 3 === 0 ? 0xf2b53c : STYLE_LEAF[p.entity.style]));
      return { p: new THREE.Vector3(p.x + (this.rand() - 0.5) * 8, this.groundAt(p.x, p.z) + this.rand() * 14, p.z + (this.rand() - 0.5) * 8), v: new THREE.Vector3((this.rand() - 0.5) * 6, 14 + this.rand() * 18, (this.rand() - 0.5) * 6) };
    }));
    this.scene.add(sparkles);
    const wave = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 96), new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    wave.rotation.x = -Math.PI / 2; wave.position.y = this.groundAt(0, 0) + 6; wave.scale.setScalar(0.01);
    this.scene.add(wave);
    this.renewal = { start: now, plan, sparkles, seeds, wave, applied: false, pops: [] };
    this.emit({ type: 'busy', busy: true });
  }
  private animateRenewal(now: number, dt: number) {
    const r = this.renewal;
    if (!r) return;
    const t = (now - r.start) / 1000, radius = this.radius;
    const fade = Math.max(0, 1 - t / 1.4);
    (r.sparkles.material as THREE.MeshBasicMaterial).opacity = fade;
    r.seeds.forEach((s, i) => { s.p.addScaledVector(s.v, dt); s.v.multiplyScalar(0.985); r.sparkles.setMatrixAt(i, this.M.makeScale(fade, fade, fade).setPosition(s.p)); });
    r.sparkles.instanceMatrix.needsUpdate = true;
    const w = Math.min(1, Math.max(0, (t - 0.5) / 1.8));
    r.wave.scale.setScalar(Math.max(0.01, w * radius * 1.35));
    (r.wave.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - w);
    if (t >= 0.9 && !r.applied) {
      r.applied = true;
      this.events = [...this.events, ...mergeEvents(r.plan)];
      this.hidden.clear();
      this.rebuild(); // regenerate the valley exactly once, under the wave
      const results = new Set(r.plan.map((m) => m.result.id));
      for (const [mesh, ids] of this.picks) {
        if (!(mesh instanceof THREE.InstancedMesh)) continue;
        ids.forEach((id, index) => {
          if (!results.has(id)) return;
          const matrix = new THREE.Matrix4(); mesh.getMatrixAt(index, matrix);
          const p = new THREE.Vector3().setFromMatrixPosition(matrix);
          r.pops.push({ mesh, index, matrix, delay: 0.5 + (Math.hypot(p.x, p.z) / (radius * 1.35)) * 1.8 });
          mesh.setMatrixAt(index, new THREE.Matrix4().makeScale(0, 0, 0).setPosition(p)); mesh.instanceMatrix.needsUpdate = true;
        });
      }
    }
    for (const pop of r.pops) {
      const k = Math.min(1, Math.max(0, (t - pop.delay) / 0.45));
      const scale = k <= 0 ? 0 : k < 1 ? Math.sin(k * Math.PI * 0.75) * 1.18 : 1;
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      pop.matrix.decompose(p, q, s);
      pop.mesh.setMatrixAt(pop.index, this.M.compose(p, q, s.multiplyScalar(Math.max(0, scale)))); pop.mesh.instanceMatrix.needsUpdate = true;
    }
    if (t >= 3.0) {
      for (const pop of r.pops) { pop.mesh.setMatrixAt(pop.index, pop.matrix); pop.mesh.instanceMatrix.needsUpdate = true; }
      this.scene.remove(r.sparkles, r.wave); r.sparkles.dispose();
      const finals = new Set(r.plan.map((m) => m.result.id));
      for (const m of r.plan) for (const id of m.ingredients) finals.delete(id);
      const made = new Map<Level, number>();
      for (const m of r.plan) if (finals.has(m.result.id)) made.set(m.result.level, (made.get(m.result.level) ?? 0) + 1);
      const people = [...made.entries()].reduce((n, [level, count]) => n + villagersFor(level) * count, 0);
      this.renewal = null; this.shadowsDirty = true;
      this.emit({ type: 'summary', plan: r.plan, made: [...made.entries()].sort((a, b) => b[0] - a[0]), villagers: people });
      this.emit({ type: 'busy', busy: false });
    }
  }
}

export { levelInfo, mergeResult };

const FALL_SHADES = [0x3ea7de, 0x5bbbea, 0x86cff2, 0x5bbbea, 0xeaf8ff];
/** Lean waterfalls: two shades, so each fall is two mirrored assets instead of four (32 drops fill both exactly). */
const LEAN_FALL_SHADES = [0x5bbbea, 0xeaf8ff];
const FALL_TINT = new THREE.Color();

/**
 * A waterfall's sheet of water in the fall's own frame (x points out from the cliff, y up, z
 * across): stacked voxel slabs that follow the falling arc, widen as they drop and pale into mist.
 */
function curtainGeometry(width: number, frozen: boolean) {
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
  const color = new THREE.Color(), top = new THREE.Color(frozen ? 0xd9eef8 : 0x2f9fd8), bottom = new THREE.Color(frozen ? 0xf4fafd : 0xcdeefa);
  const FACES: [number[], number[][]][] = [
    [[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]], [[-1, 0, 0], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]]],
    [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]], [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
    [[0, 0, 1], [[1, -1, 1], [1, 1, 1], [-1, 1, 1], [-1, -1, 1]]], [[0, 0, -1], [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]]],
  ];
  const box = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, shade: number) => {
    for (const [normal, corners] of FACES) {
      const base = positions.length / 3;
      const light = normal[1] > 0 ? 1.08 : normal[0] !== 0 ? 1 : 0.9;
      for (const [x, y, z] of corners) {
        positions.push(cx + (x * sx) / 2, cy + (y * sy) / 2, cz + (z * sz) / 2);
        normals.push(normal[0], normal[1], normal[2]);
        colors.push(Math.min(1, color.r * shade * light), Math.min(1, color.g * shade * light), Math.min(1, color.b * shade * light));
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  };
  const STEP = 4, DEPTH = 132, FALL = 170, REACH = 7;
  // The lip: water curls over the edge before it drops.
  color.copy(top).lerp(new THREE.Color(0xffffff), frozen ? 0.2 : 0.25);
  box(0.4, -0.6, 0, 2, 1.6, width, 1);
  for (let y0 = 0; y0 < DEPTH; y0 += STEP) {
    const y1 = y0 + STEP, f = y0 / DEPTH;
    const t = Math.sqrt((y0 + STEP / 2) / FALL);
    color.copy(top).lerp(bottom, Math.pow(f, 1.4));
    const stripe = (y0 / STEP) % 2 ? 0.94 : 1.04; // flow bands that read as falling water
    box(t * REACH + 1, -(y0 + y1) / 2, 0, 1.8 + f * 1.6, STEP + 0.02, width * (1 + f * 0.6), stripe);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  return geometry;
}

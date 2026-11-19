/**
 * Mirrors a three.js scene into a native renderer (Filament) every frame.
 *
 * The valley's world stays exactly the web's: `ValleyScene` builds and animates a three.js scene
 * graph, and picking still raycasts against it. Nothing in it draws, though; this mirror copies
 * what is visible into the renderer:
 * - each Mesh / InstancedMesh becomes one instanced glTF asset (serialised with geometryToGlb);
 *   instanced meshes with per-instance colours are split into one asset per colour;
 * - every frame, world matrices that changed are sent in one batched call;
 * - assets are pooled by geometry, so rebuilding the valley reuses what is already loaded.
 *
 * It has no React Native imports: the renderer is behind `MirrorBackend`, so it is unit-tested in bun.
 */
import * as THREE from 'three';
import { geometryToGlb } from '@focus-garden/garden/glb';

export interface MirrorAsset {
  /** One root entity per instance, in instance order. */
  readonly roots: readonly unknown[];
  setOpacity(alpha: number): void;
  setShadows(cast: boolean, receive: boolean): void;
  release(): void;
}

export interface MirrorBackend {
  /** Loads a .glb with `instances` copies and adds it to the scene. */
  load(glb: Uint8Array, key: string, instances: number): Promise<MirrorAsset>;
  /** Sets the world matrix (column-major, 16 floats each) of each entity. */
  setTransforms(entities: readonly unknown[], matrices: Float32Array): void;
}

/** Instances that are not drawn: tiny and far below the world, so they are culled. */
const HIDDEN = new THREE.Matrix4().makeScale(1e-5, 1e-5, 1e-5).setPosition(0, -1e5, 0).elements;
const RELEASE_AFTER_MS = 2000;

type Group = { colorKey: string; color: THREE.Color | null; indices: number[] | null };

interface Binding {
  key: string;
  mesh: THREE.Mesh;
  group: Group;
  assetKey: string;
  asset: MirrorAsset | null;
  capacity: number;
  loading: number; // capacity being loaded, 0 when none
  last: Float32Array;
  opacity: number;
  seenAt: number;
  hidden: boolean;
  disposed: boolean;
}

const nextPow2 = (n: number) => (n <= 1 ? 1 : 2 ** Math.ceil(Math.log2(n)));
/**
 * Room for `n` instances. Every instance is its own entity in Filament (one draw each, even when
 * hidden it is culled), so pad little: powers of two up to 8, then multiples of 8.
 */
export const capacityFor = (n: number) => (n <= 8 ? nextPow2(n) : Math.ceil(n / 8) * 8);

export class SceneMirror {
  private readonly bindings = new Map<string, Binding>();
  private readonly pool = new Map<string, { asset: MirrorAsset; capacity: number; freedAt: number }[]>();
  private readonly groups = new Map<string, { version: number; count: number; groups: Group[] }>();
  private readonly glbs = new Map<string, Uint8Array>();
  private readonly M = new THREE.Matrix4();
  private readonly I = new THREE.Matrix4();
  private scratch = new Float32Array(16 * 64);
  /** Loads started and finished, and what is held, for diagnostics. */
  readonly stats = { loads: 0, loaded: 0, bindings: 0, sent: 0, glbs: 0, groups: 0 };

  constructor(private readonly backend: MirrorBackend) {}

  /** Copies the visible scene to the renderer. Call once per frame after updating the scene. */
  sync(scene: THREE.Scene, now: number) {
    scene.updateMatrixWorld();
    const entities: unknown[] = [];
    let used = 0;
    const push = (asset: MirrorAsset, index: number, matrix: ArrayLike<number>) => {
      if ((used + 1) * 16 > this.scratch.length) { const grown = new Float32Array(this.scratch.length * 2); grown.set(this.scratch); this.scratch = grown; }
      entities.push(asset.roots[index]);
      for (let k = 0; k < 16; k++) this.scratch[used * 16 + k] = matrix[k];
      used++;
    };

    scene.traverseVisible((object) => {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
      for (const group of this.groupsOf(object)) {
        const binding = this.bind(object, group);
        binding.seenAt = now;
        const instanced = object instanceof THREE.InstancedMesh;
        const need = group.indices ? group.indices.length : instanced ? object.count : 1;
        this.ensure(binding, need);
        const asset = binding.asset;
        if (!asset) continue;
        const material = object.material as THREE.MeshBasicMaterial;
        const opacity = material.transparent ? material.opacity : 1;
        if (opacity !== binding.opacity) { binding.opacity = opacity; asset.setOpacity(opacity); }
        for (let i = 0; i < binding.capacity; i++) {
          let matrix: ArrayLike<number> = HIDDEN;
          if (i < need) {
            if (instanced) {
              (object as THREE.InstancedMesh).getMatrixAt(group.indices ? group.indices[i] : i, this.I);
              matrix = this.M.multiplyMatrices(object.matrixWorld, this.I).elements;
            } else matrix = object.matrixWorld.elements;
          }
          if (binding.hidden || differs(binding.last, i, matrix)) { binding.last.set(matrix as number[], i * 16); push(asset, i, matrix); }
        }
        binding.hidden = false;
      }
    });

    for (const binding of this.bindings.values()) {
      if (binding.seenAt === now) continue;
      if (!binding.hidden && binding.asset) {
        for (let i = 0; i < binding.capacity; i++) push(binding.asset, i, HIDDEN);
        binding.last.fill(NaN); binding.hidden = true;
      }
      if (now - binding.seenAt > RELEASE_AFTER_MS) this.unbind(binding, now);
    }
    this.sweepPool(now);

    if (used) { this.backend.setTransforms(entities, this.scratch.subarray(0, used * 16)); this.stats.sent += used; }
    this.stats.bindings = this.bindings.size;
    this.stats.glbs = this.glbs.size;
    this.stats.groups = this.groups.size;
    return used;
  }

  /** Releases everything this mirror loaded. */
  dispose() {
    for (const binding of this.bindings.values()) { binding.disposed = true; binding.asset?.release(); }
    this.bindings.clear();
    for (const list of this.pool.values()) for (const entry of list) entry.asset.release();
    this.pool.clear(); this.glbs.clear(); this.groups.clear();
  }

  // ---------------------------------------------------------------- grouping and assets

  /** One group per instance colour (instanced meshes with instanceColor), otherwise one group. */
  private groupsOf(mesh: THREE.Mesh): Group[] {
    const colors = mesh instanceof THREE.InstancedMesh ? mesh.instanceColor : null;
    if (!colors) return [{ colorKey: '', color: null, indices: null }];
    const count = (mesh as THREE.InstancedMesh).count;
    const cached = this.groups.get(mesh.uuid);
    if (cached && cached.version === colors.version && cached.count === count) return cached.groups;
    const byColor = new Map<string, Group>();
    for (let i = 0; i < count; i++) {
      const r = colors.getX(i), g = colors.getY(i), b = colors.getZ(i);
      const key = `${r.toFixed(4)},${g.toFixed(4)},${b.toFixed(4)}`;
      let group = byColor.get(key);
      if (!group) byColor.set(key, (group = { colorKey: key, color: new THREE.Color(r, g, b), indices: [] }));
      group.indices!.push(i);
    }
    const groups = [...byColor.values()];
    this.groups.set(mesh.uuid, { version: colors.version, count, groups });
    return groups;
  }

  private bind(mesh: THREE.Mesh, group: Group): Binding {
    const key = `${mesh.uuid}|${group.colorKey}`;
    let binding = this.bindings.get(key);
    if (binding && binding.mesh.geometry.uuid !== binding.assetKey.split('|')[0]) { this.unbind(binding, binding.seenAt); binding = undefined; }
    if (!binding) {
      binding = { key, mesh, group, assetKey: assetKeyOf(mesh, group), asset: null, capacity: 0, loading: 0, last: new Float32Array(0), opacity: NaN, seenAt: 0, hidden: true, disposed: false };
      this.bindings.set(key, binding);
    }
    binding.group = group;
    return binding;
  }

  private unbind(binding: Binding, now: number) {
    binding.disposed = true;
    this.bindings.delete(binding.key);
    if (binding.asset) this.toPool(binding.assetKey, binding.asset, binding.capacity, now);
    else this.forgetGlb(binding.assetKey);
    // The mesh's colour groups go with its last binding.
    let shared = false;
    for (const other of this.bindings.values()) if (other.mesh === binding.mesh) { shared = true; break; }
    if (!shared) this.groups.delete(binding.mesh.uuid);
  }

  /** Drops the .glb bytes of an asset key nothing uses any more (each valley rebuild makes new geometries). */
  private forgetGlb(key: string) {
    if (this.pool.get(key)?.length) return;
    for (const binding of this.bindings.values()) if (binding.assetKey === key) return;
    this.glbs.delete(key);
  }

  private ensure(binding: Binding, need: number) {
    if (binding.asset && binding.capacity >= need) return;
    if (binding.loading >= need) return;
    const capacity = binding.mesh instanceof THREE.InstancedMesh ? capacityFor(Math.max(1, need)) : 1;
    const pooled = this.fromPool(binding.assetKey, capacity);
    if (pooled) { this.attach(binding, pooled.asset, pooled.capacity); return; }
    binding.loading = capacity;
    this.stats.loads++;
    const bytes = this.glbOf(binding);
    this.backend.load(bytes, `${binding.assetKey}|${capacity}`, capacity).then((asset) => {
      this.stats.loaded++;
      if (binding.loading === capacity) binding.loading = 0;
      if (binding.disposed || (binding.asset && binding.capacity >= capacity)) { this.toPool(binding.assetKey, asset, capacity, binding.seenAt); return; }
      this.attach(binding, asset, capacity);
    }, () => { if (binding.loading === capacity) binding.loading = 0; });
  }

  private attach(binding: Binding, asset: MirrorAsset, capacity: number) {
    if (binding.asset) this.toPool(binding.assetKey, binding.asset, binding.capacity, binding.seenAt);
    binding.asset = asset; binding.capacity = capacity;
    binding.last = new Float32Array(capacity * 16).fill(NaN);
    binding.opacity = NaN; binding.hidden = true;
    asset.setShadows(binding.mesh.castShadow, binding.mesh.receiveShadow);
  }

  private toPool(key: string, asset: MirrorAsset, capacity: number, now: number) {
    // Parked assets must not draw: hide every instance.
    const matrices = new Float32Array(capacity * 16);
    for (let i = 0; i < capacity; i++) matrices.set(HIDDEN, i * 16);
    this.backend.setTransforms(asset.roots.slice(0, capacity), matrices);
    (this.pool.get(key) ?? this.pool.set(key, []).get(key)!).push({ asset, capacity, freedAt: now });
  }

  private fromPool(key: string, capacity: number) {
    const list = this.pool.get(key);
    if (!list) return null;
    const at = list.findIndex((entry) => entry.capacity >= capacity);
    return at < 0 ? null : list.splice(at, 1)[0];
  }

  private sweepPool(now: number) {
    for (const [key, list] of this.pool) {
      for (let i = list.length - 1; i >= 0; i--) if (now - list[i].freedAt > RELEASE_AFTER_MS * 5) { list[i].asset.release(); list.splice(i, 1); }
      if (!list.length) { this.pool.delete(key); this.forgetGlb(key); }
    }
  }

  private glbOf(binding: Binding) {
    const cached = this.glbs.get(binding.assetKey);
    if (cached) return cached;
    const bytes = meshToGlb(binding.mesh, binding.group.color);
    this.glbs.set(binding.assetKey, bytes);
    return bytes;
  }
}

function differs(last: Float32Array, index: number, matrix: ArrayLike<number>) {
  const at = index * 16;
  for (let k = 0; k < 16; k++) if (last[at + k] !== Math.fround(matrix[k])) return true;
  return false;
}

function assetKeyOf(mesh: THREE.Mesh, group: Group) {
  const m = mesh.material as THREE.MeshBasicMaterial;
  const unlit = m instanceof THREE.MeshBasicMaterial ? 'u' : (mesh.material as THREE.Material) instanceof THREE.MeshPhongMaterial ? 'g' : 'l';
  return `${mesh.geometry.uuid}|${group.colorKey}|${m.color?.getHexString() ?? ''}|${m.vertexColors ? 'v' : ''}|${unlit}|${m.transparent ? 't' : ''}|${m.side === THREE.DoubleSide ? 'd' : ''}`;
}

/**
 * A mesh as a .glb: material colour (and the instance colour, when grouped) baked into vertex
 * colours, so every asset is one mesh with one material.
 */
export function meshToGlb(mesh: THREE.Mesh, instanceColor: THREE.Color | null) {
  const material = mesh.material as THREE.MeshBasicMaterial;
  const source = mesh.geometry;
  const geometry = new THREE.BufferGeometry();
  const position = source.getAttribute('position');
  geometry.setAttribute('position', position);
  if (source.getAttribute('normal')) geometry.setAttribute('normal', source.getAttribute('normal'));
  else { geometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(position.count * 3), 3)); }
  const tint = new THREE.Color(1, 1, 1);
  if (material.color) tint.multiply(material.color);
  if (instanceColor) tint.multiply(instanceColor);
  const sourceColor = material.vertexColors ? source.getAttribute('color') : undefined;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    colors[i * 3] = (sourceColor ? sourceColor.getX(i) : 1) * tint.r;
    colors[i * 3 + 1] = (sourceColor ? sourceColor.getY(i) : 1) * tint.g;
    colors[i * 3 + 2] = (sourceColor ? sourceColor.getZ(i) : 1) * tint.b;
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  if (source.getIndex()) geometry.setIndex(source.getIndex());
  else geometry.setIndex(Array.from({ length: position.count }, (_, i) => i));
  if (!source.getAttribute('normal')) geometry.computeVertexNormals();
  return geometryToGlb(geometry, {
    name: mesh.name || 'mesh',
    unlit: material instanceof THREE.MeshBasicMaterial,
    opacity: material.transparent ? material.opacity : 1,
    doubleSided: material.side === THREE.DoubleSide,
    // Glossy three.js materials (water) keep their sheen in Filament.
    roughness: material instanceof THREE.MeshPhongMaterial ? 0.3 : 1,
  });
}

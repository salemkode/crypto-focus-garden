import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { readGlb } from '@focus-garden/garden/glb';
import type { Level } from '@focus-garden/garden/ladder';
import { ValleyScene } from '@focus-garden/garden/scene';
import type { ValleyEvent } from '@focus-garden/garden/valley';
import { meshToGlb, SceneMirror, type MirrorAsset, type MirrorBackend } from '../src/components/valley/filament/mirror';

/** A renderer stand-in: records loads, transforms, opacity and releases. */
function fakeBackend() {
  const loads: { key: string; instances: number; json: any }[] = [];
  const transforms = new Map<unknown, number[]>();
  const released: string[] = [];
  let calls = 0;
  const backend: MirrorBackend = {
    async load(glb, key, instances) {
      loads.push({ key, instances, json: readGlb(glb).json });
      const roots = Array.from({ length: instances }, (_, i) => ({ key, i }));
      const asset: MirrorAsset & { opacity: number; shadows: [boolean, boolean] } = {
        roots, opacity: 1, shadows: [false, false],
        setOpacity(alpha) { asset.opacity = alpha; },
        setShadows(cast, receive) { asset.shadows = [cast, receive]; },
        release() { released.push(key); },
      };
      return asset;
    },
    setTransforms(entities, matrices) {
      calls++;
      expect(matrices.length).toBe(entities.length * 16);
      entities.forEach((e, i) => transforms.set(e, Array.from(matrices.subarray(i * 16, i * 16 + 16))));
    },
  };
  return { backend, loads, transforms, released, calls: () => calls };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const translationOf = (m: number[] | undefined) => (m ? [m[12], m[13], m[14]] : null);

describe('SceneMirror', () => {
  test('a mesh is loaded once and its world matrix is sent only when it changes', async () => {
    const fake = fakeBackend();
    const mirror = new SceneMirror(fake.backend);
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xff0000 }));
    mesh.position.set(1, 2, 3); mesh.castShadow = true;
    scene.add(mesh);
    mirror.sync(scene, 1); await flush();
    expect(fake.loads).toHaveLength(1);
    expect(mirror.sync(scene, 2)).toBe(1);
    const root = [...fake.transforms.keys()][0];
    expect(translationOf(fake.transforms.get(root))).toEqual([1, 2, 3]);
    expect(mirror.sync(scene, 3)).toBe(0); // unchanged: nothing sent
    mesh.position.x = 5;
    expect(mirror.sync(scene, 4)).toBe(1);
    expect(translationOf(fake.transforms.get(root))).toEqual([5, 2, 3]);
    expect(fake.loads).toHaveLength(1);
  });

  test('instance colours become one asset per colour, with the colour baked in', async () => {
    const fake = fakeBackend();
    const mirror = new SceneMirror(fake.backend);
    const scene = new THREE.Scene();
    const crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), 5);
    const colors = [0xff0000, 0x00ff00, 0xff0000, 0x00ff00, 0xff0000];
    colors.forEach((c, i) => { crowd.setColorAt(i, new THREE.Color(c)); crowd.setMatrixAt(i, new THREE.Matrix4().makeTranslation(i, 0, 0)); });
    scene.add(crowd);
    mirror.sync(scene, 1); await flush();
    expect(fake.loads.map((l) => l.instances).sort()).toEqual([2, 4]); // 2 greens, 3 reds rounded up to 4
    mirror.sync(scene, 2);
    const xs = [...fake.transforms.values()].filter((m) => m[13] > -1000).map((m) => m[12]).sort();
    expect(xs).toEqual([0, 1, 2, 3, 4]);
  });

  test('meshes that leave the scene are hidden, then their assets are pooled and reused', async () => {
    const fake = fakeBackend();
    const mirror = new SceneMirror(fake.backend);
    const scene = new THREE.Scene();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshLambertMaterial({ color: 0x3366ff });
    const first = new THREE.Mesh(geometry, material);
    scene.add(first);
    mirror.sync(scene, 0); await flush(); mirror.sync(scene, 10);
    scene.remove(first);
    mirror.sync(scene, 20);
    const root = [...fake.transforms.keys()][0];
    expect(fake.transforms.get(root)![13]).toBeLessThan(-1000); // hidden far below
    mirror.sync(scene, 5000); // unseen long enough: back to the pool
    const second = new THREE.Mesh(geometry, material); second.position.y = 7;
    scene.add(second);
    mirror.sync(scene, 5001);
    expect(fake.loads).toHaveLength(1); // reused, not reloaded
    expect(translationOf(fake.transforms.get(root))).toEqual([0, 7, 0]);
  });

  test('geometry that is gone for good is forgotten: its asset, .glb bytes and colour groups are released', async () => {
    const fake = fakeBackend();
    const mirror = new SceneMirror(fake.backend);
    const scene = new THREE.Scene();
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    // Each rebuild of the valley makes new geometries; the old ones must not pile up.
    for (let round = 0; round < 5; round++) {
      const crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, 2);
      crowd.setColorAt(0, new THREE.Color(0xff0000)); crowd.setColorAt(1, new THREE.Color(0x00ff00));
      const tree = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), material);
      scene.add(crowd, tree);
      const t = round * 60_000;
      mirror.sync(scene, t); await flush(); mirror.sync(scene, t + 1);
      scene.remove(crowd, tree);
      mirror.sync(scene, t + 5_000); // unseen: parked in the pool
      mirror.sync(scene, t + 30_000); // parked too long: released
    }
    expect(fake.released).toHaveLength(fake.loads.length);
    expect(mirror.stats.glbs).toBe(0);
    expect(mirror.stats.groups).toBe(0);
    expect(mirror.stats.bindings).toBe(0);
  });

  test('transparent materials follow their opacity', async () => {
    const fake = fakeBackend();
    const mirror = new SceneMirror(fake.backend);
    const scene = new THREE.Scene();
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), material));
    mirror.sync(scene, 1); await flush(); mirror.sync(scene, 2);
    expect(fake.loads[0].json.materials[0].alphaMode).toBe('BLEND');
    expect(fake.loads[0].json.extensionsUsed).toEqual(['KHR_materials_unlit']);
  });

  test('meshToGlb bakes material and instance colours into vertex colours', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x808080 }));
    const { json, bin } = readGlb(meshToGlb(mesh, new THREE.Color(1, 0, 0)));
    const view = json.bufferViews[2];
    const colours = new Uint16Array(bin.buffer.slice(bin.byteOffset + view.byteOffset, bin.byteOffset + view.byteOffset + view.byteLength));
    const grey = new THREE.Color(0x808080).r;
    expect(colours[0] / 65535).toBeCloseTo(grey, 3);
    expect(colours[1]).toBe(0);
  });

  test('a real valley: every visible mesh is mirrored and a steady frame sends only what moved', async () => {
    const fake = fakeBackend();
    const mirror = new SceneMirror(fake.backend);
    let seed = 1;
    const valley = new ValleyScene({ seed: 7, random: () => ((seed = (seed * 16807) % 2147483647) / 2147483647) });
    const levels: Level[] = [1, 2, 3, 2, 1, 5, 6, 7, 2, 3, 1, 1, 4, 8, 2, 3, 6, 1, 2, 9, 3, 2];
    const history: ValleyEvent[] = levels.map((level, n) => ({ type: 'plant', entity: { id: `p${n}`, level, style: (['oak', 'pine', 'birch', 'cherry', 'maple', 'cash'] as const)[n % 6], seed: n } }));
    valley.setHistory(history);
    valley.buildWeather();
    const camera = new THREE.PerspectiveCamera(32, 0.5, 0.5, 5000);
    camera.position.set(400, 400, 400); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    mirror.sync(valley.scene, 0);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mirror.stats.loaded).toBe(mirror.stats.loads);
    let meshes = 0;
    valley.scene.traverseVisible((o) => { if (o instanceof THREE.Mesh) meshes++; });
    expect(mirror.stats.bindings).toBeGreaterThanOrEqual(meshes);

    // Frame timing of the JavaScript side (scene update + mirror) over a few seconds of animation.
    const times: number[] = [];
    let sent = 0;
    for (let f = 1; f <= 240; f++) {
      const now = f * (1000 / 120);
      const start = performance.now();
      valley.update(now, 1 / 120, camera);
      sent = mirror.sync(valley.scene, now);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    console.log(`valley: ${meshes} meshes, ${mirror.stats.bindings} bindings, ${sent} transforms in the last frame; JS frame median ${times[120].toFixed(2)} ms, p99 ${times[237].toFixed(2)} ms (bun)`);
    expect(sent).toBeGreaterThan(0); // villagers, weather and waterfalls move
  });
});

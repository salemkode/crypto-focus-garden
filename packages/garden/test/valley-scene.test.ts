import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { ValleyScene, type SceneEvent } from '../src/engine/valley-scene';
import type { Level } from '../src/ladder';
import type { ValleyEvent } from '../src/valley';

const history = (levels: Level[]): ValleyEvent[] => levels.map((level, n) => ({ type: 'plant', entity: { id: `p${n}`, level, style: 'oak', seed: n } }));
let seed = 1; const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test('the scene builds a valley from history and reports changes', () => {
  const events: SceneEvent[] = [];
  const s = new ValleyScene({ seed: 7, random, onEvent: (e) => events.push(e) });
  s.setHistory(history([1, 2, 3, 5, 6]));
  expect(s.placed.length).toBe(5);
  expect(s.villagers.length).toBe(1 + 2); // a cabin and a cottage
  expect(events.some((e) => e.type === 'changed')).toBe(true);
});

test('a single merge plays its ceremony and lands the result', () => {
  const events: SceneEvent[] = [];
  const s = new ValleyScene({ seed: 7, random, onEvent: (e) => events.push(e) });
  s.setHistory(history([1, 1, 1, 4]));
  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 5000);
  const merge = s.nextMerge()!;
  expect(merge.ingredients.length).toBe(3);
  s.mergeOne(merge, 0);
  expect(s.busy).toBe(true);
  for (let t = 0; t <= 3500; t += 100) s.update(t, 0.1, camera);
  expect(s.busy).toBe(false);
  expect(s.placed.map((p) => p.entity.level).sort()).toEqual([2, 4]);
  expect(events.find((e) => e.type === 'reveal')).toBeTruthy();
});

test('a batch renewal regenerates once and summarises what you made', () => {
  const events: SceneEvent[] = [];
  const s = new ValleyScene({ seed: 7, random, onEvent: (e) => events.push(e) });
  s.setHistory(history(Array(9).fill(1)));
  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 5000);
  const plan = s.planMerges({ 1: Infinity }, true);
  s.renew(plan, 0);
  const changes = () => events.filter((e) => e.type === 'changed').length;
  const before = changes();
  for (let t = 0; t <= 3100; t += 100) s.update(t, 0.1, camera);
  expect(changes() - before).toBe(1);
  const summary = events.find((e) => e.type === 'summary') as Extract<SceneEvent, { type: 'summary' }>;
  expect(summary.made).toEqual([[3, 1]]);
  expect(s.placed.map((p) => p.entity.level)).toEqual([3]);
});

test('lean weather: every flake is baked into a few layers that keep the weather band evenly filled', () => {
  const s = new ValleyScene({ seed: 7, random, lean: true });
  s.season = 'winter';
  s.setHistory(history([1, 2, 3, 5, 6]));
  s.buildWeather();
  const camera = new THREE.PerspectiveCamera(32, 0.5, 0.5, 5000);
  const layers = s.scene.children.filter((o) => o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh) && (o.material as THREE.MeshBasicMaterial).vertexColors && o.geometry.getAttribute('position').count % 24 === 0 && o.frustumCulled === false) as THREE.Mesh[];
  expect(layers).toHaveLength(6);
  expect(s.scene.children.some((o) => o instanceof THREE.InstancedMesh && o.count >= 400)).toBe(false); // no per-flake instances
  const flakes = layers.reduce((n, m) => n + m.geometry.getAttribute('position').count / 24, 0);
  expect(flakes).toBe(420 * 2); // winter's 420 flakes, each held twice (one span apart)
  // However far the layers have fallen, the band from -15 to 160 holds every flake once.
  for (let t = 0; t < 40; t += 3.7) {
    s.update(t * 1000, 3.7, camera);
    let inBand = 0;
    for (const mesh of layers) {
      mesh.updateMatrixWorld();
      const p = mesh.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i += 24) {
        let y = 0; for (let j = 0; j < 24; j++) y += p.getY(i + j) / 24;
        y += mesh.position.y;
        if (y >= -15 && y < 160) inBand++;
      }
    }
    expect(inBand).toBeGreaterThan(420 * 0.97);
    expect(inBand).toBeLessThan(420 * 1.03);
  }
});

test('lean waterfalls and ripples use fewer particles than the web', () => {
  const lean = new ValleyScene({ seed: 7, random, lean: true });
  const full = new ValleyScene({ seed: 7, random });
  const levels: Level[] = [1, 2, 3, 2, 1, 5, 6, 7, 2, 3, 1, 1, 4, 8, 2, 3, 6, 1, 2, 9, 3, 2];
  for (const s of [lean, full]) { s.season = 'summer'; s.setHistory(history(levels)); }
  const particles = (s: ValleyScene) => s.scene.children.reduce((n, o) => n + (o instanceof THREE.InstancedMesh && o.material !== (s as any).flat ? o.count : 0), 0);
  expect(particles(lean)).toBeLessThan(particles(full) / 3);
});

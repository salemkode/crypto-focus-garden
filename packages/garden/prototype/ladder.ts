/** Design prototype: the ten-level ladder, standing on a winding path. */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildLevelModel, LADDER, minimumUnits, uniqueName, type Level } from '../src/ladder';
import type { SpeciesKey } from '../src/tiers';

const STYLES: SpeciesKey[] = ['oak', 'cherry', 'maple', 'pine', 'birch', 'cash'];
const canvas = document.querySelector('canvas')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 1, 5000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.minPolarAngle = 0.5; controls.maxPolarAngle = 1.2;
scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6b5a4a, 1.5));
const sun = new THREE.DirectionalLight(0xffe2b0, 3.0);
sun.position.set(-200, 300, 160); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -260, right: 260, top: 260, bottom: -260, far: 1200 });
scene.add(sun);
const material = new THREE.MeshLambertMaterial({ vertexColors: true });
const ground = new THREE.Mesh(new THREE.CylinderGeometry(260, 240, 14, 64), new THREE.MeshLambertMaterial({ color: 0x74bd4d }));
ground.position.y = -7.5; ground.receiveShadow = true; scene.add(ground);
const group = new THREE.Group(); scene.add(group);
const labels = document.getElementById('labels')!;

// Two rows of five: levels 1–5 in front, 6–10 behind, read left to right like a path.
const stops = LADDER.map((_, i) => ({ x: -176 + (i % 5) * 88, z: i < 5 ? 70 : -70 }));
let style: SpeciesKey = 'cherry';
let salt = 1;
function rebuild() {
  group.children.forEach((c) => (c as THREE.Mesh).geometry.dispose()); group.clear(); labels.innerHTML = '';
  LADDER.forEach((info, i) => {
    const seed = salt * 97 + i * 13;
    const mesh = new THREE.Mesh(buildLevelModel(info.level as Level, style, seed).toGeometry(), material);
    const scale = i < 3 ? [3.4, 2.3, 1.6][i] : 2.1;
    mesh.scale.setScalar(scale); mesh.position.set(stops[i].x, 0, stops[i].z);
    mesh.rotation.y = -0.5; mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    const hours = (minimumUnits(info.level as Level) * 512) / 3600;
    const el = document.createElement('div');
    el.className = 'label glass';
    const how = info.sessionUnits && info.merge ? `1 session or merge ${info.merge}` : info.merge ? `merge ${info.merge}` : 'one session';
    el.innerHTML = `<b>${info.level}</b> ${uniqueName(info.level as Level, style, seed)}<small>${how} · ${hours < 1 ? Math.round(hours * 60) + ' min' : Math.round(hours) + ' h'} focus</small>`;
    el.dataset.i = String(i);
    labels.appendChild(el);
  });
}
// A path of stepping stones linking the levels (row to row at the end of the front row).
for (let i = 0; i < 9; i++) for (let k = 1; k < 8; k++) {
  const a = stops[i], b = stops[i + 1], t = k / 8;
  const stone = new THREE.Mesh(new THREE.BoxGeometry(7, 1.2, 7), new THREE.MeshLambertMaterial({ color: 0xd9c9a3 }));
  stone.position.set(a.x + (b.x - a.x) * t, 0.2, a.z + (b.z - a.z) * t); stone.receiveShadow = true; scene.add(stone);
}
camera.position.set(0, 380, 600); controls.target.set(0, 22, -8);
function resize() { const r = canvas.parentElement!.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
function tick() {
  controls.update(); renderer.render(scene, camera);
  const r = canvas.getBoundingClientRect();
  labels.querySelectorAll<HTMLElement>('.label').forEach((el) => {
    const i = Number(el.dataset.i); const p = new THREE.Vector3(stops[i].x, [16, 30, 38, 34, 32, 36, 46, 34, 44, 66][i], stops[i].z).project(camera);
    el.style.transform = `translate(-50%,-100%) translate(${(p.x + 1) / 2 * r.width}px, ${(1 - p.y) / 2 * r.height}px)`;
  });
  requestAnimationFrame(tick);
}
document.querySelectorAll<HTMLButtonElement>('[data-style]').forEach((b) => b.onclick = () => {
  style = b.dataset.style as SpeciesKey; document.querySelectorAll('[data-style]').forEach((o) => o.classList.remove('on')); b.classList.add('on'); rebuild();
});
document.getElementById('reroll')!.onclick = () => { salt++; rebuild(); };
rebuild(); requestAnimationFrame(tick);

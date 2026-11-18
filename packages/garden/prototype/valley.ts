/**
 * Web host for the valley (design prototype). All 3D lives in the shared engine
 * (src/engine/valley-scene.ts + camera.ts); this file is only the renderer, gestures and UI —
 * the same split the React Native app uses with WebGPU.
 * Build: bun run prototype/build.ts
 */
import * as THREE from 'three';
import { ValleyCamera } from '../src/engine/camera';
import { describe, STYLE_NAME } from '../src/engine/describe';
import { STYLE_LEAF, ValleyScene, type Hit } from '../src/engine/valley-scene';
import { levelForUnits, levelInfo, uniqueName, type Level } from '../src/ladder';
import { seasonFor, type Season } from '../src/season';
import type { SpeciesKey } from '../src/tiers';
import { seedOf, villagersFor, type ValleyEntity, type ValleyEvent } from '../src/valley';

const INIT = (globalThis as { __INIT?: { season?: Season; age?: number; planner?: boolean; card?: boolean } }).__INIT ?? {};
const LOW_POWER = matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency ?? 8) <= 4;
const STYLES = Object.keys(STYLE_NAME) as SpeciesKey[];
const rand = Math.random;

function history(count: number): ValleyEvent[] {
  return Array.from({ length: count }, (_, n) => {
    const roll = ((n * 2654435761) >>> 0) / 4294967296;
    const level = (roll < 0.22 ? 1 : roll < 0.48 ? 2 : roll < 0.68 ? 3 : roll < 0.78 ? 4 : roll < 0.85 ? 5 : roll < 0.9 ? 6 : roll < 0.94 ? 7 : roll < 0.97 ? 8 : roll < 0.99 ? 9 : 10) as Level;
    return { type: 'plant' as const, entity: { id: `nft-${n}`, level: count < 12 && level > 6 ? 5 : level, style: STYLES[(n * 7 + 3) % STYLES.length], seed: n * 31 + 7 } };
  });
}

// ---------- renderer, engine, camera ----------
const app = document.getElementById('app')!;
const canvas = document.querySelector('canvas')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW_POWER, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(LOW_POWER ? 1.5 : 2, devicePixelRatio));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 5000);
const view = new ValleyCamera(camera);
let busy = false;
const valley = new ValleyScene({
  seed: seedOf('bchtest:qq-demo-owner-focus-garden'), lowPower: LOW_POWER,
  onEvent: (e) => {
    if (e.type === 'busy') { busy = e.busy; renderDock(); }
    if (e.type === 'reveal') reveal(`Level ${e.entity.level}`, uniqueName(e.entity.level, e.entity.style, e.entity.seed), `${e.ingredients} became one ${levelInfo(e.entity.level).name.toLowerCase()}${villagersFor(e.entity.level) ? ` · ${villagersFor(e.entity.level)} villagers move in` : ''}`);
    if (e.type === 'summary') { reveal(`${e.plan.length} merges`, 'Your valley grew', `${e.made.map(([l, n]) => `${n} ${levelInfo(l).name.toLowerCase()}${n > 1 ? 's' : ''}`).join(' · ')}${e.villagers ? ` · ${e.villagers} villagers moved in` : ''}`); view.frame(valley.radius, performance.now()); }
    if (e.type === 'changed') document.getElementById('count')!.textContent = `${valley.placed.length} items · ${valley.villagers.length} villagers`;
  },
});
valley.season = INIT.season ?? seasonFor(new Date());
valley.setHistory(history(INIT.age ?? 10));
valley.buildWeather();

function resize() { const r = app.getBoundingClientRect(); renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
const setSky = () => { app.style.setProperty('--sky-top', valley.sky.top); app.style.setProperty('--sky-bottom', valley.sky.bottom); app.classList.toggle('legend', valley.hasLegend); };

// ---------- gestures → camera (the app uses the same calls from gesture-handler) ----------
const pointers = new Map<number, { x: number; y: number }>();
let tap: { x: number; y: number; t: number } | null = null;
let last2: { mid: { x: number; y: number }; distance: number; angle: number } | null = null;
const ndc = (x: number, y: number) => { const r = canvas.getBoundingClientRect(); return new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1); };
const pair = () => { const [a, b] = [...pointers.values()]; return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x) }; };
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  view.begin(performance.now()); tap = pointers.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
  if (pointers.size === 2) last2 = pair();
});
canvas.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId); if (!prev) return;
  const h = canvas.getBoundingClientRect().height;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    if (e.buttons & 2) { view.rotate((e.clientX - prev.x) * 0.006); view.tilt((e.clientY - prev.y) * 0.004); }
    else view.pan(e.clientX - prev.x, e.clientY - prev.y, h);
  } else if (pointers.size === 2 && last2) {
    const now = pair();
    view.zoom(now.distance / Math.max(1, last2.distance)); view.rotate(now.angle - last2.angle); view.tilt((now.mid.y - last2.mid.y) * 0.004);
    last2 = now;
  }
});
const lift = (e: PointerEvent) => {
  pointers.delete(e.pointerId); if (pointers.size < 2) last2 = null;
  if (pointers.size === 0) view.release(performance.now());
  if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 6 && performance.now() - tap.t < 350) { const hit = valley.pick(ndc(e.clientX, e.clientY), camera); if (hit) showCard(hit); else hideCard(); }
  tap = null;
};
canvas.addEventListener('pointerup', lift); canvas.addEventListener('pointercancel', lift);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { e.preventDefault(); view.begin(performance.now()); view.zoom(Math.exp(-e.deltaY * 0.0015)); view.release(performance.now()); }, { passive: false });
canvas.addEventListener('dblclick', (e) => { const p = valley.groundPoint(ndc(e.clientX, e.clientY), camera); if (p) view.flyTo(p, 90, performance.now()); });

// ---------- floating card ----------
const card = document.getElementById('card')!;
let anchor: (() => THREE.Vector3) | null = null;
let live: (() => string) | null = null;
function showCard(hit: Hit) {
  const text = describe(hit, valley, { plantedDaysAgo: (id) => { const i = valley.events.findIndex((ev) => ev.type === 'plant' ? ev.entity.id === id : ev.result.id === id); return i < 0 ? null : Math.max(1, (valley.events.length - i) * 2); } });
  card.innerHTML = `<div class="bubble"><button class="close" aria-label="Close">×</button><div class="eyebrow">${text.eyebrow}</div><div class="name">${text.name}</div>
    <div class="facts">${text.facts.join('<br>')}${text.live ? `<br><span class="live"></span>` : ''}</div>${text.noteKey ? '<label class="note">Your note<textarea placeholder="What did you focus on?" rows="2"></textarea></label>' : ''}</div><div class="stem"></div>`;
  const area = card.querySelector('textarea');
  if (area && text.noteKey) { area.value = localStorage.getItem(text.noteKey) ?? ''; area.addEventListener('input', () => localStorage.setItem(text.noteKey!, area.value)); }
  card.querySelector('.close')!.addEventListener('click', hideCard);
  anchor = hit.anchor; live = text.live ?? null;
  if (hit.kind === 'item') { const top = valley.heightOf(hit.placed.entity); view.flyTo(new THREE.Vector3(hit.placed.x, valley.groundAt(hit.placed.x, hit.placed.z) + top * 0.4, hit.placed.z), Math.max(150, top * 8), performance.now()); }
  card.classList.remove('show'); void card.offsetWidth; card.classList.add('show');
}
function hideCard() { card.classList.remove('show'); setTimeout(() => { if (!card.classList.contains('show')) anchor = null; }, 350); }
function positionCard() {
  if (!anchor) return;
  const box = canvas.getBoundingClientRect();
  const at = valley.project(anchor(), camera, box.width, box.height);
  card.style.visibility = at ? 'visible' : 'hidden';
  if (!at) return;
  const w = card.offsetWidth || 260, h = card.offsetHeight || 120, below = at.y - h - 18 < 70;
  card.classList.toggle('below', below);
  card.style.left = `${Math.max(w / 2 + 10, Math.min(box.width - w / 2 - 10, at.x))}px`; card.style.top = `${below ? at.y + 18 : at.y - 12}px`;
  if (live) { const el = card.querySelector('.live'); if (el) el.textContent = live(); }
}

// ---------- reveal ----------
function reveal(badge: string, title: string, sub: string) {
  const el = document.getElementById('reveal')!;
  el.innerHTML = `<div class="badge">${badge}</div><div class="title">${title}</div><div class="sub">${sub}</div>`;
  el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 4000);
}

// ---------- merge planner ----------
const planner = document.getElementById('planner')!;
let choice: Partial<Record<Level, number>> = {};
let cascade = true;
function openPlanner() { hideCard(); choice = Object.fromEntries(valley.mergeOptions().map((o) => [o.level, o.available])); renderPlanner(); planner.classList.add('show'); }
function renderPlanner() {
  const options = valley.mergeOptions();
  const plan = valley.planMerges(choice, cascade);
  const finals = new Set(plan.map((m) => m.result.id)); for (const m of plan) for (const id of m.ingredients) finals.delete(id);
  const made = new Map<Level, number>(); for (const m of plan) if (finals.has(m.result.id)) made.set(m.result.level, (made.get(m.result.level) ?? 0) + 1);
  planner.innerHTML = `<div class="head"><div><div class="eyebrow">Merge planner</div><div class="name">Grow your valley in one go</div></div><button class="close" aria-label="Close">×</button></div>
    ${options.map((o) => `<div class="option"><div><b>${o.need} ${levelInfo(o.level).name.toLowerCase()}s → ${levelInfo(o.next).name.toLowerCase()}</b><small>${o.available} possible</small></div>
      <div class="stepper"><button data-level="${o.level}" data-step="-1" aria-label="Fewer">−</button><span>${Math.min(choice[o.level] ?? 0, o.available)}</span><button data-level="${o.level}" data-step="1" aria-label="More">+</button></div></div>`).join('')}
    <label class="cascade"><input type="checkbox" ${cascade ? 'checked' : ''}> Keep merging upward with the new ones</label>
    <div class="actions"><button class="all">Everything</button><button class="go" ${plan.length ? '' : 'disabled'}>Merge ${plan.length}</button></div>
    <div class="preview">${plan.length ? `You end up with ${[...made.entries()].sort((a, b) => b[0] - a[0]).map(([l, n]) => `${n} ${levelInfo(l).name.toLowerCase()}${n > 1 ? 's' : ''}`).join(', ')}.` : 'Choose what to merge.'}</div>`;
  planner.querySelector('.close')!.addEventListener('click', () => planner.classList.remove('show'));
  planner.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((b) => b.onclick = () => {
    const level = Number(b.dataset.level) as Level, max = options.find((o) => o.level === level)!.available;
    choice[level] = Math.max(0, Math.min(max, Math.min(max, choice[level] ?? 0) + Number(b.dataset.step))); renderPlanner();
  });
  planner.querySelector<HTMLInputElement>('.cascade input')!.onchange = (e) => { cascade = (e.target as HTMLInputElement).checked; renderPlanner(); };
  planner.querySelector<HTMLButtonElement>('.all')!.onclick = () => { choice = Object.fromEntries(options.map((o) => [o.level, Infinity])); renderPlanner(); };
  planner.querySelector<HTMLButtonElement>('.go')!.onclick = () => {
    planner.classList.remove('show');
    if (plan.length === 1) mergeOne(plan[0]); else { valley.renew(plan, performance.now()); view.frame(valley.radius, performance.now()); }
  };
}
function mergeOne(merge = valley.nextMerge()) {
  if (!merge) return;
  hideCard();
  const centre = valley.mergeOne(merge, performance.now());
  if (centre) view.flyTo(centre.clone().setY(centre.y + 12), 200, performance.now(), 700);
}

// ---------- dock and the demo session ----------
const dock = document.getElementById('dock')!;
let chosen: SpeciesKey = 'oak';
let units = 3;
let clock = '';
let timer = 0;
function renderDock() {
  const growing = valley.growing;
  if (growing) {
    dock.innerHTML = `<div class="growing"><div class="eyebrow">Growing your ${levelInfo(growing.entity.level).name.toLowerCase()} · ${Math.round(growing.progress * 100)}%</div>
      <div class="clock">${clock}</div><button class="ghost" id="giveup">Give up</button></div>`;
    document.getElementById('giveup')!.onclick = () => finish(false);
    return;
  }
  const level = levelForUnits(units)!, minutes = Math.round((units * 512) / 60);
  const possible = busy ? 0 : valley.mergeOptions().reduce((n, o) => n + o.available, 0);
  dock.innerHTML = `<div class="styles">${STYLES.map((s) => `<button class="style ${s === chosen ? 'on' : ''}" data-key="${s}"><i style="background:${STYLE_LEAF[s]}"></i>${STYLE_NAME[s]}</button>`).join('')}</div>
    <div class="row"><button class="length" id="length"><span class="mins">${String(minutes).padStart(2, '0')}:00</span><span class="grows">grows a ${levelInfo(level).name.toLowerCase()}<br><small>tap to change · max 1 h</small></span></button>
    <button class="plant" id="plant">Plant</button></div>
    ${possible === 1 ? '<button class="merge" id="merge">✦ Merge</button>' : possible > 1 ? `<button class="merge" id="planner-open">✦ Merge… ${possible} merges possible</button>` : ''}`;
  dock.querySelectorAll<HTMLButtonElement>('.style').forEach((b) => { b.onclick = () => { chosen = b.dataset.key as SpeciesKey; renderDock(); }; });
  document.getElementById('length')!.onclick = () => { units = units === 1 ? 3 : units === 3 ? 5 : units === 5 ? 7 : 1; renderDock(); };
  document.getElementById('plant')!.onclick = plantNow;
  document.getElementById('merge')?.addEventListener('click', () => mergeOne());
  document.getElementById('planner-open')?.addEventListener('click', openPlanner);
}
function plantNow() {
  hideCard();
  const entity: ValleyEntity = { id: `new-${Date.now()}`, level: levelForUnits(units)!, style: chosen, seed: Math.floor(rand() * 1e6) };
  valley.setGrowing({ entity, progress: 0.04 });
  const spot = valley.placed.find((p) => p.id === entity.id)!;
  view.flyTo(new THREE.Vector3(spot.x, valley.groundAt(spot.x, spot.z), spot.z), 120, performance.now());
  const start = performance.now(), length = 24000, minutes = (units * 512) / 60;
  clearInterval(timer);
  timer = window.setInterval(() => {
    const p = Math.min(1, (performance.now() - start) / length), left = Math.ceil((1 - p) * minutes * 60);
    clock = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
    valley.setDaylight(p); setSky();
    const stepped = Math.max(0.04, Math.floor(p * 16) / 16);
    if (valley.growing && stepped !== valley.growing.progress) valley.setGrowing({ entity, progress: stepped });
    renderDock();
    if (p >= 1) finish(true);
  }, 250);
  renderDock();
}
function finish(grown: boolean) {
  clearInterval(timer);
  const entity = valley.growing?.entity;
  valley.setGrowing(null);
  if (entity && grown) valley.setHistory([...valley.events, { type: 'plant', entity }]);
  renderDock();
  toast(grown ? 'It joined your valley' : 'It withered');
  setTimeout(() => { valley.setDaylight(0); setSky(); view.frame(valley.radius, performance.now()); }, 2200);
}
function toast(text: string) { const t = document.getElementById('toast')!; t.textContent = text; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2000); }

document.querySelectorAll<HTMLButtonElement>('[data-age]').forEach((b) => {
  b.classList.toggle('on', Number(b.dataset.age) === (INIT.age ?? 10));
  b.onclick = () => {
    document.querySelectorAll('[data-age]').forEach((o) => o.classList.remove('on')); b.classList.add('on');
    clearInterval(timer); valley.setGrowing(null); hideCard();
    valley.setHistory(history(Number(b.dataset.age))); setSky(); view.frame(valley.radius, performance.now()); renderDock();
  };
});
document.querySelectorAll<HTMLButtonElement>('[data-season]').forEach((b) => {
  b.classList.toggle('on', b.dataset.season === valley.season);
  b.onclick = () => { document.querySelectorAll('[data-season]').forEach((o) => o.classList.remove('on')); b.classList.add('on'); valley.setSeason(b.dataset.season as Season); };
});

// ---------- frame loop ----------
let last = performance.now(), frames = 0, fpsAt = performance.now(), worst = 0;
function tick(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); worst = Math.max(worst, now - last); last = now;
  view.limits.bounds = valley.radius;
  view.update(now, dt);
  valley.update(now, dt, camera);
  if (valley.shadowsDirty) { renderer.shadowMap.needsUpdate = true; valley.shadowsDirty = false; }
  positionCard();
  renderer.render(valley.scene, camera);
  frames++;
  if (now - fpsAt > 1000) { document.getElementById('fps')!.textContent = `${frames} fps · worst frame ${Math.round(worst)} ms${LOW_POWER ? ' · low power' : ''}`; frames = 0; worst = 0; fpsAt = now; }
  requestAnimationFrame(tick);
}

setSky();
view.limits.bounds = valley.radius;
view.distance = 260 + valley.radius * 4.2;
renderDock();
if (INIT.planner) openPlanner();
if (INIT.card) { const building = valley.placed.find((p) => p.entity.level >= 5) ?? valley.placed[0]; const hit = building && valley.pick(new THREE.Vector2(0, 0), camera); if (building) showCard(hit && hit.kind === 'item' ? hit : { kind: 'item', placed: building, anchor: () => new THREE.Vector3(building.x, valley.groundAt(building.x, building.z) + valley.heightOf(building.entity) + 2, building.z) }); }
requestAnimationFrame(tick);

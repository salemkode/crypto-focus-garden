/**
 * The valley engine side: one canvas, the three.js scene, the camera, touch, and everything that
 * happens inside the 3D world. It talks to the app only through messages (see protocol.ts), so it
 * runs unchanged in a web page and inside the iOS/Android WebView (where JavaScript has a JIT and
 * WebGL runs on the GPU).
 */
import * as THREE from 'three';
import { ValleyCamera } from '@focus-garden/garden/camera';
import { describe, type CardText } from '@focus-garden/garden/describe';
import { ValleyScene, type Hit, type SceneEvent } from '@focus-garden/garden/scene';
import { seasonFor } from '@focus-garden/garden/season';
import type { ValleyEntity, ValleyEvent } from '@focus-garden/garden/valley';
import type { FromValley, ToValley } from './protocol';
import { createPacer, shouldStep } from './filament/pacing';

const signature = (events: readonly ValleyEvent[]) => events.map((e) => (e.type === 'plant' ? e.entity.id : `${e.result.id}<${e.ingredients.join(',')}`)).join('|');
const CARD_WIDTH = 248;

type History = Extract<ToValley, { type: 'history' }>;

export function startValley(canvas: HTMLCanvasElement, send: (message: FromValley) => void) {
  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 5000);
  const view = new ValleyCamera(camera);
  const size = { width: 1, height: 1 };
  const insets = { top: 0, bottom: 0 };
  let renderer: THREE.WebGLRenderer | null = null;
  let valley: ValleyScene | null = null;
  let busy = false;
  let pending: History | null = null;
  let plantedAt: Record<string, number> = {};
  let framed = false;
  let shownGrowing: string | null = null;
  let hit: Hit | null = null;
  let card: CardText | null = null;
  let lastAnchor = { x: -1, y: -1, visible: false };
  let lastLive = '', liveAt = 0;
  let paused = false;

  // ------------------------------------------------------------------ scene

  function onEvent(event: SceneEvent) {
    if (event.type === 'busy') {
      busy = event.busy;
      send({ type: 'busy', busy });
      if (!busy && pending) { const next = pending; pending = null; applyHistory(next); }
    }
    if (event.type === 'reveal') { send({ type: 'reveal', entity: event.entity, ingredients: event.ingredients }); send({ type: 'haptic', kind: 'success' }); }
    if (event.type === 'summary') { send({ type: 'summary', merges: event.plan.length, made: event.made, villagers: event.villagers }); send({ type: 'haptic', kind: 'success' }); }
  }

  function init(seed: number, low: boolean, season = seasonFor(new Date())) {
    renderer?.dispose();
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(low ? 1.5 : 2, window.devicePixelRatio || 1));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
    renderer.setClearColor(0x000000, 0);
    valley = new ValleyScene({ seed, lowPower: low, onEvent });
    valley.season = season;
    valley.buildWeather();
    framed = false; shownGrowing = null; busy = false; pending = null;
    closeCard();
    resize();
  }

  function applyHistory(message: History) {
    if (!valley) return;
    if (busy) { pending = message; return; }
    plantedAt = message.plantedAt;
    const { history, growing } = message;
    if (signature(history) !== signature(valley.events) || !framed) {
      valley.growing = growing;
      valley.setHistory(history);
    } else valley.setGrowing(growing);
    if (!framed) { framed = true; view.frame(valley.radius, performance.now()); }
    const growingId = growing?.entity.id ?? null;
    if (growingId && shownGrowing !== growingId) {
      closeCard();
      const spot = valley.placed.find((p) => p.id === growingId);
      if (spot) view.flyTo(new THREE.Vector3(spot.x, valley.groundAt(spot.x, spot.z), spot.z), 130, performance.now(), 1200);
    }
    if (!growingId && shownGrowing) view.frame(valley.radius, performance.now());
    shownGrowing = growingId;
  }

  function merge(plan: Extract<ToValley, { type: 'merge' }>['plan']) {
    if (!valley || !plan.length || valley.busy) return;
    closeCard();
    send({ type: 'haptic', kind: 'heavy' });
    if (plan.length === 1) {
      const centre = valley.mergeOne(plan[0], performance.now());
      if (centre) view.flyTo(centre.clone().setY(centre.y + 12), 200, performance.now(), 700);
    } else {
      valley.renew(plan, performance.now());
      view.frame(valley.radius, performance.now());
    }
  }

  // ------------------------------------------------------------------ cards

  function closeCard() {
    if (!hit && !card) return;
    hit = null; card = null; lastAnchor = { x: -1, y: -1, visible: false };
    send({ type: 'card', card: null });
  }

  function focusCard() {
    if (!valley || !hit) return;
    if (hit.kind === 'item') {
      const p = hit.placed, top = valley.heightOf(p.entity);
      view.flyTo(new THREE.Vector3(p.x, valley.groundAt(p.x, p.z) + top * 0.4, p.z), Math.max(150, top * 8), performance.now());
    } else view.flyTo(hit.anchor(), 120, performance.now());
  }

  const ndc = (x: number, y: number) => new THREE.Vector2((x / size.width) * 2 - 1, -(y / size.height) * 2 + 1);

  function tap(x: number, y: number) {
    if (!valley || valley.busy) return;
    const found = valley.pick(ndc(x, y), camera);
    if (!found || (found.kind === 'ground' && hit)) { closeCard(); return; }
    hit = found;
    card = describe(found, valley, { plantedDaysAgo: (id) => (plantedAt[id] === undefined ? null : Math.floor((Date.now() - plantedAt[id]) / 86_400_000)) });
    lastLive = card.live?.() ?? '';
    send({ type: 'haptic', kind: 'selection' });
    send({ type: 'card', card: { key: `${found.kind}:${Date.now()}`, eyebrow: card.eyebrow, name: card.name, facts: card.facts, noteKey: card.noteKey, live: lastLive || undefined } });
    sendAnchor(true);
  }

  function doubleTap(x: number, y: number) {
    const point = valley?.groundPoint(ndc(x, y), camera);
    if (point) view.flyTo(point, 90, performance.now());
  }

  /** Where the open card points, in view points. Sent only when it moves. */
  function sendAnchor(force = false) {
    if (!valley || !hit) return;
    const p = valley.project(hit.anchor(), camera, size.width, size.height);
    const visible = Boolean(p && p.y > insets.top + 40 && p.y < size.height - insets.bottom && p.x > -40 && p.x < size.width + 40);
    const x = p ? Math.min(size.width - CARD_WIDTH / 2 - 8, Math.max(CARD_WIDTH / 2 + 8, p.x)) : lastAnchor.x;
    const y = p ? p.y : lastAnchor.y;
    if (force || visible !== lastAnchor.visible || Math.abs(x - lastAnchor.x) > 0.3 || Math.abs(y - lastAnchor.y) > 0.3) {
      lastAnchor = { x, y, visible };
      send({ type: 'anchor', x, y, visible });
    }
  }

  // ------------------------------------------------------------------ size and touch

  function resize() {
    const box = canvas.getBoundingClientRect();
    // Inside a WebView the page can be measured before the view has its real size; the canvas
    // always fills the page there, so the window size is the fallback.
    size.width = Math.max(1, box.width > 2 ? box.width : window.innerWidth);
    size.height = Math.max(1, box.height > 2 ? box.height : window.innerHeight);
    renderer?.setSize(size.width, size.height, false);
    camera.aspect = size.width / size.height; camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  window.addEventListener('resize', resize);

  const pointers = new Map<number, { x: number; y: number }>();
  let tapStart: { x: number; y: number; t: number } | null = null;
  let lastTapAt = 0;
  let last2: { midY: number; distance: number; angle: number } | null = null;
  const local = (e: PointerEvent | MouseEvent) => { const box = canvas.getBoundingClientRect(); return { x: e.clientX - box.left, y: e.clientY - box.top }; };
  const pair = () => { const [a, b] = [...pointers.values()]; return { midY: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x) }; };
  const down = (e: PointerEvent) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, local(e)); view.begin(performance.now());
    tapStart = pointers.size === 1 ? { ...local(e), t: performance.now() } : null;
    if (pointers.size === 2) last2 = pair();
  };
  const move = (e: PointerEvent) => {
    const prev = pointers.get(e.pointerId); if (!prev) return;
    e.preventDefault();
    const at = local(e); pointers.set(e.pointerId, at);
    if (pointers.size === 1) {
      if (e.buttons & 2) { view.rotate((at.x - prev.x) * 0.006); view.tilt((at.y - prev.y) * 0.004); }
      else view.pan(at.x - prev.x, at.y - prev.y, size.height);
    } else if (pointers.size === 2 && last2) {
      const now = pair();
      const delta = now.angle - last2.angle;
      view.zoom(now.distance / Math.max(1, last2.distance)); view.rotate(Math.atan2(Math.sin(delta), Math.cos(delta))); view.tilt((now.midY - last2.midY) * 0.004);
      last2 = now; tapStart = null;
    }
  };
  const up = (e: PointerEvent) => {
    const at = local(e);
    pointers.delete(e.pointerId); if (pointers.size < 2) last2 = null;
    if (pointers.size === 0) view.release(performance.now());
    const now = performance.now();
    if (tapStart && Math.hypot(at.x - tapStart.x, at.y - tapStart.y) < 8 && now - tapStart.t < 350) {
      if (now - lastTapAt < 300) doubleTap(at.x, at.y); else tap(at.x, at.y);
      lastTapAt = now;
    }
    tapStart = null;
  };
  const wheel = (e: WheelEvent) => { e.preventDefault(); view.begin(performance.now()); view.zoom(Math.exp(-e.deltaY * 0.0015)); view.release(performance.now()); };
  const block = (e: Event) => e.preventDefault();
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false }); canvas.addEventListener('contextmenu', block);

  // ------------------------------------------------------------------ frame loop

  let frame = 0, lastFrame = performance.now(), statsAt = performance.now(), frames = 0, spent = 0;
  // The same pacing as the native valley (filament/pacing.ts): full rate only while something moves
  // on purpose, 30 fps otherwise. A browser tab drawing 120 Hz all session heats a phone or laptop too.
  const pacer = createPacer();
  const loop = (now: number) => {
    frame = requestAnimationFrame(loop);
    if (paused || !valley || !renderer) return;
    if (!shouldStep(pacer, now, view.moving || valley.busy)) return;
    const started = performance.now();
    const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
    view.limits.bounds = valley.radius;
    view.update(now, dt);
    valley.update(now, dt, camera);
    if (valley.shadowsDirty) { renderer.shadowMap.needsUpdate = true; valley.shadowsDirty = false; }
    renderer.render(valley.scene, camera);
    if (hit) {
      sendAnchor();
      if (card?.live && now - liveAt > 600) { liveAt = now; const text = card.live(); if (text !== lastLive) { lastLive = text; send({ type: 'live', text }); } }
    }
    frames++; spent += performance.now() - started;
    if (now - statsAt > 5000) {
      send({ type: 'stats', fps: Math.round((frames * 1000) / (now - statsAt)), frameMs: Math.round((spent / frames) * 10) / 10, width: canvas.width, height: canvas.height, layout: `window ${window.innerWidth}x${window.innerHeight}, html ${document.documentElement.clientWidth}x${document.documentElement.clientHeight}, box ${Math.round(canvas.getBoundingClientRect().width)}x${Math.round(canvas.getBoundingClientRect().height)}, size ${size.width}x${size.height}` });
      if (canvas.height < 4) resize();
      statsAt = now; frames = 0; spent = 0;
    }
  };
  frame = requestAnimationFrame(loop);

  function receive(message: ToValley) {
    try {
      if (message.type === 'init') init(message.seed, message.lowPower, message.season);
      else if (message.type === 'history') applyHistory(message);
      else if (message.type === 'merge') merge(message.plan);
      else if (message.type === 'insets') { insets.top = message.top; insets.bottom = message.bottom; }
      else if (message.type === 'closeCard') closeCard();
      else if (message.type === 'focusCard') focusCard();
      else if (message.type === 'pause') { paused = message.paused; lastFrame = performance.now(); }
      else if (message.type === 'camera') {
        const now = performance.now();
        if (message.begin) view.begin(now);
        if (message.pan) view.pan(message.pan[0], message.pan[1], size.height);
        if (message.zoom) view.zoom(message.zoom);
        if (message.rotate) view.rotate(message.rotate);
        if (message.tilt) view.tilt(message.tilt);
        if (message.release) view.release(now);
      }
      else if (message.type === 'tap') { if (message.double) doubleTap(message.x, message.y); else tap(message.x, message.y); }
    } catch (error) {
      send({ type: 'error', message: String((error as Error)?.stack ?? error) });
    }
  }

  return {
    receive,
    stop() {
      cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('contextmenu', block);
      renderer?.dispose();
    },
    /** Debug builds: the live engine, for inspection from a debugger. */
    debug: () => ({ valley, view, camera, size }),
  };
}

export type ValleyController = ReturnType<typeof startValley>;
export type { ValleyEntity };

/**
 * The valley engine for the native renderer: the same world, camera, cards, taps and merges as the
 * web controller (../controller.ts), without a canvas. The three.js scene is never drawn here; the
 * host mirrors it into Filament (see mirror.ts) and drives `step` from its frame loop.
 *
 * Keep the message handling in step with controller.ts: both speak protocol.ts, so ValleyView
 * cannot tell them apart.
 */
import * as THREE from 'three';
import { ValleyCamera } from '@focus-garden/garden/camera';
import { describe, type CardText } from '@focus-garden/garden/describe';
import { ValleyScene, type Hit, type SceneEvent } from '@focus-garden/garden/scene';
import { seasonFor } from '@focus-garden/garden/season';
import type { ValleyEvent } from '@focus-garden/garden/valley';
import type { FromValley, ToValley } from '../protocol';

const signature = (events: readonly ValleyEvent[]) => events.map((e) => (e.type === 'plant' ? e.entity.id : `${e.result.id}<${e.ingredients.join(',')}`)).join('|');
const CARD_WIDTH = 248;

type History = Extract<ToValley, { type: 'history' }>;

export function createValleyEngine(send: (message: FromValley) => void) {
  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 5000);
  const view = new ValleyCamera(camera);
  const size = { width: 1, height: 1 };
  const insets = { top: 0, bottom: 0 };
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
    // lean: Filament draws every instance separately, so particles are batched or fewer (see SceneOptions).
    valley = new ValleyScene({ seed, lowPower: low, lean: true, onEvent });
    valley.season = season;
    valley.buildWeather();
    framed = false; shownGrowing = null; busy = false; pending = null;
    closeCard();
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

  function receive(message: ToValley) {
    try {
      if (message.type === 'init') init(message.seed, message.lowPower, message.season);
      else if (message.type === 'history') applyHistory(message);
      else if (message.type === 'merge') merge(message.plan);
      else if (message.type === 'insets') { insets.top = message.top; insets.bottom = message.bottom; }
      else if (message.type === 'closeCard') closeCard();
      else if (message.type === 'focusCard') focusCard();
      else if (message.type === 'pause') paused = message.paused;
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
    camera,
    get scene() { return valley?.scene ?? null; },
    get sun() { return valley?.sun ?? null; },
    get paused() { return paused; },
    /** Moving on purpose (finger, fly-to, glide, ceremony): draw at full rate. See pacing.ts. */
    get lively() { return view.moving || Boolean(valley?.busy); },
    resize(width: number, height: number) {
      size.width = Math.max(1, width); size.height = Math.max(1, height);
      camera.aspect = size.width / size.height; camera.updateProjectionMatrix();
    },
    /** Advances the camera and the world by one frame. */
    step(now: number, dt: number) {
      if (!valley) return;
      view.limits.bounds = valley.radius;
      view.update(now, dt);
      valley.update(now, dt, camera);
      if (hit) {
        sendAnchor();
        if (card?.live && now - liveAt > 600) { liveAt = now; const text = card.live(); if (text !== lastLive) { lastLive = text; send({ type: 'live', text }); } }
      }
    },
    debug: () => ({ valley, view, camera, size }),
  };
}

export type ValleyEngine = ReturnType<typeof createValleyEngine>;

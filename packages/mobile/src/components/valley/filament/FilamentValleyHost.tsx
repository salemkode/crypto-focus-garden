/**
 * The valley on iOS and Android, drawn by Filament.
 *
 * Threads:
 * - JS thread: the valley engine (three.js scene graph, camera maths, picking, cards) steps once per
 *   animation frame, then the mirror sends what moved to Filament in one batched call.
 * - Filament's render thread: draws at the display's rate (120 Hz on ProMotion / high-refresh
 *   Android) and counts frames for the on-screen FPS figure.
 *
 * Compiled with the worklets-core Babel plugin (see babel.config.js): the render callback is a
 * worklets-core worklet, not a Reanimated one.
 */
import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import * as THREE from 'three';
import { PixelRatio, Platform, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { EnvironmentalLight, FilamentScene, FilamentView, Light, useFilamentContext, type FrameInfo } from 'react-native-filament';
import { FilamentProxy } from 'react-native-filament/src/native/FilamentProxy';
import { Worklets } from 'react-native-worklets-core';
import type { FromValley, ToValley, ValleyHostHandle } from '../protocol';
import { valleyResponder } from '../WebViewValleyHost';
import { createValleyEngine, type ValleyEngine } from './engine';
import { SceneMirror, type MirrorAsset, type MirrorBackend } from './mirror';
import { createPacer, IDLE_FPS, isFullRate, shouldStep } from './pacing';

type Props = { ref: Ref<ValleyHostHandle>; onMessage: (message: FromValley) => void; onFailure: (error: unknown) => void };

/** Rendered pixels per point, at most: dynamic resolution never goes above this. */
const MAX_PIXEL_RATIO = 2;
/** Frames slower than this count against the 1% low (90 FPS). */
const SLOW_FRAME_MS = 1000 / 90;
/** The on-screen FPS overlay: debug builds, or release builds bundled with EXPO_PUBLIC_VALLEY_STATS=1 (device measurements). */
// Opt-in only (EXPO_PUBLIC_VALLEY_STATS=1): the overlay covered the wallet button in every dev build.
const SHOW_STATS = process.env.EXPO_PUBLIC_VALLEY_STATS === '1';

/** Rendered pixels per point at most: dynamic resolution scales the view between 60% and 100% of this. */
const RESOLUTION_CAP = Math.min(1, MAX_PIXEL_RATIO / PixelRatio.get());

export function FilamentValleyHost(props: Props) {
  // FXAA instead of MSAA; dynamic resolution keeps the frame inside its budget, capped at MAX_PIXEL_RATIO.
  return <FilamentScene
    antiAliasing="FXAA"
    postProcessing
    shadowing
    // Dynamic resolution exists only on Android in Filament; on iOS the patched view caps the drawable at 2x.
    dynamicResolutionOptions={Platform.OS === 'android' ? { enabled: true, homogeneousScaling: true, minScale: [RESOLUTION_CAP * 0.6, RESOLUTION_CAP * 0.6], maxScale: [RESOLUTION_CAP, RESOLUTION_CAP], quality: 'MEDIUM' } : undefined}
  >
    <Valley {...props} />
  </FilamentScene>;
}

function Valley({ ref, onMessage, onFailure }: Props) {
  const context = useFilamentContext();
  const { camera, choreographer } = context;
  const handler = useRef(onMessage);
  useEffect(() => { handler.current = onMessage; }, [onMessage]);
  const send = useCallback((message: FromValley) => handler.current(message), []);

  // The engine only stores `send` and calls it from messages and the frame loop, never during
  // render; the compiler cannot see that through the factory, so this line opts out of the refs rule.
  // eslint-disable-next-line react-hooks/refs
  const valley = useMemo(() => createValleyEngine(send), [send]);
  const backend = useMemo(() => filamentBackend(context, onFailure), [context, onFailure]);
  const mirror = useMemo(() => new SceneMirror(backend), [backend]);
  useEffect(() => () => mirror.dispose(), [mirror]);
  // Off screen (another tab, a covering screen, the background) the display link stops too.
  const [paused, setPaused] = useState(false);
  useImperativeHandle(ref, () => ({
    post: (message: ToValley) => {
      // A pause is not a slow frame: frame timing starts again after it.
      if (message.type === 'pause') { setPaused(message.paused); counters.lastAt.value = 0; }
      valley.receive(message);
    },
  }), [valley]);

  const jsTime = useRef({ total: 0, frames: 0, sent: 0 });
  useEffect(() => {
    let since = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(), seconds = (now - since) / 1000;
      const { frames: n, ticks, slow: s, worst: w } = takeFrameCounts(); since = now;
      const js = jsTime.current; const jsMs = js.frames ? js.total / js.frames : 0;
      const next = { fps: Math.round(n / seconds), hz: Math.round(ticks / seconds), slow: n ? Math.round((s / n) * 1000) / 10 : 0, worst: Math.round(w * 10) / 10, js: Math.round(jsMs * 10) / 10, sent: js.frames ? Math.round(js.sent / js.frames) : 0 };
      jsTime.current = { total: 0, frames: 0, sent: 0 };
      if (SHOW_STATS) showStats(next);
      send({ type: 'stats', fps: next.fps, frameMs: next.js, width: 0, height: 0, layout: `filament: display ${next.hz} Hz, slow ${next.slow}% worst ${next.worst} ms, ${next.sent} transforms/frame` });
    }, 1000);
    return () => clearInterval(timer);
  }, [send]);

  // The JS frame loop: step the world, mirror it, place the camera, then let Filament draw it.
  // Paced (pacing.ts): full rate while the valley moves on purpose, IDLE_FPS otherwise.
  useEffect(() => {
    let frame = 0, last = performance.now();
    const pacer = createPacer();
    let displayRate: number | null = null;
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (valley.paused) { last = now; return; }
      if (!shouldStep(pacer, now, valley.lively)) return;
      const started = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      try {
        valley.step(now, dt);
        const world = valley.scene;
        if (world) jsTime.current.sent += mirror.sync(world, now);
        placeCamera(valley, camera);
        const full = isFullRate(pacer, now);
        const rate = full ? 0 : IDLE_FPS;
        if (rate !== displayRate) {
          // Idle, the display link itself slows to IDLE_FPS, so the screen and CPU stop waking at
          // 120 Hz for frames that are skipped anyway (iOS; elsewhere a no-op or absent).
          displayRate = rate;
          choreographer.setFrameRate?.(rate);
        }
        counters.full.value = full;
        counters.produced.value += 1;
      } catch (error) { onFailure(error); cancelAnimationFrame(frame); return; }
      jsTime.current.total += performance.now() - started; jsTime.current.frames += 1;
    };
    frame = requestAnimationFrame(loop);
    send({ type: 'ready' });
    return () => cancelAnimationFrame(frame);
  }, [valley, mirror, camera, choreographer, send, onFailure]);

  const touch = useMemo(() => valleyResponder(valley.receive), [valley]);
  const layout = useCallback((event: LayoutChangeEvent) => { const { width, height } = event.nativeEvent.layout; valley.resize(width, height); }, [valley]);
  const sun = useMemo(() => sunOf(valley), [valley]);

  return <View style={styles.fill} onLayout={layout}>
    <FilamentView style={styles.fill} renderCallback={drawIfNew} paused={paused} enableTransparentRendering />
    <Lights intensity={sun.intensity} direction={sun.direction} />
    <View style={styles.fill} {...touch.panHandlers} accessible accessibilityLabel="Your valley. Drag to travel, pinch to zoom, two fingers to turn." />
    {SHOW_STATS ? <StatsOverlay /> : null}
  </View>;
}

const IBL = { uri: 'RNF_default_env_ibl.ktx' };

/**
 * Memoised: Filament's EnvironmentalLight sets the light on every render and releases its buffer
 * after the first, so it must render exactly once.
 */
const Lights = memo(function Lights({ intensity, direction }: { intensity: number; direction: [number, number, number] }) {
  return <>
    <EnvironmentalLight source={IBL} intensity={22_000} />
    <Light type="directional" intensity={intensity} colorKelvin={5_200} direction={direction} castShadows />
  </>;
});

type Stats = { fps: number; hz: number; slow: number; worst: number; js: number; sent: number };
let showStats: (stats: Stats) => void = () => {};

/** Frames per second and frame times, updated once a second without re-rendering the valley. */
function StatsOverlay() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => { showStats = setStats; return () => { showStats = () => {}; }; }, []);
  if (!stats) return null;
  return <Text pointerEvents="none" style={styles.stats}>{`${stats.fps} fps @ ${stats.hz} Hz · slow ${stats.slow}% · worst ${stats.worst} ms · js ${stats.js} ms · ${stats.sent} tx`}</Text>;
}

/**
 * Shared between the JS thread and Filament's render thread (one valley is shown at a time):
 * `produced` counts frames the JS side has finished, `drawn` the last one Filament drew, `full` is
 * whether the valley runs at full rate; the rest are frame statistics (slow and worst frames are
 * measured only at full rate, where every display tick should draw).
 */
const counters = { produced: Worklets.createSharedValue(0), drawn: Worklets.createSharedValue(0), full: Worklets.createSharedValue(false), ticks: Worklets.createSharedValue(0), frames: Worklets.createSharedValue(0), slow: Worklets.createSharedValue(0), worst: Worklets.createSharedValue(0), lastAt: Worklets.createSharedValue(0) };

/**
 * Runs on the render thread once per display tick. Everything Filament shows (transforms, camera,
 * loads) comes from the JS frame loop, so a tick with no new JS frame would draw the same picture
 * again: skip it (the patched FilamentView skips drawing when this returns false).
 */
function drawIfNew(info: FrameInfo) {
  'worklet';
  counters.ticks.value += 1;
  const produced = counters.produced.value;
  if (produced === counters.drawn.value) return false;
  counters.drawn.value = produced;
  const at = info.timestamp / 1e6;
  counters.frames.value += 1;
  if (counters.full.value && counters.lastAt.value > 0) {
    const interval = at - counters.lastAt.value;
    if (interval > SLOW_FRAME_MS) counters.slow.value += 1;
    if (interval > counters.worst.value) counters.worst.value = interval;
  }
  counters.lastAt.value = counters.full.value ? at : 0;
  return true;
}

/** Reads and resets the frame counters (JS thread). */
function takeFrameCounts() {
  const counts = { frames: counters.frames.value, ticks: counters.ticks.value, slow: counters.slow.value, worst: counters.worst.value };
  counters.frames.value = 0; counters.ticks.value = 0; counters.slow.value = 0; counters.worst.value = 0;
  return counts;
}

/** The three.js camera, copied to Filament. */
function placeCamera(valley: ValleyEngine, camera: ReturnType<typeof useFilamentContext>['camera']) {
  const c = valley.camera;
  const eye = c.position, look = c.getWorldDirection(scratch.direction), up = scratch.up.copy(c.up).applyQuaternion(c.quaternion);
  camera.lookAt([eye.x, eye.y, eye.z], [eye.x + look.x, eye.y + look.y, eye.z + look.z], [up.x, up.y, up.z]);
  // The native method takes the FOV direction as a fifth argument (its C++ default does not apply
  // through JSI, and the TypeScript type omits it). three.js FOV is vertical.
  (camera.setProjection as (fov: number, aspect: number, near: number, far: number, direction: 'vertical' | 'horizontal') => void)(c.fov, c.aspect, c.near, c.far, 'vertical');
}
const scratch = { direction: new THREE.Vector3(), up: new THREE.Vector3() };

/** The scene's sun as a Filament directional light (it is set once, at the start of the day). */
function sunOf(valley: ValleyEngine) {
  const sun = valley.sun;
  if (!sun) return { direction: [-0.5, -0.8, -0.3] as [number, number, number], intensity: 110_000 };
  const d = sun.target.position.clone().sub(sun.position).normalize();
  return { direction: [d.x, d.y, d.z] as [number, number, number], intensity: Math.round((sun.intensity / 3.2) * 110_000) };
}

/**
 * Loads mirrored meshes into Filament: .glb bytes → cache file → FilamentBuffer → instanced asset.
 * Engine, scene and renderable calls run on Filament's thread (its job system only accepts that
 * thread), like react-native-filament's own useModel; transforms are set from the JS thread.
 */
function filamentBackend(context: ReturnType<typeof useFilamentContext>, onFailure: (error: unknown) => void): MirrorBackend {
  const { engine, scene, transformManager, renderableManager, workletContext } = context;
  // worklets-core's runAsync returns a thenable without .catch.
  const onFilamentThread = (work: () => void) => { Promise.resolve(workletContext.runAsync(work)).catch(onFailure); };
  let counter = 0;
  return {
    async load(glb, key, instances) {
      const file = new File(Paths.cache, `valley-${hash(key)}-${counter++}.glb`);
      try {
        await file.write(glb);
        const buffer = await FilamentProxy.loadAsset(file.uri);
        const { asset, roots, renderables } = await workletContext.runAsync(() => {
          'worklet';
          const loaded = engine.loadInstancedAsset(buffer, instances);
          buffer.release();
          loaded.releaseSourceData();
          scene.addAssetEntities(loaded);
          return { asset: loaded, roots: loaded.getAssetInstances().map((instance) => instance.getRoot()), renderables: loaded.getRenderableEntities() };
        });
        const handle: MirrorAsset = {
          roots,
          setOpacity: (alpha) => { onFilamentThread(() => { 'worklet'; renderableManager.setAssetEntitiesOpacity(asset, alpha); }); },
          setShadows: (cast, receive) => {
            onFilamentThread(() => {
              'worklet';
              for (const entity of renderables) { renderableManager.setCastShadow(entity, cast); renderableManager.setReceiveShadow(entity, receive); }
            });
          },
          release: () => { onFilamentThread(() => { 'worklet'; scene.removeAssetEntities(asset); asset.release(); }); },
        };
        return handle;
      } catch (error) {
        onFailure(error);
        throw error;
      } finally {
        try { file.delete(); } catch { /* already gone */ }
      }
    },
    setTransforms(entities, matrices) {
      transformManager.setTransforms(entities as Parameters<typeof transformManager.setTransforms>[0], matrices);
    },
  };
}

function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

const styles = StyleSheet.create({
  fill: StyleSheet.absoluteFill,
  stats: { position: 'absolute', top: 54, left: 12, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 11, fontVariant: ['tabular-nums'] },
});

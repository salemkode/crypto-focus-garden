import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { PixelRatio, Platform, View } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';
import { buildItem, createStage, frame, framingGeometry, specKey, type ItemSpec } from '../features/three/scene';

/** Icon renders: one 3/4 view per item. */
const ICON_POINTS = 128;
/** Turntable renders: TURN_FRAMES views around the item, laid out as a TURN_COLUMNS-wide sheet. */
const TURN_FRAMES = 24;
const TURN_COLUMNS = 6;
const TURN_ROWS = TURN_FRAMES / TURN_COLUMNS;
/**
 * Pixels per turntable frame. The biggest turntable is about 250 pt wide (750 px on a 3x screen);
 * 600 px keeps it sharp while a 6x4 sheet (3600 x 2400) stays well under GPU texture limits.
 */
const TURN_CELL_PIXELS = 600;
const START_ANGLE = -0.45;

export interface Turntable { uri: string; frames: number; columns: number; rows: number }
interface Snapshots {
  icon: (spec: ItemSpec) => Promise<string>;
  turntable: (spec: ItemSpec) => Promise<Turntable>;
  /** Finished renders by spec key, read synchronously so a cached item shows on its first frame. */
  done: { icon: (key: string) => string | undefined; turntable: (key: string) => Turntable | undefined };
}
const SnapshotContext = createContext<Snapshots | null>(null);

type Draw = (renderer: Renderer, gl: ExpoWebGLRenderingContext, spec: ItemSpec) => void;

/** One offscreen GL surface with a serial job queue; renders are cached by spec. */
function useEngine<T>(draw: Draw, wrap: (uri: string) => T, onRequest: () => void) {
  const cache = useRef(new Map<string, Promise<T>>());
  const done = useRef(new Map<string, T>());
  const queue = useRef<{ spec: ItemSpec; resolve: (value: T) => void; reject: (error: unknown) => void }[]>([]);
  const engine = useRef<((spec: ItemSpec) => Promise<string>) | null>(null);
  const busy = useRef(false);

  async function drain() {
    if (busy.current || !engine.current) return;
    busy.current = true;
    while (queue.current.length) {
      const job = queue.current.shift()!;
      try { job.resolve(wrap(await engine.current(job.spec))); } catch (error) { if (__DEV__) console.warn('3D snapshot failed', error); job.reject(error); }
    }
    busy.current = false;
  }

  function request(spec: ItemSpec) {
    const key = specKey(spec);
    const existing = cache.current.get(key);
    if (existing) return existing;
    const promise = new Promise<T>((resolve, reject) => { queue.current.push({ spec, resolve, reject }); });
    cache.current.set(key, promise);
    promise.then((value) => { done.current.set(key, value); }, () => cache.current.delete(key));
    onRequest();
    void drain();
    return promise;
  }

  const finished = (key: string) => done.current.get(key);

  function onContextCreate(gl: ExpoWebGLRenderingContext) {
    try {
      const renderer = new Renderer({ gl, alpha: true, preserveDrawingBuffer: true });
      renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
      renderer.setClearColor(0x000000, 0);
      engine.current = async (spec) => {
        draw(renderer, gl, spec);
        gl.endFrameEXP();
        const snapshot = await GLView.takeSnapshotAsync(gl, { format: 'png' });
        const uri = typeof snapshot.uri === 'string' ? snapshot.uri : snapshot.uri ? URL.createObjectURL(snapshot.uri as Blob) : null;
        if (!uri) throw new Error('No snapshot');
        return uri;
      };
      void drain();
    } catch (error) { if (__DEV__) console.warn('3D renderer failed', error); engine.current = null; }
  }

  return { request, finished, onContextCreate };
}

/** Renders one item at each angle, one grid cell per angle (a single cell for icons). */
function drawItem(renderer: Renderer, spec: ItemSpec, angles: number[], columns: number, rows: number, width: number, height: number) {
  const { scene, material, pivot } = createStage();
  const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 2000);
  const geometry = buildItem(spec).toGeometry();
  pivot.add(new THREE.Mesh(geometry, material));
  const framing = framingGeometry(spec, geometry);
  frame(camera, framing);
  if (framing !== geometry) framing.dispose();
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, width * columns, height * rows);
  renderer.clear();
  renderer.autoClear = false;
  renderer.setScissorTest(true);
  angles.forEach((angle, index) => {
    const x = (index % columns) * width;
    // GL counts rows from the bottom; the snapshot image counts them from the top.
    const y = (rows - 1 - Math.floor(index / columns)) * height;
    renderer.setViewport(x, y, width, height);
    renderer.setScissor(x, y, width, height);
    pivot.rotation.y = angle;
    renderer.render(scene, camera);
  });
  renderer.setScissorTest(false);
  // Snapshots capture the current viewport, so restore the whole surface.
  renderer.setViewport(0, 0, width * columns, height * rows);
  renderer.autoClear = true;
  geometry.dispose();
  material.dispose();
}

const drawIcon: Draw = (renderer, gl, spec) => {
  drawItem(renderer, spec, [START_ANGLE], 1, 1, gl.drawingBufferWidth, gl.drawingBufferHeight);
};
const drawTurntable: Draw = (renderer, gl, spec) => {
  const angles = Array.from({ length: TURN_FRAMES }, (_, index) => START_ANGLE + (index * Math.PI * 2) / TURN_FRAMES);
  drawItem(renderer, spec, angles, TURN_COLUMNS, TURN_ROWS, gl.drawingBufferWidth / TURN_COLUMNS, gl.drawingBufferHeight / TURN_ROWS);
};
const asIcon = (uri: string) => uri;
const asTurntable = (uri: string): Turntable => ({ uri, frames: TURN_FRAMES, columns: TURN_COLUMNS, rows: TURN_ROWS });

/**
 * Hidden 3D renderers for the whole app. Items are rendered once and cached as images:
 * icons for grids and lists, and turntable sheets (every angle around an item) that
 * Model3D spins and drags on native. Screens full of items stay smooth, and every
 * picture is still a real 3D render.
 */
export function ModelSnapshotHost({ children }: { children: ReactNode }) {
  // Each GL surface is created on its first request, not at launch: the turntable surface alone
  // is a 3600 x 2400 px buffer (about 33 MB) on a 3x screen, and the Focus tab needs neither.
  const [iconsUsed, setIconsUsed] = useState(false);
  const [turntablesUsed, setTurntablesUsed] = useState(false);
  const icons = useEngine(drawIcon, asIcon, () => setIconsUsed(true));
  const turntables = useEngine(drawTurntable, asTurntable, () => setTurntablesUsed(true));
  // The engines keep their state in refs, so the first render's functions stay valid.
  const [value] = useState<Snapshots>(() => ({ icon: icons.request, turntable: turntables.request, done: { icon: icons.finished, turntable: turntables.finished } }));
  const cell = TURN_CELL_PIXELS / PixelRatio.get();
  return <SnapshotContext.Provider value={value}>
    {children}
    {/* Invisible renderer. On the web its canvases still take pointer events, so it also sits off screen there. */}
    <View pointerEvents="none" style={{ position: 'absolute', left: Platform.OS === 'web' ? -10000 : 0, top: 0, opacity: 0 }}>
      {iconsUsed ? <View style={{ width: ICON_POINTS, height: ICON_POINTS * 1.25 }}><GLView style={{ flex: 1 }} onContextCreate={icons.onContextCreate} /></View> : null}
      {turntablesUsed ? <View style={{ width: cell * TURN_COLUMNS, height: cell * TURN_ROWS }}><GLView style={{ flex: 1 }} onContextCreate={turntables.onContextCreate} /></View> : null}
    </View>
  </SnapshotContext.Provider>;
}

function useSnapshot<T>(spec: ItemSpec, kind: 'icon' | 'turntable', enabled: boolean) {
  const snapshots = useContext(SnapshotContext);
  const key = specKey(spec);
  const [result, setResult] = useState<{ key: string; value: T } | null>(null);
  // Already drawn: show it now, instead of the placeholder for a frame and a second render.
  const finished = snapshots && enabled ? (snapshots.done[kind](key) as T | undefined) : undefined;
  useEffect(() => {
    if (!snapshots || !enabled || snapshots.done[kind](key) !== undefined) return;
    let active = true;
    (snapshots[kind](spec) as Promise<T>).then((value) => { if (active) setResult({ key, value }); }).catch(() => undefined);
    return () => { active = false; };
    // key captures every visual input; the object identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, kind, snapshots, enabled]);
  return finished ?? (result?.key === key ? result.value : null);
}

/** The cached 3D icon for an item, or null while it is being drawn. */
export function useItemImage(spec: ItemSpec) {
  return useSnapshot<string>(spec, 'icon', true);
}

/** The cached turntable sheet for an item, or null while it is being drawn. */
export function useTurntable(spec: ItemSpec, enabled = true) {
  return useSnapshot<Turntable>(spec, 'turntable', enabled);
}

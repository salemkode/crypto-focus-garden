import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, PixelRatio, Pressable, Text, useWindowDimensions, View, type GestureResponderEvent, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';
import { buildGrowthModel, buildTierModel, buildWitheredModel } from '@focus-garden/garden/tiers';
import { decorations, PLOT, valleyLayout, type Tile, type ValleyItem } from '../features/valley/layout';
import { quantize } from '../features/three/scene';
import { color, Icon, icons } from '../ui';

const TILT = THREE.MathUtils.degToRad(33);
/** Pixels of the offscreen valley image (square). Large enough to zoom in on a single tree. */
const IMAGE_PIXELS = 2048;
const MIN_SCALE = 0.8;
const MAX_SCALE = 5;

const TOP: Record<Tile['kind'], number> = { grass: 0x6fbf4a, meadow: 0x76c34f, sand: 0xe8d69a, water: 0x4aa8d8 };
const SIDE: Record<Tile['kind'], number> = { grass: 0x8a5a33, meadow: 0x8a5a33, sand: 0xc9b077, water: 0x3a86b5 };
/** Smaller rewards are drawn larger within their plot so every item reads clearly. */
const SCALE: Record<ValleyItem['tier'], number> = { sprout: 1.6, tree: 1.4, bigTree: 1.1, house: 1 };

/** A box whose top face and sides carry their own colours (grass on top, earth on the sides). */
function blockGeometry(width: number, height: number, top: number, side: number) {
  const geometry = new THREE.BoxGeometry(width, height, width).toNonIndexed();
  const normal = geometry.getAttribute('normal');
  const colours = new Float32Array(normal.count * 3);
  const a = new THREE.Color(top), b = new THREE.Color(side);
  for (let i = 0; i < normal.count; i++) (normal.getY(i) > 0.5 ? a : b).toArray(colours, i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return geometry;
}

/** One rendered view of the valley, with every plot's position on the image (0..1). */
interface Shot { uri: string; spots: Map<string, { u: number; v: number }> }
type Engine = (items: ValleyItem[], angle: number) => Promise<Shot>;

/**
 * Your valley, full screen. The 3D scene is rendered offscreen into a large image whenever it
 * changes (a new tree, a growth step, a turn); dragging and pinching move that image on the UI
 * thread, so gestures stay smooth and the GPU only works when something actually changed.
 * (On-screen GL layers do not reliably present on iOS; the offscreen path does.)
 */
export function Valley({ items, focusId, style, bottomInset = 0 }: { items: ValleyItem[]; focusId?: string | null; style?: ViewStyle; bottomInset?: number }) {
  const { width, height } = useWindowDimensions();
  const engine = useRef<Engine | null>(null);
  const latest = useRef({ items, angle: 0 });
  const busy = useRef(false);
  const dirty = useRef(false);
  const [shot, setShot] = useState<Shot | null>(null);
  const [angle, setAngle] = useState(0);
  const [failed, setFailed] = useState(false);
  const itemsKey = items.map((item) => `${item.id}:${item.tier}:${item.species}:${item.seed}:${item.withered ? 'w' : ''}:${item.progress === undefined ? '' : quantize(item.progress)}`).join('|');

  // The image is a square as wide as the screen's longer side, centred in the space above the controls.
  const side = Math.max(width, height);
  const centre = { x: width / 2, y: (height - bottomInset) / 2 };
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  async function draw() {
    if (!engine.current) return;
    if (busy.current) { dirty.current = true; return; }
    busy.current = true;
    try {
      do {
        dirty.current = false;
        const next = await engine.current(latest.current.items, latest.current.angle);
        setShot(next);
      } while (dirty.current);
    } catch (error) { if (__DEV__) console.warn('Valley render failed', error); }
    finally { busy.current = false; }
  }

  useEffect(() => {
    latest.current = { items, angle };
    void draw();
    // itemsKey captures every visual input; the array identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, angle]);

  // Frame the focused plot (the growing tree), or the whole valley when nothing is focused.
  const spot = focusId && shot ? shot.spots.get(focusId) : undefined;
  const spotU = spot?.u;
  const spotV = spot?.v;
  useEffect(() => {
    const timing = { duration: 650, easing: Easing.out(Easing.cubic) };
    if (spotU !== undefined && spotV !== undefined) {
      const zoom = 2.2;
      tx.set(withTiming(-(spotU - 0.5) * side * zoom, timing));
      ty.set(withTiming(-(spotV - 0.5) * side * zoom, timing));
      scale.set(withTiming(zoom, timing));
    } else {
      tx.set(withTiming(0, timing)); ty.set(withTiming(0, timing)); scale.set(withTiming(1, timing));
    }
  }, [spotU, spotV, side, scale, tx, ty]);

  const responder = useMemo(() => {
    let last: { x: number; y: number; distance: number } | null = null;
    const read = (event: GestureResponderEvent) => {
      const touches = event.nativeEvent.touches;
      if (touches.length >= 2) {
        const [a, b] = touches;
        return { x: (a.pageX + b.pageX) / 2, y: (a.pageY + b.pageY) / 2, distance: Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) };
      }
      return { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, distance: 0 };
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => { last = read(event); },
      onPanResponderMove: (event) => {
        const now = read(event);
        if (last) {
          if (now.distance && last.distance) {
            const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale.get() * (now.distance / last.distance)));
            const k = next / scale.get();
            tx.set(tx.get() * k); ty.set(ty.get() * k); scale.set(next);
          } else if (!now.distance && !last.distance) {
            const limit = (side * scale.get()) / 2;
            tx.set(Math.max(-limit, Math.min(limit, tx.get() + now.x - last.x)));
            ty.set(Math.max(-limit, Math.min(limit, ty.get() + now.y - last.y)));
          }
        }
        last = now;
      },
      onPanResponderRelease: () => { last = null; },
      onPanResponderTerminate: () => { last = null; },
    });
  }, [scale, side, tx, ty]);

  const moving = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }] }));

  function onContextCreate(gl: ExpoWebGLRenderingContext) {
    try {
      const renderer = new Renderer({ gl, preserveDrawingBuffer: true });
      renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
      renderer.setClearColor(color.skyTop, 1);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0xb59a74, 2.1));
      const sun = new THREE.DirectionalLight(0xfff1d6, 2.3);
      sun.position.set(-60, 120, 40);
      scene.add(sun);
      const material = new THREE.MeshLambertMaterial({ vertexColors: true });
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 2000);
      const ground = new THREE.Group(); const trees = new THREE.Group(); scene.add(ground, trees);
      const geometries = new Map<string, THREE.BufferGeometry>();
      const geometry = (key: string, make: () => THREE.BufferGeometry) => {
        let found = geometries.get(key);
        if (!found) { found = make(); geometries.set(key, found); }
        return found;
      };
      const clear = (group: THREE.Object3D) => { group.children.forEach((child) => { if (child instanceof THREE.InstancedMesh) child.dispose(); }); group.clear(); };
      function instanced(geo: THREE.BufferGeometry, transforms: THREE.Matrix4[], tints?: THREE.Color[]) {
        const mesh = new THREE.InstancedMesh(geo, material, transforms.length);
        transforms.forEach((matrix, index) => { mesh.setMatrixAt(index, matrix); if (tints) mesh.setColorAt(index, tints[index]); });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        return mesh;
      }
      let groundRadius = -1;
      let growing: THREE.Mesh | null = null;

      engine.current = async (next, turn) => {
        const layout = valleyLayout(next);
        if (layout.radius !== groundRadius) {
          groundRadius = layout.radius;
          clear(ground);
          const byKind = new Map<Tile['kind'], THREE.Matrix4[]>();
          const decos: THREE.Matrix4[] = []; const tints: THREE.Color[] = [];
          for (const tile of layout.tiles) {
            const sink = tile.kind === 'water' ? -1.6 : tile.kind === 'sand' ? -0.6 : 0;
            const list = byKind.get(tile.kind) ?? []; list.push(new THREE.Matrix4().makeTranslation(tile.gx * PLOT, -3.5 + sink, tile.gz * PLOT)); byKind.set(tile.kind, list);
            for (const deco of decorations(tile)) {
              const size = deco.kind === 'stone' ? 1.2 : deco.kind === 'tuft' ? 0.9 : 0.8;
              decos.push(new THREE.Matrix4().compose(new THREE.Vector3(tile.gx * PLOT + deco.x, sink + size / 2 - 0.5, tile.gz * PLOT + deco.z), new THREE.Quaternion(), new THREE.Vector3(size, deco.kind === 'tuft' ? 1.6 : size, size)));
              tints.push(new THREE.Color(deco.kind === 'stone' ? 0x9a9a92 : deco.kind === 'tuft' ? 0x3f8f2e : [0xf2c94c, 0xf06292, 0xffffff, 0x9b6bd6][Math.floor(deco.tint * 4)]));
            }
          }
          for (const [kind, transforms] of byKind) ground.add(instanced(geometry(`ground:${kind}`, () => blockGeometry(PLOT, 6, TOP[kind], SIDE[kind])), transforms));
          if (decos.length) ground.add(instanced(geometry('deco', () => blockGeometry(1, 1, 0xffffff, 0xffffff)), decos, tints));
        }
        clear(trees);
        if (growing) { growing.geometry.dispose(); growing = null; }
        const groups = new Map<string, THREE.Matrix4[]>();
        for (const plot of layout.plots) {
          const { item } = plot;
          const size = SCALE[item.tier];
          if (item.progress !== undefined && item.progress < 1) {
            growing = new THREE.Mesh(buildGrowthModel(item.species, quantize(item.progress), item.seed, item.tier).toGeometry(), material);
            growing.position.set(plot.gx * PLOT, 0, plot.gz * PLOT);
            growing.scale.setScalar(size);
            trees.add(growing);
            continue;
          }
          const key = item.withered ? `w:${item.species}:${item.seed}` : `${item.tier}:${item.species}:${item.seed}`;
          const list = groups.get(key) ?? [];
          list.push(new THREE.Matrix4().compose(new THREE.Vector3(plot.gx * PLOT, 0, plot.gz * PLOT), new THREE.Quaternion(), new THREE.Vector3(size, size, size)));
          groups.set(key, list);
        }
        for (const [key, transforms] of groups) {
          const [tier, species, seed] = key.split(':');
          trees.add(instanced(geometry(`model:${key}`, () => (tier === 'w' ? buildWitheredModel(species as never, Number(seed)) : buildTierModel(tier as never, species as never, Number(seed))).toGeometry()), transforms));
        }

        // Frame the whole land in the square image.
        const half = (layout.radius + 1.6) * PLOT * 0.78;
        camera.left = -half; camera.right = half; camera.top = half; camera.bottom = -half;
        camera.updateProjectionMatrix();
        const yaw = Math.PI / 4 + turn * (Math.PI / 2);
        camera.position.set(600 * Math.sin(yaw) * Math.cos(TILT), 600 * Math.sin(TILT), 600 * Math.cos(yaw) * Math.cos(TILT));
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        renderer.render(scene, camera);
        gl.endFrameEXP();
        const spots = new Map<string, { u: number; v: number }>();
        for (const plot of layout.plots) {
          const p = new THREE.Vector3(plot.gx * PLOT, 6, plot.gz * PLOT).project(camera);
          spots.set(plot.item.id, { u: (p.x + 1) / 2, v: (1 - p.y) / 2 });
        }
        const snapshot = await GLView.takeSnapshotAsync(gl, { format: 'png' });
        const uri = typeof snapshot.uri === 'string' ? snapshot.uri : snapshot.uri ? URL.createObjectURL(snapshot.uri as Blob) : null;
        if (!uri) throw new Error('No valley image');
        return { uri, spots };
      };
      void draw();
    } catch (error) {
      if (__DEV__) console.warn('Valley failed', error);
      setFailed(true);
    }
  }

  const points = IMAGE_PIXELS / PixelRatio.get();
  return <View style={[{ flex: 1, backgroundColor: color.skyTop, overflow: 'hidden' }, style]}>
    {/* Offscreen renderer: never shown, only read back into the image below. */}
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: points, height: points, opacity: 0 }}>
      <GLView style={{ flex: 1 }} onContextCreate={onContextCreate} />
    </View>
    {failed ? <View className="flex-1 items-center justify-center p-8"><Text className="text-center text-subhead text-ink-2">Your valley could not be drawn on this device. Your sessions are safe.</Text></View>
      : <View style={{ flex: 1 }} {...responder.panHandlers}>
        {shot ? <Animated.Image source={{ uri: shot.uri }} fadeDuration={0} accessibilityLabel={`Your valley with ${items.length} ${items.length === 1 ? 'item' : 'items'}`}
          style={[{ position: 'absolute', width: side, height: side, left: centre.x - side / 2, top: centre.y - side / 2 }, moving]} /> : null}
      </View>}
    <Pressable accessibilityRole="button" accessibilityLabel="Turn the valley" onPress={() => setAngle((angle + 1) % 4)} className="absolute right-4 top-28 h-11 w-11 items-center justify-center rounded-full bg-surface/90">
      <Icon name={icons.refresh} size={18} tint={color.ink} weight="semibold" />
    </Pressable>
  </View>;
}

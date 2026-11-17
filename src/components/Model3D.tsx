import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, Platform, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useFrameCallback, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';
import { buildItem, createStage, frame, framingGeometry, specKey, type ItemSpec } from '../features/three/scene';
import { useItemImage, useTurntable, type Turntable } from './ModelSnapshots';

/** Turntable frames per second while idling; about a 5 s turn (24 frames). */
const SPIN_FPS = 5;
/** Drag distance, in points, that turns the item by one frame. */
const DRAG_POINTS_PER_FRAME = 6;

/**
 * A softly rotating 3D item. Drag sideways to turn it. Used for the big moments:
 * the tree growing on the Focus screen, item details, merge results, onboarding.
 *
 * Native platforms show a turntable: the item is rendered offscreen from every angle once,
 * then spun on the UI thread. That keeps a continuous GL loop off the screen (iOS does not
 * reliably present on-screen GL layers) and saves battery. The web draws it live.
 */
interface Props {
  spec: ItemSpec; size: number; style?: ViewStyle; spin?: boolean; fill?: number;
  /** A tap that is not a drag. With it, the model owns its touches, so dragging works inside buttons. */
  onPress?: () => void;
  /** Horizontal swipe to the next (1) or previous (-1) item instead of turning the model. */
  onSwipe?: (direction: 1 | -1) => void;
}

export function Model3D(props: Props) {
  return Platform.OS === 'web' ? <LiveModel {...props} /> : <TurntableModel {...props} />;
}

/** Swipe distance, in points, that switches to the next or previous item. */
const SWIPE_POINTS = 40;

function TurntableModel({ spec, size, style, spin = true, onPress, onSwipe }: Props) {
  const sheet = useTurntable(spec);
  const still = useItemImage(spec);
  const angle = useSharedValue(0);
  const velocity = useSharedValue(0);
  const held = useSharedValue(false);
  const spinning = useSharedValue(spin);
  useEffect(() => { spinning.set(spin); }, [spin, spinning]);

  useFrameCallback(({ timeSincePreviousFrame }) => {
    'worklet';
    if (held.value) return;
    const seconds = (timeSincePreviousFrame ?? 16) / 1000;
    angle.value += velocity.value * seconds + (spinning.value ? SPIN_FPS * seconds : 0);
    velocity.value *= Math.pow(0.04, seconds);
  });

  const start = useSharedValue(0);
  const offset = useSharedValue(0);
  const press = useRef(onPress);
  const swipe = useRef(onSwipe);
  useEffect(() => { press.current = onPress; swipe.current = onSwipe; }, [onPress, onSwipe]);
  const claimsTaps = Boolean(onPress);
  const swipes = Boolean(onSwipe);
  const responder = useMemo(() => {
    // The handlers read the latest callbacks only during gestures, never while rendering.
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({
      onStartShouldSetPanResponder: () => claimsTaps,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 4 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderGrant: () => { held.set(true); start.set(angle.get()); velocity.set(0); },
      onPanResponderMove: (_, gesture) => {
        if (swipes) offset.set(gesture.dx * 0.6);
        else angle.set(start.get() - gesture.dx / DRAG_POINTS_PER_FRAME);
      },
      onPanResponderRelease: (_, gesture) => {
        held.set(false);
        offset.set(withSpring(0, { damping: 16 }));
        if (Math.abs(gesture.dx) < 6 && Math.abs(gesture.dy) < 6) { press.current?.(); return; }
        if (swipes) { if (Math.abs(gesture.dx) >= SWIPE_POINTS) swipe.current?.(gesture.dx < 0 ? 1 : -1); return; }
        velocity.set((-gesture.vx * 1000) / DRAG_POINTS_PER_FRAME);
      },
      onPanResponderTerminate: () => { held.set(false); offset.set(withSpring(0, { damping: 16 })); },
    });
  }, [angle, claimsTaps, held, offset, start, swipes, velocity]);
  const sliding = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }], opacity: 1 - Math.min(0.5, Math.abs(offset.value) / 200) }));

  return <View style={[{ width: size, height: size }, style]} {...responder.panHandlers}>
    <Animated.View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center' }, sliding]}>
      {sheet ? <Sheet sheet={sheet} size={size} angle={angle} />
        : still ? <Image source={{ uri: still }} style={{ width: size * 0.8, height: size }} resizeMode="contain" accessibilityIgnoresInvertColors />
        : null}
    </Animated.View>
  </View>;
}

function Sheet({ sheet, size, angle }: { sheet: Turntable; size: number; angle: SharedValue<number> }) {
  const { frames, columns, rows } = sheet;
  const moving = useAnimatedStyle(() => {
    const index = ((Math.floor(angle.value) % frames) + frames) % frames;
    return { transform: [{ translateX: -(index % columns) * size }, { translateY: -Math.floor(index / columns) * size }] };
  });
  return <View style={{ width: size, height: size, overflow: 'hidden' }}>
    <Animated.Image source={{ uri: sheet.uri }} style={[{ width: size * columns, height: size * rows }, moving]} fadeDuration={0} accessibilityIgnoresInvertColors />
  </View>;
}

function LiveModel({ spec, size, style, spin = true, fill, onPress, onSwipe }: Props) {
  const key = specKey(spec);
  const apply = useRef<((spec: ItemSpec) => void) | null>(null);
  const latest = useRef(spec);
  const drag = useRef({ velocity: 0, held: false });
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    latest.current = spec;
    apply.current?.(spec);
    // key captures every visual input; the object identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const press = useRef(onPress);
  const swipe = useRef(onSwipe);
  useEffect(() => { press.current = onPress; swipe.current = onSwipe; }, [onPress, onSwipe]);
  const claimsTaps = Boolean(onPress);
  const swipes = Boolean(onSwipe);
  // PanResponder registers event callbacks; these refs are read only when a gesture fires.
  // eslint-disable-next-line react-hooks/refs
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => claimsTaps,
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 4,
    onPanResponderGrant: () => { drag.current.held = true; },
    onPanResponderMove: (_, gesture) => { if (!swipes) drag.current.velocity = gesture.vx * 0.12; },
    onPanResponderRelease: (_, gesture) => {
      drag.current.held = false;
      if (Math.abs(gesture.dx) < 6 && Math.abs(gesture.dy) < 6) { press.current?.(); return; }
      if (swipes && Math.abs(gesture.dx) >= SWIPE_POINTS) swipe.current?.(gesture.dx < 0 ? 1 : -1);
    },
    onPanResponderTerminate: () => { drag.current.held = false; },
  }), [claimsTaps, swipes]);

  const cleanup = useRef<(() => void) | null>(null);
  function onContextCreate(gl: ExpoWebGLRenderingContext) {
    try {
      const renderer = new Renderer({ gl, alpha: true });
      renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
      renderer.setClearColor(0x000000, 0);
      const camera = new THREE.PerspectiveCamera(30, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.1, 2000);
      const { scene, material, pivot } = createStage();
      let mesh: THREE.Mesh | null = null;
      apply.current = (next) => {
        if (mesh) { pivot.remove(mesh); mesh.geometry.dispose(); }
        const geometry = buildItem(next).toGeometry();
        mesh = new THREE.Mesh(geometry, material);
        pivot.add(mesh);
        const framing = framingGeometry(next, geometry);
        frame(camera, framing, fill);
        if (framing !== geometry) framing.dispose();
      };
      apply.current(latest.current);
      pivot.rotation.y = -0.5;
      let frameId = 0;
      const loop = () => {
        const motion = drag.current;
        pivot.rotation.y += motion.held ? motion.velocity : spin ? 0.006 + motion.velocity : motion.velocity;
        motion.velocity *= 0.94;
        renderer.render(scene, camera);
        gl.endFrameEXP();
        frameId = requestAnimationFrame(loop);
      };
      loop();
      cleanup.current = () => {
        cancelAnimationFrame(frameId);
        apply.current = null;
        if (mesh) mesh.geometry.dispose();
        material.dispose();
        renderer.dispose();
      };
    } catch (error) { if (__DEV__) console.warn('Model3D failed', error); setFailed(true); }
  }
  useEffect(() => () => cleanup.current?.(), []);
  if (failed) return <View style={[{ width: size, height: size }, style]} />;
  return <View style={[{ width: size, height: size }, style]} {...responder.panHandlers}><GLView style={{ flex: 1 }} onContextCreate={onContextCreate} /></View>;
}

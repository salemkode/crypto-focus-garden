import { createElement, useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { View } from 'react-native';
import { startValley, type ValleyController } from './controller';
import type { FromValley, ValleyHostHandle } from './protocol';

/** The valley on the web: the engine runs in this page, messages are plain function calls. */
export function ValleyHost({ ref, onMessage }: { ref: Ref<ValleyHostHandle>; onMessage: (message: FromValley) => void }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const controller = useRef<ValleyController | null>(null);
  const handler = useRef(onMessage);
  useEffect(() => { handler.current = onMessage; }, [onMessage]);
  useImperativeHandle(ref, () => ({ post: (message) => controller.current?.receive(message) }), []);

  useEffect(() => {
    if (!canvas.current) return;
    const started = startValley(canvas.current, (message) => handler.current(message));
    controller.current = started;
    if (__DEV__) (globalThis as { __valley?: unknown }).__valley = started;
    handler.current({ type: 'ready' });
    return () => { started.stop(); controller.current = null; };
  }, []);

  return <View style={{ flex: 1 }}>
    {createElement('canvas', { ref: canvas, style: { width: '100%', height: '100%', display: 'block', touchAction: 'none' }, 'aria-label': 'Your valley. Drag to travel, pinch to zoom, two fingers to turn.' })}
  </View>;
}

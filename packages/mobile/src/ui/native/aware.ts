import type { ReactNode } from 'react';

type Flagged = { nativeAware?: boolean };
type Transform = (output: ReactNode) => ReactNode;

/** Set on iOS by ./scope: re-renders a composite's output into the current SwiftUI scope. */
let transform: { use: () => Transform } | null = null;
export function registerNativeTransform(next: { use: () => Transform }) { transform = next; }

/** Flags a design-system primitive that renders SwiftUI by itself (Group, Row, Button, ...). */
export function markNative<T>(component: T): T {
  (component as T & Flagged).nativeAware = true;
  return component;
}

/**
 * Marks a component whose output is design-system pieces (groups, rows, buttons) plus ordinary
 * React Native blocks. On iOS, inside a SwiftUI form, the pieces become native form parts and the
 * React Native blocks are hosted. Elsewhere this changes nothing.
 */
export function nativeAware<P extends object>(component: (props: P) => ReactNode): (props: P) => ReactNode {
  function NativeAware(props: P) {
    const output = component(props);
    // Hook order is stable: `transform` is registered once at startup and never changes.
    const place = transform?.use();
    return place ? place(output) : output;
  }
  NativeAware.displayName = (component as { name?: string }).name;
  return markNative(NativeAware);
}

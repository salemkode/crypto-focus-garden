/**
 * Messages between the app (React Native UI) and the valley (the 3D engine). On the web the
 * engine runs in the page; on iOS and Android it runs inside a WebView. Either way the app only
 * speaks these messages, so every screen around the valley is the same React Native code.
 */
import type { Level } from '@focus-garden/garden/ladder';
import type { PlannedMerge } from '@focus-garden/garden/merge-plan';
import type { Season } from '@focus-garden/garden/season';
import type { ValleyEntity, ValleyEvent } from '@focus-garden/garden/valley';

export interface CardMessage {
  key: string;
  eyebrow: string;
  name: string;
  facts: string[];
  live?: string;
  noteKey?: string;
}

/** App → valley. */
export type ToValley =
  | { type: 'init'; seed: number; lowPower: boolean; season?: Season }
  | { type: 'history'; history: ValleyEvent[]; growing: { entity: ValleyEntity; progress: number } | null; plantedAt: Record<string, number> }
  | { type: 'merge'; plan: PlannedMerge[] }
  | { type: 'insets'; top: number; bottom: number }
  | { type: 'closeCard' }
  | { type: 'focusCard' }
  | { type: 'pause'; paused: boolean }
  /** Touch handled by the app (phones): camera moves in view points, taps where they landed. */
  | { type: 'camera'; begin?: boolean; release?: boolean; pan?: [number, number]; zoom?: number; rotate?: number; tilt?: number }
  | { type: 'tap'; x: number; y: number; double?: boolean };

/** Valley → app. */
export type FromValley =
  | { type: 'ready' }
  | { type: 'card'; card: CardMessage | null }
  | { type: 'anchor'; x: number; y: number; visible: boolean }
  | { type: 'live'; text: string }
  | { type: 'busy'; busy: boolean }
  | { type: 'reveal'; entity: ValleyEntity; ingredients: number }
  | { type: 'summary'; merges: number; made: [Level, number][]; villagers: number }
  | { type: 'haptic'; kind: 'selection' | 'success' | 'heavy' }
  | { type: 'stats'; fps: number; frameMs: number; width: number; height: number; layout?: string }
  | { type: 'error'; message: string };

/** A valley host: post messages in, receive messages out. */
export interface ValleyHostHandle {
  post: (message: ToValley) => void;
}

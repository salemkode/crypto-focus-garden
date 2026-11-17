import { Platform } from 'react-native';
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';

export interface ShieldStatus {
  /** The platform can block apps at all. */
  supported: boolean;
  /** iOS build made before Apple approved Family Controls for distribution. */
  pendingApproval?: boolean;
  platform: 'ios' | 'android' | 'other';
  /** iOS: Screen Time (FamilyControls) approved. Android: usage access granted. */
  authorized: boolean;
  /** Android only: may bring Focus Garden back in front of a blocked app. */
  overlay?: boolean;
  /** Number of chosen apps/categories/sites. */
  selectionCount: number;
  /** A shield is currently applied. */
  active: boolean;
}
export interface LaunchableApp { packageName: string; label: string; icon: string | null }

interface NativeShield {
  getStatus(): Promise<ShieldStatus>;
  requestAuthorization(): Promise<boolean>;
  pickApps?(): Promise<number>;
  openOverlaySettings?(): Promise<void>;
  listApps?(): Promise<LaunchableApp[]>;
  getBlockedPackages?(): Promise<string[]>;
  setBlockedPackages?(packages: string[]): Promise<number>;
  start(endsAt: number): Promise<boolean>;
  stop(): Promise<void>;
}

const native = requireOptionalNativeModule<NativeShield>('FocusShield');
const unsupported: ShieldStatus = { supported: false, platform: 'other', authorized: false, selectionCount: 0, active: false };

/**
 * iOS: the chosen apps, categories and websites, drawn by iOS (52 pt per row). Bump `revision`
 * after the picker closes to redraw. Null where the native view doesn't exist.
 */
export const ShieldSelectionList: ComponentType<ViewProps & { revision: number }> | null =
  Platform.OS === 'ios' && native ? requireNativeView('FocusShield') : null;
export const SHIELD_ROW_HEIGHT = 52;

export const FocusShield = {
  available: native !== null,
  getStatus: () => native?.getStatus() ?? Promise.resolve(unsupported),
  /** Resolves false when declined; rejects with an explanation when iOS can't grant it at all. */
  requestAuthorization: () => native?.requestAuthorization() ?? Promise.resolve(false),
  /** iOS: Apple's private app picker. Apps stay opaque tokens; the app never learns which apps you chose. */
  pickApps: () => (Platform.OS === 'ios' && native?.pickApps ? native.pickApps() : Promise.resolve(0)),
  openOverlaySettings: () => (native?.openOverlaySettings ? native.openOverlaySettings() : Promise.resolve()),
  listApps: () => (native?.listApps ? native.listApps() : Promise.resolve([] as LaunchableApp[])),
  getBlockedPackages: () => (native?.getBlockedPackages ? native.getBlockedPackages() : Promise.resolve([] as string[])),
  setBlockedPackages: (packages: string[]) => (native?.setBlockedPackages ? native.setBlockedPackages(packages) : Promise.resolve(0)),
  /** Applies the shield until `endsAt` (ms since epoch). */
  start: (endsAt: number) => native?.start(endsAt) ?? Promise.resolve(false),
  stop: () => native?.stop() ?? Promise.resolve(),
};

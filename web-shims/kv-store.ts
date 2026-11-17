/**
 * Web preview only: expo-sqlite's web worker needs cross-origin isolation, so the
 * browser preview keeps the same key-value API on localStorage. Native builds use expo-sqlite.
 */
import { createBrowserStorage } from '../src/platform/browser-storage';

export default createBrowserStorage(() => globalThis.localStorage);

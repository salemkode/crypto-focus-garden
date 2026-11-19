/**
 * Web preview only: expo-sqlite's web worker needs cross-origin isolation, so the
 * browser preview keeps the same key-value API on localStorage. Native builds use expo-sqlite.
 */
const area = () => globalThis.localStorage;
const Storage = {
  getItem: async (key: string) => area().getItem(key),
  setItem: async (key: string, value: string) => { area().setItem(key, value); },
  removeItem: async (key: string) => { area().removeItem(key); },
  getItemSync: (key: string) => area().getItem(key),
  setItemSync: (key: string, value: string) => { area().setItem(key, value); },
  removeItemSync: (key: string) => { area().removeItem(key); },
};
export default Storage;

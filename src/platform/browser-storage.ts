import * as Data from 'effect/Data';

class BrowserStorageUnavailable extends Data.TaggedError('BrowserStorageUnavailable')<{ message: string }> {}

/** Public session/preferences adapter. Private wallet material never uses browser storage. */
export function createBrowserStorage(resolve: () => Storage | undefined) {
  function writable() {
    const area = resolve();
    if (!area) throw new BrowserStorageUnavailable({ message: 'Browser storage is unavailable. Open the app in a browser to save changes.' });
    return area;
  }
  return {
    getItemSync: (key: string) => resolve()?.getItem(key) ?? null,
    setItemSync: (key: string, value: string) => writable().setItem(key, value),
    removeItemSync: (key: string) => writable().removeItem(key),
    getAllKeysSync: () => {
      const area = resolve();
      return area ? Array.from({ length: area.length }, (_, index) => area.key(index)).filter((key) => key !== null) : [];
    },
    getItem: async (key: string) => resolve()?.getItem(key) ?? null,
    setItem: async (key: string, value: string) => writable().setItem(key, value),
    removeItem: async (key: string) => writable().removeItem(key),
  };
}

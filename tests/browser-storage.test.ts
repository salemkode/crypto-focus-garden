import { describe, expect, test } from 'bun:test';
import { createBrowserStorage } from '../src/platform/browser-storage';

describe('browser public-data storage', () => {
  test('supports an SSR read without a browser and does not invent saved data', () => {
    const storage = createBrowserStorage(() => undefined);
    expect(storage.getItemSync('focus-garden-v2')).toBeNull();
    expect(storage.getAllKeysSync()).toEqual([]);
    expect(() => storage.setItemSync('focus-garden-v2', '{}')).toThrow('unavailable');
  });

  test('persists public session data and removes only the requested key', async () => {
    const data = new Map<string, string>();
    const area = {
      get length() { return data.size; },
      key: (index: number) => [...data.keys()][index] ?? null,
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
      removeItem: (key: string) => { data.delete(key); },
    };
    const storage = createBrowserStorage(() => area);
    await storage.setItem('focus-garden-v2', '{"records":[]}');
    storage.setItemSync('focus-garden.note.1', 'hello');
    expect(await storage.getItem('focus-garden-v2')).toBe('{"records":[]}');
    expect(storage.getAllKeysSync()).toEqual(['focus-garden-v2', 'focus-garden.note.1']);
    await storage.removeItem('focus-garden.note.1');
    expect(storage.getAllKeysSync()).toEqual(['focus-garden-v2']);
  });
});

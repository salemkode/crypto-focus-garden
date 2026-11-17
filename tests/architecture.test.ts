import { expect, test } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function sources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory()
    ? sources(resolve(directory, entry.name))
    : /\.tsx?$/.test(entry.name) ? [resolve(directory, entry.name)] : []))).flat();
}

test('the rendering adapters cannot sign transactions or call the credit service', async () => {
  for (const path of await sources('src/components/valley')) {
    const imports = [...(await readFile(path, 'utf8')).matchAll(/(?:from\s+|import\s*\()['"]([^'"]+)/g)].map((match) => match[1]);
    expect(imports.filter((entry) => /features\/(wallet|rewards)|services\//.test(entry))).toEqual([]);
  }
});

test('the protocol package cannot depend on app UI, native storage or platform crypto', async () => {
  for (const path of await sources('packages/protocol/src')) {
    const content = await readFile(path, 'utf8');
    expect(content).not.toMatch(/from ['"](?:react-native|expo-|libauth-native|.*src\/app)/);
  }
});

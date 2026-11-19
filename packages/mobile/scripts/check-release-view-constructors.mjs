#!/usr/bin/env node
// Release regression check: every Expo native view shipped in the app must keep the
// (Context, AppContext) constructor that Expo looks up by reflection. Reads the R8 mapping
// of a minified release build. Usage: node scripts/check-release-view-constructors.mjs [mapping.txt]
// It found the 16 November 2026 crash (expo.modules.gl.GLView had no constructor in the mapping).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = path.dirname(new URL(import.meta.url).pathname);
const mappingPath = process.argv[2] ?? path.join(here, '../android/app/build/outputs/mapping/release/mapping.txt');
const SIGNATURE = '<init>(android.content.Context,expo.modules.kotlin.AppContext)';

function kotlinFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? kotlinFiles(full) : entry.name.endsWith('.kt') ? [full] : [];
  });
}

/** Expo view classes declared with View(Class::class) in the app's Expo dependencies. */
function expoViewClasses() {
  const pkg = JSON.parse(fs.readFileSync(path.join(here, '../package.json'), 'utf8'));
  const roots = Object.keys(pkg.dependencies ?? {}).filter((name) => name.startsWith('expo'))
    .map((name) => { try { return path.dirname(require.resolve(`${name}/package.json`)); } catch { return null; } })
    .filter(Boolean);
  const classes = new Set();
  for (const root of roots) {
    const files = kotlinFiles(path.join(root, 'android/src'));
    const sources = files.map((file) => fs.readFileSync(file, 'utf8'));
    for (const source of sources) {
      for (const [, name] of source.matchAll(/\bView\(\s*([A-Za-z0-9_]+)::class/g)) {
        const declaring = sources.find((s) => new RegExp(`class\\s+${name}\\b`).test(s));
        const pkgName = declaring?.match(/^package\s+([\w.]+)/m)?.[1];
        if (pkgName) classes.add(`${pkgName}.${name}`);
      }
    }
  }
  return [...classes].sort();
}

/** Kept members per original class name, from an R8 mapping file. */
function mappedMembers(file) {
  const members = new Map();
  let current = null;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    if (!line.startsWith(' ')) { current = line.split(' -> ')[0]; members.set(current, []); continue; }
    if (current) members.get(current).push(line.replace(/^\s*(\d+:\d+:)?/, '').replace(/\s+/g, ''));
  }
  return members;
}

const views = expoViewClasses();
if (!views.length) { console.error('No Expo view classes found; cannot check.'); process.exit(2); }
const members = mappedMembers(mappingPath);
const failures = views.filter((name) => {
  const list = members.get(name);
  // A class absent from the mapping was neither renamed nor shrunk, so its constructor is intact.
  return list !== undefined && !list.some((member) => member.includes(SIGNATURE));
});
for (const name of views) console.log(`${failures.includes(name) ? 'MISSING' : 'ok     '} ${name}`);
if (failures.length) { console.error(`${failures.length} Expo view(s) lost their ${SIGNATURE} constructor.`); process.exit(1); }

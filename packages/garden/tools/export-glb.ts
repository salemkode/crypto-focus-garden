/**
 * Exports the valley's fixed voxel models to .glb (one mesh, one material, colours per vertex).
 *
 *   bun tools/export-glb.ts [--out dir] [--seeds 3] [--seasons summer|all]
 *
 * Output is deterministic: the same arguments always produce byte-identical files, plus a
 * manifest.json listing each file with its vertex count and size.
 *
 * What this cannot cover: the terrain and every item's exact model depend on the user's history
 * (each item has its own lineage seed, growth progress and season), so a native renderer builds
 * those at runtime with the same `geometryToGlb`. These files are the shared pieces (scenery,
 * villager parts) and a reference set of item models per level and style.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { geometryToGlb } from "../src/glb";
import { buildLevelModel, type Level } from "../src/ladder";
import { buildBalloon, buildCloud, buildIslet, type IsletKind } from "../src/models";
import { SEASONS, seasonal, type Season } from "../src/season";
import type { SpeciesKey } from "../src/tiers";

const STYLES: SpeciesKey[] = ["oak", "pine", "birch", "cherry", "maple", "cash"];
const LEVELS: Level[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const ISLETS: IsletKind[] = ["oak", "pine", "flowers", "hut"];

function arg(name: string, fallback: string) {
	const at = process.argv.indexOf(`--${name}`);
	return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

const out = resolve(arg("out", join(dirname(fileURLToPath(import.meta.url)), "../dist/glb")));
const seeds = Math.max(1, Number(arg("seeds", "3")) | 0);
const seasons: readonly Season[] = arg("seasons", "summer") === "all" ? SEASONS : ["summer"];

/** A flat-coloured box as an indexed, vertex-coloured geometry (villager and hen parts). */
function part(size: [number, number, number], color: number) {
	const g = new THREE.BoxGeometry(...size);
	const c = new THREE.Color(color);
	g.setAttribute("color", new THREE.Float32BufferAttribute(Array.from({ length: g.getAttribute("position").count }, () => [c.r, c.g, c.b]).flat(), 3));
	return g;
}

const manifest: { file: string; vertices: number; bytes: number }[] = [];
function write(file: string, geometry: THREE.BufferGeometry) {
	const bytes = geometryToGlb(geometry, { name: file.replace(/\.glb$/, "") });
	writeFileSync(join(out, file), bytes);
	manifest.push({ file, vertices: geometry.getAttribute("position").count, bytes: bytes.byteLength });
	geometry.dispose();
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const season of seasons) {
	for (const level of LEVELS) for (const style of STYLES) for (let seed = 0; seed < seeds; seed++) {
		write(`item-l${level}-${style}-s${seed}-${season}.glb`, seasonal(buildLevelModel(level, style, seed).toGeometry(), season));
	}
	ISLETS.forEach((kind, i) => write(`islet-${kind}-${season}.glb`, seasonal(buildIslet(70 + i, 4 + (i % 3), kind).toGeometry(), season, { ground: true })));
}
for (let i = 0; i < 9; i++) write(`cloud-${i}.glb`, buildCloud(40 + i).toGeometry());
[[0xe0413a, 0x3a5fa8], [0x2e5fa8, 0xe0413a], [0xf2c94c, 0x8a5a33]].forEach(([a, cap], i) => write(`balloon-${i}.glb`, buildBalloon(a, 0xffffff, cap).toGeometry()));
// Villager and hen parts: the same sizes as ValleyScene, in the colours it uses for them.
write("part-leg.glb", part([0.9, 1.8, 0.9], 0x4a3b2f));
write("part-log.glb", part([2.4, 0.8, 0.8], 0x93653d));
write("part-hen.glb", part([1.6, 1.3, 2], 0xffffff));
write("part-hen-head.glb", part([0.9, 0.9, 0.9], 0xffffff));
write("part-comb.glb", part([0.3, 0.4, 0.5], 0xe0413a));

writeFileSync(join(out, "manifest.json"), JSON.stringify({ seeds, seasons, files: manifest }, null, "\t") + "\n");
const total = manifest.reduce((n, f) => n + f.bytes, 0);
console.log(`${manifest.length} models, ${(total / 1024 / 1024).toFixed(1)} MB → ${out}`);

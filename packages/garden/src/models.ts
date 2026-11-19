import { hash3, mulberry32, noise2, VoxelModel } from "./voxel";

export type TreeType = "normal" | "gold" | "diamond";

export interface Plot {
	x: number;
	z: number;
}

export interface Waterfall {
	x: number;
	z: number;
	/** Unit vector pointing off the island, the way the water leaves. */
	dx: number;
	dz: number;
}

export interface Island {
	model: VoxelModel;
	plots: Plot[];
	waterfalls: Waterfall[];
}

const RX = 42;
const RZ = 31;

const GRASS = [0x78c444, 0x6dba3b, 0x84cd4e];
const GRASS_DARK = [0x55a530, 0x4a962a];
const VINE = [0x4f9e2c, 0x3f8a25, 0x5cab35];
const WATER = [0x4fb0ea, 0x45a4e2, 0x62bdf2];
const PATH = [0xe2cc97, 0xd8bf86, 0xead7a8];
const WOOD = 0x9b6a3c;
const TRUNK = 0x7a4a27;
const FLOWERS = [0xf48fb1, 0xe5484d, 0xffd23f, 0xffffff, 0x9b6dd6, 0xff9f43];

// Soil layers from the turf downward: [thickness, colour].
const STRATA: [number, number][] = [
	[2, 0x8b5a33],
	[2, 0x74482a],
	[3, 0xcf7f3a],
	[2, 0xddb57f],
	[3, 0xb7702f],
	[3, 0x80502c],
	[3, 0x9c6a3a],
	[99, 0x5c3a22],
];

function strataColor(depth: number): number {
	let d = depth;
	for (const [thickness, color] of STRATA) {
		if (d < thickness) return color;
		d -= thickness;
	}
	return STRATA[STRATA.length - 1][1];
}

const pickFrom = (palette: number[], h: number) =>
	palette[Math.min(palette.length - 1, Math.floor(h * palette.length))];

function distToSegment(
	px: number,
	pz: number,
	ax: number,
	az: number,
	bx: number,
	bz: number,
) {
	const vx = bx - ax;
	const vz = bz - az;
	const t = Math.max(
		0,
		Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz)),
	);
	return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

function distToLine(px: number, pz: number, line: number[][]) {
	let best = Number.POSITIVE_INFINITY;
	for (let i = 0; i < line.length - 1; i++) {
		best = Math.min(
			best,
			distToSegment(
				px,
				pz,
				line[i][0],
				line[i][1],
				line[i + 1][0],
				line[i + 1][1],
			),
		);
	}
	return best;
}

// Layout of the island top, drawn on a small grid and scaled up to the island.
const LAYOUT_SCALE = 1.4;
const scaled = (line: number[][]) =>
	line.map(([x, z]) => [x * LAYOUT_SCALE, z * LAYOUT_SCALE]);

const POND = { x: -11, z: 4, rx: 8, rz: 5.5 };
// Streams run past the rim so they spill over it.
const STREAMS = [
	[
		[-8, 5],
		[-11, 11],
		[-8, 16],
		[-11, 22],
		[-13, 34],
	],
	[
		[-4, 2],
		[4, 0],
		[11, 3],
		[18, 1],
		[25, -3],
		[40, -7],
	],
].map(scaled);
const PATHS = [
	[
		[11, -6],
		[8, -2],
		[7, 2],
		[4, 8],
		[3, 13],
		[7, 17],
	],
	[
		[8, -2],
		[0, -7],
		[-10, -9],
		[-19, -5],
	],
	[
		[4, 8],
		[-3, 12],
		[-16, 10],
		[-22, 3],
	],
].map(scaled);
const COTTAGE = { x: 17, z: -15 };
const PATCH = { x: 25, z: -8 };
const WELL = { x: 8, z: -13 };
const STREAM_HALF_WIDTH = 1.5;
const PATH_HALF_WIDTH = 1.1;

/** 0 at the centre, 1 at the wobbly rim. */
function rimDistance(x: number, z: number) {
	const a = Math.atan2(z / RZ, x / RX);
	const rim =
		1 +
		0.06 * Math.sin(3 * a + 1.3) +
		0.045 * Math.sin(5 * a + 0.4) +
		0.03 * Math.sin(9 * a + 2.1);
	return Math.hypot(x / RX, z / RZ) / rim;
}

function distToWater(x: number, z: number) {
	const pond =
		(Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz) - 1) *
		Math.min(POND.rx, POND.rz);
	let best = pond;
	for (const s of STREAMS) best = Math.min(best, distToLine(x, z, s) - STREAM_HALF_WIDTH);
	return best;
}

function distToPath(x: number, z: number) {
	let best = Number.POSITIVE_INFINITY;
	for (const p of PATHS) best = Math.min(best, distToLine(x, z, p) - PATH_HALF_WIDTH);
	return best;
}

/** Distance to anything built: the cottage, its vegetable patch, the well. */
function distToCottage(x: number, z: number) {
	return Math.min(
		Math.max(Math.abs(x - COTTAGE.x) - 4, Math.abs(z - COTTAGE.z) - 3),
		Math.max(Math.abs(x - PATCH.x) - 4, Math.abs(z - PATCH.z) - 3),
		Math.max(Math.abs(x - WELL.x) - 1, Math.abs(z - WELL.z) - 1),
	);
}

export function buildIsland(seed = 7): Island {
	const model = new VoxelModel();
	const rng = mulberry32(seed);
	const inside = (x: number, z: number) => rimDistance(x, z) <= 1;

	// --- Ground: turf on top, banded soil tapering into a ragged underside.
	for (let x = -RX - 4; x <= RX + 4; x++) {
		for (let z = -RZ - 4; z <= RZ + 4; z++) {
			const d = rimDistance(x, z);
			if (d > 1) continue;

			const edge = 1 - d;
			const broad = noise2(x * 0.09, z * 0.09, 11);
			const fine = noise2(x * 0.3, z * 0.3, 23);
			let depth = Math.round(5 + fine * 3 + edge ** 0.6 * (13 + broad * 14));
			// Occasional stalactite.
			if (d < 0.9 && hash3(x, 99, z) < 0.045) {
				depth += 2 + Math.floor(hash3(z, 5, x) * 6);
			}

			const wobble = Math.round(noise2(x * 0.1 + 50, z * 0.1 + 50, 3) * 3);
			const water = distToWater(x, z) <= 0;
			const path = !water && distToPath(x, z) <= 0;
			const bridge = water && distToPath(x, z) <= 0.3;

			for (let y = 0; y >= -depth; y--) {
				let color: number;
				if (y === 0) {
					if (water && !bridge) continue;
					if (bridge) color = WOOD;
					else if (path) color = pickFrom(PATH, hash3(x, 1, z));
					else {
						const patch = noise2(x * 0.22, z * 0.22, 41);
						color = GRASS[patch < 0.4 ? 1 : patch > 0.68 ? 2 : 0];
					}
				} else if (y === -1 && water) {
					color = pickFrom(WATER, hash3(x, 2, z));
				} else {
					color = strataColor(Math.max(0, -y - 1 + wobble - 1));
					// A few grey stones embedded in the cliff.
					if (noise2(x * 0.45 + y, z * 0.45 - y, 77) > 0.86) color = 0x9d968a;
				}
				model.set(x, y, z, color);
			}
		}
	}

	// --- Rim dressing: turf dripping over the cliff and loose hanging vines.
	const sides = [
		[1, 0],
		[-1, 0],
		[0, 1],
		[0, -1],
	];
	for (let x = -RX - 4; x <= RX + 4; x++) {
		for (let z = -RZ - 4; z <= RZ + 4; z++) {
			if (!inside(x, z) || distToWater(x, z) <= 0) continue;
			for (const [sx, sz] of sides) {
				const nx = x + sx;
				const nz = z + sz;
				if (inside(nx, nz)) continue;
				const h = hash3(nx, 7, nz);
				if (h < 0.55) {
					const len = 1 + Math.floor(hash3(nx, 8, nz) * 4);
					for (let y = -1; y >= -len; y--) {
						if (model.has(x, y, z)) {
							model.set(x, y, z, pickFrom(GRASS_DARK, hash3(x, y, z)));
						}
					}
				}
				if (h > 0.8) {
					const len = 3 + Math.floor(hash3(nx, 9, nz) * 8);
					model.set(nx, 0, nz, pickFrom(GRASS, hash3(nx, 3, nz)));
					for (let y = -1; y >= -len; y--) {
						model.set(nx, y, nz, pickFrom(VINE, hash3(nx, y, nz)));
					}
				}
			}
		}
	}

	// --- Plots: where earned trees go. Dart-throwing keeps them spread out
	// and the order stable, so the garden fills in the same way every time.
	const spots: Plot[] = [];
	for (let attempt = 0; attempt < 9000 && spots.length < 60; attempt++) {
		const x = Math.round((rng() * 2 - 1) * RX);
		const z = Math.round((rng() * 2 - 1) * RZ);
		if (rimDistance(x, z) > 0.8) continue;
		if (distToWater(x, z) < 3 || distToPath(x, z) < 2.5) continue;
		if (distToCottage(x, z) < 4) continue;
		if (spots.some((p) => Math.hypot(p.x - x, p.z - z) < 7)) continue;
		spots.push({ x, z });
	}
	// Fill order: start front and centre, then always take the spot farthest
	// from every tree so far, so a young garden is spread out, not clumped.
	const gap = (a: Plot, b: Plot) => Math.hypot(a.x - b.x, a.z - b.z);
	const plots: Plot[] = [];
	while (spots.length) {
		let best = 0;
		let bestScore = Number.NEGATIVE_INFINITY;
		spots.forEach((spot, i) => {
			const score = plots.length
				? Math.min(...plots.map((p) => gap(p, spot)))
				: -gap(spot, { x: 4, z: 14 });
			if (score > bestScore) {
				bestScore = score;
				best = i;
			}
		});
		plots.push(spots.splice(best, 1)[0]);
	}

	const free = (x: number, z: number, margin = 0.95) =>
		rimDistance(x, z) < margin &&
		distToWater(x, z) > 0.6 &&
		distToPath(x, z) > 0.4 &&
		distToCottage(x, z) > 0.5 &&
		!model.has(x, 1, z) &&
		!plots.some((p) => Math.hypot(p.x - x, p.z - z) < 2);

	const scatter = (count: number, place: (x: number, z: number) => void) => {
		for (let i = 0, tries = 0; i < count && tries < count * 30; tries++) {
			const x = Math.round((rng() * 2 - 1) * RX);
			const z = Math.round((rng() * 2 - 1) * RZ);
			if (!free(x, z)) continue;
			place(x, z);
			i++;
		}
	};

	// --- Small things that make it a garden rather than a lawn.
	scatter(20, (x, z) => {
		model.blob(
			x,
			1.4,
			z,
			1.7,
			1.3,
			1.7,
			(_, h) => (h > 0.93 ? 0xe5484d : pickFrom(GRASS_DARK, h)),
			0.35,
			x * 13 + z,
		);
	});
	scatter(14, (x, z) => {
		model.set(x, 1, z, 0xa7a199);
		if (rng() > 0.4) model.set(x + 1, 1, z, 0x8f8a83);
		if (rng() > 0.6) model.set(x, 2, z, 0xb5afa6);
	});
	scatter(6, (x, z) => {
		model.set(x, 1, z, 0xf3eee2);
		for (let dx = -1; dx <= 1; dx++) {
			for (let dz = -1; dz <= 1; dz++) {
				model.set(x + dx, 2, z + dz, dx || dz ? 0xe2463c : 0xfdf6ea);
			}
		}
	});
	scatter(100, (x, z) => {
		const color = pickFrom(FLOWERS, rng());
		if (rng() > 0.55) {
			model.set(x, 1, z, 0x4f9e2c);
			model.set(x, 2, z, color);
		} else {
			model.set(x, 1, z, color);
		}
	});
	scatter(240, (x, z) => {
		model.set(x, 1, z, pickFrom(GRASS_DARK, rng()));
	});

	// Reeds along the banks and a few lily pads on the pond.
	for (let x = -RX; x <= RX; x++) {
		for (let z = -RZ; z <= RZ; z++) {
			const w = distToWater(x, z);
			if (w > 0.2 && w < 1.3 && hash3(x, 12, z) < 0.22 && free(x, z, 0.9)) {
				model.set(x, 1, z, 0x3f8a25);
				model.set(x, 2, z, hash3(x, 13, z) > 0.5 ? 0x8a5a34 : 0x4f9e2c);
			}
			const onPond =
				Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz) < 0.8;
			if (onPond && hash3(x, 14, z) < 0.07 && model.has(x, -1, z)) {
				model.set(x, -1, z, 0x8fd65e);
			}
		}
	}

	// --- Where each stream leaves the island.
	const waterfalls: Waterfall[] = STREAMS.map((line) => {
		let last = { x: line[0][0], z: line[0][1], dx: 0, dz: 1 };
		for (let i = 0; i < line.length - 1; i++) {
			const [ax, az] = line[i];
			const [bx, bz] = line[i + 1];
			const len = Math.hypot(bx - ax, bz - az);
			for (let t = 0; t <= 1; t += 0.25 / len) {
				const x = ax + (bx - ax) * t;
				const z = az + (bz - az) * t;
				if (!inside(Math.round(x), Math.round(z))) return last;
				last = { x, z, dx: (bx - ax) / len, dz: (bz - az) / len };
			}
		}
		return last;
	});

	return { model, plots, waterfalls };
}

// ---------------------------------------------------------------- trees

const OAK = [0x4caf3f, 0x43a038, 0x5bbf4a, 0x3d9432];
const PINE = [0x2f8f4e, 0x2a8246, 0x379b58];
const BIRCH = [0x8fd14f, 0x7cc344, 0xa0db5c];
const GOLD = [0xf6c431, 0xf0a92a, 0xffd95a, 0xe8932a];
const DIAMOND = [0x56d4f2, 0x86e6ff, 0x34b7e8, 0xc9f6ff];

/** Leaf colour: lighter on the sunlit crown, darker underneath. */
const leaves = (palette: number[]) => (dy: number, h: number) => {
	const lift = dy > 0.35 ? 0.25 : dy < -0.3 ? -0.2 : 0;
	return pickFrom(palette, Math.max(0, Math.min(0.999, h * 0.75 + 0.12 + lift)));
};

function oak(model: VoxelModel, seed: number) {
	const h = 4 + (seed % 2);
	for (let y = 0; y < h; y++) model.set(0, y, 0, TRUNK);
	model.blob(0, h + 1.4, 0, 3.3, 2.7, 3.3, leaves(OAK), 0.32, seed);
}

/**
 * Earned trees. A plain session grows a common tree; four of them merge into
 * a golden one and twenty-four into a towering crystal tree.
 */
export function buildTree(type: TreeType, seed: number): VoxelModel {
	const model = new VoxelModel();

	if (type === "gold") {
		const h = 6;
		for (let y = 0; y < h; y++) model.set(0, y, 0, 0x6f4526);
		for (const [x, z] of [
			[1, 0],
			[-1, 0],
			[0, 1],
			[0, -1],
		]) {
			model.set(x, 0, z, 0x6f4526);
		}
		model.blob(0, h + 2, 0, 4.4, 3.5, 4.4, leaves(GOLD), 0.3, seed);
		return model;
	}

	if (type === "diamond") {
		const h = 9;
		for (let y = 0; y < h; y++) {
			for (const [x, z] of [
				[0, 0],
				[1, 0],
				[0, 1],
				[1, 1],
			]) {
				model.set(x, y, z, (x + y + z) % 3 ? 0xeee5d6 : 0xd6c9b3);
			}
		}
		for (const [x, z] of [
			[-1, 0],
			[2, 1],
			[0, -1],
			[1, 2],
		]) {
			model.set(x, 0, z, 0xd6c9b3);
			model.set(x, 1, z, 0xeee5d6);
		}
		const pick = leaves(DIAMOND);
		model.blob(0.5, h + 3, 0.5, 5.6, 4.4, 5.6, pick, 0.28, seed);
		model.blob(-3.5, h + 0.5, 1.5, 3, 2.4, 3, pick, 0.3, seed + 1);
		model.blob(4.5, h + 1, -0.5, 3, 2.4, 3, pick, 0.3, seed + 2);
		model.blob(0.5, h + 7.5, 0.5, 2.6, 2, 2.6, pick, 0.3, seed + 3);
		return model;
	}

	const species = seed % 3;
	if (species === 0) {
		oak(model, seed);
	} else if (species === 1) {
		model.set(0, 0, 0, TRUNK);
		model.set(0, 1, 0, TRUNK);
		const tiers = [3, 3, 2, 2, 2, 1, 1, 0];
		tiers.forEach((r, i) => {
			const y = 2 + i;
			for (let x = -r; x <= r; x++) {
				for (let z = -r; z <= r; z++) {
					if (Math.abs(x) + Math.abs(z) > r + (r > 1 ? 1 : 0)) continue;
					model.set(x, y, z, pickFrom(PINE, hash3(x + seed, y, z)));
				}
			}
		});
	} else {
		for (let y = 0; y < 6; y++) {
			model.set(0, y, 0, hash3(seed, y, 4) > 0.72 ? 0x5b5148 : 0xf1ebde);
		}
		model.blob(0, 7.2, 0, 2.6, 2.6, 2.6, leaves(BIRCH), 0.32, seed);
	}
	return model;
}

/**
 * The tree being grown by the running session. The last stage is the very
 * tree that gets planted once the session is claimed.
 */
export function buildSapling(stage: number, seed: number): VoxelModel {
	if (stage >= 3) return buildTree("normal", seed);

	const model = new VoxelModel();
	// A patch of turned soil marks the spot.
	const cross = [
		[0, 0],
		[1, 0],
		[-1, 0],
		[0, 1],
		[0, -1],
	];
	for (const [x, z] of cross) {
		model.set(x, 0, z, x || z ? 0x74482a : 0x8b5a33);
	}
	if (stage <= 0) {
		model.set(0, 1, 0, 0x6cc04a);
		model.set(1, 2, 0, 0x8fd65e);
		model.set(-1, 2, 0, 0x8fd65e);
	} else if (stage === 1) {
		model.set(0, 1, 0, 0x7a8a35);
		model.set(0, 2, 0, 0x7a8a35);
		for (const [x, z] of cross) model.set(x, 3, z, 0x6cc04a);
		model.set(0, 4, 0, 0x8fd65e);
	} else {
		for (let y = 1; y <= 3; y++) model.set(0, y, 0, TRUNK);
		model.blob(0, 5, 0, 2.1, 1.9, 2.1, leaves(OAK), 0.3, seed);
	}
	return model;
}

// ------------------------------------------------------------- scenery

export type IsletKind = "oak" | "pine" | "flowers" | "hut";

export function buildIslet(seed: number, radius: number, kind: IsletKind) {
	const model = new VoxelModel();
	const rng = mulberry32(seed);
	for (let x = -radius - 1; x <= radius + 1; x++) {
		for (let z = -radius - 1; z <= radius + 1; z++) {
			const wob = 1 + (noise2(x * 0.5, z * 0.5, seed) - 0.5) * 0.5;
			const d = Math.hypot(x, z) / (radius * wob);
			if (d > 1) continue;
			const depth = Math.round(
				1 + (1 - d) ** 0.8 * radius * 1.9 + hash3(x, seed, z) * 2,
			);
			for (let y = 0; y >= -depth; y--) {
				model.set(
					x,
					y,
					z,
					y === 0
						? pickFrom(GRASS, hash3(x, seed, z))
						: strataColor((-y - 1) * 2),
				);
			}
			if (d > 0.75 && hash3(x, seed + 1, z) > 0.7) {
				const len = 1 + Math.floor(hash3(x, seed + 2, z) * 3);
				for (let y = -1; y >= -len; y--) {
					if (model.has(x, y, z)) model.set(x, y, z, pickFrom(VINE, rng()));
				}
			}
		}
	}

	if (kind === "oak") {
		for (let y = 1; y <= 3; y++) model.set(0, y, 0, TRUNK);
		model.blob(0, 5, 0, 2.3, 2, 2.3, leaves(seed % 2 ? GOLD : OAK), 0.3, seed);
	} else if (kind === "pine") {
		model.set(0, 1, 0, TRUNK);
		[2, 2, 1, 1, 0].forEach((r, i) => {
			for (let x = -r; x <= r; x++) {
				for (let z = -r; z <= r; z++) {
					if (Math.abs(x) + Math.abs(z) > r + (r > 1 ? 1 : 0)) continue;
					model.set(x, 2 + i, z, pickFrom(PINE, hash3(x, i + seed, z)));
				}
			}
		});
	} else if (kind === "hut") {
		for (let x = -1; x <= 1; x++) {
			for (let z = -1; z <= 1; z++) {
				model.set(x, 1, z, x === 0 && z === 1 ? 0x6b3f22 : 0xf6ecd4);
				model.set(x, 2, z, 0xf6ecd4);
			}
		}
		for (let k = 0; k <= 2; k++) {
			for (let x = -2 + k; x <= 2 - k; x++) {
				for (let z = -2 + k; z <= 2 - k; z++) {
					model.set(x, 3 + k, z, k % 2 ? 0xc2452f : 0xd9553f);
				}
			}
		}
	}
	for (let i = 0; i < radius * 2; i++) {
		const x = Math.round((rng() * 2 - 1) * radius * 0.7);
		const z = Math.round((rng() * 2 - 1) * radius * 0.7);
		if (model.has(x, 0, z) && !model.has(x, 1, z)) {
			model.set(x, 1, z, pickFrom(kind === "flowers" ? FLOWERS : GRASS_DARK, rng()));
		}
	}
	return model;
}

export function buildCloud(seed: number) {
	const model = new VoxelModel();
	const rng = mulberry32(seed);
	const white = (dy: number) => (dy < -0.3 ? 0xe6eff6 : 0xffffff);
	const puffs = 3 + Math.floor(rng() * 3);
	for (let i = 0; i < puffs; i++) {
		const r = 2.5 + rng() * 2.5;
		model.blob(
			(i - (puffs - 1) / 2) * 3.4 + rng(),
			rng() * 1.5,
			(rng() - 0.5) * 3,
			r * 1.3,
			r * 0.7,
			r,
			white,
			0.15,
			seed + i,
		);
	}
	return model;
}

export function buildBalloon(a: number, b: number, cap: number) {
	const model = new VoxelModel();
	const R = 5;
	for (let y = -7; y <= R; y++) {
		const r = y >= 0 ? Math.sqrt(R * R - y * y) : R * (1 - (-y / 9) ** 1.6);
		for (let x = -R; x <= R; x++) {
			for (let z = -R; z <= R; z++) {
				if (Math.hypot(x, z) > r + 0.25) continue;
				const gore = Math.floor(((Math.atan2(z, x) + Math.PI) / Math.PI) * 4);
				model.set(x, y, z, y >= R - 1 || y === -7 ? cap : gore % 2 ? a : b);
			}
		}
	}
	for (const [x, z] of [
		[-1, -1],
		[1, -1],
		[-1, 1],
		[1, 1],
	]) {
		model.set(x, -8, z, 0x5b4632);
		model.set(x, -9, z, 0x5b4632);
	}
	for (let x = -1; x <= 1; x++) {
		for (let z = -1; z <= 1; z++) {
			model.set(x, -10, z, 0xb07a45);
			model.set(x, -11, z, 0x9b6a3c);
		}
	}
	return model;
}

/** A small bobbing gem that points out the tree currently growing. */
export function buildMarker() {
	const model = new VoxelModel();
	model.set(0, 0, 0, 0xf6c431);
	for (const [x, z] of [
		[0, 0],
		[1, 0],
		[-1, 0],
		[0, 1],
		[0, -1],
	]) {
		model.set(x, 1, z, x || z ? 0xffd95a : 0xfff1d6);
	}
	model.set(0, 2, 0, 0xffd95a);
	return model;
}

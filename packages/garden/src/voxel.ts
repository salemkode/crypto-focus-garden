import * as THREE from "three";

export type RNG = () => number;

/** Small deterministic PRNG so the garden looks the same on every visit. */
export function mulberry32(seed: number): RNG {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Stable 0..1 hash of an integer lattice point. */
export function hash3(x: number, y: number, z: number): number {
	let h =
		Math.imul(x | 0, 374761393) ^
		Math.imul(y | 0, 668265263) ^
		Math.imul(z | 0, 1440662683);
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 2D value noise in 0..1. */
export function noise2(x: number, z: number, seed = 0): number {
	const ix = Math.floor(x);
	const iz = Math.floor(z);
	const fx = x - ix;
	const fz = z - iz;
	const sx = fx * fx * (3 - 2 * fx);
	const sz = fz * fz * (3 - 2 * fz);
	const a = hash3(ix, seed, iz);
	const b = hash3(ix + 1, seed, iz);
	const c = hash3(ix, seed, iz + 1);
	const d = hash3(ix + 1, seed, iz + 1);
	return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

const OFFSET = 512;
const SPAN = 1024;

const keyOf = (x: number, y: number, z: number) =>
	((x + OFFSET) * SPAN + (y + OFFSET)) * SPAN + (z + OFFSET);

// Each face: outward normal, then two tangents with u × v = normal so the
// (-,-) (+,-) (+,+) (-,+) corner order winds counter-clockwise from outside.
const FACES: [number[], number[], number[]][] = [
	[[1, 0, 0], [0, 1, 0], [0, 0, 1]],
	[[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
	[[0, 1, 0], [0, 0, 1], [1, 0, 0]],
	[[0, -1, 0], [1, 0, 0], [0, 0, 1]],
	[[0, 0, 1], [1, 0, 0], [0, 1, 0]],
	[[0, 0, -1], [0, 1, 0], [1, 0, 0]],
];
const CORNERS = [
	[-1, -1],
	[1, -1],
	[1, 1],
	[-1, 1],
];
// Brightness for 0..3 open neighbours around a vertex (baked ambient occlusion).
const AO_LEVELS = [0.5, 0.66, 0.83, 1];

const linearCache = new Map<number, [number, number, number]>();
function linearOf(hex: number): [number, number, number] {
	let c = linearCache.get(hex);
	if (!c) {
		const col = new THREE.Color(hex);
		c = [col.r, col.g, col.b];
		linearCache.set(hex, c);
	}
	return c;
}

/** A sparse grid of coloured unit cubes that meshes into one geometry. */
export class VoxelModel {
	private cells = new Map<number, number>();

	get size() {
		return this.cells.size;
	}

	set(x: number, y: number, z: number, color: number) {
		this.cells.set(keyOf(x, y, z), color);
	}

	has(x: number, y: number, z: number) {
		return this.cells.has(keyOf(x, y, z));
	}

	remove(x: number, y: number, z: number) {
		this.cells.delete(keyOf(x, y, z));
	}

	/** Fill a noisy ellipsoid; `pick` chooses a colour for each cell. */
	blob(
		cx: number,
		cy: number,
		cz: number,
		rx: number,
		ry: number,
		rz: number,
		pick: (dy: number, h: number) => number,
		rough = 0.3,
		seed = 0,
	) {
		for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
			for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
				for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
					const dx = (x - cx) / rx;
					const dy = (y - cy) / ry;
					const dz = (z - cz) / rz;
					const h = hash3(x + seed * 31, y + seed * 17, z + seed * 7);
					if (dx * dx + dy * dy + dz * dz <= 1 - h * rough) {
						this.set(x, y, z, pick(dy, hash3(z - seed, x + seed, y)));
					}
				}
			}
		}
	}

	/**
	 * Mesh only the exposed faces, darkening vertices tucked into corners so
	 * every cube reads as a cube without any textures.
	 */
	toGeometry(jitter = 0.05): THREE.BufferGeometry {
		const positions: number[] = [];
		const normals: number[] = [];
		const colors: number[] = [];
		const indices: number[] = [];
		const ao = [0, 0, 0, 0];

		for (const [k, hex] of this.cells) {
			const z = (k % SPAN) - OFFSET;
			const y = (Math.floor(k / SPAN) % SPAN) - OFFSET;
			const x = Math.floor(k / (SPAN * SPAN)) - OFFSET;
			const [r, g, b] = linearOf(hex);
			const tint = 1 + (hash3(x, y, z) - 0.5) * 2 * jitter;

			for (const [n, u, v] of FACES) {
				if (this.has(x + n[0], y + n[1], z + n[2])) continue;
				const base = positions.length / 3;

				for (let i = 0; i < 4; i++) {
					const [su, sv] = CORNERS[i];
					positions.push(
						x + 0.5 * (n[0] + su * u[0] + sv * v[0]),
						y + 0.5 * (n[1] + su * u[1] + sv * v[1]),
						z + 0.5 * (n[2] + su * u[2] + sv * v[2]),
					);
					normals.push(n[0], n[1], n[2]);

					const ox = x + n[0];
					const oy = y + n[1];
					const oz = z + n[2];
					const s1 = this.has(ox + su * u[0], oy + su * u[1], oz + su * u[2])
						? 1
						: 0;
					const s2 = this.has(ox + sv * v[0], oy + sv * v[1], oz + sv * v[2])
						? 1
						: 0;
					const cn = this.has(
						ox + su * u[0] + sv * v[0],
						oy + su * u[1] + sv * v[1],
						oz + su * u[2] + sv * v[2],
					)
						? 1
						: 0;
					ao[i] = s1 && s2 ? 0 : 3 - (s1 + s2 + cn);
					const shade = AO_LEVELS[ao[i]] * tint;
					colors.push(r * shade, g * shade, b * shade);
				}

				// Split the quad along the brighter diagonal to avoid AO streaks.
				if (ao[0] + ao[2] >= ao[1] + ao[3]) {
					indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
				} else {
					indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
				}
			}
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute(
			"position",
			new THREE.Float32BufferAttribute(positions, 3),
		);
		geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
		geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
		geometry.setIndex(indices);
		geometry.computeBoundingSphere();
		return geometry;
	}
}

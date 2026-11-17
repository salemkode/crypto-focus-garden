import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { geometryToGlb, readGlb } from "../src/glb";
import { buildLevelModel, type Level } from "../src/ladder";
import { buildTierModel } from "../src/tiers";

const floats = (bin: Uint8Array, view: { byteOffset: number; byteLength: number }) =>
	new Float32Array(bin.buffer.slice(bin.byteOffset + view.byteOffset, bin.byteOffset + view.byteOffset + view.byteLength));

describe("geometryToGlb", () => {
	test("round-trips positions, normals, colours and indices of a tier model", () => {
		const geometry = buildTierModel("tree", "oak", 42).toGeometry(0);
		const { json, bin } = readGlb(geometryToGlb(geometry, { name: "oak-tree" }));
		expect(json.asset.version).toBe("2.0");
		expect(json.meshes).toHaveLength(1);
		expect(json.materials).toHaveLength(1);
		expect(json.meshes[0].name).toBe("oak-tree");
		const [pos, nor, col, idx] = json.accessors;
		const views = json.bufferViews;
		const count = geometry.getAttribute("position").count;
		expect(pos.count).toBe(count);
		expect(Array.from(floats(bin, views[0]))).toEqual(Array.from(geometry.getAttribute("position").array as Float32Array));
		expect(Array.from(floats(bin, views[1]))).toEqual(Array.from(geometry.getAttribute("normal").array as Float32Array));
		const colours = new Uint16Array(bin.buffer.slice(bin.byteOffset + views[2].byteOffset, bin.byteOffset + views[2].byteOffset + views[2].byteLength));
		const source = geometry.getAttribute("color");
		for (let i = 0; i < count; i += 97) {
			expect(colours[i * 4] / 65535).toBeCloseTo(source.getX(i), 4);
			expect(colours[i * 4 + 3]).toBe(65535);
		}
		expect(col.normalized).toBe(true);
		expect(idx.count).toBe(geometry.getIndex()!.count);
		geometry.computeBoundingBox();
		expect(pos.min).toEqual(geometry.boundingBox!.min.toArray());
		expect(pos.max).toEqual(geometry.boundingBox!.max.toArray());
	});

	test("every buffer view is 4-byte aligned and inside the binary chunk", () => {
		for (const level of [1, 5, 9, 10] as Level[]) {
			const bytes = geometryToGlb(buildLevelModel(level, "pine", 7).toGeometry());
			expect(bytes.byteLength % 4).toBe(0);
			const { json, bin } = readGlb(bytes);
			for (const view of json.bufferViews) {
				expect(view.byteOffset % 4).toBe(0);
				expect(view.byteOffset + view.byteLength).toBeLessThanOrEqual(bin.byteLength);
			}
		}
	});

	test("uses uint32 indices only above 65535 vertices", () => {
		const small = readGlb(geometryToGlb(buildTierModel("sprout", "birch", 1).toGeometry())).json;
		expect(small.accessors[3].componentType).toBe(5123);
		const big = new THREE.BoxGeometry(1, 1, 1, 200, 200, 1);
		big.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(big.getAttribute("position").count * 3).fill(0.5), 3));
		expect(big.getAttribute("position").count).toBeGreaterThan(65535);
		expect(readGlb(geometryToGlb(big)).json.accessors[3].componentType).toBe(5125);
	});

	test("rejects geometry without vertex colours", () => {
		expect(() => geometryToGlb(new THREE.BoxGeometry(1, 1, 1))).toThrow(/color/);
	});
});

describe("geometryToGlb material options", () => {
	test("unlit, blended and double-sided materials", () => {
		const geometry = buildTierModel("sprout", "oak", 3).toGeometry();
		const plain = readGlb(geometryToGlb(geometry)).json;
		expect(plain.materials[0].alphaMode).toBeUndefined();
		expect(plain.extensionsUsed).toBeUndefined();
		const fancy = readGlb(geometryToGlb(geometry, { unlit: true, opacity: 0.35, doubleSided: true })).json;
		expect(fancy.materials[0].alphaMode).toBe("BLEND");
		expect(fancy.materials[0].pbrMetallicRoughness.baseColorFactor[3]).toBeCloseTo(0.35);
		expect(fancy.materials[0].doubleSided).toBe(true);
		expect(fancy.materials[0].extensions.KHR_materials_unlit).toEqual({});
		expect(fancy.extensionsUsed).toEqual(["KHR_materials_unlit"]);
	});
});

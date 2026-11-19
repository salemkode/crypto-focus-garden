/**
 * Serialises a voxel BufferGeometry to a binary glTF 2.0 (.glb) file with no browser APIs, so it
 * runs in bun (build-time export) and in Hermes (runtime export of history-dependent models).
 *
 * Output shape, chosen for a native renderer such as Filament:
 * - one mesh, one primitive, one material (rough, non-metallic; colour comes from COLOR_0);
 * - POSITION and NORMAL as float32, COLOR_0 as normalised uint16 RGBA (linear, as three.js stores it);
 * - indices as uint16 when the vertex count allows, otherwise uint32.
 */
import type * as THREE from 'three';

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN\0"
const FLOAT = 5126, UNSIGNED_SHORT = 5123, UNSIGNED_INT = 5125;
const ARRAY_BUFFER = 34962, ELEMENT_ARRAY_BUFFER = 34963;

const pad4 = (n: number) => (n + 3) & ~3;

export interface GlbOptions {
  /** Mesh and node name inside the file. */
  name?: string;
  /** No lighting (three.js MeshBasicMaterial): KHR_materials_unlit. */
  unlit?: boolean;
  /** Below 1, the material blends (alphaMode BLEND) with this opacity. */
  opacity?: number;
  /** Draw back faces too. */
  doubleSided?: boolean;
  /** PBR roughness, 0 (mirror-like) to 1 (matte, the default). */
  roughness?: number;
}

/** The geometry as a .glb file. Requires position, normal and color attributes and an index. */
export function geometryToGlb(geometry: THREE.BufferGeometry, options: GlbOptions = {}): Uint8Array {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const color = geometry.getAttribute('color');
  const index = geometry.getIndex();
  if (!position || !normal || !color || !index) throw new Error('geometryToGlb: needs position, normal, color and an index');
  const count = position.count;
  if (normal.count !== count || color.count !== count) throw new Error('geometryToGlb: attribute counts differ');

  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Uint16Array(count * 4);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) {
    const p = [position.getX(i), position.getY(i), position.getZ(i)];
    for (let k = 0; k < 3; k++) { positions[i * 3 + k] = p[k]; if (p[k] < min[k]) min[k] = p[k]; if (p[k] > max[k]) max[k] = p[k]; }
    normals[i * 3] = normal.getX(i); normals[i * 3 + 1] = normal.getY(i); normals[i * 3 + 2] = normal.getZ(i);
    const rgb = [color.getX(i), color.getY(i), color.getZ(i)];
    for (let k = 0; k < 3; k++) colors[i * 4 + k] = Math.round(Math.min(1, Math.max(0, rgb[k])) * 65535);
    colors[i * 4 + 3] = 65535;
  }
  if (!count) { min.fill(0); max.fill(0); }
  const wide = count > 65535;
  const indices = wide ? new Uint32Array(index.count) : new Uint16Array(index.count);
  for (let i = 0; i < index.count; i++) indices[i] = index.getX(i);

  // One binary buffer: each view starts on a 4-byte boundary.
  const parts = [positions, normals, colors, indices] as const;
  const offsets: number[] = [];
  let length = 0;
  for (const part of parts) { offsets.push(length); length = pad4(length + part.byteLength); }
  const bin = new Uint8Array(length);
  parts.forEach((part, i) => bin.set(new Uint8Array(part.buffer, part.byteOffset, part.byteLength), offsets[i]));

  const name = options.name ?? 'model';
  const opacity = Math.min(1, Math.max(0, options.opacity ?? 1));
  const gltf = {
    asset: { version: '2.0', generator: 'focus-garden glb.ts' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    meshes: [{ name, primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, indices: 3, material: 0, mode: 4 }] }],
    materials: [{
      name: 'voxel',
      pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, opacity], metallicFactor: 0, roughnessFactor: Math.min(1, Math.max(0, options.roughness ?? 1)) },
      ...(opacity < 1 ? { alphaMode: 'BLEND' } : {}),
      ...(options.doubleSided ? { doubleSided: true } : {}),
      ...(options.unlit ? { extensions: { KHR_materials_unlit: {} } } : {}),
    }],
    ...(options.unlit ? { extensionsUsed: ['KHR_materials_unlit'] } : {}),
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: offsets[0], byteLength: positions.byteLength, target: ARRAY_BUFFER },
      { buffer: 0, byteOffset: offsets[1], byteLength: normals.byteLength, target: ARRAY_BUFFER },
      { buffer: 0, byteOffset: offsets[2], byteLength: colors.byteLength, target: ARRAY_BUFFER },
      { buffer: 0, byteOffset: offsets[3], byteLength: indices.byteLength, target: ELEMENT_ARRAY_BUFFER },
    ],
    accessors: [
      { bufferView: 0, componentType: FLOAT, count, type: 'VEC3', min, max },
      { bufferView: 1, componentType: FLOAT, count, type: 'VEC3' },
      { bufferView: 2, componentType: UNSIGNED_SHORT, normalized: true, count, type: 'VEC4' },
      { bufferView: 3, componentType: wide ? UNSIGNED_INT : UNSIGNED_SHORT, count: indices.length, type: 'SCALAR' },
    ],
  };

  // The JSON chunk is padded with spaces, the binary chunk with zeros (glTF 2.0 §4.4.3).
  const text = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonLength = pad4(text.byteLength);
  const total = 12 + 8 + jsonLength + 8 + bin.byteLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, GLB_MAGIC, true); view.setUint32(4, 2, true); view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true); view.setUint32(16, CHUNK_JSON, true);
  out.set(text, 20); out.fill(0x20, 20 + text.byteLength, 20 + jsonLength);
  const binAt = 20 + jsonLength;
  view.setUint32(binAt, bin.byteLength, true); view.setUint32(binAt + 4, CHUNK_BIN, true);
  out.set(bin, binAt + 8);
  return out;
}

/** Reads the JSON and binary chunks of a .glb (for tests and tooling). */
export function readGlb(bytes: Uint8Array): { json: any; bin: Uint8Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(4, true) !== 2) throw new Error('readGlb: not a glTF 2.0 binary');
  if (view.getUint32(8, true) !== bytes.byteLength) throw new Error('readGlb: length mismatch');
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== CHUNK_JSON) throw new Error('readGlb: first chunk is not JSON');
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  const binAt = 20 + jsonLength;
  if (view.getUint32(binAt + 4, true) !== CHUNK_BIN) throw new Error('readGlb: second chunk is not BIN');
  const bin = bytes.subarray(binAt + 8, binAt + 8 + view.getUint32(binAt, true));
  return { json, bin };
}

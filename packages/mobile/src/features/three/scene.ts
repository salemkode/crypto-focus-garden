import * as THREE from 'three';
import { buildGrowthModel, buildTierModel, buildWitheredModel, type SpeciesKey, type Tier } from '@focus-garden/garden/tiers';
import type { SpeciesId } from '../focus/catalog';

export interface ItemSpec { tier: Tier; species: SpeciesId; seed: number; withered?: boolean; progress?: number }

export const SPECIES_3D: Record<SpeciesId, SpeciesKey> = { oak: 'oak', cherry: 'cherry', pine: 'pine', maple: 'maple', birch: 'birch', cashtree: 'cash' };
/** Growth is shown in 16 steps so renders can be reused while a session runs. */
export const GROWTH_STEPS = 16;
export const quantize = (progress: number) => Math.round(Math.max(0, Math.min(1, progress)) * GROWTH_STEPS) / GROWTH_STEPS;

export function specKey(spec: ItemSpec) {
  return [spec.tier, spec.species, spec.seed, spec.withered ? 'w' : '', spec.progress === undefined ? '' : quantize(spec.progress)].join('|');
}

export function buildItem(spec: ItemSpec) {
  const species = SPECIES_3D[spec.species];
  if (spec.withered) return buildWitheredModel(species, spec.seed);
  if (spec.progress !== undefined && quantize(spec.progress) < 1) return buildGrowthModel(species, quantize(spec.progress), spec.seed, spec.tier);
  return buildTierModel(spec.tier, species, spec.seed);
}

/** Warm, soft lighting shared by every 3D view so items look the same everywhere. */
export function createStage() {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcdb89a, 2.1));
  const sun = new THREE.DirectionalLight(0xfff3dc, 2.2);
  sun.position.set(-40, 90, 60);
  scene.add(sun);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const pivot = new THREE.Group();
  scene.add(pivot);
  return { scene, material, pivot };
}

/**
 * The item whose size sets the camera. A growing tree is framed at its finished size,
 * so it starts small and grows into the frame instead of looking huge from the first second.
 */
export function framingGeometry(spec: ItemSpec, geometry: THREE.BufferGeometry) {
  if (spec.withered || spec.progress === undefined || quantize(spec.progress) >= 1) return geometry;
  return buildTierModel(spec.tier, SPECIES_3D[spec.species], spec.seed).toGeometry();
}

/** Frames a mesh in a 3/4 view from slightly above, filling the view. */
export function frame(camera: THREE.PerspectiveCamera, geometry: THREE.BufferGeometry, fill = 1) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);
  // Bounding-sphere fit: the item stays fully in view at every rotation angle.
  const radius = size.length() / 2;
  const distance = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) / fill;
  const direction = new THREE.Vector3(1, 0.72, 1.15).normalize();
  camera.position.copy(center.clone().add(direction.multiplyScalar(distance)));
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  return center;
}

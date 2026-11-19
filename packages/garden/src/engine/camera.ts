/**
 * The valley camera: map-style movement driven by plain gesture numbers, so the same controller
 * works under browser pointer events and React Native gesture handlers.
 *
 * - pan(dx, dy) moves across the ground under the finger
 * - zoom(factor) pinches toward or away from the target
 * - rotate(radians) turns around the target; tilt(radians) looks lower or higher
 * - flyTo(point, distance) eases there; frame(radius) shows the whole island
 * - release() keeps a little momentum; after a quiet spell the view slowly turns by itself
 */
import * as THREE from 'three';

export interface CameraLimits { minDistance: number; maxDistance: number; minPitch: number; maxPitch: number; bounds: number }

export class ValleyCamera {
  readonly target = new THREE.Vector3();
  distance = 600;
  yaw = Math.PI / 4;
  pitch = 0.62;
  autoTurn = true;
  limits: CameraLimits = { minDistance: 18, maxDistance: 1400, minPitch: 0.12, maxPitch: 1.42, bounds: 200 };
  private velocity = { x: 0, z: 0, yaw: 0 };
  private flight: { from: THREE.Vector3; to: THREE.Vector3; d0: number; d1: number; start: number; length: number } | null = null;
  private quietSince = 0;
  private touching = false;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  /** World units per screen point at the target, for a view `height` points tall. */
  private unitsPerPoint(height: number) {
    return (2 * this.distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / Math.max(1, height);
  }

  begin(now: number) { this.touching = true; this.flight = null; this.autoTurn = false; this.velocity = { x: 0, z: 0, yaw: 0 }; this.quietSince = now; }
  /** Moves the ground with the finger: dragging right moves the land right. */
  pan(dx: number, dy: number, height: number) {
    const k = this.unitsPerPoint(height);
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // Screen right is perpendicular to the view direction on the ground; screen up is away from the camera.
    const mx = (-dx * cos + -dy * sin / Math.max(0.35, Math.sin(this.pitch))) * k;
    const mz = (dx * sin + -dy * cos / Math.max(0.35, Math.sin(this.pitch))) * k;
    this.target.x += mx; this.target.z += mz;
    this.velocity.x = mx * 60; this.velocity.z = mz * 60;
    this.clamp();
  }
  zoom(factor: number) {
    this.distance = THREE.MathUtils.clamp(this.distance / Math.max(0.01, factor), this.limits.minDistance, this.limits.maxDistance);
  }
  rotate(radians: number) { this.yaw += radians; this.velocity.yaw = radians * 60; }
  tilt(radians: number) { this.pitch = THREE.MathUtils.clamp(this.pitch + radians, this.limits.minPitch, this.limits.maxPitch); }
  release(now: number) { this.touching = false; this.quietSince = now; }
  /** Under a finger, flying, or still gliding after a fling. The slow idle turn does not count. */
  get moving() {
    return this.touching || this.flight !== null || Math.hypot(this.velocity.x, this.velocity.z) > 0.05 || Math.abs(this.velocity.yaw) > 0.001;
  }

  flyTo(point: THREE.Vector3, distance: number, now: number, length = 900) {
    this.flight = { from: this.target.clone(), to: point.clone(), d0: this.distance, d1: THREE.MathUtils.clamp(distance, this.limits.minDistance, this.limits.maxDistance), start: now, length };
    this.velocity = { x: 0, z: 0, yaw: 0 };
  }
  frame(radius: number, now: number) {
    this.limits.bounds = radius;
    // A tall phone sees less across, so step back until the island's width fits.
    const narrow = Math.min(1, Math.max(0.5, this.camera.aspect * 1.25));
    this.flyTo(new THREE.Vector3(0, 0, 0), (260 + radius * 4.2) / narrow, now, 1100);
  }

  private clamp() {
    const b = this.limits.bounds;
    this.target.x = THREE.MathUtils.clamp(this.target.x, -b, b);
    this.target.z = THREE.MathUtils.clamp(this.target.z, -b, b);
  }

  /** Advances easing, momentum and the idle turn, then places the three.js camera. */
  update(now: number, dt: number) {
    if (this.flight) {
      const k = Math.min(1, (now - this.flight.start) / this.flight.length), e = 1 - Math.pow(1 - k, 3);
      this.target.lerpVectors(this.flight.from, this.flight.to, e);
      this.distance = this.flight.d0 + (this.flight.d1 - this.flight.d0) * e;
      if (k >= 1) this.flight = null;
    } else if (!this.touching) {
      // Momentum after a fling, fading quickly.
      const fade = Math.pow(0.02, dt);
      this.target.x += this.velocity.x * dt; this.target.z += this.velocity.z * dt; this.yaw += this.velocity.yaw * dt;
      this.velocity.x *= fade; this.velocity.z *= fade; this.velocity.yaw *= fade;
      this.clamp();
      if (now - this.quietSince > 9000) this.autoTurn = true;
      if (this.autoTurn) this.yaw += dt * 0.05;
    }
    const c = this.camera;
    const flat = this.distance * Math.cos(this.pitch);
    c.position.set(this.target.x + flat * Math.sin(this.yaw), this.target.y + this.distance * Math.sin(this.pitch), this.target.z + flat * Math.cos(this.yaw));
    c.lookAt(this.target);
    c.updateMatrixWorld();
  }
}

import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { ValleyCamera } from '../src/engine/camera';

const setup = () => { const cam = new THREE.PerspectiveCamera(32, 0.5, 0.5, 5000); const c = new ValleyCamera(cam); c.update(0, 0); return { cam, c }; };
const project = (cam: THREE.PerspectiveCamera, p: THREE.Vector3) => p.clone().project(cam);

test('dragging moves the land with the finger', () => {
  const { cam, c } = setup();
  const mark = new THREE.Vector3(30, 0, 30);
  const before = project(cam, mark);
  c.begin(0); c.pan(40, 0, 800); c.release(0); c.update(0, 0);
  const after = project(cam, mark);
  expect(after.x).toBeGreaterThan(before.x); // dragged right, the land moved right
  c.begin(0); c.pan(0, 40, 800); c.release(0); c.update(0, 0);
  expect(project(cam, mark).y).toBeLessThan(after.y); // dragged down, the land moved down
});

test('zoom, tilt and bounds stay inside their limits', () => {
  const { c } = setup();
  c.zoom(1000); expect(c.distance).toBe(c.limits.minDistance);
  c.zoom(0.0001); expect(c.distance).toBe(c.limits.maxDistance);
  c.tilt(10); expect(c.pitch).toBe(c.limits.maxPitch);
  c.limits.bounds = 50; c.begin(0); c.pan(100000, 0, 800);
  expect(Math.abs(c.target.x)).toBeLessThanOrEqual(50);
  expect(Math.abs(c.target.z)).toBeLessThanOrEqual(50);
});

test('flying to a point arrives there and stops', () => {
  const { c } = setup();
  c.flyTo(new THREE.Vector3(20, 4, -10), 120, 0, 900);
  c.update(450, 0.016);
  expect(c.target.x).toBeGreaterThan(0); expect(c.target.x).toBeLessThan(20);
  c.update(900, 0.016);
  expect(c.target.toArray()).toEqual([20, 4, -10]);
  expect(c.distance).toBe(120);
});

test('the view turns by itself only after a quiet spell', () => {
  const { c } = setup();
  c.begin(0); c.release(0);
  const yaw = c.yaw;
  c.update(5000, 0.016); expect(c.yaw).toBeCloseTo(yaw, 6);
  c.update(9500, 0.016); c.update(9516, 0.016); expect(c.yaw).toBeGreaterThan(yaw);
});

test('moving: true under a finger, while flying and while a fling glides; false once settled', () => {
  const { c } = setup();
  expect(c.moving).toBe(false);
  c.begin(0); expect(c.moving).toBe(true);
  c.pan(40, 0, 800); c.release(0);
  expect(c.moving).toBe(true); // momentum after the fling
  for (let t = 16; t < 3000; t += 16) c.update(t, 0.016);
  expect(c.moving).toBe(false);
  c.flyTo(new THREE.Vector3(5, 0, 5), 100, 3000, 900);
  expect(c.moving).toBe(true);
  c.update(3900, 0.016);
  expect(c.moving).toBe(false);
  // The slow idle turn alone is not movement.
  c.update(20000, 0.016); c.update(20016, 0.016);
  expect(c.autoTurn).toBe(true);
  expect(c.moving).toBe(false);
});

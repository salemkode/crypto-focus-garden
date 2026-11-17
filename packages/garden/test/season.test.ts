import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { classify, seasonal, seasonFor } from '../src/season';
import { buildLevelModel } from '../src/ladder';

test('the valley follows the calendar, with the opposite season in the south', () => {
  expect(seasonFor(new Date(2026, 0, 10))).toBe('winter');
  expect(seasonFor(new Date(2026, 3, 10))).toBe('spring');
  expect(seasonFor(new Date(2026, 6, 10))).toBe('summer');
  expect(seasonFor(new Date(2026, 10, 16))).toBe('autumn');
  expect(seasonFor(new Date(2026, 0, 10), true)).toBe('summer');
});

test('colours are classified so evergreens stay green and water can freeze', () => {
  expect(classify(new THREE.Color(0x51a846))).toBe('foliage');
  expect(classify(new THREE.Color(0x1e5949))).toBe('evergreen');
  expect(classify(new THREE.Color(0x4fb0db))).toBe('water');
  expect(classify(new THREE.Color(0xf2dfb7))).toBe('other');
});

test('each season recolours a model, and summer leaves it as built', () => {
  const geometry = buildLevelModel(3, 'oak', 4).toGeometry();
  const sum = (g: THREE.BufferGeometry) => Array.from(g.getAttribute('color').array as Float32Array).reduce((a, b) => a + b, 0);
  expect(seasonal(geometry, 'summer')).toBe(geometry);
  const winter = sum(seasonal(geometry, 'winter')), autumn = sum(seasonal(geometry, 'autumn')), summer = sum(geometry);
  expect(winter).toBeGreaterThan(summer); // snow is brighter
  expect(autumn).not.toBe(summer);
  expect(sum(geometry)).toBe(summer); // the original is untouched
});

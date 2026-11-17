import { expect, test } from 'bun:test';
import { createPacer, IDLE_FPS, SETTLE_MS, shouldStep } from '../src/components/valley/filament/pacing';

/** Frames stepped over one second of display ticks at `hz`, with `lively(t)` deciding movement. */
function stepsPerSecond(hz: number, lively: (t: number) => boolean, from = 0) {
  const pacer = createPacer();
  let steps = 0;
  for (let i = 0; i < hz * 2; i++) {
    const t = (i * 1000) / hz;
    if (shouldStep(pacer, t, lively(t)) && t >= 1000 + from) steps++;
  }
  return steps;
}

test('idle: about IDLE_FPS at 120 Hz and at 60 Hz', () => {
  expect(stepsPerSecond(120, () => false)).toBe(IDLE_FPS);
  expect(stepsPerSecond(60, () => false)).toBe(IDLE_FPS);
});

test('moving: every display frame', () => {
  expect(stepsPerSecond(120, () => true)).toBe(120);
});

test('full rate continues briefly after movement stops, then drops to idle', () => {
  const pacer = createPacer();
  const steps: number[] = [];
  for (let i = 0; i < 240; i++) {
    const t = (i * 1000) / 120;
    if (shouldStep(pacer, t, t < 500)) steps.push(t);
  }
  const settled = 500 + SETTLE_MS;
  const ticks = Array.from({ length: 240 }, (_, i) => (i * 1000) / 120).filter((t) => t >= 500 && t < settled - 10);
  expect(steps.filter((t) => t >= 500 && t < settled - 10)).toEqual(ticks); // every tick while settling
  const idle = steps.filter((t) => t >= settled + 100);
  for (let i = 1; i < idle.length; i++) expect(idle[i] - idle[i - 1]).toBeGreaterThanOrEqual(1000 / IDLE_FPS - 2);
});

test('a touch on an idle frame is drawn at once', () => {
  const pacer = createPacer();
  expect(shouldStep(pacer, 0, false)).toBe(true);
  expect(shouldStep(pacer, 8.3, false)).toBe(false);
  expect(shouldStep(pacer, 16.6, true)).toBe(true);
});

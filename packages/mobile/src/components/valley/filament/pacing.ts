/**
 * Frame pacing for the native valley. A full-screen 3D frame with shadows at 120 Hz, held for a
 * whole focus session, heats a phone until iOS throttles it and the valley stalls. So:
 * - full rate only while something moves on purpose: a finger, a fly-to, a fling's glide, a merge
 *   ceremony, and briefly after it settles;
 * - otherwise IDLE_FPS, enough for the slow life of the valley (villagers, clouds, weather);
 * - nothing at all while the valley is not on screen (another tab, a covering screen, background).
 * Filament draws only frames the JS side has produced (see FilamentValleyHost), so this one
 * decision paces both threads.
 */
export const IDLE_FPS = 30;
/** Full rate continues this long after movement stops, so the end of a glide stays smooth. */
export const SETTLE_MS = 500;
/** Slack for display-link jitter: at 120 Hz an idle frame lands every 4th tick, at 60 Hz every 2nd. */
const SLACK_MS = 4;

export interface Pacer { lastStep: number; lastLively: number }

export const createPacer = (): Pacer => ({ lastStep: -Infinity, lastLively: -Infinity });

/** Whether to advance and draw the world at `now` (ms). Updates the pacer when it says yes. */
export function shouldStep(pacer: Pacer, now: number, lively: boolean): boolean {
  if (lively) pacer.lastLively = now;
  if (!isFullRate(pacer, now) && now - pacer.lastStep < 1000 / IDLE_FPS - SLACK_MS) return false;
  pacer.lastStep = now;
  return true;
}

/** Whether the valley currently runs at the display's full rate. */
export const isFullRate = (pacer: Pacer, now: number) => now - pacer.lastLively < SETTLE_MS;

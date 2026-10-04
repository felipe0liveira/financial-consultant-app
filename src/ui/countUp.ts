export const COUNT_UP_MS = 600;
/** Ease-out cubic: fast start, gentle stop. */
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
/** Value shown at `elapsed` ms of a count-up from 0 to `target`. */
export function countUpValue(target: number, elapsed: number, duration = COUNT_UP_MS): number {
  return target * easeOutCubic(elapsed / duration);
}

/** Anything that can be closed — a swipeable row's methods. */
export interface Closable { close: () => void }

/**
 * Only one bill row may show its swipe actions at a time (iOS Mail behaviour): when a row starts
 * opening, the previously open row closes. Module-level because every list shows one at a time.
 */
let openRow: Closable | null = null;

/** Call when `row` starts opening; closes any other open row. */
export function claimOpenSwipe(row: Closable | null): void {
  if (openRow && openRow !== row) openRow.close();
  openRow = row;
}

/** Call when `row` has closed. */
export function releaseOpenSwipe(row: Closable | null): void {
  if (openRow === row) openRow = null;
}

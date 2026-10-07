// Horizontal swipe -> month step. Pure so the threshold rules are testable.
export const SWIPE_MIN_X = 50      // px of horizontal travel
export const SWIPE_AXIS_RATIO = 1.5 // must be clearly more horizontal than vertical (so scrolling never flips months)

/** -1 = previous month (swipe right), +1 = next month (swipe left), 0 = not a swipe. */
export function swipeMonth(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_MIN_X) return 0
  if (Math.abs(dx) < SWIPE_AXIS_RATIO * Math.abs(dy)) return 0
  return dx < 0 ? 1 : -1
}

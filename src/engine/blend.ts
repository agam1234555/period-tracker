/**
 * Predictor blend + range, ported from the Phase 1 backtests (phase1_patch5/6).
 * Pure functions, no dependencies. Units: days since the last period start; callers convert to/from dates.
 * Round only at display time, never inside the engine.
 *
 * Rule: cycle-length model alone until ovulation is confirmed; then weight the two predictions by how each has
 * performed on this user's own past cycles. With too little history, weight 50/50.
 * The same function accepts further predictors later (e.g. LH) by generalising `blend` to N inputs.
 */

export interface BlendConfig {
  window: number;          // past comparisons used for the weights
  minComparisons: number;  // below this, weight 50/50
  eps: number;             // smoothing so a perfect run cannot take all the weight
  exponent: number;        // weight ~ 1 / (meanError + eps) ^ exponent
  hwWindow: number;        // past shown-prediction errors used for the range
  hwShrinkK: number;       // pseudo-observations pulling the range toward the native half-width
  hwFloor: number;         // smallest half-width once there is any history (days)
  hwQuantile: number;      // coverage target for the range
  maxKept: number;         // cap on stored errors per list (must be >= window and hwWindow)
}

export const DEFAULT_CONFIG: BlendConfig = {
  window: 6, minComparisons: 3, eps: 0.25, exponent: 1,
  hwWindow: 8, hwShrinkK: 3, hwFloor: 1, hwQuantile: 0.8, maxKept: 24,
};

/** Per-user record of absolute errors, oldest first. Treat as immutable. */
export interface Track {
  ovErrors: number[];     // ovulation-based prediction, only cycles that had a confirmed ovulation
  lenErrors: number[];    // cycle-length model on those same cycles
  shownErrors: number[];  // the prediction actually shown, every cycle
}

export const emptyTrack = (): Track => ({ ovErrors: [], lenErrors: [], shownErrors: [] });

const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
const last = (a: number[], n: number): number[] => a.slice(-n);

/** Linear-interpolation quantile (same as numpy's default). Requires a non-empty array. */
export function quantile(values: number[], q: number): number {
  const s = [...values].sort((x, y) => x - y);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** Half-width of analyze()'s own range; floored so a degenerate range never reaches zero. */
export const nativeHalfWidth = (lo: number, hi: number): number => Math.max(0.5, (hi - lo) / 2);

/** Weight on the ovulation-based prediction, in (0, 1). */
export function blendWeight(t: Track, c: BlendConfig = DEFAULT_CONFIG): number {
  if (t.ovErrors.length < c.minComparisons) return 0.5;
  const a = 1 / Math.pow(mean(last(t.ovErrors, c.window)) + c.eps, c.exponent);
  const b = 1 / Math.pow(mean(last(t.lenErrors, c.window)) + c.eps, c.exponent);
  return a / (a + b);
}

export interface Blended { pred: number; weightOv: number }

/** ovPred is null until ovulation is confirmed this cycle; then the cycle-length model is returned unchanged. */
export function blend(lenPred: number, ovPred: number | null, t: Track, c: BlendConfig = DEFAULT_CONFIG): Blended {
  if (ovPred === null) return { pred: lenPred, weightOv: 0 };
  const w = blendWeight(t, c);
  return { pred: w * ovPred + (1 - w) * lenPred, weightOv: w };
}

/** Range half-width around the shown prediction: native width, pulled toward this user's own recent errors. */
export function halfWidth(nativeHw: number, t: Track, c: BlendConfig = DEFAULT_CONFIG): number {
  const recent = last(t.shownErrors, c.hwWindow);
  if (recent.length === 0) return nativeHw;
  const k = recent.length;
  return Math.max(c.hwFloor, (c.hwShrinkK * nativeHw + k * quantile(recent, c.hwQuantile)) / (c.hwShrinkK + k));
}

/** Call once a cycle has ended and the true length is known. Returns a new Track. */
export function recordOutcome(
  t: Track,
  o: { actual: number; lenPred: number; ovPred: number | null; shown: number },
  c: BlendConfig = DEFAULT_CONFIG,
): Track {
  const cap = (a: number[]) => a.slice(-c.maxKept);
  const had = o.ovPred !== null;
  return {
    shownErrors: cap([...t.shownErrors, Math.abs(o.shown - o.actual)]),
    ovErrors: had ? cap([...t.ovErrors, Math.abs((o.ovPred as number) - o.actual)]) : t.ovErrors,
    lenErrors: had ? cap([...t.lenErrors, Math.abs(o.lenPred - o.actual)]) : t.lenErrors,
  };
}

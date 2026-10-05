import { describe, it, expect } from 'vitest';
import blendFixtures from './__fixtures__/blend_fixtures.json';
import { DEFAULT_CONFIG, blend, blendWeight, emptyTrack, halfWidth, nativeHalfWidth, quantile, recordOutcome, type Track } from './blend';

const T = (ov: number[], len: number[], shown: number[] = []): Track => ({ ovErrors: ov, lenErrors: len, shownErrors: shown });

describe('quantile', () => {
  it('interpolates linearly', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 12);
    expect(quantile([1, 2, 3, 4], 0.8)).toBeCloseTo(3.4, 12);
    expect(quantile([7], 0.8)).toBe(7);
  });
  it('does not mutate its input', () => {
    const a = [3, 1, 2]; quantile(a, 0.5); expect(a).toEqual([3, 1, 2]);
  });
});

describe('blendWeight', () => {
  it('is 0.5 until enough comparisons exist', () => {
    expect(blendWeight(emptyTrack())).toBe(0.5);
    expect(blendWeight(T([0, 0], [9, 9]))).toBe(0.5);
  });
  it('is 0.5 when both predictors have performed equally', () => {
    expect(blendWeight(T([2, 2, 2], [2, 2, 2]))).toBeCloseTo(0.5, 12);
  });
  it('favours the better predictor: hand-computed 0.642857', () => {
    // a = 1/1.25 = 0.8, b = 1/2.25 = 0.4444..., a/(a+b)
    expect(blendWeight(T([1, 1, 1], [2, 2, 2]))).toBeCloseTo(0.8 / (0.8 + 1 / 2.25), 12);
    expect(blendWeight(T([1, 1, 1], [2, 2, 2]))).toBeCloseTo(0.642857, 5);
  });
  it('favours the cycle-length model when ovulation detection has been worse', () => {
    expect(blendWeight(T([4, 4, 4], [1, 1, 1]))).toBeLessThan(0.5);
  });
  it('only the last `window` comparisons count', () => {
    const recent = [1, 1, 1, 1, 1, 1], len = [2, 2, 2, 2, 2, 2];
    expect(blendWeight(T([50, 50, 50, ...recent], [0, 0, 0, ...len]))).toBeCloseTo(blendWeight(T(recent, len)), 12);
  });
  it('stays strictly inside (0, 1) even for a perfect run', () => {
    const w = blendWeight(T([0, 0, 0], [30, 30, 30]));
    expect(w).toBeGreaterThan(0); expect(w).toBeLessThan(1);
  });
  it('a larger exponent concentrates weight on the better predictor', () => {
    const t = T([1, 1, 1], [2, 2, 2]);
    expect(blendWeight(t, { ...DEFAULT_CONFIG, exponent: 2 })).toBeGreaterThan(blendWeight(t));
  });
});

describe('blend', () => {
  it('returns the cycle-length prediction untouched until ovulation is confirmed', () => {
    expect(blend(29.4, null, T([1, 1, 1], [2, 2, 2]))).toEqual({ pred: 29.4, weightOv: 0 });
  });
  it('averages 50/50 with little history', () => {
    const r = blend(30, 28, emptyTrack());
    expect(r.weightOv).toBe(0.5); expect(r.pred).toBeCloseTo(29, 12);
  });
  it('always lands between the two predictions', () => {
    const r = blend(30, 26, T([1, 1, 1], [3, 3, 3]));
    expect(r.pred).toBeGreaterThanOrEqual(26); expect(r.pred).toBeLessThanOrEqual(30);
  });
});

describe('halfWidth', () => {
  it('equals the native width with no history', () => { expect(halfWidth(4, emptyTrack())).toBe(4); });
  it('shrinks toward own errors: (3*4 + 3*1)/6 = 2.5', () => {
    expect(halfWidth(4, T([], [], [1, 1, 1]))).toBeCloseTo(2.5, 12);
  });
  it('never drops below the floor once history exists', () => {
    expect(halfWidth(0.5, T([], [], [0, 0, 0, 0, 0, 0, 0, 0]))).toBe(1);
  });
  it('widens for users whose recent predictions miss by more', () => {
    expect(halfWidth(4, T([], [], [6, 6, 6]))).toBeGreaterThan(halfWidth(4, T([], [], [1, 1, 1])));
  });
  it('only the last `hwWindow` errors count', () => {
    const small = [1, 1, 1, 1, 1, 1, 1, 1];
    expect(halfWidth(4, T([], [], [9, 9, 9, 9, 9, ...small]))).toBeCloseTo(halfWidth(4, T([], [], small)), 12);
  });
});

describe('nativeHalfWidth', () => {
  it('is half the range, floored at 0.5', () => {
    expect(nativeHalfWidth(24, 32)).toBe(4);
    expect(nativeHalfWidth(29, 29)).toBe(0.5);
  });
});

describe('recordOutcome', () => {
  it('records the shown error every cycle, and ovulation errors only when detected', () => {
    const t1 = recordOutcome(emptyTrack(), { actual: 29, lenPred: 28, ovPred: null, shown: 28 });
    expect(t1).toEqual({ ovErrors: [], lenErrors: [], shownErrors: [1] });
    const t2 = recordOutcome(t1, { actual: 30, lenPred: 28, ovPred: 31, shown: 29.5 });
    expect(t2).toEqual({ ovErrors: [1], lenErrors: [2], shownErrors: [1, 0.5] });
  });
  it('does not mutate the previous track', () => {
    const t = emptyTrack(); recordOutcome(t, { actual: 29, lenPred: 28, ovPred: 30, shown: 29 });
    expect(t).toEqual(emptyTrack());
  });
  it('caps stored history without changing any windowed result', () => {
    let t = emptyTrack();
    for (let i = 0; i < 60; i++) t = recordOutcome(t, { actual: 29, lenPred: 29 + (i % 3), ovPred: 29 + (i % 2), shown: 29 + (i % 4) });
    expect(t.shownErrors.length).toBe(DEFAULT_CONFIG.maxKept);
    expect(t.ovErrors.length).toBe(DEFAULT_CONFIG.maxKept);
  });
});

describe('parity with the Python reference (blend_ref.py)', () => {
  const fx = blendFixtures as unknown as {
    config: unknown;
    users: { lenPred: number; ovPred: number | null; nativeHw: number; actual: number; expected: { pred: number; weightOv: number; halfWidth: number } }[][];
  };
  it('uses the same configuration', () => {
    expect(fx.config).toEqual({
      window: 6, min_comparisons: 3, eps: 0.25, exponent: 1, hw_window: 8, hw_shrink_k: 3, hw_floor: 1, hw_quantile: 0.8, max_kept: 24,
    });
  });
  it('reproduces every step of every simulated user', () => {
    let steps = 0;
    for (const user of fx.users) {
      let t = emptyTrack();
      for (const s of user) {
        const b = blend(s.lenPred, s.ovPred, t);
        const hw = halfWidth(s.nativeHw, t);
        expect(Math.abs(b.pred - s.expected.pred)).toBeLessThan(1e-9);
        expect(Math.abs(b.weightOv - s.expected.weightOv)).toBeLessThan(1e-9);
        expect(Math.abs(hw - s.expected.halfWidth)).toBeLessThan(1e-9);
        t = recordOutcome(t, { actual: s.actual, lenPred: s.lenPred, ovPred: s.ovPred, shown: b.pred });
        steps++;
      }
    }
    expect(steps).toBeGreaterThan(400);
  });
});

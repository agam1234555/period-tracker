"""Python reference for blend.ts. Source of truth for the golden fixtures (blend_fixtures.json).
Mirrors patch5/patch6 logic. All units are days since the last period start (the caller converts dates)."""
import json, math, random

CFG = dict(window=6, min_comparisons=3, eps=0.25, exponent=1,
           hw_window=8, hw_shrink_k=3, hw_floor=1.0, hw_quantile=0.8, max_kept=24)

def mean(a): return sum(a) / len(a)

def quantile(a, q):                      # linear interpolation, identical to numpy.quantile default
    s = sorted(a); pos = (len(s) - 1) * q; lo, hi = math.floor(pos), math.ceil(pos)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)

def native_half_width(lo, hi): return max(0.5, (hi - lo) / 2)

def blend_weight(ov_err, len_err, c=CFG):
    if len(ov_err) < c['min_comparisons']: return 0.5
    a = 1 / (mean(ov_err[-c['window']:]) + c['eps']) ** c['exponent']
    b = 1 / (mean(len_err[-c['window']:]) + c['eps']) ** c['exponent']
    return a / (a + b)

def blend(len_pred, ov_pred, ov_err, len_err, c=CFG):
    if ov_pred is None: return len_pred, 0.0
    w = blend_weight(ov_err, len_err, c)
    return w * ov_pred + (1 - w) * len_pred, w

def half_width(nat, shown_err, c=CFG):
    recent = shown_err[-c['hw_window']:]
    if not recent: return nat
    k = len(recent)
    return max(c['hw_floor'], (c['hw_shrink_k'] * nat + k * quantile(recent, c['hw_quantile'])) / (c['hw_shrink_k'] + k))

def record(track, actual, len_pred, ov_pred, shown, c=CFG):
    t = {k: list(v) for k, v in track.items()}
    t['shown'].append(abs(shown - actual))
    if ov_pred is not None:
        t['ov'].append(abs(ov_pred - actual)); t['len'].append(abs(len_pred - actual))
    return t

if __name__ == '__main__':
    try:
        import numpy as np
        r = random.Random(1)
        for _ in range(200):
            a = [r.random() * 10 for _ in range(r.randint(1, 12))]
            assert abs(quantile(a, .8) - float(np.quantile(a, .8))) < 1e-12
        print('quantile matches numpy')
    except ImportError:
        pass
    rng = random.Random(20260101); users = []
    for u in range(40):
        track = dict(ov=[], len=[], shown=[]); steps = []; sd = rng.choice([0.5, 1, 2, 3])
        for _ in range(14):
            actual = round(rng.gauss(29, 3)); len_pred = actual + rng.gauss(0, 2.2)
            ov_pred = actual + rng.gauss(1, sd) if rng.random() < .75 else None
            nat = rng.uniform(3, 5)
            pred, w = blend(len_pred, ov_pred, track['ov'], track['len'])
            hw = half_width(nat, track['shown'])
            steps.append(dict(lenPred=len_pred, ovPred=ov_pred, nativeHw=nat, actual=actual,
                              expected=dict(pred=pred, weightOv=w, halfWidth=hw)))
            track = record(track, actual, len_pred, ov_pred, pred)
        users.append(steps)
    json.dump(dict(config=CFG, users=users), open('blend_fixtures.json', 'w'))
    print('wrote', len(users), 'users,', sum(map(len, users)), 'steps')

# Python port of analyze() used for backtesting. Keep in sync with analyze.js.
# CHANGE vs previous version: confirmed-ovulation window w = 2 if lut_known else 3.
import math, statistics

def jsround(x): return math.floor(x + 0.5)  # JS Math.round semantics (Python's round is banker's)
def avg(a): return sum(a) / len(a)

def from_days(period_days):
    """Group logged period days (day numbers) into starts + lengths; gap <= 1 skipped day merges."""
    ks = sorted(period_days); st, pl = [], []
    for i, n in enumerate(ks):
        if i and n - ks[i-1] <= 2: pl[-1] = n - st[-1] + 1
        else: st.append(n); pl.append(1)
    return st, pl

def analyze(starts, plens=None, temps=None, today=None):
    """starts: sorted period-start day numbers. temps: {day: basal temp C}. today: day number."""
    temps = temps or {}
    A = dict(st=starts, cy=[], proj=[], plen=5, sd=4.0, mu=29.0, n=0, lut=14, lut_known=False)
    if not starts: return A
    cy = [dict(s=starts[i-1], e=starts[i], len=starts[i] - starts[i-1]) for i in range(1, len(starts))]
    A['cy'] = cy
    raw = [c['len'] for c in cy if 15 <= c['len'] <= 60]
    md = statistics.median(raw) if raw else 29
    mad = 1.4826 * statistics.median([abs(x - md) for x in raw]) if raw else 0
    tol = max(3 * mad, 6)
    for c in cy: c['ok'] = 15 <= c['len'] <= 60 and abs(c['len'] - md) <= tol
    u = [c for c in cy if c['ok']][-12:]
    ws = [0.5 ** ((len(u) - 1 - i) / 4) for i in range(len(u))]
    W = sum(ws); W2 = sum(w * w for w in ws)
    mean = sum(w * c['len'] for w, c in zip(ws, u)) / W if W else 0
    V = sum(w * (c['len'] - mean) ** 2 for w, c in zip(ws, u)) / W if W else 0
    ne = W * W / W2 if W else 0; K = 3
    A['mu'] = (ne * mean + K * 29) / (ne + K)
    A['sd'] = max(1.5, math.sqrt((ne * V + K * 16) / (ne + K)))
    A['n'] = len(u)

    def ov_of(s, e):
        l = [(n, temps[n]) for n in range(s, e) if n in temps]
        for j in range(6, len(l) - 2):
            b = max(t for _, t in l[j-6:j])
            if l[j][1] > b and l[j+1][1] > b and l[j+2][1] >= b + .2: return l[j][0] - 1
        return None

    for c in cy:
        c['ov'] = ov_of(c['s'], c['e'])
        c['lut'] = c['e'] - c['ov'] if c['ov'] is not None else None
    ll = [c['lut'] for c in cy if c['lut'] is not None and 9 <= c['lut'] <= 17][-6:]
    if ll: A['lut'] = jsround(avg(ll)); A['lut_known'] = True
    last = starts[-1]; A['last'] = last
    A['plen'] = jsround(avg(plens[-6:])) if plens else 5
    A['curOv'] = ov_of(last, today + 1) if today is not None else None
    # Blend inputs (days since last start). Cycle-length path only, independent of confirmed ovulation.
    A['len_pred'] = jsround(A['mu'])
    A['len_hw'] = max(1, jsround(1.28 * A['sd']))
    A['ov_pred'] = (A['curOv'] + A['lut'] - last) if A['curOv'] is not None else None
    for k in range(1, 4):
        conf = False
        if k == 1 and A['curOv'] is not None:
            ov = A['curOv']; s = ov + A['lut']; w = 2 if A['lut_known'] else 3; conf = True   # CHANGED: was w = 2
        else:
            s = last + jsround(A['mu'] * k)
            w = max(1, jsround(1.28 * A['sd'] * math.sqrt(k)))
            ov = s - A['lut']
        A['proj'].append(dict(s=s, w=w, ov=ov, conf=conf))
    return A

if __name__ == '__main__':
    starts = [0, 28, 58, 87, 114, 145, 174]
    A = analyze(starts, [5]*7, today=186)
    print({k: (round(v, 2) if isinstance(v, float) else v) for k, v in A.items() if k not in ('cy', 'st')})

"""Generate golden test fixtures from the Python reference engine.
Run from project root:  python scripts/make_golden.py
Writes src/engine/__fixtures__/golden.json. Rerun whenever python/analyze.py changes.
"""
import datetime, json, os, random, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'python'))
from analyze import analyze

BASE = 19000  # realistic epoch-day offset
EPOCH = datetime.date(1970, 1, 1)
iso = lambda n: (EPOCH + datetime.timedelta(days=n)).isoformat()

def make_case(name, starts, temps, today, plen=5):
    s_abs = [BASE + s for s in starts]
    t_abs = {BASE + d: t for d, t in temps.items()}
    days = {}
    for s in s_abs:
        for d in range(s, s + plen):
            days.setdefault(iso(d), {})['p'] = 1
    for d, t in t_abs.items():
        days.setdefault(iso(d), {})['t'] = t
    A = analyze(s_abs, [plen] * len(s_abs), t_abs, BASE + today)
    exp = dict(st=A['st'], plen=A['plen'], sd=A['sd'], mu=A['mu'], n=A['n'], lut=A['lut'], lutKnown=A['lut_known'],
               last=A.get('last'), curOv=A.get('curOv'),
               lenPred=A.get('len_pred'), lenHw=A.get('len_hw'), ovPred=A.get('ov_pred'),
               proj=A['proj'], cy=[dict(len=c['len'], ok=c['ok'], ov=c['ov'], lut=c['lut']) for c in A['cy']])
    return dict(name=name, today=BASE + today, days=days, expected=exp)

def bbt(start, rise, upto, rng=None, miss=0.0):
    """basal temp curve for one cycle: flat then +0.3 after `rise`, days start..upto"""
    t = {}
    for d in range(start, upto + 1):
        if rng and rng.random() < miss: continue
        base = 36.35 + (rng.gauss(0, 0.06) if rng else 0)
        t[d] = round(base + (0.35 if d >= start + rise else 0), 2)
    return t

cases = []
cases.append(make_case('empty', [], {}, 10))
cases.append(make_case('single start', [0], {}, 12))
cases.append(make_case('regular 7 cycles, no temps', [0, 28, 58, 87, 114, 145, 174], {}, 186))
cases.append(make_case('missed logs (62d and 12d cycles)', [0, 29, 91, 120, 132, 161, 190], {}, 200))

S = [0, 28, 58, 87, 114, 145, 174]
t_known = {}
for a, b in zip(S, S[1:] + [None]):
    t_known.update(bbt(a, 13, (b - 1) if b else 192))
cases.append(make_case('luteal known + ovulation confirmed this cycle', S, t_known, 192))
t_unknown = bbt(174, 13, 192)
cases.append(make_case('ovulation confirmed, luteal NOT known (w=3)', S, t_unknown, 192))
cases.append(make_case('luteal known, no temps this cycle', S, {k: v for k, v in t_known.items() if k < 174}, 180))

rng = random.Random(42)
for i in range(60):
    n = rng.randint(1, 14); starts = [0]
    for _ in range(n):
        L = int(round(rng.gauss(29, 4)))
        if rng.random() < 0.08: L = rng.choice([12, 58, 70])
        starts.append(starts[-1] + max(L, 12))
    temps = {}
    if rng.random() < 0.7:
        for a, b in zip(starts, starts[1:] + [None]):
            if rng.random() < 0.8:
                end = (b - 1) if b else starts[-1] + rng.randint(5, 25)
                temps.update(bbt(a, rng.randint(10, 20), end, rng, miss=0.1))
    today = starts[-1] + rng.randint(0, 30)
    cases.append(make_case(f'fuzz {i}', starts, temps, today))

out = os.path.join(os.path.dirname(__file__), '..', 'src', 'engine', '__fixtures__', 'golden.json')
with open(out, 'w') as f: json.dump(cases, f)
confirmed = sum(1 for c in cases if c['expected']['proj'] and c['expected']['proj'][0]['conf'])
known = sum(1 for c in cases if c['expected']['lutKnown'])
print(f"{len(cases)} cases written | {confirmed} confirmed-ovulation | {known} luteal-known")

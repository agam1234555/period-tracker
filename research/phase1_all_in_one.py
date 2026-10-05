# Phase 1 all-in-one backtest. Colab: 1) !pip install -q kagglehub  2) upload analyze.py  3) paste this file in ONE cell and run.
# %% [0]
# !pip install -q kagglehub

# %% [1] Setup
# Colab: upload Kaggle FedCycleData CSV (or pull via kaggle API), set PATH.
import numpy as np, pandas as pd

import kagglehub, glob, os
folder = kagglehub.dataset_download("nikitabisht/menstrual-cycle-data")
print(os.listdir(folder))
csvs = glob.glob(os.path.join(folder, "**", "*.csv"), recursive=True)
PATH = ([f for f in csvs if "fed" in f.lower()] or csvs)[0]
print("Using:", PATH)
Z = 1.28                               # 80% interval

# %% [2] Load + clean into one table
def load_fedcycle(path):
    df = pd.read_csv(path)
    df.columns = [c.strip() for c in df.columns]
    print(list(df.columns)[:12])   # debug
    lower = {c.lower(): c for c in df.columns}
    df = df.rename(columns={lower["clientid"]: "user",
                            lower["cyclenumber"]: "cycle_no",
                            lower["lengthofcycle"]: "len"})
    keep = ["user", "cycle_no", "len"]
    if "estimateddayofovulation" in lower:       # keep for later ovulation phase
        df = df.rename(columns={lower["estimateddayofovulation"]: "EstimatedDayofOvulation"})
        keep.append("EstimatedDayofOvulation")
    df = df[keep].copy()
    for c in keep[1:]:
        df[c] = pd.to_numeric(df[c], errors="coerce")   # blanks like ' ' -> NaN
    df = df.dropna(subset=["len"])
    df = df[(df["len"] >= 15) & (df["len"] <= 120)]     # drop garbage, keep long (missed-log) cases
    df = df.sort_values(["user", "cycle_no"])
    # dataset has lengths, not dates -> rebuild period start dates
    off = df.groupby("user")["len"].transform(lambda s: s.shift(fill_value=0).cumsum())
    df["start"] = pd.Timestamp("2020-01-01") + pd.to_timedelta(off, unit="D")
    return df.reset_index(drop=True)

df = load_fedcycle(PATH)
series = {u: g["len"].to_numpy() for u, g in df.groupby("user") if len(g) >= 3}
print(len(series), "users,", sum(len(v) for v in series.values()), "cycles")

# %% [3] Priors (fit on TRAIN users only -> no leakage)
def fit_prior(train):
    mus = [y.mean() for y in train.values()]
    wv = [y.var(ddof=1) for y in train.values() if len(y) > 1]
    return dict(mu=np.mean(mus), between_var=np.var(mus), within_var=np.mean(wv))

# %% [4] Predictors. Signature: f(history, prior) -> (point, lo, hi)
def baseline(h, prior):                 # PLACEHOLDER: replace with port of analyze()
    return 29, 25, 33

def mean_recent(h, prior, w=6):
    h = np.asarray(h[-w:]); sd = h.std(ddof=1) if len(h) > 1 else 4
    m = h.mean()
    return m, m - Z * sd, m + Z * sd

def shrink(h, prior, k_mu=3, k_var=3, w=12):
    h = np.asarray(h[-w:]); n = len(h)
    mu = (n * h.mean() + k_mu * prior["mu"]) / (n + k_mu)
    vu = h.var(ddof=1) if n > 1 else 0.0
    var = ((n - 1) * vu + k_var * prior["within_var"]) / (n - 1 + k_var)
    sd = np.sqrt(var)
    return mu, mu - Z * sd, mu + Z * sd

def ewma(h, prior, alpha=0.3):
    x = prior["mu"]; res = []
    for y in h:
        res.append(y - x); x = alpha * y + (1 - alpha) * x
    n = len(res)
    var = (np.sum(np.square(res)) + 3 * prior["within_var"]) / (n + 3)
    sd = np.sqrt(var)
    return x, x - Z * sd, x + Z * sd

def kalman(h, prior, q=0.5):            # local-level model
    r = prior["within_var"]; x = prior["mu"]; p = prior["between_var"]
    for y in h:
        p += q
        k = p / (p + r); x += k * (y - x); p *= (1 - k)
    p += q
    sd = np.sqrt(p + r)
    return x, x - Z * sd, x + Z * sd

# Missed-log handling: wrap any predictor. Merged double cycle -> split into n equal cycles.
def clean_missed(h, ratio=1.6):
    h = list(h)
    if len(h) < 3: return h
    med = np.median(h); out = []
    for x in h:
        if x > ratio * med:
            n = int(round(x / med)); out += [x / n] * n
        else:
            out.append(x)
    return out

def with_cleaning(f):
    return lambda h, prior: f(clean_missed(h), prior)

# %% [5] Backtest: predict cycle i from cycles[:i] only
def backtest(series, predictor, prior, min_hist=1):
    rows = []
    for u, y in series.items():
        for i in range(min_hist, len(y)):
            p, lo, hi = predictor(list(y[:i]), prior)
            rows.append((u, i, y[i], p, lo, hi))   # actual stays RAW (merged cycle is real outcome)
    return pd.DataFrame(rows, columns=["user", "hist_n", "actual", "pred", "lo", "hi"])

def score(r):
    err = (r.pred - r.actual).abs()
    return dict(MAE=err.mean(),
                coverage=((r.actual >= r.lo) & (r.actual <= r.hi)).mean(),
                width=(r.hi - r.lo).mean(), n=len(r))

def cross_validate(series, predictor, folds=5, seed=0):
    users = np.array(sorted(series)); rng = np.random.default_rng(seed); rng.shuffle(users)
    parts = np.array_split(users, folds); out = []
    for k in range(folds):
        test = {u: series[u] for u in parts[k]}
        train = {u: series[u] for j in range(folds) if j != k for u in parts[j]}
        out.append(backtest(test, predictor, fit_prior(train)))
    return pd.concat(out, ignore_index=True)


# %% [port] Single source of truth: analyze.py
# Upload analyze.py to Colab first (left folder icon -> upload) so it sits next to this code.
import sys, os, math, statistics
sys.path.insert(0, os.getcwd())
try:
    from analyze import analyze, jsround, avg
except ImportError:
    raise ImportError("analyze.py not found. Upload it to Colab (same folder as this notebook), then rerun.")

# %% [patch]
import random

# --- Baseline = real analyze() port, fed cycle-length history ---
def baseline_analyze(h, prior=None):
    h = [int(round(x)) for x in h]
    starts = [0]
    for x in h: starts.append(starts[-1] + x)
    A = analyze(starts)                      # no temps, no today: cycle-length path only
    p = A['proj'][0]
    length = p['s'] - A['last']              # predicted next cycle length (int)
    return length, length - p['w'], length + p['w']

# --- Same math, every constant exposed so upgrades toggle one at a time ---
def predict_len(h, mu0=29, var0=16, K=3, half=4, z=1.28, sd_floor=1.5,
                mad_k=3, mad_floor=6, win=12, rnd=True, filt=True):
    raw = [x for x in h if 15 <= x <= 60]
    md = statistics.median(raw) if raw else 29
    mad = 1.4826 * statistics.median([abs(x - md) for x in raw]) if raw else 0
    tol = max(mad_k * mad, mad_floor)
    u = [x for x in h if (15 <= x <= 60 and abs(x - md) <= tol)] if filt else list(h)
    u = u[-win:]
    ws = [0.5 ** ((len(u) - 1 - i) / half) for i in range(len(u))]
    W = sum(ws); W2 = sum(w * w for w in ws)
    mean = sum(w * x for w, x in zip(ws, u)) / W if W else 0
    V = sum(w * (x - mean) ** 2 for w, x in zip(ws, u)) / W if W else 0
    ne = W * W / W2 if W else 0
    mu = (ne * mean + K * mu0) / (ne + K)
    sd = max(sd_floor, math.sqrt((ne * V + K * var0) / (ne + K)))
    if rnd:
        s = jsround(mu); w = max(1, jsround(z * sd))
        return s, s - w, s + w
    return mu, mu - z * sd, mu + z * sd

# Parity test: param version w/ defaults must equal ported analyze() exactly
random.seed(1)
for _ in range(300):
    h = [random.randint(20, 45) for _ in range(random.randint(1, 15))]
    assert baseline_analyze(h) == predict_len([int(x) for x in h]), h
print("parity OK")

# --- Ablations ---
candidates = {
    "A0 analyze() baseline":      baseline_analyze,
    "A1 no rounding":             lambda h, p: predict_len(h, rnd=False),
    "A2 fitted prior":            lambda h, p: predict_len(h, mu0=p['mu'], var0=p['within_var'], rnd=False),
    "A3 split-missed (no filter)": lambda h, p: predict_len(clean_missed(h), filt=False, rnd=False),
    "A4 fitted prior+split":      lambda h, p: predict_len(clean_missed(h), mu0=p['mu'], var0=p['within_var'], filt=False, rnd=False),
    "A5 kalman":                  kalman,
    "A6 kalman+split":            with_cleaning(kalman),
}
# half-life / K grid on fitted-prior variant (one param at a time)
for hl in (2, 4, 8):
    candidates[f"A2 half={hl}"] = (lambda hl: lambda h, p: predict_len(h, mu0=p['mu'], var0=p['within_var'], half=hl, rnd=False))(hl)
for K in (1, 3, 6):
    candidates[f"A2 K={K}"] = (lambda K: lambda h, p: predict_len(h, mu0=p['mu'], var0=p['within_var'], K=K, rnd=False))(K)

results = {n: cross_validate(series, f) for n, f in candidates.items()}
full = pd.DataFrame({n: score(r) for n, r in results.items()}).T
norm = pd.DataFrame({n: score(r[r.actual <= 60]) for n, r in results.items()}).T   # drop unpredictable skipped-log actuals
print("ALL ACTUALS\n", full.round(3).sort_values("MAE"))
print("\nACTUAL <= 60d\n", norm.round(3).sort_values("MAE"))

# %% [patch2] Calibrated comparison + missed-log injection
# Needs everything above already run (series, results, predict_len, clean_missed, kalman, baseline_analyze, fit_prior).

# ---------- Part A: compare at EQUAL 80% coverage ----------
def calib(r, target=0.80):
    hw = ((r.hi - r.lo) / 2).clip(lower=0.5)
    ratio = (r.actual - r.pred).abs() / hw
    s = np.quantile(ratio, target)                 # scale that gives exactly 80% coverage
    return dict(MAE=(r.pred - r.actual).abs().mean(), width_at_80=(2 * s * hw).mean(), n=len(r))

keep = ["A0 analyze() baseline", "A1 no rounding", "A2 fitted prior", "A2 K=1",
        "A2 half=8", "A3 split-missed (no filter)", "A5 kalman", "A6 kalman+split"]
tabA = pd.DataFrame({k: calib(results[k]) for k in keep}).T.round(3).sort_values("width_at_80")
print("EQUAL-COVERAGE COMPARISON (lower width_at_80 = better; MAE secondary)\n", tabA)

# ---------- Part B: inject missed logs ----------
def backtest_inj(series, predictor, prior, p, seed):
    rng = np.random.default_rng(seed); rows = []
    for u, y in series.items():
        y = [int(round(v)) for v in y]
        starts = np.concatenate([[0], np.cumsum(y)])          # true starts s_0..s_n
        dropped = rng.random(len(starts)) < p                  # forgot to log this start
        for t in range(1, len(y)):                             # predict y[t] from starts s_0..s_t
            obs = [starts[k] for k in range(t + 1) if k == 0 or k == t or not dropped[k]]
            h = list(np.diff(obs))                             # history may contain merged cycles
            pr, lo, hi = predictor(h, prior)
            rows.append((u, t, y[t], pr, lo, hi))             # target = TRUE next length
    return pd.DataFrame(rows, columns=["user", "hist_n", "actual", "pred", "lo", "hi"])

def cv_inj(series, predictor, p, seeds=(0, 1, 2), folds=5):
    users = np.array(sorted(series)); rng = np.random.default_rng(0); rng.shuffle(users)
    parts = np.array_split(users, folds); out = []
    for sd in seeds:
        for k in range(folds):
            test = {u: series[u] for u in parts[k]}
            train = {u: series[u] for j in range(folds) if j != k for u in parts[j]}
            out.append(backtest_inj(test, predictor, fit_prior(train), p, sd))
    return pd.concat(out, ignore_index=True)

inj_models = {
    "none (no filter, no split)": lambda h, pr: predict_len(h, filt=False, rnd=False),
    "filter only = analyze()":    baseline_analyze,
    "split only":                 lambda h, pr: predict_len(clean_missed(h), filt=False, rnd=False),
    "split + filter":             lambda h, pr: predict_len(clean_missed(h), rnd=False),
    "kalman + split":             with_cleaning(kalman),
}
rows = []
for p in (0.0, 0.05, 0.10, 0.20):
    for name, f in inj_models.items():
        r = cv_inj(series, f, p)
        c = calib(r); s = score(r)
        rows.append(dict(p_missed=p, model=name, MAE=c["MAE"], coverage=s["coverage"],
                         width=s["width"], width_at_80=c["width_at_80"]))
tabB = pd.DataFrame(rows).round(3)
print("\nMISSED-LOG INJECTION")
print(tabB.pivot(index="model", columns="p_missed", values="MAE").round(3).rename_axis("MAE by missed-log rate"))
print(tabB.pivot(index="model", columns="p_missed", values="width_at_80").round(2).rename_axis("width_at_80 by missed-log rate"))

# %% [patch3] Luteal / ovulation backtest
# Needs earlier cells run: PATH, baseline_analyze, jsround, avg, np, pd.
# Luteal here = cycle length - ovulation day (self-consistent, from EstimatedDayofOvulation).

def load_luteal(path):
    d = pd.read_csv(path); d.columns = [c.strip() for c in d.columns]
    lo = {c.lower(): c for c in d.columns}
    out = pd.DataFrame({
        "user": d[lo["clientid"]], "cycle_no": pd.to_numeric(d[lo["cyclenumber"]], errors="coerce"),
        "len": pd.to_numeric(d[lo["lengthofcycle"]], errors="coerce"),
        "ov": pd.to_numeric(d[lo["estimateddayofovulation"]], errors="coerce"),
        "lut_col": pd.to_numeric(d[lo["lengthoflutealphase"]], errors="coerce") if "lengthoflutealphase" in lo else np.nan})
    out = out.dropna(subset=["len"]); out = out[(out.len >= 15) & (out.len <= 60)]
    out.loc[~((out.ov >= 1) & (out.ov < out.len)), "ov"] = np.nan      # bad/missing ovulation -> NaN
    return out.sort_values(["user", "cycle_no"])

L = load_luteal(PATH)
ok = L.dropna(subset=["ov"])
print("cycles with ovulation:", len(ok), "of", len(L), "| users:", ok.user.nunique())
chk = (ok.len - ok.ov) - ok.lut_col
print("identity check (len-ov) - LengthofLutealPhase:\n", chk.value_counts().head(5).to_string())
lut_all = (ok.len - ok.ov); lut_ok = lut_all[(lut_all >= 9) & (lut_all <= 17)]
print(f"luteal (len-ov): mean {lut_all.mean():.2f}, sd {lut_all.std():.2f}, median {lut_all.median():.0f} | in 9..17: {len(lut_ok)/len(lut_all):.0%}")

# per-user sequences
U = {u: dict(len=g.len.astype(int).to_numpy(), ov=g.ov.to_numpy()) for u, g in L.groupby("user")}
def valid_lut(x):
    l = x["len"] - x["ov"]; return l[(~np.isnan(l)) & (l >= 9) & (l <= 17)]
S_sum = {u: valid_lut(x).sum() for u, x in U.items()}; S_n = {u: len(valid_lut(x)) for u, x in U.items()}
T_sum, T_n = sum(S_sum.values()), sum(S_n.values())

rows = []
for u, x in U.items():
    pop = int(round((T_sum - S_sum[u]) / (T_n - S_n[u])))               # leave-one-user-out population luteal
    ln, ov = x["len"], x["ov"]
    for t in range(1, len(ln)):
        if np.isnan(ov[t]): continue
        P, lo_, hi_ = baseline_analyze(list(ln[:t]))
        lh = [ln[i] - ov[i] for i in range(t) if not np.isnan(ov[i]) and 9 <= ln[i] - ov[i] <= 17][-6:]
        dh = [ov[i] for i in range(t) if not np.isnan(ov[i])][-6:]
        pers = jsround(avg(lh)) if lh else 14
        rows.append(dict(user=u, t=t, n_lut=len(lh), len=ln[t], ov=ov[t], P=P, lo=lo_, hi=hi_, pers=pers, pop=pop,
                         fwd=jsround(avg(dh)) if dh else P - 14))
R = pd.DataFrame(rows)

def ov_metrics(pred, lut_for_interval, r):
    e = pred - r.ov
    cov = ((r.ov >= r.lo - lut_for_interval) & (r.ov <= r.hi - lut_for_interval)).mean() if lut_for_interval is not None else np.nan
    return dict(MAE=e.abs().mean(), bias=e.mean(), within1=(e.abs() <= 1).mean(), within2=(e.abs() <= 2).mean(),
                ov_window_cov=cov, n=len(r))

def ovtable(r):
    return pd.DataFrame({
        "fixed 14 (app default)": ov_metrics(r.P - 14, 14, r),
        "population luteal":      ov_metrics(r.P - r["pop"], r["pop"], r),
        "personal luteal":        ov_metrics(r.P - r.pers, r.pers, r),
        "forward (mean ov day)":  ov_metrics(r.fwd, None, r)}).T.round(3)

print("\n== TASK 1: predict OVULATION DAY before cycle starts (error in days) ==")
print("ALL targets (personal falls back to 14 until history exists)\n", ovtable(R))
print("\nONLY after >=3 prior luteals known (learned personal)\n", ovtable(R[R.n_lut >= 3]))
print("\nBest fixed constant (sweep):")
print(pd.Series({c: (R.P - c - R.ov).abs().mean() for c in range(10, 17)}).round(3).rename("MAE by fixed luteal c").to_string())

# ---- Task 2: ovulation already confirmed this cycle -> predict period start
def st_metrics(pred, r):
    e = pred - r.len
    return dict(MAE=e.abs().mean(), bias=e.mean(), within1=(e.abs() <= 1).mean(), within2=(e.abs() <= 2).mean(), n=len(r))
def sttable(r):
    return pd.DataFrame({
        "cycle-length model (no ov info)": st_metrics(r.P, r),
        "ov + 14":                          st_metrics(r.ov + 14, r),
        "ov + population luteal":           st_metrics(r.ov + r["pop"], r),
        "ov + personal luteal":             st_metrics(r.ov + r.pers, r)}).T.round(3)
print("\n== TASK 2: ovulation CONFIRMED -> predict next period start (error in days) ==")
print("ALL targets\n", sttable(R))
print("\nONLY after >=3 prior luteals known\n", sttable(R[R.n_lut >= 3]))
print("\nBest fixed constant after confirmed ovulation:")
print(pd.Series({c: (R.ov + c - R.len).abs().mean() for c in range(10, 17)}).round(3).rename("MAE by ov + c").to_string())
print("\nCAVEAT: dataset ovulation = hormone/monitor-based (near exact). Real BBT detection is later + noisier -> real numbers worse.")

# %% [patch4] Paste AFTER the other cells in the same session (needs: results, U, baseline_analyze, jsround, avg, np, pd).
# (a) Does the app's +/-1.28 sd next-period range really cover 80%?   (b) Ovulation confirmation with realistic detection noise.

# ---------- (a) Next-period range calibration, by how much history the user has ----------
r0 = results["A0 analyze() baseline"].copy()
r0 = r0[r0.actual <= 60]
r0["hist"] = pd.cut(r0.hist_n, [0, 2, 5, 9, 999], labels=["1-2", "3-5", "6-9", "10+"])
cov = lambda r: ((r.actual >= r.lo) & (r.actual <= r.hi)).mean()
tabC = pd.DataFrame({h: dict(n=len(g), coverage=cov(g), MAE=(g.pred - g.actual).abs().mean(), width=(g.hi - g.lo).mean())
                     for h, g in r0.groupby("hist", observed=True)}).T.round(3)
print("(a) NEXT-PERIOD RANGE CALIBRATION (target coverage 0.80)\n", tabC)
print("overall coverage:", round(cov(r0), 3))
hw = ((r0.hi - r0.lo) / 2).clip(lower=.5)
print("multiply the half-width by", round(float(np.quantile((r0.actual - r0.pred).abs() / hw, .8)), 2), "to hit exactly 80%")

# ---------- (b) Realistic ovulation detection ----------
# detected_ov = true_ov + round(Normal(bias, sd)); a share of cycles is never detected (falls back to the cycle-length model).
# Personal luteal is learned from the NOISY detections, exactly as the app would learn it.
def noisy_rows(bias, sd, p_miss, seed):
    rng = np.random.default_rng(seed); rows = []
    for u, x in U.items():
        ln, ov = x["len"], x["ov"]
        det = ov + np.array([jsround(v) for v in rng.normal(bias, sd, len(ov))])
        det[rng.random(len(det)) < p_miss] = np.nan
        for t in range(1, len(ln)):
            P, _, _ = baseline_analyze(list(ln[:t]))
            lh = [ln[i] - det[i] for i in range(t) if not np.isnan(det[i]) and 9 <= ln[i] - det[i] <= 17][-6:]
            rows.append(dict(len=ln[t], P=P, det=det[t], true_ov=ov[t], pers=jsround(avg(lh)) if lh else 14))
    return pd.DataFrame(rows)

scen = [(0, 0, 0), (0, 1, 0), (0, 2, 0), (1, 1, 0), (1, 2, 0), (1, 2, .25)]   # (bias days, sd days, share never detected)
out = []
for b, s, m in scen:
    R2 = pd.concat([noisy_rows(b, s, m, k) for k in (0, 1, 2)], ignore_index=True)
    has = R2.det.notna(); d = R2[has]
    mixed = np.where(has, R2.det + R2.pers, R2.P)
    out.append(dict(bias=b, sd=s, undetected=m,
                    len_model_MAE=(d.P - d.len).abs().mean(),          # same rows as the two below
                    ov_plus_14_MAE=(d.det + 14 - d.len).abs().mean(),
                    ov_plus_personal_MAE=(d.det + d.pers - d.len).abs().mean(),
                    mixed_MAE=np.abs(mixed - R2.len).mean(),            # all cycles: confirmed -> ov+personal, else cycle-length model
                    mixed_within2=(np.abs(mixed - R2.len) <= 2).mean(),
                    days_left_after_confirm=(d.len - (d.true_ov + 3)).mean()))   # confirmation lands ~3 days after ovulation
print("\n(b) CONFIRMED-OVULATION NEXT-PERIOD ERROR UNDER REALISTIC DETECTION (days)")
print(pd.DataFrame(out).round(3).to_string(index=False))
print("Reading it: a constant bias is absorbed by personal luteal; random noise (sd) is what erodes the gain.")

# %% [patch5] Gated re-anchor backtest. Paste AFTER the earlier cells (needs: U, baseline_analyze, jsround, avg, np, pd).
# Question: can the app decide, per user, when to trust confirmed ovulation? For every past cycle with a detected ovulation we know both
# predictions' errors once the cycle ends. Gate = re-anchor only if the ovulation-based prediction has been beating the cycle-length model.
M_WIN, MIN_N, EPS, TOL = 6, 3, 0.25, 0.02     # comparisons used, minimum before trusting the gate, blend smoothing, pass tolerance (days)

def gate_rows(bias, sd, p_miss, seed):
    rng = np.random.default_rng(seed); rows = []
    for u, x in U.items():
        ln, ov = x["len"], x["ov"]
        det = ov + np.array([jsround(v) for v in rng.normal(bias, sd, len(ov))])
        det[rng.random(len(det)) < p_miss] = np.nan
        c_ov, c_len = [], []                                  # past errors of each method, only cycles that had a detection
        for t in range(1, len(ln)):
            P = baseline_analyze(list(ln[:t]))[0]
            lh = [ln[i] - det[i] for i in range(t) if not np.isnan(det[i]) and 9 <= ln[i] - det[i] <= 17][-6:]
            pers = jsround(avg(lh)) if lh else 14
            k = len(c_ov[-M_WIN:])
            rows.append(dict(len=ln[t], P=P, det=det[t], pers=pers, n_cmp=k,
                             e_ov=np.mean(c_ov[-M_WIN:]) if k else np.nan, e_len=np.mean(c_len[-M_WIN:]) if k else np.nan))
            if not np.isnan(det[t]):                          # outcome known only after the cycle ends -> usable from the NEXT cycle
                c_ov.append(abs(det[t] + pers - ln[t])); c_len.append(abs(P - ln[t]))
    return pd.DataFrame(rows)

def variants(G):
    has = G.det.notna().to_numpy(); ovp = (G.det + G.pers).to_numpy(); P = G.P.to_numpy()
    enough = (G.n_cmp >= MIN_N).to_numpy(); wins = (G.e_ov < G.e_len).to_numpy()
    a, b = 1 / (G.e_ov + EPS), 1 / (G.e_len + EPS); w = (a / (a + b)).fillna(.5).to_numpy()
    return {"cycle-length only": P,
            "always re-anchor":   np.where(has, ovp, P),
            "gate, fallback=len": np.where(has & enough & wins, ovp, P),
            "gate, fallback=ov":  np.where(has & (~enough | wins), ovp, P),
            "blend by past err":  np.where(has, np.where(enough, w * ovp + (1 - w) * P, .5 * ovp + .5 * P), P)}

for m in (0, .25):
    out = []
    for s in (0, 1, 1.5, 2, 2.5, 3):                          # detection noise sd in days (bias fixed at +1)
        G = pd.concat([gate_rows(1, s, m, k) for k in (0, 1, 2)], ignore_index=True)
        out.append(dict(sd=s, **{n: np.abs(p - G.len.to_numpy()).mean() for n, p in variants(G).items()}))
    T = pd.DataFrame(out).set_index("sd"); base = T["cycle-length only"]
    print(f"\nGATED RE-ANCHOR: overall next-period MAE (days), {int(m*100)}% of cycles never detected")
    print(T.round(3).to_string())
    be = T.index[T["always re-anchor"] > base + TOL]
    print("always-re-anchor first worse than cycle-length at sd =", be[0] if len(be) else "never (in grid)")
    for c in T.columns[2:]:
        gap = (T[c] - base)[T.index >= 2].max()
        print(f"  {c:20s} worst gap vs cycle-length at sd>=2: {gap:+.3f}  {'PASS' if gap <= TOL else 'FAIL'}   | gain at sd=0: {base.iloc[0]-T[c].iloc[0]:+.3f}")

# %% [patch6] Paste AFTER the earlier cells (needs: U, baseline_analyze, jsround, avg, np, pd).
# (1) Users with DIFFERENT detection noise (clean ... messy), blend vs always-re-anchor vs cycle-length only.
# (2) Range for the blended prediction: native analyze() half-width vs one built from the user's own recent errors of the prediction actually shown.
M_WIN, MIN_N, EPS = 6, 3, 0.25                       # same blend settings as patch5
NOISE_SD, NOISE_P = (0.5, 1, 2, 3), (.25, .35, .25, .15)   # per-user detection noise (days) and how common each is
K_HW, WIN_HW = 3, 8                                  # range: shrinkage toward native half-width, past errors used

def mixed_rows(seed, bias=1.0, p_miss=.25):
    rng = np.random.default_rng(seed); rows = []
    for u, x in U.items():
        ln, ov = x["len"], x["ov"]
        sdu = rng.choice(NOISE_SD, p=NOISE_P)
        det = ov + np.array([jsround(v) for v in rng.normal(bias, sdu, len(ov))])
        det[rng.random(len(det)) < p_miss] = np.nan
        c_ov, c_len, fe = [], [], []
        for t in range(1, len(ln)):
            P, lo, hi = baseline_analyze(list(ln[:t]))
            lh = [ln[i] - det[i] for i in range(t) if not np.isnan(det[i]) and 9 <= ln[i] - det[i] <= 17][-6:]
            pers = jsround(avg(lh)) if lh else 14
            has = not np.isnan(det[t]); ovp = det[t] + pers if has else P
            if has:
                if len(c_ov[-M_WIN:]) >= MIN_N:
                    a, b = 1 / (np.mean(c_ov[-M_WIN:]) + EPS), 1 / (np.mean(c_len[-M_WIN:]) + EPS); w = a / (a + b)
                else: w = .5
                final = w * ovp + (1 - w) * P
            else: final = P
            nat = max(.5, (hi - lo) / 2); kk = len(fe[-WIN_HW:])
            hwB = max(1., (K_HW * nat + kk * np.quantile(fe[-WIN_HW:], .8)) / (K_HW + kk)) if kk else nat
            rows.append(dict(sd=sdu, nhist=t, len=ln[t], P=P, alw=ovp, final=final, nat=nat, hwB=hwB))
            fe.append(abs(final - ln[t]))                # error of the prediction that was actually shown
            if has: c_ov.append(abs(ovp - ln[t])); c_len.append(abs(P - ln[t]))
    return pd.DataFrame(rows)

H = pd.concat([mixed_rows(s) for s in (0, 1, 2)], ignore_index=True)
err = lambda p: (p - H.len).abs()
M = pd.DataFrame({"cycle-length only": err(H.P), "always re-anchor": err(H.alw), "blend": err(H.final)})
H["grp"] = pd.cut(H.sd, [0, 1, 2, 9], labels=["clean (sd<=1)", "mid (sd=2)", "messy (sd=3)"])
print("\n(1) MIXED-NOISE USERS: next-period MAE (days)   [25% of cycles never detected, bias +1]")
print(pd.concat([M.groupby(H.grp, observed=True).mean(), M.mean().to_frame("ALL").T]).round(3).to_string())
print("within +/-2 days:", (M <= 2).mean().round(3).to_dict())

H["histb"] = pd.cut(H.nhist, [0, 2, 5, 9, 999], labels=["1-2", "3-5", "6-9", "10+"])
e = err(H.final)
def rng_tab(by):
    return pd.DataFrame({k: dict(n=len(g), covA=(e[g.index] <= g.nat).mean(), widthA=2 * g.nat.mean(),
                                 covB=(e[g.index] <= g.hwB).mean(), widthB=2 * g.hwB.mean())
                         for k, g in H.groupby(by, observed=True)}).T.round(3)
print("\n(2) RANGE AROUND THE BLENDED PREDICTION. A = native analyze() half-width, B = shrunk toward own recent errors (80% target)")
print("by history length:\n", rng_tab("histb").to_string())
print("by user noise:\n", rng_tab("grp").to_string())

# %% [patch6] Paste AFTER the earlier cells (needs: U, baseline_analyze, jsround, avg, np, pd).
# (1) Users with DIFFERENT detection noise (clean ... messy), blend vs always-re-anchor vs cycle-length only.
# (2) Range for the blended prediction: native analyze() half-width vs one built from the user's own recent errors of the prediction actually shown.
M_WIN, MIN_N, EPS = 6, 3, 0.25                       # same blend settings as patch5
NOISE_SD, NOISE_P = (0.5, 1, 2, 3), (.25, .35, .25, .15)   # per-user detection noise (days) and how common each is
K_HW, WIN_HW = 3, 8                                  # range: shrinkage toward native half-width, past errors used

def mixed_rows(seed, bias=1.0, p_miss=.25):
    rng = np.random.default_rng(seed); rows = []
    for u, x in U.items():
        ln, ov = x["len"], x["ov"]
        sdu = rng.choice(NOISE_SD, p=NOISE_P)
        det = ov + np.array([jsround(v) for v in rng.normal(bias, sdu, len(ov))])
        det[rng.random(len(det)) < p_miss] = np.nan
        c_ov, c_len, fe = [], [], []
        for t in range(1, len(ln)):
            P, lo, hi = baseline_analyze(list(ln[:t]))
            lh = [ln[i] - det[i] for i in range(t) if not np.isnan(det[i]) and 9 <= ln[i] - det[i] <= 17][-6:]
            pers = jsround(avg(lh)) if lh else 14
            has = not np.isnan(det[t]); ovp = det[t] + pers if has else P
            if has:
                if len(c_ov[-M_WIN:]) >= MIN_N:
                    a, b = 1 / (np.mean(c_ov[-M_WIN:]) + EPS), 1 / (np.mean(c_len[-M_WIN:]) + EPS); w = a / (a + b)
                else: w = .5
                final = w * ovp + (1 - w) * P
            else: final = P
            nat = max(.5, (hi - lo) / 2); kk = len(fe[-WIN_HW:])
            hwB = max(1., (K_HW * nat + kk * np.quantile(fe[-WIN_HW:], .8)) / (K_HW + kk)) if kk else nat
            rows.append(dict(sd=sdu, nhist=t, len=ln[t], P=P, alw=ovp, final=final, nat=nat, hwB=hwB))
            fe.append(abs(final - ln[t]))                # error of the prediction that was actually shown
            if has: c_ov.append(abs(ovp - ln[t])); c_len.append(abs(P - ln[t]))
    return pd.DataFrame(rows)

G6 = pd.concat([mixed_rows(s) for s in (0, 1, 2)], ignore_index=True)
err = lambda p: (p - G6.len).abs()
M = pd.DataFrame({"cycle-length only": err(G6.P), "always re-anchor": err(G6.alw), "blend": err(G6.final)})
G6["grp"] = pd.cut(G6.sd, [0, 1, 2, 9], labels=["clean (sd<=1)", "mid (sd=2)", "messy (sd=3)"])
print("\n(1) MIXED-NOISE USERS: next-period MAE (days)   [25% of cycles never detected, bias +1]")
print(pd.concat([M.groupby(G6.grp, observed=True).mean(), M.mean().to_frame("ALL").T]).round(3).to_string())
print("within +/-2 days:", (M <= 2).mean().round(3).to_dict())

G6["histb"] = pd.cut(G6.nhist, [0, 2, 5, 9, 999], labels=["1-2", "3-5", "6-9", "10+"])
e = err(G6.final)
def rng_tab(by):
    return pd.DataFrame({k: dict(n=len(g), covA=(e[g.index] <= g.nat).mean(), widthA=2 * g.nat.mean(),
                                 covB=(e[g.index] <= g.hwB).mean(), widthB=2 * g.hwB.mean())
                         for k, g in G6.groupby(by, observed=True)}).T.round(3)
print("\n(2) RANGE AROUND THE BLENDED PREDICTION. A = native analyze() half-width, B = shrunk toward own recent errors (80% target)")
print("by history length:\n", rng_tab("histb").to_string())
print("by user noise:\n", rng_tab("grp").to_string())

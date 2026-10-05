// Prediction engine. Pure TypeScript port of analyze.js (validated in the Phase 1 backtest).
// Python reference: python/analyze.py. Golden tests: analyze.test.ts (fixtures made by scripts/make_golden.py).
// Keep behaviour identical to the Python version; change both, regenerate fixtures, rerun tests.
//
// Model:
//  1. Period starts = first day of each run of logged period days (gaps <= 1 day merge).
//  2. Cycle lengths outside 15-60 d, or beyond max(3*MAD, 6) from the median, are excluded (missed logs, illness).
//  3. Recency-weighted mean/variance (half-life 4 cycles), shrunk toward a population prior (29 d, sd 4).
//  4. Ovulation: from basal temperature (3 days above the prior 6, last >= +0.2 C) when logged;
//     luteal length personalised from confirmed cycles, else 14 d.
//  5. Window = +/-1.28 sd (~80%), widening for later cycles. Confirmed ovulation re-anchors the forecast;
//     its window is w=2 once luteal is known, else w=3 (Phase 1 result).

export interface DayRecord {
  p?: number | boolean // period day
  t?: number | null // basal temperature, C
  f?: 1 | 2 | 3 // flow: light / medium / heavy (display only)
  s?: string[] // symptom keys (see symptoms.ts); display / insights only
  m?: 1 | 2 | 3 | 4 | 5 // mood; display / insights only
  pe?: boolean // last day of a period the user explicitly ended (see periodLogging.ts); display / prompts only
  lh?: boolean // positive LH test (display only for now; Stage 2: third predictor)
  [key: string]: unknown
}
export type Days = Record<string, DayRecord>

export interface Cycle {
  s: number
  e: number
  len: number
  ok?: boolean
  ov: number | null
  lut: number | null
}
export interface Projection {
  s: number
  w: number
  ov: number
  conf: boolean
}
export interface Analysis {
  st: number[]
  cy: Cycle[]
  proj: Projection[]
  plen: number
  sd: number
  mu: number
  n: number
  lut: number
  lutKnown: boolean
  last?: number
  curOv?: number | null
  /** Blend inputs, in days since `last`. Cycle-length path only: NOT changed by confirmed ovulation. */
  lenPred?: number
  lenHw?: number
  /** Ovulation-based next start (confirmed ovulation + personal luteal), days since `last`; null until confirmed. */
  ovPred?: number | null
}

/** 'YYYY-MM-DD' -> days since epoch (UTC, no timezone drift) */
export const dayNum = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 864e5
}
/** days since epoch -> 'YYYY-MM-DD' */
export const isoDay = (n: number): string => new Date(n * 864e5).toISOString().slice(0, 10)
/** Today's LOCAL calendar date as a day number (use this, not Date.now()/864e5, to avoid off-by-one at night). */
export const todayDayNum = (d: Date = new Date()): number => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5

const med = (a: number[]): number => {
  const s = [...a].sort((x, y) => x - y)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const avg = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length

/** Period starts and period lengths from logged period days (gaps <= 1 skipped day merge). */
export function periodStarts(days: Days): { st: number[]; pl: number[] } {
  const ks = Object.keys(days)
    .filter((k) => days[k].p)
    .map(dayNum)
    .sort((a, b) => a - b)
  const st: number[] = []
  const pl: number[] = []
  ks.forEach((n, i) => {
    if (i && n - ks[i - 1] <= 2) pl[pl.length - 1] = n - st[st.length - 1] + 1
    else {
      st.push(n)
      pl.push(1)
    }
  })
  return { st, pl }
}

/** day number -> basal temperature, for every logged temperature. */
export function tempsOf(days: Days): Record<number, number> {
  const out: Record<number, number> = {}
  for (const k of Object.keys(days)) {
    const t = days[k].t
    if (t != null) out[dayNum(k)] = t
  }
  return out
}

export function analyze(days: Days, today: number): Analysis {
  const { st, pl } = periodStarts(days)
  return analyzeCore(st, pl, tempsOf(days), today)
}

/** Same result as analyze(), but takes pre-parsed data so replaying many history prefixes parses the logs only once. */
export function analyzeCore(st: number[], pl: number[], temps: Record<number, number>, today: number): Analysis {
  const A: Analysis = { st, cy: [], proj: [], plen: 5, sd: 4, mu: 29, n: 0, lut: 14, lutKnown: false }
  if (!st.length) return A

  const cy = A.cy
  for (let i = 1; i < st.length; i++) cy.push({ s: st[i - 1], e: st[i], len: st[i] - st[i - 1], ov: null, lut: null })
  const raw = cy.map((c) => c.len).filter((x) => x >= 15 && x <= 60)
  const md = raw.length ? med(raw) : 29
  const mad = raw.length ? 1.4826 * med(raw.map((x) => Math.abs(x - md))) : 0
  const tol = Math.max(3 * mad, 6)
  cy.forEach((c) => {
    c.ok = c.len >= 15 && c.len <= 60 && Math.abs(c.len - md) <= tol
  })

  const u = cy.filter((c) => c.ok).slice(-12)
  const ws = u.map((_, i) => Math.pow(0.5, (u.length - 1 - i) / 4))
  const W = ws.reduce((a, b) => a + b, 0)
  const W2 = ws.reduce((a, b) => a + b * b, 0)
  const mean = W ? u.reduce((a, c, i) => a + ws[i] * c.len, 0) / W : 0
  const V = W ? u.reduce((a, c, i) => a + ws[i] * (c.len - mean) ** 2, 0) / W : 0
  const ne = W ? (W * W) / W2 : 0
  const K = 3
  A.mu = (ne * mean + K * 29) / (ne + K)
  A.sd = Math.max(1.5, Math.sqrt((ne * V + K * 16) / (ne + K)))
  A.n = u.length

  const ovOf = (s: number, e: number): number | null => {
    const l: [number, number][] = []
    for (let n = s; n < e; n++) {
      const t = temps[n]
      if (t !== undefined) l.push([n, t])
    }
    for (let j = 6; j + 2 < l.length; j++) {
      const b = Math.max(...l.slice(j - 6, j).map((x) => x[1]))
      if (l[j][1] > b && l[j + 1][1] > b && l[j + 2][1] >= b + 0.2) return l[j][0] - 1
    }
    return null
  }
  cy.forEach((c) => {
    c.ov = ovOf(c.s, c.e)
    c.lut = c.ov != null ? c.e - c.ov : null
  })
  const ll = cy
    .filter((c) => c.lut !== null && c.lut >= 9 && c.lut <= 17)
    .map((c) => c.lut as number)
    .slice(-6)
  if (ll.length) {
    A.lut = Math.round(avg(ll))
    A.lutKnown = true
  }

  A.last = st[st.length - 1]
  A.plen = Math.round(avg(pl.slice(-6)))
  A.curOv = ovOf(A.last, today + 1)
  A.lenPred = Math.round(A.mu)
  A.lenHw = Math.max(1, Math.round(1.28 * A.sd))
  A.ovPred = A.curOv != null ? A.curOv + A.lut - A.last : null
  for (let k = 1; k <= 3; k++) {
    let s: number
    let w: number
    let ov: number
    let conf = false
    if (k === 1 && A.curOv != null) {
      ov = A.curOv
      s = ov + A.lut
      w = A.lutKnown ? 2 : 3
      conf = true
    } else {
      s = A.last + Math.round(A.mu * k)
      w = Math.max(1, Math.round(1.28 * A.sd * Math.sqrt(k)))
      ov = s - A.lut
    }
    A.proj.push({ s, w, ov, conf })
  }
  return A
}

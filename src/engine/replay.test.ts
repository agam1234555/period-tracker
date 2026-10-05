// Guards the fast replay in forecast.ts (analyzeCore on history prefixes) against the original, slow definition:
// "for each past cycle, analyse only the logs written BEFORE the next period started". Any leak of later data
// (e.g. later temperatures) into an earlier prediction would make these disagree.
import { describe, expect, it } from 'vitest'
import { analyze, dayNum, isoDay, periodStarts, type Days } from './analyze'
import { blend, emptyTrack, recordOutcome, type Track } from './blend'
import { buildTrack } from './forecast'

let seed = 987654321
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1))

function history(): Days {
  const days: Days = {}
  let s = dayNum('2023-06-01') + ri(0, 30)
  const starts = [s]
  for (let c = 0, n = ri(2, 16); c < n; c++) { s += rnd() < 0.1 ? ri(10, 75) : ri(24, 36); starts.push(s) }
  const temps = rnd() < 0.7
  starts.forEach((st, k) => {
    for (let i = 0, pl = ri(1, 8); i < pl; i++) days[isoDay(st + i)] = { p: 1 }
    if (!temps) return
    const end = k + 1 < starts.length ? starts[k + 1] : st + ri(8, 30), ov = st + ri(11, 19)
    for (let n = st; n < end; n++) if (rnd() < 0.85) days[isoDay(n)] = { ...(days[isoDay(n)] ?? {}), t: Math.round((36.2 + rnd() * 0.15 + (n > ov ? 0.3 + rnd() * 0.1 : 0)) * 100) / 100 }
  })
  return days
}

/** The original, obviously-correct (but slow) track builder. */
function oracleTrack(days: Days): Track {
  const { st } = periodStarts(days)
  let track = emptyTrack()
  for (let j = 1; j + 1 < st.length; j++) {
    const actual = st[j + 1] - st[j]
    const cutoff = isoDay(st[j + 1])
    const past: Days = {}
    for (const k of Object.keys(days)) if (k < cutoff) past[k] = days[k]
    const A = analyze(past, st[j + 1] - 1)
    if (A.lenPred === undefined) continue
    const ovPred = A.ovPred ?? null
    const shown = blend(A.lenPred, ovPred, track).pred
    if (actual < 15 || actual > 60) continue
    track = recordOutcome(track, { actual, lenPred: A.lenPred, ovPred, shown })
  }
  return track
}

describe('fast replay == original definition', () => {
  it('buildTrack matches the prefix-filter oracle on 400 random histories', () => {
    for (let i = 0; i < 400; i++) {
      const d = history()
      expect(buildTrack(d), `case ${i}`).toEqual(oracleTrack(d))
    }
  })
})

// Wording for the forecast card. Pure, so the messages for "few cycles", "late" and "estimated" are testable.
import type { Forecast } from '../engine/forecast'

export type ForecastTextInput = Pick<Forecast, 'daysUntil' | 'rangeLo' | 'rangeHi' | 'nextStart' | 'fertileFrom' | 'fertileTo' | 'ovulation' | 'ovulationConfirmed' | 'confidence' | 'cyclesUsed' | 'avgCycle' | 'variability' | 'weightOv'>

export interface ForecastText {
  headline: string
  status: string | null        // late / within-range note
  range: string
  best: string
  fertile: string
  ovulation: string
  fertileNote: string | null   // only when ovulation is an estimate
  cycleLine: string
  blendNote: string | null
}

export function forecastText(f: ForecastTextInput, fmt: (day: number) => string): ForecastText {
  const d = f.daysUntil
  const headline = d < 0 ? `${-d} day${d === -1 ? '' : 's'} late` : d === 0 ? 'Expected today' : `In ${d} day${d === 1 ? '' : 's'}`
  const today = f.nextStart - d
  const status = d >= 0 ? null : today > f.rangeHi
    ? 'Later than your usual range. Cycles can run late for many reasons; this is only a prediction.'
    : 'Still within your usual range.'
  const v = f.variability
  const cycleLine = f.cyclesUsed < 2
    ? 'Still learning your cycle. This is a rough guess until you have logged a few periods.'
    : `Your cycles average ${Math.round(f.avgCycle)} days and usually vary by ${v < 1 ? 'less than a day' : `about ±${Math.round(v)} days`}.`
  return {
    headline,
    status,
    range: `${fmt(f.rangeLo)} – ${fmt(f.rangeHi)}`,
    best: fmt(f.nextStart),
    fertile: `${fmt(f.fertileFrom)} – ${fmt(f.fertileTo)}`,
    ovulation: f.ovulationConfirmed ? `Ovulation confirmed by temperature: ${fmt(f.ovulation)}` : `Estimated ovulation: ${fmt(f.ovulation)}`,
    fertileNote: f.ovulationConfirmed ? null : 'The fertile window is estimated from your cycle length and can be off by several days.',
    cycleLine,
    blendNote: f.ovulationConfirmed ? `Uses your temperatures as well as your cycle history (${Math.round(f.weightOv * 100)}% temperature).` : null,
  }
}

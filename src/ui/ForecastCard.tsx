import type { Forecast } from '../engine/forecast'

const fmt = (n: number) => new Date(n * 864e5).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })

export function ForecastCard({ f }: { f: Forecast | null }) {
  if (!f) return <section className="card"><p>Log the first day of a period to see a forecast.</p></section>
  const late = f.daysUntil < 0
  const headline = late ? `${-f.daysUntil} day${f.daysUntil === -1 ? '' : 's'} late` : f.daysUntil === 0 ? 'Expected today' : `In ${f.daysUntil} day${f.daysUntil === 1 ? '' : 's'}`
  return (
    <section className="card">
      <div className="lbl">Next period</div>
      <div className="big">{headline}</div>
      <div>{fmt(f.rangeLo)} – {fmt(f.rangeHi)} <span className="lbl">(estimate, best guess {fmt(f.nextStart)})</span></div>
      <div className="row">
        <span>Cycle day {f.cycleDay}</span>
        <span>Fertile window {fmt(f.fertileFrom)} – {fmt(f.fertileTo)}</span>
        <span>Ovulation {f.ovulationConfirmed ? 'confirmed' : 'expected'} {fmt(f.ovulation)}</span>
      </div>
      {f.ovulationConfirmed && <p className="lbl">Forecast blends temperature and cycle history ({Math.round(f.weightOv * 100)}% temperature).</p>}
      <p className="lbl">
        Confidence: {f.confidence} · {f.cyclesUsed} cycle{f.cyclesUsed === 1 ? '' : 's'} used · avg {f.avgCycle.toFixed(1)} d ± {f.variability.toFixed(1)}
      </p>
      <small>Estimates only. Not contraception or medical advice.</small>
    </section>
  )
}

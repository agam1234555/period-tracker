import type { Forecast } from '../engine/forecast'
import { forecastText } from './forecastText'

const fmt = (n: number) => new Date(n * 864e5).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })

export function ForecastCard({ f }: { f: Forecast | null }) {
  if (!f) return <section className="card"><p>Tap “Period started today” below to begin. Your forecast appears after your first period is logged.</p></section>
  const t = forecastText(f, fmt)
  return (
    <section className="card">
      <div className="lbl">Next period</div>
      <div className="big">{t.headline}</div>
      {t.status && <p className="lbl">{t.status}</p>}
      <div>{t.range} <span className="lbl">(best guess {t.best})</span></div>
      <div className="row">
        <span>Cycle day {f.cycleDay}</span>
        <span>Fertile window {t.fertile}</span>
      </div>
      <p className="lbl">{t.ovulation}</p>
      {t.fertileNote && <p className="lbl">{t.fertileNote}</p>}
      {t.blendNote && <p className="lbl">{t.blendNote}</p>}
      <p className="lbl">Confidence: {f.confidence}. {t.cycleLine}</p>
      <small>Estimates only. Not contraception or medical advice.</small>
    </section>
  )
}

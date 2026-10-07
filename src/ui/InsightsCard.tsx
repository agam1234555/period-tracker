import { MIN_TRACKED_CYCLES, PHASE_TEXT, symptomDetail, type Insights } from '../insights'

export function InsightsCard({ insights: i }: { insights: Insights }) {
  return (
    <section className="card">
      {!i.ready ? (
        <p>
          Patterns appear once you’ve logged symptoms or mood in at least {MIN_TRACKED_CYCLES} completed cycles.
          So far: {i.trackedCycles} of {MIN_TRACKED_CYCLES}.
        </p>
      ) : (
        <>
          <div className="lbl">Based on {i.trackedCycles} cycle{i.trackedCycles === 1 ? '' : 's'} where you logged symptoms or mood</div>
          {i.symptoms.length === 0 ? <p>No clear symptom pattern yet. That’s normal early on; keep logging.</p> : (
            <ul className="ins">
              {i.symptoms.map((s) => (
                <li key={s.key}>
                  <strong>{s.label}</strong>: {symptomDetail(s)}
                </li>
              ))}
            </ul>
          )}
          {i.mood.length >= 2 && (
            <>
              <div className="lbl">Average mood (1 low – 5 great)</div>
              <ul className="ins">
                {i.mood.map((m) => <li key={m.phase}>{m.phase === 'period' ? 'During your period' : m.phase === 'pre' ? `Before your period` : 'Between periods'}: <strong>{m.avg.toFixed(1)}</strong> ({m.days} days)</li>)}
              </ul>
              {i.moodLowest && <p>Your mood tends to be lowest {PHASE_TEXT[i.moodLowest]}.</p>}
            </>
          )}
        </>
      )}
      <small>Patterns in what you logged, not diagnoses. Days you didn’t log are not counted as symptom-free. If symptoms are severe or new, talk to a clinician.</small>
    </section>
  )
}

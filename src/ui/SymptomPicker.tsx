import { MOODS, SYMPTOMS, SYMPTOM_GROUPS, toggleSymptom, type Mood } from '../symptoms'
import { Chip } from './Chip'

interface Props {
  symptoms: readonly string[] | undefined
  mood: Mood | undefined
  disabled?: boolean
  onSymptoms: (next: string[]) => void
  onMood: (next: Mood | undefined) => void
}

export function SymptomPicker({ symptoms, mood, disabled, onSymptoms, onMood }: Props) {
  const has = new Set(symptoms)
  return (
    <div className="picker">
      <div className="lbl">Symptoms</div>
      {SYMPTOM_GROUPS.map((g) => (
        <div key={g} className="group" role="group" aria-label={g}>
          {SYMPTOMS.filter((s) => s.group === g).map((s) => (
            <Chip key={s.key} on={has.has(s.key)} emoji={s.emoji} disabled={disabled} onClick={() => onSymptoms(toggleSymptom(symptoms, s.key))}>{s.label}</Chip>
          ))}
        </div>
      ))}
      <div className="lbl">Mood</div>
      <div className="group" role="radiogroup" aria-label="Mood">
        {MOODS.map((m) => (
          <Chip key={m.value} role="radio" on={mood === m.value} emoji={m.emoji} disabled={disabled} onClick={() => onMood(mood === m.value ? undefined : m.value)}>{m.label}</Chip>
        ))}
      </div>
    </div>
  )
}

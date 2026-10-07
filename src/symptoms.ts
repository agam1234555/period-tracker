// Fixed symptom checklist + mood. Pure data and helpers (no DOM / storage).
// Keys are STABLE identifiers stored in the database and backups: never rename or reuse one.
// Labels, emoji and grouping are free to change.

export interface SymptomDef { key: string; label: string; emoji: string; group: string }

export const SYMPTOMS: readonly SymptomDef[] = [
  { key: 'cramps', label: 'Cramps', emoji: '⚡', group: 'Pain' },
  { key: 'headache', label: 'Headache', emoji: '🤕', group: 'Pain' },
  { key: 'back_pain', label: 'Back pain', emoji: '🔙', group: 'Pain' },
  { key: 'breast_tenderness', label: 'Breast tenderness', emoji: '💢', group: 'Pain' },
  { key: 'bloating', label: 'Bloating', emoji: '🎈', group: 'Body' },
  { key: 'nausea', label: 'Nausea', emoji: '🤢', group: 'Body' },
  { key: 'fatigue', label: 'Fatigue', emoji: '😴', group: 'Body' },
  { key: 'acne', label: 'Acne', emoji: '🔴', group: 'Body' },
  { key: 'spotting', label: 'Spotting', emoji: '💧', group: 'Other' },
]

export const SYMPTOM_GROUPS: readonly string[] = ['Pain', 'Body', 'Other']
const ORDER = new Map(SYMPTOMS.map((s, i) => [s.key, i] as const))

export const isSymptomKey = (k: unknown): k is string => typeof k === 'string' && ORDER.has(k)

/** Mood: 1 (low) to 5 (great). */
export const MOODS = [
  { value: 1, label: 'Low', emoji: '😞' },
  { value: 2, label: 'Meh', emoji: '😕' },
  { value: 3, label: 'Okay', emoji: '😐' },
  { value: 4, label: 'Good', emoji: '🙂' },
  { value: 5, label: 'Great', emoji: '😄' },
] as const
export type Mood = 1 | 2 | 3 | 4 | 5
export const isMood = (v: unknown): v is Mood => v === 1 || v === 2 || v === 3 || v === 4 || v === 5

/** Add the key if absent, remove it if present. Result is de-duplicated and in canonical order. Unknown keys are ignored. */
export function toggleSymptom(current: readonly string[] | undefined, key: string): string[] {
  if (!isSymptomKey(key)) return canonicalSymptoms(current)
  const set = new Set(canonicalSymptoms(current))
  if (set.has(key)) set.delete(key)
  else set.add(key)
  return canonicalSymptoms([...set])
}

/** De-duplicate, drop unknown keys, sort into canonical order. */
export function canonicalSymptoms(list: readonly string[] | undefined): string[] {
  return [...new Set((list ?? []).filter(isSymptomKey))].sort((a, b) => ORDER.get(a)! - ORDER.get(b)!)
}

const LABEL = new Map(SYMPTOMS.map((d) => [d.key, d.label] as const))

/** One-line description of what was logged, e.g. "Cramps, Headache · Mood: Good" (shown on the collapsed section). */
export function symptomSummary(s: readonly string[] | undefined, m: number | undefined, maxNames = 3): string {
  const names = canonicalSymptoms(s).map((k) => LABEL.get(k)!)
  const shown = names.slice(0, maxNames).join(', ') + (names.length > maxNames ? ` +${names.length - maxNames} more` : '')
  const mood = isMood(m) ? `Mood: ${MOODS[m - 1].label}` : ''
  return [shown, mood].filter(Boolean).join(' · ') || 'Nothing logged'
}

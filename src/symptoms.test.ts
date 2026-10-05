import { describe, expect, it } from 'vitest'
import { canonicalSymptoms, isMood, isSymptomKey, MOODS, SYMPTOM_GROUPS, SYMPTOMS, toggleSymptom } from './symptoms'

describe('symptom catalogue', () => {
  it('keys are unique, snake_case, and every group is declared', () => {
    const keys = SYMPTOMS.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of keys) expect(k).toMatch(/^[a-z]+(_[a-z]+)*$/)
    for (const s of SYMPTOMS) expect(SYMPTOM_GROUPS).toContain(s.group)
  })
  it('stored keys are pinned: renaming one would orphan saved data', () => {
    expect(SYMPTOMS.map((s) => s.key)).toEqual(['cramps', 'headache', 'back_pain', 'breast_tenderness', 'bloating', 'nausea', 'fatigue', 'acne', 'spotting'])
  })
  it('mood scale is 1..5', () => {
    expect(MOODS.map((m) => m.value)).toEqual([1, 2, 3, 4, 5])
    expect([0, 6, 2.5, '3', null].some(isMood)).toBe(false)
  })
})

describe('toggleSymptom', () => {
  it('adds, removes, and keeps canonical order', () => {
    let s = toggleSymptom(undefined, 'fatigue')
    s = toggleSymptom(s, 'cramps')
    expect(s).toEqual(['cramps', 'fatigue'])
    expect(toggleSymptom(s, 'cramps')).toEqual(['fatigue'])
    expect(toggleSymptom(['fatigue'], 'fatigue')).toEqual([])
  })
  it('ignores unknown keys and does not mutate its input', () => {
    const input = ['cramps']
    expect(toggleSymptom(input, 'dizzy')).toEqual(['cramps'])
    toggleSymptom(input, 'acne')
    expect(input).toEqual(['cramps'])
  })
  it('canonicalSymptoms de-duplicates and drops unknown', () => {
    expect(canonicalSymptoms(['acne', 'x', 'cramps', 'acne'])).toEqual(['cramps', 'acne'])
    expect(isSymptomKey('cramps')).toBe(true)
    expect(isSymptomKey('Cramps')).toBe(false)
  })
})

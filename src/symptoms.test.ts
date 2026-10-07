import { describe, expect, it } from 'vitest'
import { symptomSummary, canonicalSymptoms, isMood, isSymptomKey, MOODS, SYMPTOM_GROUPS, SYMPTOMS, toggleSymptom } from './symptoms'

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

describe('symptomSummary', () => {
  it('nothing logged', () => {
    expect(symptomSummary(undefined, undefined)).toBe('Nothing logged')
    expect(symptomSummary([], undefined)).toBe('Nothing logged')
  })
  it('lists symptoms in canonical order, then mood', () => {
    expect(symptomSummary(['fatigue', 'cramps'], 4)).toBe('Cramps, Fatigue · Mood: Good')
    expect(symptomSummary(undefined, 1)).toBe('Mood: Low')
  })
  it('caps the list and says how many more', () => {
    expect(symptomSummary(['cramps', 'headache', 'back_pain', 'acne', 'spotting'], undefined)).toBe('Cramps, Headache, Back pain +2 more')
  })
  it('ignores unknown keys and invalid moods', () => {
    expect(symptomSummary(['dizzy'], 9)).toBe('Nothing logged')
  })
})

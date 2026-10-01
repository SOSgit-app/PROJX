/** Interactive instructor rubric for Project X task scoring. */

export const RUBRIC_LEVELS = [
  { id: 'exemplary', label: 'Exemplary' },
  { id: 'effective', label: 'Effective' },
  { id: 'developing', label: 'Developing' },
  { id: 'needsImprovement', label: 'Needs Improvement' },
]

export const RUBRIC_CRITERIA = [
  { id: 'communication', label: 'Communication' },
  { id: 'decisionMaking', label: 'Decision-Making' },
  { id: 'leadership', label: 'Leadership' },
  { id: 'debrief', label: 'Debrief' },
]

const LEVEL_IDS = new Set(RUBRIC_LEVELS.map((l) => l.id))
const CRITERION_IDS = new Set(RUBRIC_CRITERIA.map((c) => c.id))

export function emptyRubric() {
  return {
    communication: null,
    decisionMaking: null,
    leadership: null,
    debrief: null,
  }
}

export function normalizeRubric(raw) {
  const base = emptyRubric()
  if (!raw || typeof raw !== 'object') return base
  for (const criterion of CRITERION_IDS) {
    const value = raw[criterion]
    base[criterion] = LEVEL_IDS.has(value) ? value : null
  }
  return base
}

export function rubricHasMarks(rubric) {
  const normalized = normalizeRubric(rubric)
  return Object.values(normalized).some(Boolean)
}

export function rubricLevelLabel(levelId) {
  return RUBRIC_LEVELS.find((l) => l.id === levelId)?.label || ''
}

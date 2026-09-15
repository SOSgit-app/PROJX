const STORAGE_KEY = 'projx-task-results-v1'

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveAll(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

/** Stable id for a flight task slot within a workbook. */
export function taskResultKey(fileName, flightId, phase, column, task) {
  return [fileName || 'workbook', flightId, phase, column, task]
    .map((part) => String(part ?? '').trim().toUpperCase())
    .join('::')
}

export function getTaskResult(key) {
  const all = loadAll()
  return all[key] || null
}

/**
 * @param {string} key
 * @param {'pass'|'fail'|null} result
 */
export function setTaskResult(key, result) {
  const all = loadAll()
  if (!result) {
    delete all[key]
  } else {
    all[key] = {
      result,
      updatedAt: new Date().toISOString(),
    }
  }
  saveAll(all)
  return all[key] || null
}

export function resultLabel(result) {
  if (result === 'pass') return 'Pass'
  if (result === 'fail') return 'Fail'
  return 'Not graded'
}

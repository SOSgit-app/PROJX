import { emptyRubric, normalizeRubric } from './rubric.js'

/**
 * Class profile storage.
 * Logical key: {classId}/{flightId}/{taskCode}
 *
 * IndexedDB persists grades across the session / browser restarts on this site.
 * Finalize downloads a JSON backup; Restore reloads it from the menu.
 * Flight Report exports Excel from the schedule page.
 */

const META_KEY = 'projx-profile-meta-v1'
const DB_NAME = 'projx-profiles'
const DB_STORE = 'records'
export const BACKUP_TYPE = 'projx-flight-backup'
export const BACKUP_VERSION = 2

function loadMeta() {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

function saveMeta(meta) {
  localStorage.setItem(META_KEY, JSON.stringify(meta))
}

export function getClassId() {
  return String(loadMeta().classId || '').trim()
}

export function setClassId(classId) {
  const meta = loadMeta()
  meta.classId = String(classId || '').trim()
  saveMeta(meta)
  return meta.classId
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'path' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function recordPath(classId, flightId, taskCode) {
  return [classId, flightId, taskCode]
    .map((p) => String(p || '').trim().toUpperCase())
    .join('/')
}

export function normalizeResult(result) {
  if (result === 'complete' || result === 'pass') return 'complete'
  if (result === 'incomplete' || result === 'fail') return 'incomplete'
  return null
}

function emptyRecord(classId, flightId, taskCode) {
  return {
    path: recordPath(classId, flightId, taskCode),
    classId: String(classId || '').trim().toUpperCase(),
    flightId: String(flightId || '').trim().toUpperCase(),
    taskCode: String(taskCode || '').trim().toUpperCase(),
    result: null,
    penalties: [],
    studentComments: [],
    operationalComments: [],
    rubric: emptyRubric(),
    timerStartedAt: null,
    timerAccumulatedMs: 0,
    durationMs: null,
    updatedAt: null,
  }
}

/** Normalize legacy records (pass/fail, comments[]) into the current shape. */
export function normalizeRecord(raw, classId, flightId, taskCode) {
  const base = emptyRecord(
    classId || raw?.classId,
    flightId || raw?.flightId,
    taskCode || raw?.taskCode,
  )
  if (!raw || typeof raw !== 'object') return base

  const studentComments = Array.isArray(raw.studentComments)
    ? raw.studentComments
    : Array.isArray(raw.comments)
      ? raw.comments
      : []
  const operationalComments = Array.isArray(raw.operationalComments)
    ? raw.operationalComments
    : []

  return {
    ...base,
    ...raw,
    path: recordPath(base.classId, base.flightId, base.taskCode),
    classId: base.classId,
    flightId: base.flightId,
    taskCode: base.taskCode,
    result: normalizeResult(raw.result),
    penalties: Array.isArray(raw.penalties) ? raw.penalties : [],
    studentComments,
    operationalComments,
    rubric: normalizeRubric(raw.rubric),
    timerStartedAt: raw.timerStartedAt || null,
    timerAccumulatedMs:
      typeof raw.timerAccumulatedMs === 'number' && Number.isFinite(raw.timerAccumulatedMs)
        ? Math.max(0, raw.timerAccumulatedMs)
        : 0,
    durationMs:
      typeof raw.durationMs === 'number' && Number.isFinite(raw.durationMs)
        ? raw.durationMs
        : null,
    updatedAt: raw.updatedAt || null,
  }
}

async function idbGet(path) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly')
    const req = tx.objectStore(DB_STORE).get(path)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

async function idbPut(record) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).put(record)
    tx.oncomplete = () => resolve(record)
    tx.onerror = () => reject(tx.error)
  })
}

async function idbDelete(path) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).delete(path)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function downloadFlightBackup(classId, flightId) {
  const backup = await buildFlightBackup(classId, flightId)
  const stamp = backup.exportedAt.replace(/[:.]/g, '-').slice(0, 19)
  const filename = `PROJX-${backup.classId}-Flight${backup.flightId}-${stamp}.json`
  const bytes = textBytes(`${JSON.stringify(backup, null, 2)}\n`)
  triggerDownload(bytes, filename, 'application/json')
  return {
    classId: backup.classId,
    flightId: backup.flightId,
    taskCount: backup.records.length,
    filename,
  }
}

export async function buildFlightBackup(classId, flightId) {
  const cls = String(classId || '').trim().toUpperCase()
  const flt = String(flightId || '').trim().toUpperCase()
  if (!cls) throw new Error('Set a class profile first.')
  if (!flt) throw new Error('Select a flight first.')

  const records = await listRecordsForClassFlight(cls, flt)
  return {
    type: BACKUP_TYPE,
    version: BACKUP_VERSION,
    classId: cls,
    flightId: flt,
    exportedAt: new Date().toISOString(),
    records: records.map((r) => ({
      path: r.path,
      classId: r.classId,
      flightId: r.flightId,
      taskCode: r.taskCode,
      result: r.result ?? null,
      penalties: Array.isArray(r.penalties) ? r.penalties : [],
      studentComments: Array.isArray(r.studentComments) ? r.studentComments : [],
      operationalComments: Array.isArray(r.operationalComments)
        ? r.operationalComments
        : [],
      rubric: normalizeRubric(r.rubric),
      timerStartedAt: r.timerStartedAt || null,
      timerAccumulatedMs: r.timerAccumulatedMs ?? 0,
      durationMs: r.durationMs ?? null,
      updatedAt: r.updatedAt || null,
    })),
  }
}

export async function restoreFlightBackupFromFile(file) {
  if (!file) throw new Error('Choose a backup file to restore.')
  const text = await file.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON. Use a PROJX Finalize backup.')
  }
  return restoreFlightBackup(data)
}

export async function restoreFlightBackup(data) {
  if (!data || data.type !== BACKUP_TYPE) {
    throw new Error('Not a PROJX flight backup. Use a file from Finalize.')
  }
  const cls = String(data.classId || '').trim().toUpperCase()
  const flt = String(data.flightId || '').trim().toUpperCase()
  if (!cls || !flt) {
    throw new Error('Backup is missing class or flight.')
  }

  const incoming = Array.isArray(data.records) ? data.records : []
  const normalized = incoming
    .map((raw) => normalizeBackupRecord(raw, cls, flt))
    .filter(Boolean)

  const existing = await listRecordsForClassFlight(cls, flt)
  const keep = new Set(normalized.map((r) => r.path))
  for (const old of existing) {
    if (!keep.has(old.path)) {
      await idbDelete(old.path)
    }
  }

  for (const record of normalized) {
    await idbPut(record)
  }

  setClassId(cls)

  return {
    classId: cls,
    flightId: flt,
    taskCount: normalized.length,
    exportedAt: data.exportedAt || null,
  }
}

function normalizeBackupRecord(raw, classId, flightId) {
  if (!raw || typeof raw !== 'object') return null
  const taskCode = String(raw.taskCode || '').trim().toUpperCase()
  if (!taskCode) return null
  return normalizeRecord(raw, classId, flightId, taskCode)
}

function triggerDownload(data, filename, mime) {
  const blob = new Blob([data], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function textBytes(text) {
  return new TextEncoder().encode(text)
}

async function listRecordsForClass(classId) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly')
    const store = tx.objectStore(DB_STORE)
    const req = store.getAll()
    req.onsuccess = () => {
      const all = Array.isArray(req.result) ? req.result : []
      resolve(
        all
          .filter((r) => String(r?.classId || '').toUpperCase() === classId)
          .map((r) => normalizeRecord(r, r.classId, r.flightId, r.taskCode)),
      )
    }
    req.onerror = () => reject(req.error || new Error('Could not read profiles.'))
  })
}

async function listRecordsForClassFlight(classId, flightId) {
  const all = await listRecordsForClass(classId)
  return all.filter((r) => String(r?.flightId || '').toUpperCase() === flightId)
}

export async function listFlightRecords(classId, flightId) {
  const cls = String(classId || '').trim().toUpperCase()
  const flt = String(flightId || '').trim().toUpperCase()
  if (!cls || !flt) return []
  return listRecordsForClassFlight(cls, flt)
}

export async function getTaskRecord(classId, flightId, taskCode) {
  if (!classId || !flightId || !taskCode) {
    return emptyRecord(classId, flightId, taskCode)
  }
  const path = recordPath(classId, flightId, taskCode)
  const existing = await idbGet(path)
  return normalizeRecord(existing || emptyRecord(classId, flightId, taskCode), classId, flightId, taskCode)
}

async function mutateTaskRecord(classId, flightId, taskCode, mutator) {
  if (!classId || !flightId || !taskCode) {
    throw new Error('Set a class profile and select a flight before saving.')
  }
  const current = await getTaskRecord(classId, flightId, taskCode)
  const next = mutator({
    ...current,
    penalties: [...current.penalties],
    studentComments: [...current.studentComments],
    operationalComments: [...current.operationalComments],
    rubric: { ...normalizeRubric(current.rubric) },
  })
  next.path = recordPath(classId, flightId, taskCode)
  next.classId = String(classId).trim().toUpperCase()
  next.flightId = String(flightId).trim().toUpperCase()
  next.taskCode = String(taskCode).trim().toUpperCase()
  next.result = normalizeResult(next.result)
  next.updatedAt = new Date().toISOString()
  delete next.comments
  await idbPut(next)
  return next
}

/** Live or final elapsed ms for a task record (running, paused, or graded). */
export function getTaskElapsedMs(rec) {
  if (!rec) return 0
  const acc =
    typeof rec.timerAccumulatedMs === 'number' && Number.isFinite(rec.timerAccumulatedMs)
      ? Math.max(0, rec.timerAccumulatedMs)
      : 0
  if (rec.timerStartedAt) {
    const started = new Date(rec.timerStartedAt).getTime()
    const running = Number.isFinite(started) ? Math.max(0, Date.now() - started) : 0
    return acc + running
  }
  if (acc > 0) return acc
  if (typeof rec.durationMs === 'number' && Number.isFinite(rec.durationMs)) {
    return Math.max(0, rec.durationMs)
  }
  return 0
}

function finalizeTimerDuration(rec) {
  const total = getTaskElapsedMs(rec)
  const hadTimer =
    Boolean(rec.timerStartedAt) ||
    (typeof rec.timerAccumulatedMs === 'number' && rec.timerAccumulatedMs > 0) ||
    (typeof rec.durationMs === 'number' && rec.durationMs > 0)
  rec.timerStartedAt = null
  rec.timerAccumulatedMs = 0
  if (hadTimer) rec.durationMs = total
}

export async function setTaskGrade(classId, flightId, taskCode, result) {
  return mutateTaskRecord(classId, flightId, taskCode, (rec) => {
    const nextResult = result === 'clear' || result == null ? null : normalizeResult(result)
    if (nextResult) {
      finalizeTimerDuration(rec)
    } else {
      rec.timerStartedAt = null
      rec.timerAccumulatedMs = 0
      rec.durationMs = null
    }
    rec.result = nextResult
    return rec
  })
}

export async function startTaskTimer(classId, flightId, taskCode) {
  return mutateTaskRecord(classId, flightId, taskCode, (rec) => {
    if (rec.timerStartedAt) return rec
    // Fresh start / restart after a graded duration (not a pause resume).
    const paused =
      typeof rec.timerAccumulatedMs === 'number' && rec.timerAccumulatedMs > 0
    if (!paused) {
      rec.timerAccumulatedMs = 0
      rec.durationMs = null
    } else {
      rec.durationMs = null
    }
    rec.timerStartedAt = new Date().toISOString()
    return rec
  })
}

export async function pauseTaskTimer(classId, flightId, taskCode) {
  return mutateTaskRecord(classId, flightId, taskCode, (rec) => {
    if (!rec.timerStartedAt) return rec
    const started = new Date(rec.timerStartedAt).getTime()
    const acc =
      typeof rec.timerAccumulatedMs === 'number' && Number.isFinite(rec.timerAccumulatedMs)
        ? Math.max(0, rec.timerAccumulatedMs)
        : 0
    if (Number.isFinite(started)) {
      rec.timerAccumulatedMs = acc + Math.max(0, Date.now() - started)
    }
    rec.timerStartedAt = null
    rec.durationMs = null
    return rec
  })
}

/** Reset elapsed time and start a fresh run. */
export async function restartTaskTimer(classId, flightId, taskCode) {
  return mutateTaskRecord(classId, flightId, taskCode, (rec) => {
    rec.timerAccumulatedMs = 0
    rec.durationMs = null
    rec.timerStartedAt = new Date().toISOString()
    return rec
  })
}

export async function setRubricMark(classId, flightId, taskCode, criterion, level) {
  return mutateTaskRecord(classId, flightId, taskCode, (rec) => {
    const rubric = normalizeRubric(rec.rubric)
    if (!Object.prototype.hasOwnProperty.call(rubric, criterion)) return rec
    // Toggle off if the same level is clicked again; otherwise select that level for the row.
    rubric[criterion] = rubric[criterion] === level ? null : level
    rec.rubric = rubric
    return rec
  })
}

export async function clearTaskRubric(classId, flightId, taskCode) {
  return mutateTaskRecord(classId, flightId, taskCode, (rec) => {
    rec.rubric = emptyRubric()
    return rec
  })
}

export async function addTaskComment(
  classId,
  flightId,
  taskCode,
  commentText,
  kind = 'student',
  meta = {},
) {
  const text = String(commentText || '').trim()
  if (!text) throw new Error('Comment cannot be empty.')
  const field = kind === 'operational' ? 'operationalComments' : 'studentComments'
  const studentId = meta?.studentId ? String(meta.studentId) : null
  const studentName = meta?.studentName ? String(meta.studentName).trim() : ''
  return mutateTaskRecord(classId, flightId, taskCode, (rec) => {
    rec[field].push({
      id: crypto.randomUUID(),
      text,
      recordedAt: new Date().toISOString(),
      ...(kind === 'student' && studentId
        ? { studentId, studentName: studentName || null }
        : {}),
    })
    return rec
  })
}

export async function addTaskPenalty(classId, flightId, taskCode, penaltyText, seconds = null) {
  const secs =
    typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
      ? Math.floor(seconds)
      : null
  return mutateTaskRecord(classId, flightId, taskCode, (rec) => {
    rec.penalties.push({
      id: crypto.randomUUID(),
      text: String(penaltyText || '').trim(),
      recordedAt: new Date().toISOString(),
      seconds: secs,
    })
    return rec
  })
}

export async function clearTaskPenalties(classId, flightId, taskCode) {
  return mutateTaskRecord(classId, flightId, taskCode, (rec) => {
    rec.penalties = []
    return rec
  })
}

export async function clearTaskComments(classId, flightId, taskCode, kind = 'student') {
  const field = kind === 'operational' ? 'operationalComments' : 'studentComments'
  return mutateTaskRecord(classId, flightId, taskCode, (rec) => {
    rec[field] = []
    return rec
  })
}

export async function removeTaskPenalty(classId, flightId, taskCode, penaltyId) {
  return mutateTaskRecord(classId, flightId, taskCode, (rec) => {
    const id = String(penaltyId || '')
    if (id) {
      rec.penalties = rec.penalties.filter((p) => String(p.id) !== id)
    }
    return rec
  })
}

export async function removeTaskComment(classId, flightId, taskCode, commentId, kind = 'student') {
  const field = kind === 'operational' ? 'operationalComments' : 'studentComments'
  return mutateTaskRecord(classId, flightId, taskCode, (rec) => {
    const id = String(commentId || '')
    if (id) {
      rec[field] = rec[field].filter((c) => String(c.id) !== id)
    }
    return rec
  })
}

export function formatDuration(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

const STUDENTS_KEY = 'projx-flight-students-v1'

function studentsMapKey(classId, flightId) {
  return `${String(classId || '').trim().toUpperCase()}::${String(flightId || '').trim().toUpperCase()}`
}

function readStudentsStore() {
  try {
    return JSON.parse(localStorage.getItem(STUDENTS_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

function writeStudentsStore(store) {
  localStorage.setItem(STUDENTS_KEY, JSON.stringify(store))
}

export function getFlightStudents(classId, flightId) {
  const key = studentsMapKey(classId, flightId)
  if (!key.startsWith('::') && !key.endsWith('::')) {
    const list = readStudentsStore()[key]
    return Array.isArray(list)
      ? list
          .map((s) => ({
            id: String(s?.id || ''),
            name: String(s?.name || '').trim(),
          }))
          .filter((s) => s.id && s.name)
      : []
  }
  return []
}

export function setFlightStudents(classId, flightId, students) {
  const key = studentsMapKey(classId, flightId)
  if (key.startsWith('::') || key.endsWith('::')) {
    throw new Error('Class and flight are required to save student names.')
  }
  const store = readStudentsStore()
  store[key] = (Array.isArray(students) ? students : [])
    .map((s) => ({
      id: String(s?.id || crypto.randomUUID()),
      name: String(s?.name || '').trim(),
    }))
    .filter((s) => s.name)
  writeStudentsStore(store)
  return store[key]
}

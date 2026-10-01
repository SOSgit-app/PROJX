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
export const BACKUP_VERSION = 1

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

function emptyRecord(classId, flightId, taskCode) {
  return {
    path: recordPath(classId, flightId, taskCode),
    classId: String(classId || '').trim().toUpperCase(),
    flightId: String(flightId || '').trim().toUpperCase(),
    taskCode: String(taskCode || '').trim().toUpperCase(),
    result: null,
    penalties: [],
    comments: [],
    updatedAt: null,
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

/**
 * Download a restore-ready JSON backup of all progress for one class + flight.
 */
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
      comments: Array.isArray(r.comments) ? r.comments : [],
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
  const result = raw.result === 'pass' || raw.result === 'fail' ? raw.result : null
  return {
    path: recordPath(classId, flightId, taskCode),
    classId,
    flightId,
    taskCode,
    result,
    penalties: Array.isArray(raw.penalties) ? raw.penalties : [],
    comments: Array.isArray(raw.comments) ? raw.comments : [],
    updatedAt: raw.updatedAt || new Date().toISOString(),
  }
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
      resolve(all.filter((r) => String(r?.classId || '').toUpperCase() === classId))
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
  return existing || emptyRecord(classId, flightId, taskCode)
}

async function mutateTaskRecord(classId, flightId, taskCode, mutator) {
  if (!classId || !flightId || !taskCode) {
    throw new Error('Set a class profile and select a flight before saving.')
  }
  const current = await getTaskRecord(classId, flightId, taskCode)
  const next = mutator({ ...current, penalties: [...current.penalties], comments: [...current.comments] })
  next.path = recordPath(classId, flightId, taskCode)
  next.classId = String(classId).trim().toUpperCase()
  next.flightId = String(flightId).trim().toUpperCase()
  next.taskCode = String(taskCode).trim().toUpperCase()
  next.updatedAt = new Date().toISOString()
  await idbPut(next)
  return next
}

export async function setTaskGrade(classId, flightId, taskCode, result) {
  return mutateTaskRecord(classId, flightId, taskCode, (rec) => {
    rec.result = result
    return rec
  })
}

export async function addTaskPenalty(classId, flightId, taskCode, penaltyText) {
  return mutateTaskRecord(classId, flightId, taskCode, (rec) => {
    rec.penalties.push({
      id: crypto.randomUUID(),
      text: String(penaltyText || '').trim(),
      recordedAt: new Date().toISOString(),
    })
    return rec
  })
}

export async function addTaskComment(classId, flightId, taskCode, commentText) {
  const text = String(commentText || '').trim()
  if (!text) throw new Error('Comment cannot be empty.')
  return mutateTaskRecord(classId, flightId, taskCode, (rec) => {
    rec.comments.push({
      id: crypto.randomUUID(),
      text,
      recordedAt: new Date().toISOString(),
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

export async function clearTaskComments(classId, flightId, taskCode) {
  return mutateTaskRecord(classId, flightId, taskCode, (rec) => {
    rec.comments = []
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

export async function removeTaskComment(classId, flightId, taskCode, commentId) {
  return mutateTaskRecord(classId, flightId, taskCode, (rec) => {
    const id = String(commentId || '')
    if (id) {
      rec.comments = rec.comments.filter((c) => String(c.id) !== id)
    }
    return rec
  })
}

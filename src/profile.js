/**
 * Class profile storage.
 * Logical path: {classId}/{flightId}/{taskCode}/
 * Files: result.json, penalties.json, comments.json
 *
 * Primary: IndexedDB (works everywhere)
 * Optional: File System Access API writes a real folder tree on disk
 */

const META_KEY = 'projx-profile-meta-v1'
const DB_NAME = 'projx-profiles'
const DB_STORE = 'records'
const HANDLE_STORE = 'handles'

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

export function getFolderLinked() {
  return Boolean(loadMeta().folderLinked)
}

function setFolderLinked(linked) {
  const meta = loadMeta()
  meta.folderLinked = Boolean(linked)
  saveMeta(meta)
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'path' })
      }
      if (!db.objectStoreNames.contains(HANDLE_STORE)) {
        db.createObjectStore(HANDLE_STORE, { keyPath: 'id' })
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

async function saveHandle(handle) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readwrite')
    tx.objectStore(HANDLE_STORE).put({ id: 'profiles-root', handle })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function loadHandle() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readonly')
    const req = tx.objectStore(HANDLE_STORE).get('profiles-root')
    req.onsuccess = () => resolve(req.result?.handle || null)
    req.onerror = () => reject(req.error)
  })
}

export function canUseFolderApi() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

export async function linkProfilesFolder() {
  if (!canUseFolderApi()) {
    throw new Error('Folder linking needs Chrome/Edge on desktop.')
  }
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
  await saveHandle(handle)
  setFolderLinked(true)
  return handle
}

async function getWritableRoot() {
  const handle = await loadHandle()
  if (!handle) return null
  if (handle.queryPermission) {
    const permission = await handle.queryPermission({ mode: 'readwrite' })
    if (permission === 'granted') return handle
    if (handle.requestPermission) {
      const next = await handle.requestPermission({ mode: 'readwrite' })
      if (next === 'granted') return handle
    }
  }
  return null
}

async function ensureDir(root, parts) {
  let dir = root
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create: true })
  }
  return dir
}

async function writeJsonFile(dir, name, data) {
  const file = await dir.getFileHandle(name, { create: true })
  const writable = await file.createWritable()
  await writable.write(`${JSON.stringify(data, null, 2)}\n`)
  await writable.close()
}

async function syncRecordToFolder(record) {
  const root = await getWritableRoot()
  if (!root) return false
  const dir = await ensureDir(root, [record.classId, record.flightId, record.taskCode])
  await writeJsonFile(dir, 'result.json', {
    result: record.result,
    updatedAt: record.updatedAt,
  })
  await writeJsonFile(dir, 'penalties.json', {
    penalties: record.penalties,
    updatedAt: record.updatedAt,
  })
  await writeJsonFile(dir, 'comments.json', {
    comments: record.comments,
    updatedAt: record.updatedAt,
  })
  await writeJsonFile(dir, 'record.json', record)
  return true
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
  try {
    await syncRecordToFolder(next)
  } catch (err) {
    console.warn('Folder sync failed', err)
  }
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

export function profileFolderHint(classId, flightId, taskCode) {
  const cls = classId || '{class}'
  const flt = flightId || '{flight}'
  const task = taskCode || '{task}'
  return `${cls}/${flt}/${task}/`
}

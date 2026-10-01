/**
 * Class profile storage.
 * Logical path: {classId}/{flightId}/{taskCode}/
 * Disk files: result.txt, penalties.txt, comments.txt, record.txt
 *
 * Primary: IndexedDB (persists across the session / browser restarts on this device)
 * Optional: File System Access API writes a real folder tree on disk
 * Backup: Finalize downloads a JSON backup; Restore reloads it from the menu
 */

const META_KEY = 'projx-profile-meta-v1'
const DB_NAME = 'projx-profiles'
const DB_STORE = 'records'
const HANDLE_STORE = 'handles'
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

async function idbDelete(path) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).delete(path)
    tx.oncomplete = () => resolve()
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
  const meta = loadMeta()
  meta.rootFolderName = handle.name || 'Profiles'
  saveMeta(meta)
  return handle
}

export function getLinkedFolderName() {
  return String(loadMeta().rootFolderName || '').trim()
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

/**
 * Ensure the class folder exists under the linked profiles root,
 * then return an in-app browse summary.
 * Note: websites cannot open Windows File Explorer / Finder.
 */
export async function openClassFolder(classId, flightId = '') {
  if (!canUseFolderApi()) {
    throw new Error('Browsing folders needs Chrome/Edge on desktop.')
  }
  const root = await getWritableRoot()
  if (!root) {
    throw new Error('Link a profile folder first from the menu.')
  }
  const cls = String(classId || '').trim().toUpperCase()
  if (!cls) {
    throw new Error('Set a class profile first.')
  }

  const parts = [cls]
  const flight = String(flightId || '').trim().toUpperCase()
  if (flight) parts.push(flight)

  await ensureDir(root, parts)

  const flights = []
  const classDir = await ensureDir(root, [cls])
  for await (const [name, handle] of classDir.entries()) {
    if (handle.kind !== 'directory') continue
    const tasks = []
    for await (const [taskName, taskHandle] of handle.entries()) {
      if (taskHandle.kind === 'directory') tasks.push(taskName)
    }
    tasks.sort()
    flights.push({ id: name, tasks })
  }
  flights.sort((a, b) => a.id.localeCompare(b.id))

  return {
    rootName: root.name || getLinkedFolderName() || 'Profiles',
    classId: cls,
    flightId: flight || null,
    pathLabel: `${root.name || getLinkedFolderName() || 'Profiles'}/${parts.join('/')}`,
    flights,
  }
}

/**
 * Build a ZIP of the class folder from IndexedDB records (works even without a linked folder).
 * Triggers a browser download so the user can open it in their OS.
 */
export async function downloadClassFolderZip(classId) {
  const cls = String(classId || '').trim().toUpperCase()
  if (!cls) throw new Error('Set a class profile first.')

  const records = await listRecordsForClass(cls)
  const files = []

  for (const record of records) {
    const base = `${record.classId}/${record.flightId}/${record.taskCode}`
    files.push({
      path: `${base}/result.txt`,
      data: textBytes(formatResultTxt(record)),
    })
    files.push({
      path: `${base}/penalties.txt`,
      data: textBytes(formatPenaltiesTxt(record)),
    })
    files.push({
      path: `${base}/comments.txt`,
      data: textBytes(formatCommentsTxt(record)),
    })
    files.push({
      path: `${base}/record.txt`,
      data: textBytes(formatRecordTxt(record)),
    })
  }

  if (!files.length) {
    files.push({
      path: `${cls}/README.txt`,
      data: textBytes(
        `No graded tasks yet for class ${cls}.\nGrade a task to create profile files.\n`,
      ),
    })
  }

  const zipBytes = buildZipStore(files)
  triggerDownload(zipBytes, `PROJX-${cls}.zip`, 'application/zip')
  return { classId: cls, fileCount: files.length }
}

/**
 * Download a restore-ready JSON backup of all progress for one class + flight.
 * Call this from Finalize after finishing a task.
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

/**
 * Restore a Finalize / backup JSON file into IndexedDB (and linked folder if available).
 * Replaces all stored tasks for that class + flight with the backup contents.
 */
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
    try {
      await syncRecordToFolder(record)
    } catch (err) {
      console.warn('Folder sync failed during restore', err)
    }
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

/** Minimal ZIP (store / no compression) for small JSON exports. */
function buildZipStore(files) {
  const localParts = []
  const centralParts = []
  let offset = 0

  for (const file of files) {
    const nameBytes = textBytes(file.path.replaceAll('\\', '/'))
    const data = file.data
    const crc = crc32(data)
    const size = data.length

    const local = new Uint8Array(30 + nameBytes.length + size)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0, true)
    lv.setUint16(8, 0, true)
    lv.setUint16(10, 0, true)
    lv.setUint16(12, 0, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true)
    lv.setUint32(22, size, true)
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true)
    local.set(nameBytes, 30)
    local.set(data, 30 + nameBytes.length)
    localParts.push(local)

    const central = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, 0, true)
    cv.setUint16(14, 0, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint16(30, 0, true)
    cv.setUint16(32, 0, true)
    cv.setUint16(34, 0, true)
    cv.setUint16(36, 0, true)
    cv.setUint32(38, 0, true)
    cv.setUint32(42, offset, true)
    central.set(nameBytes, 46)
    centralParts.push(central)

    offset += local.length
  }

  const centralSize = centralParts.reduce((n, p) => n + p.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(4, 0, true)
  ev.setUint16(6, 0, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  ev.setUint16(20, 0, true)

  const total =
    localParts.reduce((n, p) => n + p.length, 0) + centralSize + end.length
  const out = new Uint8Array(total)
  let pos = 0
  for (const p of localParts) {
    out.set(p, pos)
    pos += p.length
  }
  for (const p of centralParts) {
    out.set(p, pos)
    pos += p.length
  }
  out.set(end, pos)
  return out
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c >>> 0
  }
  return table
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

async function ensureDir(root, parts) {
  let dir = root
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create: true })
  }
  return dir
}

async function writeTextFile(dir, name, contents) {
  const file = await dir.getFileHandle(name, { create: true })
  const writable = await file.createWritable()
  await writable.write(String(contents || ''))
  await writable.close()
}

function resultLabel(result) {
  if (result === 'pass') return 'Pass'
  if (result === 'fail') return 'Fail'
  return 'Not graded'
}

function formatStamp(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return String(iso)
  }
}

function formatResultTxt(record) {
  return [
    `Task: ${record.taskCode}`,
    `Class: ${record.classId}`,
    `Flight: ${record.flightId}`,
    `Result: ${resultLabel(record.result)}`,
    `Updated: ${formatStamp(record.updatedAt) || '—'}`,
    '',
  ].join('\n')
}

function formatPenaltiesTxt(record) {
  const penalties = Array.isArray(record.penalties) ? record.penalties : []
  const lines = [
    `Task: ${record.taskCode}`,
    `Class: ${record.classId}`,
    `Flight: ${record.flightId}`,
    `Penalties: ${penalties.length}`,
    `Updated: ${formatStamp(record.updatedAt) || '—'}`,
    '',
  ]
  if (!penalties.length) {
    lines.push('No penalties recorded.', '')
    return lines.join('\n')
  }
  penalties.forEach((p, i) => {
    lines.push(`${i + 1}. ${p.text || ''}`)
    lines.push(`   Recorded: ${formatStamp(p.recordedAt) || '—'}`)
    lines.push('')
  })
  return lines.join('\n')
}

function formatCommentsTxt(record) {
  const comments = Array.isArray(record.comments) ? record.comments : []
  const lines = [
    `Task: ${record.taskCode}`,
    `Class: ${record.classId}`,
    `Flight: ${record.flightId}`,
    `Comments: ${comments.length}`,
    `Updated: ${formatStamp(record.updatedAt) || '—'}`,
    '',
  ]
  if (!comments.length) {
    lines.push('No comments recorded.', '')
    return lines.join('\n')
  }
  comments.forEach((c, i) => {
    lines.push(`${i + 1}. ${c.text || ''}`)
    lines.push(`   Recorded: ${formatStamp(c.recordedAt) || '—'}`)
    lines.push('')
  })
  return lines.join('\n')
}

function formatRecordTxt(record) {
  return [
    'PROJX Task Record',
    '=================',
    '',
    formatResultTxt(record).trimEnd(),
    '',
    '--- Penalties ---',
    formatPenaltiesTxt(record).split('\n').slice(5).join('\n').trimEnd(),
    '',
    '--- Comments ---',
    formatCommentsTxt(record).split('\n').slice(5).join('\n').trimEnd(),
    '',
  ].join('\n')
}

async function syncRecordToFolder(record) {
  const root = await getWritableRoot()
  if (!root) return false
  const dir = await ensureDir(root, [record.classId, record.flightId, record.taskCode])
  await writeTextFile(dir, 'result.txt', formatResultTxt(record))
  await writeTextFile(dir, 'penalties.txt', formatPenaltiesTxt(record))
  await writeTextFile(dir, 'comments.txt', formatCommentsTxt(record))
  await writeTextFile(dir, 'record.txt', formatRecordTxt(record))
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

export function profileFolderHint(classId, flightId, taskCode) {
  const cls = classId || '{class}'
  const flt = flightId || '{flight}'
  const task = taskCode || '{task}'
  return `${cls}/${flt}/${task}/`
}

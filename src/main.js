import './style.css'
import { parseProjectXWorkbook } from './parser.js'
import {
  SQUADRONS,
  flightsForSquadron,
  squadronForFlightId,
} from './squadrons.js'
import { findNotetaker, normalizeTaskCode, notetakersForVersion } from './notetakers.js'
import { penaltiesForTask } from './penalties.js'
import { downloadFlightReport } from './report.js'
import {
  RUBRIC_CRITERIA,
  RUBRIC_LEVELS,
  normalizeRubric,
  rubricHasMarks,
  rubricLevelLabel,
} from './rubric.js'
import {
  addTaskComment,
  addTaskPenalty,
  clearTaskComments,
  clearTaskPenalties,
  clearTaskRubric,
  downloadFlightBackup,
  buildFlightBackup,
  formatDuration,
  getClassId,
  getTaskElapsedMs,
  getTaskRecord,
  normalizeResult,
  pauseTaskTimer,
  removeTaskComment,
  removeTaskPenalty,
  restartTaskTimer,
  restoreFlightBackupFromFile,
  setClassId,
  setRubricMark,
  setTaskGrade,
  startTaskTimer,
} from './profile.js'

const AUTH_KEY = 'projx-auth-v1'
const THEME_KEY = 'projx-theme-v1'
const SESSION_KEY = 'projx-last-session-v1'
const APP_PASSWORD = 'redpants1950'

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    /* ignore */
  }
  return 'dark'
}

function applyTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark'
  document.documentElement.setAttribute('data-theme', next)
  try {
    localStorage.setItem(THEME_KEY, next)
  } catch {
    /* ignore */
  }
  return next
}

function getTheme() {
  const attr = document.documentElement.getAttribute('data-theme')
  return attr === 'light' ? 'light' : 'dark'
}

function toggleTheme() {
  const next = getTheme() === 'light' ? 'dark' : 'light'
  applyTheme(next)
  return next
}

applyTheme(readStoredTheme())

function saveLastSession() {
  if (!state.workbook?.flights?.length || !state.flightId || !state.classId) return
  try {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        classId: state.classId,
        fileName: state.fileName || '',
        squadronId: state.squadronId,
        flightId: state.flightId,
        workbook: state.workbook,
        savedAt: new Date().toISOString(),
      }),
    )
  } catch {
    /* ignore quota / private mode */
  }
}

function readLastSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data?.classId || !data?.flightId || !Array.isArray(data?.workbook?.flights)) {
      return null
    }
    const flightOk = data.workbook.flights.some(
      (f) => String(f?.id || '').toUpperCase() === String(data.flightId).toUpperCase(),
    )
    return flightOk ? data : null
  } catch {
    return null
  }
}

function clearLastSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}

async function resumeLastSchedule() {
  const session = readLastSession()
  if (!session) {
    setState({
      statusMessage: 'No saved schedule found. Upload the matrix again.',
      error: '',
    })
    return
  }
  try {
    setClassId(session.classId)
    state.classId = session.classId
    state.workbook = session.workbook
    state.fileName = session.fileName || session.workbook.fileLabel || ''
    state.squadronId = session.squadronId || null
    state.flightId = session.flightId
    state.activeTask = null
    state.taskRecord = null
    state.menuOpen = false
    state.resourceVersion = null
    state.resourceCode = null
    state.returnStep = 'schedule'
    state.error = ''
    state.step = 'schedule'
    state.statusMessage = `Resumed class ${session.classId} · flight ${session.flightId}`
    await preloadFlightRecords()
    saveLastSession()
    render()
  } catch (err) {
    setState({
      error: err.message || 'Could not resume the last schedule. Upload the matrix again.',
      step: 'upload',
    })
  }
}

function isUnlocked() {
  try {
    return sessionStorage.getItem(AUTH_KEY) === '1'
  } catch {
    return false
  }
}

function unlockSession() {
  try {
    sessionStorage.setItem(AUTH_KEY, '1')
  } catch {
    /* ignore */
  }
}

const APP_STEPS = new Set([
  'upload',
  'class-profile',
  'squadron',
  'flight',
  'schedule',
  'task',
  'resources-list',
  'resources-view',
])

const state = {
  unlocked: isUnlocked(),
  authError: '',
  step: 'upload',
  workbook: null,
  fileName: '',
  squadronId: null,
  flightId: null,
  activeTask: null,
  menuOpen: false,
  resourceVersion: null,
  resourceCode: null,
  returnStep: 'upload',
  classId: getClassId(),
  taskRecord: null,
  recordCache: {},
  statusMessage: '',
  error: '',
}

const app = document.querySelector('#app')

function asset(path) {
  const base = import.meta.env.BASE_URL || '/'
  return `${base}${path.replace(/^\//, '')}`
}

function setState(patch) {
  Object.assign(state, patch)
  render()
}

function selectedSquadron() {
  return SQUADRONS.find((s) => s.id === state.squadronId) || null
}

function selectedFlight() {
  if (!state.workbook) return null
  return state.workbook.flights.find((f) => f.id === state.flightId) || null
}

function activeTaskRecord() {
  const flight = selectedFlight()
  if (!flight || !state.activeTask) return null
  const list = flight[state.activeTask.phase]
  const task = list?.[state.activeTask.index]
  if (!task) return null
  return {
    ...task,
    phase: state.activeTask.phase,
    index: state.activeTask.index,
    phaseLabel: state.activeTask.phase === 'phase1' ? 'Phase I' : 'Phase II',
    dayLabel: state.activeTask.phase === 'phase1' ? 'Day 1' : 'Day 2',
  }
}

function cacheKey(taskCode) {
  return `${state.classId || ''}::${state.flightId || ''}::${taskCode}`.toUpperCase()
}

function cachedResult(taskCode) {
  return normalizeResult(state.recordCache[cacheKey(taskCode)]?.result || null)
}

function resultLabel(result) {
  const normalized = normalizeResult(result)
  if (normalized === 'complete') return 'Complete'
  if (normalized === 'incomplete') return 'Incomplete'
  return 'Not graded'
}

function isResourceStep(step = state.step) {
  return step === 'resources-list' || step === 'resources-view'
}

function rememberReturnStep() {
  if (!isResourceStep(state.step) && APP_STEPS.has(state.step)) {
    return state.step
  }
  return state.returnStep || 'upload'
}

function openResources(version) {
  setState({
    returnStep: rememberReturnStep(),
    step: 'resources-list',
    resourceVersion: version,
    resourceCode: null,
    menuOpen: false,
  })
}

function closeResources() {
  const back =
    state.returnStep && !isResourceStep(state.returnStep)
      ? state.returnStep
      : state.activeTask
        ? 'task'
        : state.flightId
          ? 'schedule'
          : 'upload'
  setState({
    step: back,
    resourceVersion: null,
    resourceCode: null,
    menuOpen: false,
  })
  if (back === 'task' || back === 'schedule') {
    void bootstrapStepData()
  }
}

function resourcesBackLabel() {
  if (state.returnStep === 'task' || state.activeTask) return 'Back to scoring'
  if (state.returnStep === 'schedule' || state.flightId) return 'Back to schedule'
  return 'Back'
}

function canGoBack(step = state.step) {
  if (step === 'upload' || step === 'lock') return false
  return true
}

async function goBack() {
  const step = state.step
  state.menuOpen = false

  if (step === 'resources-view') {
    setState({ step: 'resources-list', resourceCode: null, menuOpen: false })
    return
  }
  if (step === 'resources-list') {
    closeResources()
    return
  }
  if (step === 'task') {
    state.activeTask = null
    state.taskRecord = null
    state.step = 'schedule'
    await preloadFlightRecords()
    render()
    return
  }
  if (step === 'schedule') {
    setState({
      step: 'flight',
      flightId: null,
      activeTask: null,
      menuOpen: false,
      taskRecord: null,
    })
    return
  }
  if (step === 'flight') {
    setState({
      step: 'squadron',
      squadronId: null,
      flightId: null,
      activeTask: null,
      menuOpen: false,
      taskRecord: null,
    })
    return
  }
  if (step === 'squadron') {
    setState({
      step: 'class-profile',
      squadronId: null,
      flightId: null,
      activeTask: null,
      menuOpen: false,
    })
    return
  }
  if (step === 'class-profile') {
    setState({
      step: 'upload',
      squadronId: null,
      flightId: null,
      activeTask: null,
      menuOpen: false,
      error: '',
    })
  }
}

function resetToUpload() {
  setState({
    step: 'upload',
    workbook: null,
    fileName: '',
    squadronId: null,
    flightId: null,
    activeTask: null,
    menuOpen: false,
    resourceVersion: null,
    resourceCode: null,
    returnStep: 'upload',
    taskRecord: null,
    recordCache: {},
    statusMessage: '',
    error: '',
  })
}

function requireClassId() {
  let classId = state.classId || getClassId()
  if (!classId) {
    const entered = window.prompt(
      'Enter the class name (example: 26G):',
      '26G',
    )
    if (!entered || !entered.trim()) return null
    classId = setClassId(entered.trim())
    state.classId = classId
  }
  return classId
}

async function refreshTaskRecord() {
  const task = activeTaskRecord()
  if (!task || !state.flightId) {
    state.taskRecord = null
    return
  }
  const classId = state.classId || getClassId()
  if (!classId) {
    state.taskRecord = null
    return
  }
  const record = await getTaskRecord(classId, state.flightId, task.task)
  state.taskRecord = record
  state.recordCache[cacheKey(task.task)] = record
}

async function preloadFlightRecords() {
  const flight = selectedFlight()
  const classId = state.classId || getClassId()
  if (!flight || !classId) return
  const tasks = [...(flight.phase1 || []), ...(flight.phase2 || [])]
  const cache = { ...state.recordCache }
  await Promise.all(
    tasks.map(async (t) => {
      const record = await getTaskRecord(classId, flight.id, t.task)
      cache[cacheKey(t.task)] = record
    }),
  )
  state.recordCache = cache
}

async function handleFile(file) {
  if (!file) return
  const okType =
    /\.xlsx?$/i.test(file.name) ||
    file.type.includes('sheet') ||
    file.type.includes('excel')

  if (!okType) {
    setState({ error: 'Please upload an Excel workbook (.xlsx).' })
    return
  }

  try {
    const buffer = await file.arrayBuffer()
    const workbook = parseProjectXWorkbook(buffer)
    workbook.fileLabel = file.name
    const classReady = Boolean(state.classId || getClassId())
    setState({
      workbook,
      fileName: file.name,
      error: '',
      step: classReady ? 'squadron' : 'class-profile',
      squadronId: null,
      flightId: null,
      activeTask: null,
      menuOpen: false,
      resourceVersion: null,
      resourceCode: null,
      returnStep: classReady ? 'squadron' : 'class-profile',
      classId: getClassId() || state.classId,
      taskRecord: null,
      recordCache: {},
      statusMessage: '',
    })
  } catch (err) {
    console.error(err)
    setState({
      error: err.message || 'Could not read that workbook.',
      workbook: null,
      step: 'upload',
      activeTask: null,
      menuOpen: false,
    })
  }
}

function bindUpload(root) {
  const zone = root.querySelector('#upload-zone')
  const input = root.querySelector('#file-input')
  if (!zone || !input) return

  const openPicker = () => input.click()
  zone.addEventListener('click', openPicker)
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openPicker()
    }
  })

  input.addEventListener('change', () => {
    const file = input.files?.[0]
    handleFile(file)
  })

  ;['dragenter', 'dragover'].forEach((evt) => {
    zone.addEventListener(evt, (e) => {
      e.preventDefault()
      zone.classList.add('dragover')
    })
  })
  ;['dragleave', 'drop'].forEach((evt) => {
    zone.addEventListener(evt, (e) => {
      e.preventDefault()
      zone.classList.remove('dragover')
    })
  })

  zone.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files?.[0]
    handleFile(file)
  })
}

function topBar(extraActions = '') {
  const classChip = state.classId
    ? `<span class="file-chip" title="Class profile">${escapeHtml(state.classId)}</span>`
    : ''
  const backBtn = canGoBack()
    ? `<button type="button" class="btn btn-back" data-action="go-back" aria-label="Go back to previous screen">Back</button>`
    : ''
  return `
    <header class="topbar">
      <div class="brand-mark">
        <span class="eyebrow">Squadron Officer School</span>
  </div>
      <div class="nav-actions">${backBtn}${classChip}${extraActions}</div>
    </header>
  `
}

function renderSideMenu() {
  const open = state.menuOpen
  const theme = getTheme()
  const themeLabel = theme === 'light' ? 'Dark mode' : 'Light mode'
  const themeMeta =
    theme === 'light' ? 'Switch to the dark Air Force look' : 'Switch to a brighter daylight look'
  return `
    <button
      type="button"
      class="menu-toggle${open ? ' is-open' : ''}"
      data-action="toggle-menu"
      aria-expanded="${open ? 'true' : 'false'}"
      aria-controls="side-menu"
      aria-label="Open menu"
    >
      <span></span><span></span><span></span>
    </button>
    <div class="menu-backdrop${open ? ' is-open' : ''}" data-action="close-menu" ${open ? '' : 'hidden'}></div>
    <aside id="side-menu" class="side-menu${open ? ' is-open' : ''}" aria-hidden="${open ? 'false' : 'true'}">
      <div class="side-menu-head">
        <div class="side-menu-title-block">
          <p class="side-menu-kicker">Instructor tools</p>
          <h2>Menu</h2>
        </div>
        <button type="button" class="side-menu-close-btn" data-action="close-menu">Close</button>
      </div>
      <nav class="side-menu-nav" aria-label="Resources">
        <p class="side-menu-section">Appearance</p>
        <button type="button" class="side-menu-link" data-action="toggle-theme" aria-pressed="${theme === 'light' ? 'true' : 'false'}">
          <span class="side-menu-link-title">${escapeHtml(themeLabel)}</span>
          <span class="side-menu-link-meta">${escapeHtml(themeMeta)}</span>
        </button>
        <p class="side-menu-section">Class profile</p>
        <button type="button" class="side-menu-link" data-action="set-class">
          <span class="side-menu-link-title">${state.classId ? escapeHtml(state.classId) : 'Set class'}</span>
          <span class="side-menu-link-meta">Class name like 26G</span>
        </button>
        <p class="side-menu-note">Progress auto-saves in this browser. Use Finalize and Flight Report to download backups.</p>
        <button type="button" class="side-menu-link" data-action="restore-backup">
          <span class="side-menu-link-title">Restore backup</span>
          <span class="side-menu-link-meta">Reload a Finalize .json if data is lost</span>
        </button>
        <input id="restore-backup-input" class="sr-only" type="file" accept="application/json,.json" tabindex="-1" />
        <p class="side-menu-section">TASK Resources</p>
        <button type="button" class="side-menu-link" data-resource-version="A">
          <span class="side-menu-link-title">Version A</span>
          <span class="side-menu-link-meta">Tasks 1A–22A</span>
        </button>
        <button type="button" class="side-menu-link" data-resource-version="B">
          <span class="side-menu-link-title">Version B</span>
          <span class="side-menu-link-meta">Tasks 1B–22B</span>
        </button>
      </nav>
    </aside>
  `
}

function renderLock() {
  return `
    <div class="shell lock-shell">
      <section class="lock-panel">
        <span class="eyebrow" style="color:var(--af-gold);font-family:var(--font-display);letter-spacing:.22em;text-transform:uppercase;font-size:.8rem;font-weight:600">Squadron Officer School</span>
        <h1>Project X</h1>
        <p class="lede">Instructor access required</p>
        <form id="lock-form" class="lock-form" autocomplete="current-password">
          <label class="lock-label" for="app-password">Password</label>
          <input
            id="app-password"
            name="password"
            type="password"
            class="lock-input"
            placeholder="Enter password"
            required
            autofocus
          />
          ${state.authError ? `<p class="error" role="alert">${escapeHtml(state.authError)}</p>` : ''}
          <button type="submit" class="btn btn-primary lock-submit">Unlock</button>
        </form>
      </section>
    </div>
  `
}

function renderUpload() {
  const currentClass = state.classId || getClassId()
  const classReady = Boolean(currentClass)
  const lastSession = readLastSession()
  const resumeLabel = lastSession
    ? `Return to last schedule · ${lastSession.classId} / ${lastSession.flightId}`
    : ''
  return `
    <div class="shell">
      ${topBar()}
      <section class="hero">
        <div class="hero-copy">
          <span class="eyebrow" style="color:var(--af-gold);font-family:var(--font-display);letter-spacing:.22em;text-transform:uppercase;font-size:.8rem;font-weight:600">United States Air Force</span>
          <h1>Project X</h1>
          <p class="lede">${
            classReady
              ? `Class <strong>${escapeHtml(currentClass)}</strong> is ready. Upload the SOS flight matrix, then select squadron and flight.`
              : 'Start a new class session, upload the SOS flight matrix, then select the flight you will instruct.'
          }</p>
          <div class="hero-meta">
            <span>Phase I · Day 1</span>
            <span>Phase II · Day 2</span>
            <span>Instructor View</span>
          </div>
          ${
            lastSession
              ? `<div class="hero-actions">
            <button type="button" class="btn btn-primary hero-start-btn" data-action="resume-last-schedule">
              ${escapeHtml(resumeLabel)}
            </button>
          </div>`
              : ''
          }
          ${
            classReady
              ? ''
              : `<div class="hero-actions">
            <button type="button" class="btn ${lastSession ? '' : 'btn-primary'} hero-start-btn" data-action="start-new-class">
              Start new class
            </button>
          </div>`
          }
        </div>
        <div class="upload-panel">
          <h2 class="upload-panel-title">${classReady ? 'Upload Data Entry Matrix' : 'Or upload matrix first'}</h2>
          <div
            class="upload-zone"
            id="upload-zone"
            role="button"
            tabindex="0"
            aria-label="Upload Project X Excel workbook"
          >
            <h2>${classReady ? `Upload for ${escapeHtml(currentClass)}` : 'Upload Data Entry Matrix'}</h2>
            <p class="upload-hint-desktop">Drop the SOS .xlsx here, or tap to browse</p>
            <p class="upload-hint-mobile">Tap to choose the SOS .xlsx from your device</p>
            <input id="file-input" type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" />
          </div>
          ${
            classReady
              ? `<button type="button" class="btn hero-restart-btn" data-action="start-new-class">Start a different class</button>`
              : ''
          }
          ${state.statusMessage && state.step === 'upload' ? `<p class="status-message">${escapeHtml(state.statusMessage)}</p>` : ''}
          ${state.error ? `<p class="error" role="alert">${escapeHtml(state.error)}</p>` : ''}
        </div>
      </section>
      <p class="footer-note">${
        lastSession
          ? 'Refresh-safe: use Return to last schedule to pick up where you left off, or upload a matrix for a new session.'
          : classReady
            ? 'Next: choose squadron, then the flight for this class session'
            : 'Recommended: Start new class → name the class → upload matrix → pick squadron and flight'
      }</p>
    </div>
  `
}

function renderClassProfile() {
  const hasWorkbook = Boolean(state.workbook)
  const actions = hasWorkbook
    ? `<span class="file-chip" title="${escapeHtml(state.fileName)}">${escapeHtml(state.fileName)}</span>`
    : ''
  const suggested = state.classId || ''

  return `
    <div class="shell">
      ${topBar(actions)}
      <div class="section-head">
        <span class="eyebrow" style="color:var(--af-gold);font-family:var(--font-display);letter-spacing:.22em;text-transform:uppercase;font-size:.8rem;font-weight:600">New class session · Step 1</span>
        <h1>Identify class</h1>
        <p>Enter the class name, then upload the matrix and pick your flight. Progress auto-saves in this browser — use Finalize and Flight Report to download backups.</p>
      </div>
      <form id="class-profile-form" class="class-profile-panel" autocomplete="off">
        <label class="lock-label" for="class-id-input">Class name</label>
        <input
          id="class-id-input"
          name="classId"
          type="text"
          class="lock-input"
          value="${escapeHtml(suggested)}"
          placeholder="26G"
          required
          maxlength="32"
          autofocus
        />
        <p class="class-profile-hint">Saves under class <strong>${escapeHtml(suggested || '26G')}</strong> for this flight’s tasks.</p>

        ${state.statusMessage && state.step === 'class-profile' ? `<p class="status-message class-profile-status">${escapeHtml(state.statusMessage)}</p>` : ''}
        ${state.error ? `<p class="error" role="alert">${escapeHtml(state.error)}</p>` : ''}
        <button type="submit" class="btn btn-primary lock-submit">
          ${hasWorkbook ? 'Continue to squadrons' : 'Continue to upload'}
        </button>
      </form>
    </div>
  `
}

function renderSquadron() {
  const flights = state.workbook?.flights || []
  const actions = `
    <span class="file-chip" title="${escapeHtml(state.fileName)}">${escapeHtml(state.fileName)}</span>
    <button type="button" class="btn" data-action="reset">New upload</button>
  `

  const cards = SQUADRONS.map((sq) => {
    const count = flightsForSquadron(flights, sq.id).length
    const disabled = count === 0
    return `
      <button
        type="button"
        class="squadron-option${disabled ? ' disabled' : ''}"
        data-squadron="${sq.id}"
        ${disabled ? 'disabled' : ''}
        style="--accent:${sq.accent}"
      >
        <img src="${asset(sq.logo)}" alt="${escapeHtml(sq.name)} squadron logo" />
        <p class="name">${escapeHtml(sq.name)}</p>
        <p class="unit">${escapeHtml(sq.unit)}</p>
        <p class="count">${count ? `${count} flight${count === 1 ? '' : 's'} in file` : 'None in this file'}</p>
      </button>
    `
  }).join('')

  return `
    <div class="shell">
      ${topBar(actions)}
      <div class="section-head">
        <span class="eyebrow" style="color:var(--af-gold);font-family:var(--font-display);letter-spacing:.22em;text-transform:uppercase;font-size:.8rem;font-weight:600">Class ${escapeHtml(state.classId || '')} · Step 3</span>
        <h1>Select your squadron</h1>
        <p>Choose the student squadron you are instructing. Next you’ll pick the flight for this class session.</p>
      </div>
      <div class="squadron-grid">${cards}</div>
    </div>
  `
}

function renderFlight() {
  const sq = selectedSquadron()
  const flights = flightsForSquadron(state.workbook?.flights || [], state.squadronId)
  const actions = `
    <button type="button" class="btn" data-action="reset">New upload</button>
  `

  const options = flights
    .map(
      (f, i) => `
      <button type="button" class="flight-option" data-flight="${f.id}" style="animation-delay:${i * 30}ms">
        ${escapeHtml(f.displayId)}
      </button>
    `,
    )
    .join('')

  return `
    <div class="shell">
      ${topBar(actions)}
      <div class="section-head">
        <span class="eyebrow" style="color:var(--af-gold);font-family:var(--font-display);letter-spacing:.22em;text-transform:uppercase;font-size:.8rem;font-weight:600">${escapeHtml(sq?.unit || '')}</span>
        <h1>${escapeHtml(sq?.name || '')} flights</h1>
        <p>Select the flight for class <strong>${escapeHtml(state.classId || '{class}')}</strong>. Task data saves under ${escapeHtml(state.classId || '{class}')} / flight / task.</p>
      </div>
      <div class="flight-grid">${options || '<p class="empty-phase">No flights for this squadron in the uploaded file.</p>'}</div>
    </div>
  `
}

function renderTaskRail(tasks, phase) {
  if (!tasks?.length) {
    return `<p class="empty-phase">No tasks listed for this phase.</p>`
  }
  return `
    <div class="task-rail">
      ${tasks
        .map((t, index) => {
          const result = cachedResult(t.task)
          const statusClass = result ? ` is-${result}` : ''
          const note = findNotetaker(t.task)
          const code = normalizeTaskCode(t.task) || t.task
          const label = note?.title ? `${code}: ${note.title}` : code
          return `
        <button
          type="button"
          class="task-slot${statusClass}"
          data-open-task="${phase}:${index}"
          title="${escapeHtml(label)}"
          aria-label="Open task ${escapeHtml(label)}, order ${t.order ?? 'unspecified'}${result ? `, ${result}` : ''}"
        >
          <span class="order">Order ${t.order ?? '—'}</span>
          <span class="code">${escapeHtml(code)}</span>
          <span class="status-badge">${escapeHtml(resultLabel(result))}</span>
        </button>
      `
        })
        .join('')}
    </div>
  `
}

function phaseProgress(tasks) {
  if (!tasks?.length) return ''
  let complete = 0
  let incomplete = 0
  for (const t of tasks) {
    const r = cachedResult(t.task)
    if (r === 'complete') complete += 1
    if (r === 'incomplete') incomplete += 1
  }
  const graded = complete + incomplete
  return `<span class="phase-progress">${graded}/${tasks.length} graded · ${complete} complete · ${incomplete} incomplete</span>`
}

function renderSchedule() {
  const sq = selectedSquadron() || squadronForFlightId(state.flightId)
  const flight = selectedFlight()
  const actions = `
    <button type="button" class="btn" data-action="reset">New upload</button>
  `

  return `
    <div class="shell">
      ${topBar(actions)}
      <div class="schedule-hero">
        <img src="${asset(sq.logo)}" alt="${escapeHtml(sq.name)} logo" />
  <div>
          <span class="eyebrow" style="color:var(--af-gold);font-family:var(--font-display);letter-spacing:.22em;text-transform:uppercase;font-size:.8rem;font-weight:600">${escapeHtml(sq.unit)} · ${escapeHtml(sq.motto)}</span>
          <h1>Flight ${escapeHtml(flight.displayId)}</h1>
          <p class="sub">Tap a task to grade, log penalties, and add comments. Progress auto-saves in this browser. On each task page, a backup file downloads every 2 minutes when data changes. Use Finalize for an immediate backup; use Download Phase Report for Excel.</p>
          <div class="flight-report-actions">
            <button type="button" class="btn btn-primary btn-flight-report" data-action="download-flight-report" data-phase="1">
              Download Phase I Report
            </button>
            <button type="button" class="btn btn-primary btn-flight-report" data-action="download-flight-report" data-phase="2">
              Download Phase II Report
            </button>
  </div>
        </div>
      </div>

      <section class="phase-block">
        <header>
          <div>
            <h2>Phase I</h2>
            ${phaseProgress(flight.phase1)}
          </div>
          <span class="day">Day 1</span>
        </header>
        ${renderTaskRail(flight.phase1, 'phase1')}
</section>

      <section class="phase-block">
        <header>
          <div>
            <h2>Phase II</h2>
            ${phaseProgress(flight.phase2)}
          </div>
          <span class="day">Day 2</span>
        </header>
        ${renderTaskRail(flight.phase2, 'phase2')}
      </section>
      ${state.statusMessage && state.step === 'schedule' ? `<p class="status-message schedule-status">${escapeHtml(state.statusMessage)}</p>` : ''}
    </div>
  `
}

function formatWhen(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function renderTask() {
  const sq = selectedSquadron() || squadronForFlightId(state.flightId)
  const flight = selectedFlight()
  const task = activeTaskRecord()
  if (!task || !flight || !sq) {
    return renderSchedule()
  }

  const record = state.taskRecord
  const result = normalizeResult(record?.result || cachedResult(task.task))
  const note = findNotetaker(task.task)
  const penaltyOptions = penaltiesForTask(task.task)
  const recordedPenalties = record?.penalties || []
  const studentComments = record?.studentComments || record?.comments || []
  const operationalComments = record?.operationalComments || []
  const rubric = normalizeRubric(record?.rubric)
  const timerRunning = Boolean(record?.timerStartedAt)
  const timerPaused =
    !timerRunning &&
    typeof record?.timerAccumulatedMs === 'number' &&
    record.timerAccumulatedMs > 0
  const elapsedMs = getTaskElapsedMs(record)
  const canRestart =
    timerRunning || timerPaused || (typeof record?.durationMs === 'number' && record.durationMs > 0)
  const canFinalize =
    Boolean(result) ||
    recordedPenalties.length > 0 ||
    studentComments.length > 0 ||
    operationalComments.length > 0 ||
    rubricHasMarks(rubric) ||
    timerRunning ||
    timerPaused ||
    record?.durationMs != null
  const actions = `
    <button type="button" class="btn" data-action="reset">New upload</button>
  `

  return `
    <div class="shell">
      ${topBar(actions)}
      <div class="task-screen">
        <div class="task-screen-hero">
          <img src="${asset(sq.logo)}" alt="${escapeHtml(sq.name)} logo" />
          <div>
            <span class="eyebrow" style="color:var(--af-gold);font-family:var(--font-display);letter-spacing:.22em;text-transform:uppercase;font-size:.8rem;font-weight:600">Flight ${escapeHtml(flight.displayId)} · ${escapeHtml(task.phaseLabel)} · ${escapeHtml(task.dayLabel)}</span>
            <h1 class="task-title">
              <span class="task-title-code">Task ${escapeHtml(normalizeTaskCode(task.task) || task.task)}</span>
              ${
                note?.title
                  ? `<span class="task-title-name">${escapeHtml(note.title)}</span>`
                  : ''
              }
            </h1>
            <p class="sub">Order ${task.order ?? '—'} · Auto-saves in this browser</p>
            ${
              note
                ? `<button type="button" class="btn btn-resource btn-resource-top" data-open-notetaker="${note.code}">Open TASK Resource</button>`
                : ''
            }
          </div>
        </div>

        <div class="grade-panel">
          <p class="grade-label">Task timer</p>
          <p class="timer-display" id="task-timer-display">${escapeHtml(formatDuration(elapsedMs))}</p>
          <div class="timer-actions">
            <button type="button" class="btn btn-timer" data-action="start-timer" ${timerRunning ? 'disabled' : ''}>
              ${timerPaused ? 'Resume timer' : 'Start timer'}
            </button>
            <button type="button" class="btn btn-timer btn-timer-pause" data-action="pause-timer" ${timerRunning ? '' : 'disabled'}>
              Pause timer
            </button>
            <button type="button" class="btn btn-timer btn-timer-restart" data-action="restart-timer" ${canRestart ? '' : 'disabled'}>
              Restart timer
            </button>
          </div>

          <p class="grade-label grade-label-spaced">Instructor result</p>
          <p class="grade-current is-${result || 'none'}">${escapeHtml(resultLabel(result))}</p>
          <div class="grade-actions">
            <button type="button" class="btn btn-complete${result === 'complete' ? ' is-selected' : ''}" data-grade="complete">Complete</button>
            <button type="button" class="btn btn-incomplete${result === 'incomplete' ? ' is-selected' : ''}" data-grade="incomplete">Incomplete</button>
          </div>
          <button type="button" class="btn btn-clear" data-grade="clear" ${result || record?.durationMs != null || timerRunning || timerPaused ? '' : 'disabled'}>Clear result</button>

          <div class="penalty-block">
            <p class="grade-label">Penalties</p>
            <div class="penalty-list" role="list">
              ${
                penaltyOptions.length
                  ? penaltyOptions
                      .map(
                        (p, i) => `
                <button type="button" class="penalty-option tone-${escapeHtml(p.tone || 'other')}" data-record-penalty="${i}" role="listitem" title="${escapeHtml(p.detail || p.label)}">
                  <span class="penalty-label">${escapeHtml(p.label)}</span>
                </button>`,
                      )
                      .join('')
                  : '<p class="empty-phase">No penalty list found for this task code.</p>'
              }
            </div>
            ${
              recordedPenalties.length
                ? `<ul class="recorded-list">
                    ${recordedPenalties
                      .map(
                        (p) => `<li class="recorded-item">
                          <div class="recorded-item-main">
                            <strong>Penalty</strong> · ${escapeHtml(p.text)}
                            <span>${escapeHtml(formatWhen(p.recordedAt))}</span>
                          </div>
                          <button type="button" class="btn-icon-delete" data-delete-penalty="${escapeHtml(p.id || '')}" aria-label="Delete penalty" title="Delete penalty">
                            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                              <path d="M6 7h12M10 7V5h4v2m-6 3v8m4-8v8M7 7l1 12h8l1-12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                          </button>
                        </li>`,
                      )
                      .join('')}
    </ul>
                  <button type="button" class="btn btn-clear btn-clear-list" data-action="clear-penalties">Clear penalties</button>`
                : ''
            }
  </div>

          ${renderRubric(rubric)}

          ${renderCommentSection('student', 'Student Related Comments', 'Add a student-related comment', studentComments)}
          ${renderCommentSection('operational', 'Operational/Equipment Comments', 'Add an operational or equipment comment', operationalComments)}

          <div class="finalize-block">
            <button type="button" class="btn btn-finalize" data-action="finalize-task" ${canFinalize ? '' : 'disabled'}>
              Finalize &amp; download backup
            </button>
            <p class="finalize-hint">While you stay on this task page, a backup downloads automatically every 2 minutes when scoring data changes. Finalize also downloads now and returns to the schedule. Use Restore backup in the menu if anything is lost.</p>
          </div>

          ${state.statusMessage ? `<p class="status-message">${escapeHtml(state.statusMessage)}</p>` : ''}
        </div>
      </div>
    </div>
  `
}

function renderRubric(rubric) {
  const marks = normalizeRubric(rubric)
  const headerCells = RUBRIC_LEVELS.map(
    (level) => `<th scope="col">${escapeHtml(level.label)}</th>`,
  ).join('')
  const bodyRows = RUBRIC_CRITERIA.map((criterion) => {
    const selected = marks[criterion.id]
    const cells = RUBRIC_LEVELS.map((level) => {
      const isMarked = selected === level.id
      return `
        <td>
          <button
            type="button"
            class="rubric-cell-btn${isMarked ? ' is-marked' : ''}"
            data-rubric-criterion="${criterion.id}"
            data-rubric-level="${level.id}"
            aria-pressed="${isMarked ? 'true' : 'false'}"
            aria-label="${escapeHtml(criterion.label)} · ${escapeHtml(level.label)}${isMarked ? ' selected' : ''}"
            title="${escapeHtml(criterion.label)} · ${escapeHtml(level.label)}"
          >
            <span class="rubric-mark" aria-hidden="true">${isMarked ? '✓' : '+'}</span>
          </button>
        </td>`
    }).join('')
    return `
      <tr>
        <th scope="row">${escapeHtml(criterion.label)}</th>
        ${cells}
      </tr>`
  }).join('')

  return `
    <div class="rubric-block">
      <p class="grade-label">Rubric</p>
      <div class="rubric-scroll">
        <table class="rubric-table">
          <thead>
            <tr>
              <th scope="col" class="rubric-corner"></th>
              ${headerCells}
            </tr>
          </thead>
          <tbody>
            ${bodyRows}
          </tbody>
        </table>
      </div>
      ${
        rubricHasMarks(marks)
          ? `<button type="button" class="btn btn-clear btn-clear-list" data-action="clear-rubric">Clear rubric</button>`
          : ''
      }
    </div>
  `
}

function renderCommentSection(kind, title, placeholder, comments) {
  return `
    <div class="comment-block">
      <p class="grade-label">${escapeHtml(title)}</p>
      <textarea id="task-comment-${kind}" class="comment-input" rows="3" placeholder="${escapeHtml(placeholder)}"></textarea>
      <button type="button" class="btn btn-primary btn-comment-submit" data-action="submit-comment" data-comment-kind="${kind}">Submit comment</button>
      ${
        comments.length
          ? `<ul class="recorded-list">
              ${comments
                .map(
                  (c) => `<li class="recorded-item">
                    <div class="recorded-item-main">
                      <strong>Comment</strong> · ${escapeHtml(c.text)}
                      <span>${escapeHtml(formatWhen(c.recordedAt))}</span>
                    </div>
                    <button type="button" class="btn-icon-delete" data-delete-comment="${escapeHtml(c.id || '')}" data-comment-kind="${kind}" aria-label="Delete comment" title="Delete comment">
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M6 7h12M10 7V5h4v2m-6 3v8m4-8v8M7 7l1 12h8l1-12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </button>
                  </li>`,
                )
                .join('')}
    </ul>
            <button type="button" class="btn btn-clear btn-clear-list" data-action="clear-comments" data-comment-kind="${kind}">Clear comments</button>`
          : ''
      }
  </div>
  `
}

function renderResourcesList() {
  const version = String(state.resourceVersion || 'A').toUpperCase()
  const items = notetakersForVersion(version)
  const actions = ''
  const cards = items
    .map(
      (item) => `
      <button type="button" class="resource-card" data-open-notetaker="${item.code}">
        <img src="${asset(item.file)}" alt="${escapeHtml(item.code)} ${escapeHtml(item.title)}" loading="lazy" />
        <span class="resource-card-code">${escapeHtml(item.code)}</span>
        <span class="resource-card-title">${escapeHtml(item.title)}</span>
      </button>
    `,
    )
    .join('')

  return `
    <div class="shell">
      ${topBar(actions)}
      <div class="section-head">
        <span class="eyebrow" style="color:var(--af-gold);font-family:var(--font-display);letter-spacing:.22em;text-transform:uppercase;font-size:.8rem;font-weight:600">Resources · TASK Resources</span>
        <h1>Version ${escapeHtml(version)}</h1>
        <p>Select a task image to view the full TASK Resource.</p>
      </div>
      <div class="resource-grid">${cards}</div>
    </div>
  `
}

function renderResourcesView() {
  const note = findNotetaker(state.resourceCode)
  if (!note) return renderResourcesList()
  const backLabel = resourcesBackLabel()
  const actions = ''
  return `
    <div class="shell">
      ${topBar(actions)}
      <div class="section-head">
        <span class="eyebrow" style="color:var(--af-gold);font-family:var(--font-display);letter-spacing:.22em;text-transform:uppercase;font-size:.8rem;font-weight:600">Version ${escapeHtml(note.code.slice(-1))} TASK Resource</span>
        <h1>${escapeHtml(note.code)} · ${escapeHtml(note.title)}</h1>
      </div>
      <div class="resource-view-actions">
        <button type="button" class="btn btn-primary btn-back-scoring" data-action="close-resources">${escapeHtml(backLabel)}</button>
      </div>
      <figure class="resource-viewer">
        <img src="${asset(note.file)}" alt="${escapeHtml(note.code)} ${escapeHtml(note.title)}" />
      </figure>
    </div>
  `
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function bindChrome() {
  app.querySelectorAll('[data-action="toggle-menu"]').forEach((el) => {
    el.addEventListener('click', () => setState({ menuOpen: !state.menuOpen }))
  })
  app.querySelectorAll('[data-action="close-menu"]').forEach((el) => {
    el.addEventListener('click', () => setState({ menuOpen: false }))
  })
  app.querySelectorAll('[data-action="toggle-theme"]').forEach((el) => {
    el.addEventListener('click', () => {
      const next = toggleTheme()
      setState({
        statusMessage: next === 'light' ? 'Light mode on' : 'Dark mode on',
      })
    })
  })
  app.querySelectorAll('[data-resource-version]').forEach((el) => {
    el.addEventListener('click', () => openResources(el.dataset.resourceVersion))
  })
  app.querySelectorAll('[data-action="close-resources"]').forEach((el) => {
    el.addEventListener('click', closeResources)
  })
  app.querySelectorAll('[data-action="back-resources-list"]').forEach((el) => {
    el.addEventListener('click', () =>
      setState({ step: 'resources-list', resourceCode: null, menuOpen: false }),
    )
  })
  app.querySelectorAll('[data-action="set-class"]').forEach((el) => {
    el.addEventListener('click', () => {
      const entered = window.prompt(
        'Enter the class name (example: 26G):',
        state.classId || '26G',
      )
      if (!entered || !entered.trim()) return
      const classId = setClassId(entered.trim())
      setState({
        classId,
        menuOpen: false,
        recordCache: {},
        taskRecord: null,
        statusMessage: `Class profile set to ${classId}`,
      })
      if (state.step === 'task' || state.step === 'schedule') {
        bootstrapStepData()
      }
    })
  })
  app.querySelectorAll('[data-action="restore-backup"]').forEach((el) => {
    el.addEventListener('click', () => {
      const input = app.querySelector('#restore-backup-input')
      if (!input) return
      input.value = ''
      input.click()
    })
  })
  const restoreInput = app.querySelector('#restore-backup-input')
  if (restoreInput) {
    restoreInput.addEventListener('change', async () => {
      const file = restoreInput.files?.[0]
      if (!file) return
      try {
        const result = await restoreFlightBackupFromFile(file)
        state.classId = result.classId
        state.recordCache = {}
        setState({
          menuOpen: false,
          statusMessage: `Restored ${result.taskCount} task(s) for ${result.classId} / flight ${result.flightId}. Open that flight on the schedule to see grades.`,
        })
        await bootstrapStepData()
      } catch (err) {
        setState({
          menuOpen: false,
          statusMessage: err.message || 'Could not restore backup.',
        })
      }
    })
  }
  app.querySelectorAll('[data-open-notetaker]').forEach((el) => {
    el.addEventListener('click', () => {
      const code = String(el.dataset.openNotetaker || '').toUpperCase()
      const note = findNotetaker(code)
      if (!note) return
      const returnStep = isResourceStep(state.step)
        ? state.returnStep
        : rememberReturnStep()
      setState({
        returnStep,
        step: 'resources-view',
        resourceVersion: note.code.slice(-1),
        resourceCode: note.code,
        menuOpen: false,
      })
    })
  })
}

async function saveGrade(action) {
  const task = activeTaskRecord()
  if (!task) return
  const classId = requireClassId()
  if (!classId) {
    setState({ statusMessage: 'Set a class profile before grading.' })
    return
  }
  const result = action === 'clear' ? null : action
  const record = await setTaskGrade(classId, state.flightId, task.task, result)
  state.taskRecord = record
  state.recordCache[cacheKey(task.task)] = record
  state.classId = classId
  stopTimerTick()
  state.statusMessage = result
    ? `Saved ${resultLabel(result)} for ${task.task}${
        record.durationMs != null ? ` · ${formatDuration(record.durationMs)}` : ''
      }`
    : `Cleared result for ${task.task}`
  render()
}

async function beginTaskTimer() {
  const task = activeTaskRecord()
  if (!task) return
  const classId = requireClassId()
  if (!classId) {
    setState({ statusMessage: 'Set a class profile before starting the timer.' })
    return
  }
  const wasPaused =
    !state.taskRecord?.timerStartedAt &&
    typeof state.taskRecord?.timerAccumulatedMs === 'number' &&
    state.taskRecord.timerAccumulatedMs > 0
  const record = await startTaskTimer(classId, state.flightId, task.task)
  state.taskRecord = record
  state.recordCache[cacheKey(task.task)] = record
  state.classId = classId
  state.statusMessage = wasPaused
    ? `Timer resumed for ${task.task}`
    : `Timer started for ${task.task}`
  render()
  startTimerTick()
}

async function pauseActiveTimer() {
  const task = activeTaskRecord()
  if (!task) return
  const classId = requireClassId()
  if (!classId) {
    setState({ statusMessage: 'Set a class profile before pausing the timer.' })
    return
  }
  if (!state.taskRecord?.timerStartedAt) return
  const record = await pauseTaskTimer(classId, state.flightId, task.task)
  state.taskRecord = record
  state.recordCache[cacheKey(task.task)] = record
  state.classId = classId
  stopTimerTick()
  state.statusMessage = `Timer paused for ${task.task} · ${formatDuration(getTaskElapsedMs(record))}`
  render()
}

async function restartActiveTimer() {
  const task = activeTaskRecord()
  if (!task) return
  const classId = requireClassId()
  if (!classId) {
    setState({ statusMessage: 'Set a class profile before restarting the timer.' })
    return
  }
  const record = await restartTaskTimer(classId, state.flightId, task.task)
  state.taskRecord = record
  state.recordCache[cacheKey(task.task)] = record
  state.classId = classId
  state.statusMessage = `Timer restarted for ${task.task}`
  render()
  startTimerTick()
}

let timerTickId = null

function stopTimerTick() {
  if (timerTickId != null) {
    clearInterval(timerTickId)
    timerTickId = null
  }
}

function startTimerTick() {
  stopTimerTick()
  timerTickId = setInterval(() => {
    const started = state.taskRecord?.timerStartedAt
    const el = app.querySelector('#task-timer-display')
    if (!started || !el || state.step !== 'task') {
      stopTimerTick()
      return
    }
    el.textContent = formatDuration(getTaskElapsedMs(state.taskRecord))
  }, 250)
}

async function savePenalty(index) {
  const task = activeTaskRecord()
  if (!task) return
  const classId = requireClassId()
  if (!classId) {
    setState({ statusMessage: 'Set a class profile before logging penalties.' })
    return
  }
  const options = penaltiesForTask(task.task)
  const penalty = options[Number(index)]
  if (!penalty) return
  const text = typeof penalty === 'string' ? penalty : penalty.detail || penalty.label
  const record = await addTaskPenalty(classId, state.flightId, task.task, text)
  state.taskRecord = record
  state.recordCache[cacheKey(task.task)] = record
  state.classId = classId
  state.statusMessage = `Penalty recorded for ${task.task}`
  render()
}

async function saveComment(kind = 'student') {
  const task = activeTaskRecord()
  if (!task) return
  const classId = requireClassId()
  if (!classId) {
    setState({ statusMessage: 'Set a class profile before saving comments.' })
    return
  }
  const textarea = app.querySelector(`#task-comment-${kind}`)
  const text = textarea?.value || ''
  try {
    const record = await addTaskComment(classId, state.flightId, task.task, text, kind)
    state.taskRecord = record
    state.recordCache[cacheKey(task.task)] = record
    state.classId = classId
    state.statusMessage =
      kind === 'operational'
        ? `Operational/equipment comment saved for ${task.task}`
        : `Student comment saved for ${task.task}`
    render()
  } catch (err) {
    setState({ statusMessage: err.message || 'Could not save comment.' })
  }
}

async function clearPenalties() {
  const task = activeTaskRecord()
  if (!task) return
  const classId = requireClassId()
  if (!classId) {
    setState({ statusMessage: 'Set a class profile first.' })
    return
  }
  const record = await clearTaskPenalties(classId, state.flightId, task.task)
  state.taskRecord = record
  state.recordCache[cacheKey(task.task)] = record
  state.classId = classId
  state.statusMessage = `Cleared penalties for ${task.task}`
  render()
}

async function clearComments(kind = 'student') {
  const task = activeTaskRecord()
  if (!task) return
  const classId = requireClassId()
  if (!classId) {
    setState({ statusMessage: 'Set a class profile first.' })
    return
  }
  const record = await clearTaskComments(classId, state.flightId, task.task, kind)
  state.taskRecord = record
  state.recordCache[cacheKey(task.task)] = record
  state.classId = classId
  state.statusMessage =
    kind === 'operational'
      ? `Cleared operational/equipment comments for ${task.task}`
      : `Cleared student comments for ${task.task}`
  render()
}

async function deletePenalty(penaltyId) {
  const task = activeTaskRecord()
  if (!task || !penaltyId) return
  const classId = requireClassId()
  if (!classId) {
    setState({ statusMessage: 'Set a class profile first.' })
    return
  }
  const record = await removeTaskPenalty(classId, state.flightId, task.task, penaltyId)
  state.taskRecord = record
  state.recordCache[cacheKey(task.task)] = record
  state.classId = classId
  state.statusMessage = `Deleted penalty for ${task.task}`
  render()
}

async function deleteComment(commentId, kind = 'student') {
  const task = activeTaskRecord()
  if (!task || !commentId) return
  const classId = requireClassId()
  if (!classId) {
    setState({ statusMessage: 'Set a class profile first.' })
    return
  }
  const record = await removeTaskComment(
    classId,
    state.flightId,
    task.task,
    commentId,
    kind,
  )
  state.taskRecord = record
  state.recordCache[cacheKey(task.task)] = record
  state.classId = classId
  state.statusMessage = `Deleted comment for ${task.task}`
  render()
}

async function toggleRubricMark(criterion, level) {
  const task = activeTaskRecord()
  if (!task || !criterion || !level) return
  const classId = requireClassId()
  if (!classId) {
    setState({ statusMessage: 'Set a class profile before scoring the rubric.' })
    return
  }
  const record = await setRubricMark(classId, state.flightId, task.task, criterion, level)
  state.taskRecord = record
  state.recordCache[cacheKey(task.task)] = record
  state.classId = classId
  const selected = record.rubric?.[criterion]
  state.statusMessage = selected
    ? `${RUBRIC_CRITERIA.find((c) => c.id === criterion)?.label || criterion}: ${rubricLevelLabel(selected)}`
    : `Cleared rubric mark for ${RUBRIC_CRITERIA.find((c) => c.id === criterion)?.label || criterion}`
  render()
}

async function clearRubric() {
  const task = activeTaskRecord()
  if (!task) return
  const classId = requireClassId()
  if (!classId) {
    setState({ statusMessage: 'Set a class profile first.' })
    return
  }
  const record = await clearTaskRubric(classId, state.flightId, task.task)
  state.taskRecord = record
  state.recordCache[cacheKey(task.task)] = record
  state.classId = classId
  state.statusMessage = `Cleared rubric for ${task.task}`
  render()
}

function bindTaskActions() {
  app.querySelectorAll('[data-grade]').forEach((el) => {
    el.addEventListener('click', () => saveGrade(el.dataset.grade))
  })
  app.querySelectorAll('[data-action="start-timer"]').forEach((el) => {
    el.addEventListener('click', () => beginTaskTimer())
  })
  app.querySelectorAll('[data-action="pause-timer"]').forEach((el) => {
    el.addEventListener('click', () => pauseActiveTimer())
  })
  app.querySelectorAll('[data-action="restart-timer"]').forEach((el) => {
    el.addEventListener('click', () => restartActiveTimer())
  })
  app.querySelectorAll('[data-record-penalty]').forEach((el) => {
    el.addEventListener('click', () => savePenalty(el.dataset.recordPenalty))
  })
  app.querySelectorAll('[data-rubric-criterion]').forEach((el) => {
    el.addEventListener('click', () =>
      toggleRubricMark(el.dataset.rubricCriterion, el.dataset.rubricLevel),
    )
  })
  app.querySelectorAll('[data-action="clear-rubric"]').forEach((el) => {
    el.addEventListener('click', () => clearRubric())
  })
  app.querySelectorAll('[data-action="submit-comment"]').forEach((el) => {
    el.addEventListener('click', () => saveComment(el.dataset.commentKind || 'student'))
  })
  app.querySelectorAll('[data-action="clear-penalties"]').forEach((el) => {
    el.addEventListener('click', () => clearPenalties())
  })
  app.querySelectorAll('[data-action="clear-comments"]').forEach((el) => {
    el.addEventListener('click', () => clearComments(el.dataset.commentKind || 'student'))
  })
  app.querySelectorAll('[data-delete-penalty]').forEach((el) => {
    el.addEventListener('click', () => deletePenalty(el.dataset.deletePenalty))
  })
  app.querySelectorAll('[data-delete-comment]').forEach((el) => {
    el.addEventListener('click', () =>
      deleteComment(el.dataset.deleteComment, el.dataset.commentKind || 'student'),
    )
  })
  app.querySelectorAll('[data-action="finalize-task"]').forEach((el) => {
    el.addEventListener('click', () => finalizeTask())
  })
  if (state.taskRecord?.timerStartedAt) startTimerTick()
  else stopTimerTick()
  startAutoBackupWatch()
}

const AUTO_BACKUP_INTERVAL_MS = 2 * 60 * 1000
let autoBackupTimerId = null
let autoBackupBusy = false
let lastAutoBackupSig = ''

function backupSignature(backup) {
  return JSON.stringify(backup?.records || [])
}

function stopAutoBackupWatch() {
  if (autoBackupTimerId != null) {
    clearInterval(autoBackupTimerId)
    autoBackupTimerId = null
  }
}

function startAutoBackupWatch() {
  stopAutoBackupWatch()
  if (state.step !== 'task') return
  autoBackupTimerId = setInterval(() => {
    void runAutoBackup()
  }, AUTO_BACKUP_INTERVAL_MS)
}

async function runAutoBackup() {
  if (autoBackupBusy || state.step !== 'task') return
  const classId = state.classId || getClassId()
  const flightId = state.flightId
  if (!classId || !flightId) return

  autoBackupBusy = true
  try {
    const snapshot = await buildFlightBackup(classId, flightId)
    const sig = backupSignature(snapshot)
    if (!sig || sig === '[]' || sig === lastAutoBackupSig) return

    const result = await downloadFlightBackup(classId, flightId)
    lastAutoBackupSig = sig
    state.statusMessage = `Auto-backup downloaded · ${result.filename}`
    const el = app.querySelector('.status-message')
    if (el) {
      el.textContent = state.statusMessage
    } else {
      const panel = app.querySelector('.grade-panel')
      if (panel) {
        const p = document.createElement('p')
        p.className = 'status-message'
        p.textContent = state.statusMessage
        panel.appendChild(p)
      }
    }
  } catch {
    /* Keep scoring uninterrupted if a quiet backup download fails. */
  } finally {
    autoBackupBusy = false
  }
}

async function finalizeTask() {
  const task = activeTaskRecord()
  if (!task) return
  const classId = requireClassId()
  if (!classId) {
    setState({ statusMessage: 'Set a class profile before finalizing.' })
    return
  }
  if (!state.flightId) {
    setState({ statusMessage: 'Select a flight before finalizing.' })
    return
  }
  try {
    const snapshot = await buildFlightBackup(classId, state.flightId)
    const result = await downloadFlightBackup(classId, state.flightId)
    lastAutoBackupSig = backupSignature(snapshot)
    stopAutoBackupWatch()
    state.activeTask = null
    state.taskRecord = null
    state.menuOpen = false
    state.step = 'schedule'
    state.statusMessage = `Backup saved: ${result.filename} (${result.taskCount} task${result.taskCount === 1 ? '' : 's'} for ${result.classId} / flight ${result.flightId}).`
    await preloadFlightRecords()
    saveLastSession()
    render()
  } catch (err) {
    setState({ statusMessage: err.message || 'Could not create backup.' })
  }
}

async function downloadCurrentFlightReport(phase = '1') {
  const flight = selectedFlight()
  const sq = selectedSquadron() || squadronForFlightId(state.flightId)
  const classId = requireClassId()
  if (!classId) {
    setState({ statusMessage: 'Set a class profile before downloading a report.' })
    return
  }
  if (!flight) {
    setState({ statusMessage: 'Select a flight first.' })
    return
  }
  const phaseKey = String(phase) === '2' ? '2' : '1'
  try {
    const result = await downloadFlightReport({
      classId,
      flightId: flight.id,
      displayId: flight.displayId || flight.id,
      squadronName: sq?.name || '',
      squadronUnit: sq?.unit || '',
      phase1: flight.phase1 || [],
      phase2: flight.phase2 || [],
      phase: phaseKey,
    })
    setState({
      statusMessage: `Downloaded ${result.phase} report · ${result.filename} · ${result.complete} complete / ${result.incomplete} incomplete · ${result.penaltyCount} penalties · ${result.commentCount} comments`,
    })
  } catch (err) {
    setState({ statusMessage: err.message || 'Could not download flight report.' })
  }
}

async function bootstrapStepData() {
  if (state.step === 'schedule') {
    await preloadFlightRecords()
    render()
  } else if (state.step === 'task') {
    await refreshTaskRecord()
    render()
  }
}

function startNewClass() {
  clearLastSession()
  setState({
    step: 'class-profile',
    workbook: null,
    fileName: '',
    squadronId: null,
    flightId: null,
    activeTask: null,
    menuOpen: false,
    resourceVersion: null,
    resourceCode: null,
    returnStep: 'upload',
    classId: '',
    taskRecord: null,
    recordCache: {},
    statusMessage: '',
    error: '',
  })
}

function bindClassProfile() {
  const form = app.querySelector('#class-profile-form')
  const input = app.querySelector('#class-id-input')
  if (!form) return
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const value = String(input?.value || '').trim()
    if (!value) {
      setState({ error: 'Enter a class profile name (example: 26G).' })
      return
    }
    const classId = setClassId(value)
    const nextStep = state.workbook ? 'squadron' : 'upload'
    setState({
      classId,
      error: '',
      step: nextStep,
      returnStep: nextStep,
      squadronId: null,
      flightId: null,
      activeTask: null,
      recordCache: {},
      taskRecord: null,
      statusMessage: `Class session ${classId} ready`,
    })
  })
  input?.addEventListener('input', () => {
    const hint = app.querySelector('.class-profile-hint strong')
    if (hint) hint.textContent = String(input.value || '').trim() || '26G'
  })
}

function bindLock() {
  const form = app.querySelector('#lock-form')
  const input = app.querySelector('#app-password')
  if (!form) return
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const value = String(input?.value || '')
    if (value === APP_PASSWORD) {
      unlockSession()
      setState({ unlocked: true, authError: '' })
      return
    }
    setState({ unlocked: false, authError: 'Incorrect password.' })
    requestAnimationFrame(() => {
      const next = app.querySelector('#app-password')
      if (next) next.focus()
    })
  })
}

function render() {
  if (!state.unlocked) {
    stopAutoBackupWatch()
    stopTimerTick()
    app.innerHTML = renderLock()
    bindLock()
    return
  }

  let html = ''
  if (state.step === 'upload') html = renderUpload()
  else if (state.step === 'class-profile') html = renderClassProfile()
  else if (state.step === 'squadron') html = renderSquadron()
  else if (state.step === 'flight') html = renderFlight()
  else if (state.step === 'schedule') html = renderSchedule()
  else if (state.step === 'task') html = renderTask()
  else if (state.step === 'resources-list') html = renderResourcesList()
  else if (state.step === 'resources-view') html = renderResourcesView()

  if (state.step !== 'task') stopAutoBackupWatch()

  app.innerHTML = `${renderSideMenu()}${html}`

  if (state.step === 'upload') bindUpload(app)
  if (state.step === 'class-profile') bindClassProfile()
  bindChrome()
  if (state.step === 'task') bindTaskActions()
  else stopTimerTick()

  app.querySelectorAll('[data-action="reset"]').forEach((el) => {
    el.addEventListener('click', resetToUpload)
  })
  app.querySelectorAll('[data-action="go-back"]').forEach((el) => {
    el.addEventListener('click', () => {
      void goBack()
    })
  })
  app.querySelectorAll('[data-action="start-new-class"]').forEach((el) => {
    el.addEventListener('click', startNewClass)
  })
  app.querySelectorAll('[data-action="resume-last-schedule"]').forEach((el) => {
    el.addEventListener('click', () => {
      void resumeLastSchedule()
    })
  })
  app.querySelectorAll('[data-action="download-flight-report"]').forEach((el) => {
    el.addEventListener('click', () => downloadCurrentFlightReport(el.dataset.phase || '1'))
  })
  app.querySelectorAll('[data-squadron]').forEach((el) => {
    el.addEventListener('click', () => {
      if (el.disabled) return
      setState({
        step: 'flight',
        squadronId: el.dataset.squadron,
        flightId: null,
        activeTask: null,
        menuOpen: false,
      })
    })
  })
  app.querySelectorAll('[data-flight]').forEach((el) => {
    el.addEventListener('click', async () => {
      state.flightId = el.dataset.flight
      state.activeTask = null
      state.menuOpen = false
      state.step = 'schedule'
      requireClassId()
      state.classId = getClassId()
      await preloadFlightRecords()
      saveLastSession()
      render()
    })
  })
  app.querySelectorAll('[data-open-task]').forEach((el) => {
    el.addEventListener('click', async () => {
      const [phase, indexRaw] = String(el.dataset.openTask).split(':')
      const index = Number(indexRaw)
      if (!phase || Number.isNaN(index)) return
      state.step = 'task'
      state.activeTask = { phase, index }
      state.menuOpen = false
      state.statusMessage = ''
      requireClassId()
      state.classId = getClassId()
      await refreshTaskRecord()
      saveLastSession()
      render()
    })
  })
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.menuOpen) {
    setState({ menuOpen: false })
  }
})

render()

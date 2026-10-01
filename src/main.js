import './style.css'
import { parseProjectXWorkbook } from './parser.js'
import {
  SQUADRONS,
  flightsForSquadron,
  squadronForFlightId,
} from './squadrons.js'
import { findNotetaker, notetakersForVersion } from './notetakers.js'
import { penaltiesForTask } from './penalties.js'
import { downloadFlightReport } from './report.js'
import {
  addTaskComment,
  addTaskPenalty,
  canUseFolderApi,
  clearTaskComments,
  clearTaskPenalties,
  downloadClassFolderZip,
  downloadFlightBackup,
  getClassId,
  getFolderLinked,
  getLinkedFolderName,
  getTaskRecord,
  linkProfilesFolder,
  openClassFolder,
  profileFolderHint,
  removeTaskComment,
  removeTaskPenalty,
  restoreFlightBackupFromFile,
  setClassId,
  setTaskGrade,
} from './profile.js'

const AUTH_KEY = 'projx-auth-v1'
const APP_PASSWORD = 'redpants1950'

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
  'folder-browser',
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
  folderLinked: getFolderLinked(),
  taskRecord: null,
  recordCache: {},
  statusMessage: '',
  error: '',
  folderBrowse: null,
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
  return state.recordCache[cacheKey(taskCode)]?.result || null
}

function resultLabel(result) {
  if (result === 'pass') return 'Pass'
  if (result === 'fail') return 'Fail'
  return 'Not graded'
}

function isResourceStep(step = state.step) {
  return (
    step === 'resources-list' ||
    step === 'resources-view' ||
    step === 'folder-browser'
  )
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
      'Enter the class profile folder name (example: 26G):',
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
  return `
    <header class="topbar">
      <div class="brand-mark">
        <span class="eyebrow">Squadron Officer School</span>
      </div>
      <div class="nav-actions">${classChip}${extraActions}</div>
    </header>
  `
}

function renderSideMenu() {
  const open = state.menuOpen
  const linkedName = getLinkedFolderName()
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
        <p class="side-menu-section">Class profile</p>
        <button type="button" class="side-menu-link" data-action="set-class">
          <span class="side-menu-link-title">${state.classId ? escapeHtml(state.classId) : 'Set class'}</span>
          <span class="side-menu-link-meta">Folder name like 26G</span>
        </button>
        <button type="button" class="side-menu-link" data-action="link-folder" ${canUseFolderApi() ? '' : 'disabled'}>
          <span class="side-menu-link-title">${state.folderLinked ? 'Folder linked' : 'Link profile folder'}</span>
          <span class="side-menu-link-meta">${
            state.folderLinked
              ? `Saving under “${escapeHtml(linkedName || 'selected folder')}”`
              : canUseFolderApi()
                ? 'Choose where class/flight/task folders are saved'
                : 'Use Chrome/Edge to link a folder'
          }</span>
        </button>
        <button type="button" class="side-menu-link" data-action="open-class-folder" ${canUseFolderApi() ? '' : 'disabled'}>
          <span class="side-menu-link-title">Browse class folder</span>
          <span class="side-menu-link-meta">${
            state.classId
              ? `View ${escapeHtml(state.classId)} in the app`
              : 'Set a class first'
          }</span>
        </button>
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
  return `
    <div class="shell">
      ${topBar(classReady ? `<span class="file-chip">Class ${escapeHtml(currentClass)}</span>` : '')}
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
            classReady
              ? ''
              : `<div class="hero-actions">
            <button type="button" class="btn btn-primary hero-start-btn" data-action="start-new-class">
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
          ${state.error ? `<p class="error" role="alert">${escapeHtml(state.error)}</p>` : ''}
        </div>
      </section>
      <p class="footer-note">${
        classReady
          ? 'Next: choose squadron, then the flight for this class session'
          : 'Recommended: Start new class → name the class → upload matrix → pick squadron and flight'
      }</p>
    </div>
  `
}

function renderClassProfile() {
  const hasWorkbook = Boolean(state.workbook)
  const actions = hasWorkbook
    ? `
    <span class="file-chip" title="${escapeHtml(state.fileName)}">${escapeHtml(state.fileName)}</span>
    <button type="button" class="btn" data-action="reset">Home</button>
  `
    : `
    <button type="button" class="btn" data-action="reset">Home</button>
  `
  const suggested = state.classId || ''
  const linkedName = getLinkedFolderName()
  const folderReady = canUseFolderApi()

  return `
    <div class="shell">
      ${topBar(actions)}
      <div class="section-head">
        <span class="eyebrow" style="color:var(--af-gold);font-family:var(--font-display);letter-spacing:.22em;text-transform:uppercase;font-size:.8rem;font-weight:600">New class session · Step 1</span>
        <h1>Identify class</h1>
        <p>Enter the class name and link a save folder on this device. You’ll pick the flight after the matrix is uploaded.</p>
      </div>
      <form id="class-profile-form" class="class-profile-panel" autocomplete="off">
        <div class="class-folder-block">
          <p class="lock-label">Save folder on this device</p>
          <p class="class-folder-status">${
            state.folderLinked
              ? `Linked to “${escapeHtml(linkedName || 'selected folder')}”. Grades, penalties, and comments will write here as .txt files.`
              : folderReady
                ? 'Optional but recommended: choose a folder so results are saved on disk during the class.'
                : 'Folder linking needs Chrome or Edge on desktop. Progress still auto-saves in the browser.'
          }</p>
          <button type="button" class="btn ${state.folderLinked ? '' : 'btn-primary'} btn-link-folder" data-action="link-folder" ${folderReady ? '' : 'disabled'}>
            ${state.folderLinked ? 'Change linked folder' : 'Link profile folder'}
          </button>
        </div>

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
        <p class="class-profile-hint">Example path: <strong>${escapeHtml(suggested || '26G')}</strong> / {flight} / {task} /</p>

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
    <button type="button" class="btn" data-action="back-class-profile">Class profile</button>
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
    <button type="button" class="btn" data-action="back-squadron">Squadrons</button>
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
          return `
        <button
          type="button"
          class="task-slot${statusClass}"
          data-open-task="${phase}:${index}"
          aria-label="Open task ${escapeHtml(t.task)}, order ${t.order ?? 'unspecified'}${result ? `, ${result}` : ''}"
        >
          <span class="order">Order ${t.order ?? '—'}</span>
          <span class="code">${escapeHtml(t.task)}</span>
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
  let pass = 0
  let fail = 0
  for (const t of tasks) {
    const r = cachedResult(t.task)
    if (r === 'pass') pass += 1
    if (r === 'fail') fail += 1
  }
  const graded = pass + fail
  return `<span class="phase-progress">${graded}/${tasks.length} graded · ${pass} pass · ${fail} fail</span>`
}

function renderSchedule() {
  const sq = selectedSquadron() || squadronForFlightId(state.flightId)
  const flight = selectedFlight()
  const actions = `
    <button type="button" class="btn" data-action="back-flight">Flights</button>
    <button type="button" class="btn" data-action="back-squadron">Squadrons</button>
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
          <p class="sub">Tap a task to grade, log penalties, and add comments. Progress auto-saves on this device for the full session — use Finalize on each task for a downloadable backup.</p>
          <button type="button" class="btn btn-primary btn-flight-report" data-action="download-flight-report">
            Download Flight Report
          </button>
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
  const result = record?.result || cachedResult(task.task)
  const note = findNotetaker(task.task)
  const penaltyOptions = penaltiesForTask(task.task)
  const recordedPenalties = record?.penalties || []
  const comments = record?.comments || []
  const folderPath = profileFolderHint(state.classId, state.flightId, task.task)
  const canFinalize =
    Boolean(result) || recordedPenalties.length > 0 || comments.length > 0
  const actions = `
    <button type="button" class="btn" data-action="back-schedule">Schedule</button>
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
            <h1>Task ${escapeHtml(task.task)}</h1>
            <p class="sub">Order ${task.order ?? '—'} · Auto-saves to this device · ${escapeHtml(folderPath)}</p>
          </div>
        </div>

        <div class="grade-panel">
          <p class="grade-label">Instructor result</p>
          <p class="grade-current is-${result || 'none'}">${escapeHtml(resultLabel(result))}</p>
          <div class="grade-actions">
            <button type="button" class="btn btn-pass${result === 'pass' ? ' is-selected' : ''}" data-grade="pass">Pass</button>
            <button type="button" class="btn btn-fail${result === 'fail' ? ' is-selected' : ''}" data-grade="fail">Fail</button>
          </div>
          <button type="button" class="btn btn-clear" data-grade="clear" ${result ? '' : 'disabled'}>Clear result</button>

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

          <div class="comment-block">
            <p class="grade-label">Comments</p>
            <textarea id="task-comment" class="comment-input" rows="3" placeholder="Add an instructor comment for this task"></textarea>
            <button type="button" class="btn btn-primary btn-comment-submit" data-action="submit-comment">Submit comment</button>
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
                          <button type="button" class="btn-icon-delete" data-delete-comment="${escapeHtml(c.id || '')}" aria-label="Delete comment" title="Delete comment">
                            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                              <path d="M6 7h12M10 7V5h4v2m-6 3v8m4-8v8M7 7l1 12h8l1-12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                          </button>
                        </li>`,
                      )
                      .join('')}
                  </ul>
                  <button type="button" class="btn btn-clear btn-clear-list" data-action="clear-comments">Clear comments</button>`
                : ''
            }
          </div>

          ${
            note
              ? `<button type="button" class="btn btn-resource" data-open-notetaker="${note.code}">Open TASK Resource</button>`
              : ''
          }

          <div class="finalize-block">
            <button type="button" class="btn btn-finalize" data-action="finalize-task" ${canFinalize ? '' : 'disabled'}>
              Finalize &amp; download backup
            </button>
            <p class="finalize-hint">Downloads all progress so far for class ${escapeHtml(state.classId || '—')} / flight ${escapeHtml(state.flightId || '—')}. Use Restore backup in the menu if anything is lost.</p>
          </div>

          ${state.statusMessage ? `<p class="status-message">${escapeHtml(state.statusMessage)}</p>` : ''}
        </div>
      </div>
    </div>
  `
}

function renderResourcesList() {
  const version = String(state.resourceVersion || 'A').toUpperCase()
  const items = notetakersForVersion(version)
  const actions = `<button type="button" class="btn btn-primary" data-action="close-resources">${escapeHtml(resourcesBackLabel())}</button>`
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
  const actions = `
    <button type="button" class="btn btn-primary" data-action="close-resources">${escapeHtml(backLabel)}</button>
    <button type="button" class="btn" data-action="back-resources-list">All tasks</button>
  `
  return `
    <div class="shell">
      ${topBar(actions)}
      <div class="section-head">
        <span class="eyebrow" style="color:var(--af-gold);font-family:var(--font-display);letter-spacing:.22em;text-transform:uppercase;font-size:.8rem;font-weight:600">Version ${escapeHtml(note.code.slice(-1))} TASK Resource</span>
        <h1>${escapeHtml(note.code)} · ${escapeHtml(note.title)}</h1>
      </div>
      <figure class="resource-viewer">
        <img src="${asset(note.file)}" alt="${escapeHtml(note.code)} ${escapeHtml(note.title)}" />
      </figure>
      <div class="resource-view-actions">
        <button type="button" class="btn btn-primary btn-back-scoring" data-action="close-resources">${escapeHtml(backLabel)}</button>
      </div>
    </div>
  `
}

function renderFolderBrowser() {
  const browse = state.folderBrowse
  const actions = `
    <button type="button" class="btn" data-action="download-class-folder">Download ZIP</button>
    <button type="button" class="btn" data-action="close-folder-browser">Back</button>
  `
  if (!browse) {
    return `
      <div class="shell">
        ${topBar(actions)}
        <div class="section-head">
          <h1>Class folder</h1>
          <p>No folder data loaded.</p>
        </div>
      </div>
    `
  }

  const flightBlocks = browse.flights.length
    ? browse.flights
        .map(
          (f) => `
      <section class="folder-flight">
        <h3>Flight ${escapeHtml(f.id)}</h3>
        <p class="folder-tasks">${
          f.tasks.length
            ? f.tasks.map((t) => `<span class="folder-task-chip">${escapeHtml(t)}</span>`).join('')
            : '<span class="empty-phase">No task folders yet</span>'
        }</p>
      </section>
    `,
        )
        .join('')
    : '<p class="empty-phase">No flight folders yet. Grade a task to create them.</p>'

  return `
    <div class="shell">
      ${topBar(actions)}
      <div class="section-head">
        <span class="eyebrow" style="color:var(--af-gold);font-family:var(--font-display);letter-spacing:.22em;text-transform:uppercase;font-size:.8rem;font-weight:600">Linked profile folder</span>
        <h1>${escapeHtml(browse.classId)}</h1>
        <p>On disk under <strong>${escapeHtml(browse.pathLabel)}</strong> in the folder you linked with “Link profile folder.”</p>
        <p class="folder-browser-note">Websites cannot open File Explorer. Use <strong>Download ZIP</strong> to get a copy you can open on your computer, or open the linked folder yourself in File Explorer.</p>
      </div>
      <div class="folder-browser-panel">
        ${flightBlocks}
      </div>
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
        'Enter the class profile folder name (example: 26G):',
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
  app.querySelectorAll('[data-action="link-folder"]').forEach((el) => {
    el.addEventListener('click', async (e) => {
      e.preventDefault()
      try {
        await linkProfilesFolder()
        setState({
          folderLinked: true,
          menuOpen: false,
          statusMessage: 'Profile folder linked. Task saves will write class/flight/task .txt files.',
        })
      } catch (err) {
        setState({
          menuOpen: false,
          statusMessage: err.message || 'Could not link folder.',
        })
      }
    })
  })
  app.querySelectorAll('[data-action="open-class-folder"]').forEach((el) => {
    el.addEventListener('click', async () => {
      try {
        const classId = state.classId || requireClassId()
        if (!classId) {
          setState({ menuOpen: false, statusMessage: 'Set a class profile first.' })
          return
        }
        if (!state.folderLinked) {
          setState({
            menuOpen: false,
            statusMessage: 'Link a profile folder first, then browse the class folder.',
          })
          return
        }
        const browse = await openClassFolder(classId, state.flightId || '')
        setState({
          menuOpen: false,
          returnStep: rememberReturnStep(),
          step: 'folder-browser',
          folderBrowse: browse,
          statusMessage: '',
        })
      } catch (err) {
        setState({
          menuOpen: false,
          statusMessage: err.message || 'Could not browse class folder.',
        })
      }
    })
  })
  app.querySelectorAll('[data-action="download-class-folder"]').forEach((el) => {
    el.addEventListener('click', async () => {
      try {
        const classId = state.classId || requireClassId()
        if (!classId) {
          setState({ menuOpen: false, statusMessage: 'Set a class profile first.' })
          return
        }
        const result = await downloadClassFolderZip(classId)
        setState({
          menuOpen: false,
          statusMessage: `Downloaded PROJX-${result.classId}.zip — open it from your Downloads folder.`,
        })
      } catch (err) {
        setState({
          menuOpen: false,
          statusMessage: err.message || 'Could not download class folder.',
        })
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
  app.querySelectorAll('[data-action="close-folder-browser"]').forEach((el) => {
    el.addEventListener('click', () => {
      const back =
        state.returnStep && state.returnStep !== 'folder-browser'
          ? state.returnStep
          : 'upload'
      setState({ step: back, folderBrowse: null, menuOpen: false })
    })
  })
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
  state.statusMessage = result
    ? `Saved ${result.toUpperCase()} to ${profileFolderHint(classId, state.flightId, task.task)}`
    : `Cleared result for ${task.task}`
  render()
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

async function saveComment() {
  const task = activeTaskRecord()
  if (!task) return
  const classId = requireClassId()
  if (!classId) {
    setState({ statusMessage: 'Set a class profile before saving comments.' })
    return
  }
  const textarea = app.querySelector('#task-comment')
  const text = textarea?.value || ''
  try {
    const record = await addTaskComment(classId, state.flightId, task.task, text)
    state.taskRecord = record
    state.recordCache[cacheKey(task.task)] = record
    state.classId = classId
    state.statusMessage = `Comment saved for ${task.task}`
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

async function clearComments() {
  const task = activeTaskRecord()
  if (!task) return
  const classId = requireClassId()
  if (!classId) {
    setState({ statusMessage: 'Set a class profile first.' })
    return
  }
  const record = await clearTaskComments(classId, state.flightId, task.task)
  state.taskRecord = record
  state.recordCache[cacheKey(task.task)] = record
  state.classId = classId
  state.statusMessage = `Cleared comments for ${task.task}`
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

async function deleteComment(commentId) {
  const task = activeTaskRecord()
  if (!task || !commentId) return
  const classId = requireClassId()
  if (!classId) {
    setState({ statusMessage: 'Set a class profile first.' })
    return
  }
  const record = await removeTaskComment(classId, state.flightId, task.task, commentId)
  state.taskRecord = record
  state.recordCache[cacheKey(task.task)] = record
  state.classId = classId
  state.statusMessage = `Deleted comment for ${task.task}`
  render()
}

function bindTaskActions() {
  app.querySelectorAll('[data-grade]').forEach((el) => {
    el.addEventListener('click', () => saveGrade(el.dataset.grade))
  })
  app.querySelectorAll('[data-record-penalty]').forEach((el) => {
    el.addEventListener('click', () => savePenalty(el.dataset.recordPenalty))
  })
  app.querySelectorAll('[data-action="submit-comment"]').forEach((el) => {
    el.addEventListener('click', () => saveComment())
  })
  app.querySelectorAll('[data-action="clear-penalties"]').forEach((el) => {
    el.addEventListener('click', () => clearPenalties())
  })
  app.querySelectorAll('[data-action="clear-comments"]').forEach((el) => {
    el.addEventListener('click', () => clearComments())
  })
  app.querySelectorAll('[data-delete-penalty]').forEach((el) => {
    el.addEventListener('click', () => deletePenalty(el.dataset.deletePenalty))
  })
  app.querySelectorAll('[data-delete-comment]').forEach((el) => {
    el.addEventListener('click', () => deleteComment(el.dataset.deleteComment))
  })
  app.querySelectorAll('[data-action="finalize-task"]').forEach((el) => {
    el.addEventListener('click', () => finalizeTask())
  })
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
    const result = await downloadFlightBackup(classId, state.flightId)
    state.activeTask = null
    state.taskRecord = null
    state.menuOpen = false
    state.step = 'schedule'
    state.statusMessage = `Backup saved: ${result.filename} (${result.taskCount} task${result.taskCount === 1 ? '' : 's'} for ${result.classId} / flight ${result.flightId}).`
    await preloadFlightRecords()
    render()
  } catch (err) {
    setState({ statusMessage: err.message || 'Could not create backup.' })
  }
}

async function downloadCurrentFlightReport() {
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
  try {
    const result = await downloadFlightReport({
      classId,
      flightId: flight.id,
      displayId: flight.displayId || flight.id,
      squadronName: sq?.name || '',
      squadronUnit: sq?.unit || '',
      phase1: flight.phase1 || [],
      phase2: flight.phase2 || [],
    })
    setState({
      statusMessage: `Downloaded ${result.filename} · ${result.pass} pass / ${result.fail} fail · ${result.penaltyCount} penalties · ${result.commentCount} comments`,
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
    folderBrowse: null,
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
  else if (state.step === 'folder-browser') html = renderFolderBrowser()

  app.innerHTML = `${renderSideMenu()}${html}`

  if (state.step === 'upload') bindUpload(app)
  if (state.step === 'class-profile') bindClassProfile()
  bindChrome()
  if (state.step === 'task') bindTaskActions()

  app.querySelectorAll('[data-action="reset"]').forEach((el) => {
    el.addEventListener('click', resetToUpload)
  })
  app.querySelectorAll('[data-action="start-new-class"]').forEach((el) => {
    el.addEventListener('click', startNewClass)
  })
  app.querySelectorAll('[data-action="back-squadron"]').forEach((el) => {
    el.addEventListener('click', () =>
      setState({
        step: 'squadron',
        squadronId: null,
        flightId: null,
        activeTask: null,
        menuOpen: false,
        taskRecord: null,
      }),
    )
  })
  app.querySelectorAll('[data-action="back-class-profile"]').forEach((el) => {
    el.addEventListener('click', () =>
      setState({
        step: 'class-profile',
        squadronId: null,
        flightId: null,
        activeTask: null,
        menuOpen: false,
      }),
    )
  })
  app.querySelectorAll('[data-action="back-flight"]').forEach((el) => {
    el.addEventListener('click', () =>
      setState({
        step: 'flight',
        flightId: null,
        activeTask: null,
        menuOpen: false,
        taskRecord: null,
      }),
    )
  })
  app.querySelectorAll('[data-action="back-schedule"]').forEach((el) => {
    el.addEventListener('click', async () => {
      state.activeTask = null
      state.taskRecord = null
      state.menuOpen = false
      state.step = 'schedule'
      await preloadFlightRecords()
      render()
    })
  })
  app.querySelectorAll('[data-action="download-flight-report"]').forEach((el) => {
    el.addEventListener('click', () => downloadCurrentFlightReport())
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

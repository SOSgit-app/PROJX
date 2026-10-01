import './style.css'
import { parseProjectXWorkbook } from './parser.js'
import {
  SQUADRONS,
  flightsForSquadron,
  squadronForFlightId,
} from './squadrons.js'
import { findNotetaker, notetakersForVersion } from './notetakers.js'
import { penaltiesForTask } from './penalties.js'
import {
  addTaskComment,
  addTaskPenalty,
  canUseFolderApi,
  getClassId,
  getFolderLinked,
  getTaskRecord,
  linkProfilesFolder,
  profileFolderHint,
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
  folderLinked: getFolderLinked(),
  penaltiesOpen: false,
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
  return state.recordCache[cacheKey(taskCode)]?.result || null
}

function resultLabel(result) {
  if (result === 'pass') return 'Pass'
  if (result === 'fail') return 'Fail'
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
    penaltiesOpen: false,
  })
}

function closeResources() {
  const back =
    state.returnStep && !isResourceStep(state.returnStep)
      ? state.returnStep
      : 'upload'
  setState({
    step: back,
    resourceVersion: null,
    resourceCode: null,
    menuOpen: false,
  })
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
    penaltiesOpen: false,
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
    requireClassId()
    setState({
      workbook,
      fileName: file.name,
      error: '',
      step: 'squadron',
      squadronId: null,
      flightId: null,
      activeTask: null,
      menuOpen: false,
      resourceVersion: null,
      resourceCode: null,
      returnStep: 'squadron',
      classId: getClassId(),
      penaltiesOpen: false,
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
        <p class="title">Project X</p>
      </div>
      <div class="nav-actions">${classChip}${extraActions}</div>
    </header>
  `
}

function renderSideMenu() {
  const open = state.menuOpen
  return `
    <button
      type="button"
      class="menu-toggle${open ? ' is-open' : ''}"
      data-action="toggle-menu"
      aria-expanded="${open ? 'true' : 'false'}"
      aria-controls="side-menu"
      aria-label="${open ? 'Close menu' : 'Open menu'}"
    >
      <span></span><span></span><span></span>
    </button>
    <div class="menu-backdrop${open ? ' is-open' : ''}" data-action="close-menu" ${open ? '' : 'hidden'}></div>
    <aside id="side-menu" class="side-menu${open ? ' is-open' : ''}" aria-hidden="${open ? 'false' : 'true'}">
      <div class="side-menu-head">
        <p class="side-menu-kicker">Instructor tools</p>
        <h2>Menu</h2>
        <button type="button" class="btn side-menu-close" data-action="close-menu">Close</button>
      </div>
      <nav class="side-menu-nav" aria-label="Resources">
        <p class="side-menu-section">Class profile</p>
        <button type="button" class="side-menu-link" data-action="set-class">
          <span class="side-menu-link-title">${state.classId ? escapeHtml(state.classId) : 'Set class'}</span>
          <span class="side-menu-link-meta">Folder name like 26G</span>
        </button>
        <button type="button" class="side-menu-link" data-action="link-folder" ${canUseFolderApi() ? '' : 'disabled'}>
          <span class="side-menu-link-title">${state.folderLinked ? 'Folder linked' : 'Link profile folder'}</span>
          <span class="side-menu-link-meta">${canUseFolderApi() ? 'Writes class/flight/task files on this device' : 'Use Chrome/Edge to link a folder'}</span>
        </button>
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
  return `
    <div class="shell">
      ${topBar('')}
      <section class="hero">
        <div class="hero-copy">
          <span class="eyebrow" style="color:var(--af-gold);font-family:var(--font-display);letter-spacing:.22em;text-transform:uppercase;font-size:.8rem;font-weight:600">United States Air Force</span>
          <h1>Project X</h1>
          <p class="lede">Upload the SOS flight matrix, grade Pass/Fail, log task penalties and comments into a class profile folder (example: 26G / flight / task).</p>
          <div class="hero-meta">
            <span>Phase I · Day 1</span>
            <span>Phase II · Day 2</span>
            <span>Instructor View</span>
          </div>
        </div>
        <div class="upload-panel">
          <div
            class="upload-zone"
            id="upload-zone"
            role="button"
            tabindex="0"
            aria-label="Upload Project X Excel workbook"
          >
            <h2>Upload Data Entry Matrix</h2>
            <p class="upload-hint-desktop">Drop the SOS .xlsx here, or tap to browse</p>
            <p class="upload-hint-mobile">Tap to choose the SOS .xlsx from your device</p>
            <input id="file-input" type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" />
          </div>
          ${state.error ? `<p class="error" role="alert">${escapeHtml(state.error)}</p>` : ''}
        </div>
      </section>
      <p class="footer-note">Reads the “Data Entry Matrix” sheet · Use the menu to set class profile and open Version A/B TASK Resources</p>
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
        <span class="eyebrow" style="color:var(--af-gold);font-family:var(--font-display);letter-spacing:.22em;text-transform:uppercase;font-size:.8rem;font-weight:600">Step 2</span>
        <h1>Select your squadron</h1>
        <p>Choose the student squadron you are instructing. Only squadrons present in the uploaded matrix are selectable.</p>
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
        <p>Select the flight you will instruct. Task data saves under ${escapeHtml(state.classId || '{class}')} / flight / task.</p>
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
          <p class="sub">Tap a task to grade, log penalties, and add comments.</p>
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
            <p class="sub">Order ${task.order ?? '—'} · Saves to ${escapeHtml(folderPath)}</p>
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
            <button type="button" class="btn btn-penalty" data-action="toggle-penalties">
              ${state.penaltiesOpen ? 'Close penalties' : 'Penalties'}
            </button>
            ${
              state.penaltiesOpen
                ? `<div class="penalty-list" role="list">
                    ${
                      penaltyOptions.length
                        ? penaltyOptions
                            .map(
                              (p, i) => `
                      <button type="button" class="penalty-option" data-record-penalty="${i}" role="listitem">
                        ${escapeHtml(p)}
                      </button>`,
                            )
                            .join('')
                        : '<p class="empty-phase">No penalty list found for this task code.</p>'
                    }
                  </div>`
                : ''
            }
            ${
              recordedPenalties.length
                ? `<ul class="recorded-list">
                    ${recordedPenalties
                      .map(
                        (p) => `<li><strong>Penalty</strong> · ${escapeHtml(p.text)}<span>${escapeHtml(formatWhen(p.recordedAt))}</span></li>`,
                      )
                      .join('')}
                  </ul>`
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
                        (c) => `<li><strong>Comment</strong> · ${escapeHtml(c.text)}<span>${escapeHtml(formatWhen(c.recordedAt))}</span></li>`,
                      )
                      .join('')}
                  </ul>`
                : ''
            }
          </div>

          ${
            note
              ? `<button type="button" class="btn btn-resource" data-open-notetaker="${note.code}">Open TASK Resource</button>`
              : ''
          }
          ${state.statusMessage ? `<p class="status-message">${escapeHtml(state.statusMessage)}</p>` : ''}
        </div>
      </div>
    </div>
  `
}

function renderResourcesList() {
  const version = String(state.resourceVersion || 'A').toUpperCase()
  const items = notetakersForVersion(version)
  const actions = `<button type="button" class="btn" data-action="close-resources">Back</button>`
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
  const actions = `
    <button type="button" class="btn" data-action="back-resources-list">Task list</button>
    <button type="button" class="btn" data-action="close-resources">Exit resources</button>
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
    el.addEventListener('click', async () => {
      try {
        await linkProfilesFolder()
        setState({
          folderLinked: true,
          menuOpen: false,
          statusMessage: 'Profile folder linked. Task saves will write class/flight/task files.',
        })
      } catch (err) {
        setState({
          menuOpen: false,
          statusMessage: err.message || 'Could not link folder.',
        })
      }
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
  state.penaltiesOpen = false
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
  const text = options[Number(index)]
  if (!text) return
  const record = await addTaskPenalty(classId, state.flightId, task.task, text)
  state.taskRecord = record
  state.recordCache[cacheKey(task.task)] = record
  state.classId = classId
  state.penaltiesOpen = false
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

function bindTaskActions() {
  app.querySelectorAll('[data-grade]').forEach((el) => {
    el.addEventListener('click', () => saveGrade(el.dataset.grade))
  })
  app.querySelectorAll('[data-action="toggle-penalties"]').forEach((el) => {
    el.addEventListener('click', () =>
      setState({ penaltiesOpen: !state.penaltiesOpen, statusMessage: '' }),
    )
  })
  app.querySelectorAll('[data-record-penalty]').forEach((el) => {
    el.addEventListener('click', () => savePenalty(el.dataset.recordPenalty))
  })
  app.querySelectorAll('[data-action="submit-comment"]').forEach((el) => {
    el.addEventListener('click', () => saveComment())
  })
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
  else if (state.step === 'squadron') html = renderSquadron()
  else if (state.step === 'flight') html = renderFlight()
  else if (state.step === 'schedule') html = renderSchedule()
  else if (state.step === 'task') html = renderTask()
  else if (state.step === 'resources-list') html = renderResourcesList()
  else if (state.step === 'resources-view') html = renderResourcesView()

  app.innerHTML = `${renderSideMenu()}${html}`

  if (state.step === 'upload') bindUpload(app)
  bindChrome()
  if (state.step === 'task') bindTaskActions()

  app.querySelectorAll('[data-action="reset"]').forEach((el) => {
    el.addEventListener('click', resetToUpload)
  })
  app.querySelectorAll('[data-action="back-squadron"]').forEach((el) => {
    el.addEventListener('click', () =>
      setState({
        step: 'squadron',
        squadronId: null,
        flightId: null,
        activeTask: null,
        menuOpen: false,
        penaltiesOpen: false,
        taskRecord: null,
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
        penaltiesOpen: false,
        taskRecord: null,
      }),
    )
  })
  app.querySelectorAll('[data-action="back-schedule"]').forEach((el) => {
    el.addEventListener('click', async () => {
      state.activeTask = null
      state.penaltiesOpen = false
      state.taskRecord = null
      state.menuOpen = false
      state.step = 'schedule'
      await preloadFlightRecords()
      render()
    })
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
      state.penaltiesOpen = false
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
      state.penaltiesOpen = false
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
  } else if (e.key === 'Escape' && state.penaltiesOpen) {
    setState({ penaltiesOpen: false })
  }
})

render()

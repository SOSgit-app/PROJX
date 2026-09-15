import './style.css'
import { parseProjectXWorkbook } from './parser.js'
import {
  SQUADRONS,
  flightsForSquadron,
  squadronForFlightId,
} from './squadrons.js'
import {
  getTaskResult,
  resultLabel,
  setTaskResult,
  taskResultKey,
} from './results.js'

const state = {
  step: 'upload', // upload | squadron | flight | schedule | task
  workbook: null,
  fileName: '',
  squadronId: null,
  flightId: null,
  activeTask: null, // { phase: 'phase1'|'phase2', index: number }
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

function resultKeyFor(task, phase = task.phase) {
  return taskResultKey(state.fileName, state.flightId, phase, task.column, task.task)
}

function currentResult(task, phase) {
  return getTaskResult(resultKeyFor(task, phase))?.result || null
}

function resetToUpload() {
  setState({
    step: 'upload',
    workbook: null,
    fileName: '',
    squadronId: null,
    flightId: null,
    activeTask: null,
    error: '',
  })
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
    setState({
      workbook,
      fileName: file.name,
      error: '',
      step: 'squadron',
      squadronId: null,
      flightId: null,
      activeTask: null,
    })
  } catch (err) {
    console.error(err)
    setState({
      error: err.message || 'Could not read that workbook.',
      workbook: null,
      step: 'upload',
      activeTask: null,
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
  return `
    <header class="topbar">
      <div class="brand-mark">
        <span class="eyebrow">Squadron Officer School</span>
        <p class="title">Project X</p>
      </div>
      <div class="nav-actions">${extraActions}</div>
    </header>
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
          <p class="lede">Upload the SOS flight matrix, select your squadron and flight, then grade each Phase I and Phase II task as Pass or Fail.</p>
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
      <p class="footer-note">Reads the “Data Entry Matrix” sheet · Columns B–K Phase I · Columns M–V Phase II</p>
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
        <p>Select the flight you will instruct. Open each task to mark Pass or Fail.</p>
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
          const result = currentResult(t, phase)
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

function phaseProgress(tasks, phase) {
  if (!tasks?.length) return ''
  let pass = 0
  let fail = 0
  for (const t of tasks) {
    const r = currentResult(t, phase)
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
          <p class="sub">Tap a task to open it and mark Pass or Fail. Results stay on this device.</p>
        </div>
      </div>

      <section class="phase-block">
        <header>
          <div>
            <h2>Phase I</h2>
            ${phaseProgress(flight.phase1, 'phase1')}
          </div>
          <span class="day">Day 1</span>
        </header>
        ${renderTaskRail(flight.phase1, 'phase1')}
      </section>

      <section class="phase-block">
        <header>
          <div>
            <h2>Phase II</h2>
            ${phaseProgress(flight.phase2, 'phase2')}
          </div>
          <span class="day">Day 2</span>
        </header>
        ${renderTaskRail(flight.phase2, 'phase2')}
      </section>
    </div>
  `
}

function renderTask() {
  const sq = selectedSquadron() || squadronForFlightId(state.flightId)
  const flight = selectedFlight()
  const task = activeTaskRecord()
  if (!task || !flight || !sq) {
    return renderSchedule()
  }

  const result = currentResult(task, task.phase)
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
            <p class="sub">Order ${task.order ?? '—'} in the flight schedule</p>
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
        </div>
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

function render() {
  let html = ''
  if (state.step === 'upload') html = renderUpload()
  else if (state.step === 'squadron') html = renderSquadron()
  else if (state.step === 'flight') html = renderFlight()
  else if (state.step === 'schedule') html = renderSchedule()
  else if (state.step === 'task') html = renderTask()

  app.innerHTML = html

  if (state.step === 'upload') bindUpload(app)

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
      }),
    )
  })
  app.querySelectorAll('[data-action="back-flight"]').forEach((el) => {
    el.addEventListener('click', () =>
      setState({ step: 'flight', flightId: null, activeTask: null }),
    )
  })
  app.querySelectorAll('[data-action="back-schedule"]').forEach((el) => {
    el.addEventListener('click', () =>
      setState({ step: 'schedule', activeTask: null }),
    )
  })
  app.querySelectorAll('[data-squadron]').forEach((el) => {
    el.addEventListener('click', () => {
      if (el.disabled) return
      setState({
        step: 'flight',
        squadronId: el.dataset.squadron,
        flightId: null,
        activeTask: null,
      })
    })
  })
  app.querySelectorAll('[data-flight]').forEach((el) => {
    el.addEventListener('click', () => {
      setState({ step: 'schedule', flightId: el.dataset.flight, activeTask: null })
    })
  })
  app.querySelectorAll('[data-open-task]').forEach((el) => {
    el.addEventListener('click', () => {
      const [phase, indexRaw] = String(el.dataset.openTask).split(':')
      const index = Number(indexRaw)
      if (!phase || Number.isNaN(index)) return
      setState({
        step: 'task',
        activeTask: { phase, index },
      })
    })
  })
  app.querySelectorAll('[data-grade]').forEach((el) => {
    el.addEventListener('click', () => {
      const task = activeTaskRecord()
      if (!task) return
      const action = el.dataset.grade
      const key = resultKeyFor(task, task.phase)
      if (action === 'clear') setTaskResult(key, null)
      else if (action === 'pass' || action === 'fail') setTaskResult(key, action)
      render()
    })
  })
}

render()

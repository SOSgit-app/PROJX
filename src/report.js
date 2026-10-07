import * as XLSX from 'xlsx'
import { formatDuration, getFlightStudents, listFlightRecords, normalizeResult } from './profile.js'
import {
  RUBRIC_CRITERIA,
  normalizeRubric,
  rubricLevelLabel,
} from './rubric.js'

/**
 * Build and download an organized flight scoring report (.xlsx).
 * Sheets: Summary | Task Scores | Rubric | Penalties | Student Comments | Operational Comments
 * @param {'1'|'2'} phase - which phase to include
 */
export async function downloadFlightReport({
  classId,
  flightId,
  displayId,
  squadronName,
  squadronUnit,
  phase1 = [],
  phase2 = [],
  phase = '1',
}) {
  const cls = String(classId || '').trim().toUpperCase()
  const flt = String(flightId || '').trim().toUpperCase()
  if (!cls) throw new Error('Set a class profile before downloading a report.')
  if (!flt) throw new Error('Select a flight before downloading a report.')

  const phaseKey = String(phase) === '2' ? '2' : '1'
  const phaseLabel = phaseKey === '2' ? 'Phase II' : 'Phase I'
  const dayLabel = phaseKey === '2' ? 'Day 2' : 'Day 1'
  const phaseTasks = phaseKey === '2' ? phase2 : phase1

  const stored = await listFlightRecords(cls, flt)
  const byTask = new Map(
    stored.map((r) => [String(r.taskCode || '').toUpperCase(), r]),
  )

  const tasks = phaseTasks.map((t, i) => ({
    ...t,
    phase: phaseLabel,
    day: dayLabel,
    sort: i,
  }))

  tasks.sort((a, b) => a.sort - b.sort || String(a.task).localeCompare(String(b.task)))

  let complete = 0
  let incomplete = 0
  let ungraded = 0
  let penaltyCount = 0
  let studentCommentCount = 0
  let operationalCommentCount = 0
  let rubricMarkCount = 0
  let tasksWithRubric = 0
  let totalDurationMs = 0
  let timedTasks = 0

  const phaseStats = {
    total: 0,
    complete: 0,
    incomplete: 0,
    ungraded: 0,
  }

  const scoreRows = [
    [
      'Phase',
      'Day',
      'Order',
      'Task',
      'Result',
      'Duration',
      'Communication',
      'Decision-Making',
      'Leadership',
      'Debrief',
      'Penalties',
      'Student Comments',
      'Operational Comments',
      'Last Updated',
    ],
  ]
  const rubricRows = [
    ['Phase', 'Day', 'Order', 'Task', 'Result', 'Criterion', 'Level', 'Last Updated'],
  ]
  const penaltyRows = [
    ['Phase', 'Day', 'Order', 'Task', 'Result', 'Penalty', 'Recorded At'],
  ]
  const studentRows = [
    [
      'Phase',
      'Day',
      'Order',
      'Task',
      'Result',
      'Student',
      'Student Related Comment',
      'Recorded At',
    ],
  ]
  const operationalRows = [
    [
      'Phase',
      'Day',
      'Order',
      'Task',
      'Result',
      'Operational/Equipment Comment',
      'Recorded At',
    ],
  ]

  for (const t of tasks) {
    const record = byTask.get(String(t.task).toUpperCase())
    const result = normalizeResult(record?.result)
    const resultLabel =
      result === 'complete'
        ? 'Complete'
        : result === 'incomplete'
          ? 'Incomplete'
          : 'Not graded'

    const stats = phaseStats
    stats.total += 1
    if (result === 'complete') {
      complete += 1
      stats.complete += 1
    } else if (result === 'incomplete') {
      incomplete += 1
      stats.incomplete += 1
    } else {
      ungraded += 1
      stats.ungraded += 1
    }

    const penalties = Array.isArray(record?.penalties) ? record.penalties : []
    const studentComments = Array.isArray(record?.studentComments)
      ? record.studentComments
      : Array.isArray(record?.comments)
        ? record.comments
        : []
    const operationalComments = Array.isArray(record?.operationalComments)
      ? record.operationalComments
      : []
    penaltyCount += penalties.length
    studentCommentCount += studentComments.length
    operationalCommentCount += operationalComments.length

    const durationMs = record?.durationMs
    if (typeof durationMs === 'number' && Number.isFinite(durationMs)) {
      totalDurationMs += durationMs
      timedTasks += 1
    }

    const rubric = normalizeRubric(record?.rubric)
    const rubricMarks = RUBRIC_CRITERIA.map((c) => ({
      criterion: c.label,
      levelId: rubric[c.id],
      level: rubricLevelLabel(rubric[c.id]) || '',
    })).filter((m) => m.levelId)
    rubricMarkCount += rubricMarks.length
    if (rubricMarks.length) tasksWithRubric += 1

    scoreRows.push([
      t.phase,
      t.day,
      t.order ?? '',
      t.task,
      resultLabel,
      formatDuration(durationMs),
      ...RUBRIC_CRITERIA.map((c) => rubricLevelLabel(rubric[c.id]) || ''),
      penalties.length,
      studentComments.length,
      operationalComments.length,
      formatStamp(record?.updatedAt),
    ])

    for (const mark of rubricMarks) {
      rubricRows.push([
        t.phase,
        t.day,
        t.order ?? '',
        t.task,
        resultLabel,
        mark.criterion,
        mark.level,
        formatStamp(record?.updatedAt),
      ])
    }

    for (const p of penalties) {
      penaltyRows.push([
        t.phase,
        t.day,
        t.order ?? '',
        t.task,
        resultLabel,
        p.text || '',
        formatStamp(p.recordedAt),
      ])
    }

    for (const c of studentComments) {
      studentRows.push([
        t.phase,
        t.day,
        t.order ?? '',
        t.task,
        resultLabel,
        c.studentName || '',
        c.text || '',
        formatStamp(c.recordedAt),
      ])
    }

    for (const c of operationalComments) {
      operationalRows.push([
        t.phase,
        t.day,
        t.order ?? '',
        t.task,
        resultLabel,
        c.text || '',
        formatStamp(c.recordedAt),
      ])
    }
  }

  if (rubricRows.length === 1) {
    rubricRows.push(['—', '—', '', '', '', 'No rubric marks recorded', '', ''])
  }
  if (penaltyRows.length === 1) {
    penaltyRows.push(['—', '—', '', '', '', 'No penalties recorded', ''])
  }
  if (studentRows.length === 1) {
    studentRows.push(['—', '—', '', '', '', '', 'No student comments recorded', ''])
  }
  if (operationalRows.length === 1) {
    operationalRows.push([
      '—',
      '—',
      '',
      '',
      '',
      'No operational/equipment comments recorded',
      '',
    ])
  }

  const roster = getFlightStudents(cls, flt)
  const rosterRows = [['#', 'Student Name']]
  if (roster.length) {
    roster.forEach((s, i) => rosterRows.push([i + 1, s.name]))
  } else {
    rosterRows.push(['', 'No student names entered'])
  }

  const exportedAt = new Date()
  const summaryRows = [
    ['PROJX Flight Report'],
    [],
    ['Class', cls],
    ['Flight', displayId || flt],
    ['Flight ID', flt],
    ['Squadron', squadronName || ''],
    ['Unit', squadronUnit || ''],
    ['Phase', `${phaseLabel} · ${dayLabel}`],
    ['Exported', exportedAt.toLocaleString()],
    [],
    ['Flight students'],
    [
      'Names',
      roster.length ? roster.map((s) => s.name).join(', ') : 'None entered',
    ],
    ['Student count', roster.length],
    [],
    ['Totals'],
    [
      phaseLabel,
      `${phaseStats.complete} complete · ${phaseStats.incomplete} incomplete · ${phaseStats.ungraded} not graded · ${phaseStats.total} tasks`,
    ],
    ['Tasks', tasks.length],
    ['Complete', complete],
    ['Incomplete', incomplete],
    ['Not graded', ungraded],
    ['Penalty entries', penaltyCount],
    ['Student comments', studentCommentCount],
    ['Operational/equipment comments', operationalCommentCount],
    ['Tasks with rubric marks', tasksWithRubric],
    ['Rubric marks', rubricMarkCount],
    ['Timed tasks', timedTasks],
    ['Total timed duration', formatDuration(totalDurationMs)],
    [],
    ['Sheets'],
    [
      'Task Scores',
      'One row per task with result, duration, rubric levels, and counts',
    ],
    ['Rubric', 'One row per criterion mark (Communication, Decision-Making, Leadership, Debrief)'],
    ['Penalties', 'One row per recorded penalty'],
    ['Students', 'Flight roster names'],
    ['Student Comments', 'Student related comments (optional student tagged)'],
    ['Operational Comments', 'Operational/equipment comments'],
  ]

  const wb = XLSX.utils.book_new()
  const summary = XLSX.utils.aoa_to_sheet(summaryRows)
  summary['!cols'] = [{ wch: 28 }, { wch: 72 }]
  XLSX.utils.book_append_sheet(wb, summary, 'Summary')

  const scores = XLSX.utils.aoa_to_sheet(scoreRows)
  scores['!cols'] = colWidths([10, 8, 8, 10, 12, 10, 14, 16, 12, 12, 10, 16, 18, 22])
  XLSX.utils.book_append_sheet(wb, scores, 'Task Scores')

  const rubricSheet = XLSX.utils.aoa_to_sheet(rubricRows)
  rubricSheet['!cols'] = colWidths([10, 8, 8, 10, 12, 18, 18, 22])
  XLSX.utils.book_append_sheet(wb, rubricSheet, 'Rubric')

  const penaltiesSheet = XLSX.utils.aoa_to_sheet(penaltyRows)
  penaltiesSheet['!cols'] = colWidths([10, 8, 8, 10, 12, 70, 22])
  XLSX.utils.book_append_sheet(wb, penaltiesSheet, 'Penalties')

  const rosterSheet = XLSX.utils.aoa_to_sheet(rosterRows)
  rosterSheet['!cols'] = colWidths([6, 36])
  XLSX.utils.book_append_sheet(wb, rosterSheet, 'Students')

  const studentSheet = XLSX.utils.aoa_to_sheet(studentRows)
  studentSheet['!cols'] = colWidths([10, 8, 8, 10, 12, 18, 70, 22])
  XLSX.utils.book_append_sheet(wb, studentSheet, 'Student Comments')

  const operationalSheet = XLSX.utils.aoa_to_sheet(operationalRows)
  operationalSheet['!cols'] = colWidths([10, 8, 8, 10, 12, 70, 22])
  XLSX.utils.book_append_sheet(wb, operationalSheet, 'Operational Comments')

  const stamp = exportedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const phaseFile = phaseKey === '2' ? 'PhaseII' : 'PhaseI'
  const filename = `PROJX-${cls}-Flight${flt}-${phaseFile}-Report-${stamp}.xlsx`
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)

  return {
    classId: cls,
    flightId: flt,
    phase: phaseLabel,
    filename,
    taskCount: tasks.length,
    complete,
    incomplete,
    penaltyCount,
    rubricMarkCount,
    commentCount: studentCommentCount + operationalCommentCount,
  }
}

function formatStamp(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return String(iso)
  }
}

function colWidths(widths) {
  return widths.map((wch) => ({ wch }))
}

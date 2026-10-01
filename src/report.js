import * as XLSX from 'xlsx'
import { formatDuration, listFlightRecords, normalizeResult } from './profile.js'

/**
 * Build and download an organized flight scoring report (.xlsx).
 * Sheets: Summary | Task Scores | Penalties | Student Comments | Operational Comments
 */
export async function downloadFlightReport({
  classId,
  flightId,
  displayId,
  squadronName,
  squadronUnit,
  phase1 = [],
  phase2 = [],
}) {
  const cls = String(classId || '').trim().toUpperCase()
  const flt = String(flightId || '').trim().toUpperCase()
  if (!cls) throw new Error('Set a class profile before downloading a report.')
  if (!flt) throw new Error('Select a flight before downloading a report.')

  const stored = await listFlightRecords(cls, flt)
  const byTask = new Map(
    stored.map((r) => [String(r.taskCode || '').toUpperCase(), r]),
  )

  const tasks = [
    ...phase1.map((t, i) => ({
      ...t,
      phase: 'Phase I',
      day: 'Day 1',
      sort: i,
    })),
    ...phase2.map((t, i) => ({
      ...t,
      phase: 'Phase II',
      day: 'Day 2',
      sort: 100 + i,
    })),
  ]

  for (const record of stored) {
    const code = String(record.taskCode || '').toUpperCase()
    if (!code || tasks.some((t) => t.task === code)) continue
    tasks.push({
      order: null,
      task: code,
      phase: 'Other',
      day: '',
      sort: 200,
    })
  }

  tasks.sort((a, b) => a.sort - b.sort || String(a.task).localeCompare(String(b.task)))

  let complete = 0
  let incomplete = 0
  let ungraded = 0
  let penaltyCount = 0
  let studentCommentCount = 0
  let operationalCommentCount = 0
  let totalDurationMs = 0
  let timedTasks = 0

  const phaseStats = {
    'Phase I': { total: 0, complete: 0, incomplete: 0, ungraded: 0 },
    'Phase II': { total: 0, complete: 0, incomplete: 0, ungraded: 0 },
    Other: { total: 0, complete: 0, incomplete: 0, ungraded: 0 },
  }

  const scoreRows = [
    [
      'Phase',
      'Day',
      'Order',
      'Task',
      'Result',
      'Duration',
      'Penalties',
      'Student Comments',
      'Operational Comments',
      'Last Updated',
    ],
  ]
  const penaltyRows = [
    ['Phase', 'Day', 'Order', 'Task', 'Result', 'Penalty', 'Recorded At'],
  ]
  const studentRows = [
    ['Phase', 'Day', 'Order', 'Task', 'Result', 'Student Related Comment', 'Recorded At'],
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

    const stats = phaseStats[t.phase] || phaseStats.Other
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

    scoreRows.push([
      t.phase,
      t.day,
      t.order ?? '',
      t.task,
      resultLabel,
      formatDuration(durationMs),
      penalties.length,
      studentComments.length,
      operationalComments.length,
      formatStamp(record?.updatedAt),
    ])

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

  if (penaltyRows.length === 1) {
    penaltyRows.push(['—', '—', '', '', '', 'No penalties recorded', ''])
  }
  if (studentRows.length === 1) {
    studentRows.push(['—', '—', '', '', '', 'No student comments recorded', ''])
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

  const exportedAt = new Date()
  const p1 = phaseStats['Phase I']
  const p2 = phaseStats['Phase II']
  const summaryRows = [
    ['PROJX Flight Report'],
    [],
    ['Class', cls],
    ['Flight', displayId || flt],
    ['Flight ID', flt],
    ['Squadron', squadronName || ''],
    ['Unit', squadronUnit || ''],
    ['Exported', exportedAt.toLocaleString()],
    [],
    ['Phase'],
    [
      'Phase I',
      `${p1.complete} complete · ${p1.incomplete} incomplete · ${p1.ungraded} not graded · ${p1.total} tasks`,
    ],
    [
      'Phase II',
      `${p2.complete} complete · ${p2.incomplete} incomplete · ${p2.ungraded} not graded · ${p2.total} tasks`,
    ],
    [],
    ['Totals'],
    ['Tasks', tasks.length],
    ['Complete', complete],
    ['Incomplete', incomplete],
    ['Not graded', ungraded],
    ['Penalty entries', penaltyCount],
    ['Student comments', studentCommentCount],
    ['Operational/equipment comments', operationalCommentCount],
    ['Timed tasks', timedTasks],
    ['Total timed duration', formatDuration(totalDurationMs)],
    [],
    ['Sheets'],
    ['Task Scores', 'One row per task with result, duration, and counts'],
    ['Penalties', 'One row per recorded penalty'],
    ['Student Comments', 'Student related comments'],
    ['Operational Comments', 'Operational/equipment comments'],
  ]

  const wb = XLSX.utils.book_new()
  const summary = XLSX.utils.aoa_to_sheet(summaryRows)
  summary['!cols'] = [{ wch: 28 }, { wch: 72 }]
  XLSX.utils.book_append_sheet(wb, summary, 'Summary')

  const scores = XLSX.utils.aoa_to_sheet(scoreRows)
  scores['!cols'] = colWidths([10, 8, 8, 10, 12, 10, 10, 16, 18, 22])
  XLSX.utils.book_append_sheet(wb, scores, 'Task Scores')

  const penaltiesSheet = XLSX.utils.aoa_to_sheet(penaltyRows)
  penaltiesSheet['!cols'] = colWidths([10, 8, 8, 10, 12, 70, 22])
  XLSX.utils.book_append_sheet(wb, penaltiesSheet, 'Penalties')

  const studentSheet = XLSX.utils.aoa_to_sheet(studentRows)
  studentSheet['!cols'] = colWidths([10, 8, 8, 10, 12, 70, 22])
  XLSX.utils.book_append_sheet(wb, studentSheet, 'Student Comments')

  const operationalSheet = XLSX.utils.aoa_to_sheet(operationalRows)
  operationalSheet['!cols'] = colWidths([10, 8, 8, 10, 12, 70, 22])
  XLSX.utils.book_append_sheet(wb, operationalSheet, 'Operational Comments')

  const stamp = exportedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `PROJX-${cls}-Flight${flt}-Report-${stamp}.xlsx`
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
    filename,
    taskCount: tasks.length,
    complete,
    incomplete,
    penaltyCount,
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

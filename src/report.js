import * as XLSX from 'xlsx'
import { listFlightRecords } from './profile.js'

/**
 * Build and download an organized flight scoring report (.xlsx).
 * Sheets: Summary | Task Scores | Penalties | Comments
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

  // Include any stored tasks not on the uploaded schedule
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

  let pass = 0
  let fail = 0
  let ungraded = 0
  let penaltyCount = 0
  let commentCount = 0

  const scoreRows = [
    [
      'Phase',
      'Day',
      'Order',
      'Task',
      'Result',
      'Penalties',
      'Comments',
      'Last Updated',
    ],
  ]
  const penaltyRows = [
    ['Phase', 'Day', 'Order', 'Task', 'Result', 'Penalty', 'Recorded At'],
  ]
  const commentRows = [
    ['Phase', 'Day', 'Order', 'Task', 'Result', 'Comment', 'Recorded At'],
  ]

  for (const t of tasks) {
    const record = byTask.get(String(t.task).toUpperCase())
    const result = record?.result || ''
    const resultLabel =
      result === 'pass' ? 'Pass' : result === 'fail' ? 'Fail' : 'Not graded'
    if (result === 'pass') pass += 1
    else if (result === 'fail') fail += 1
    else ungraded += 1

    const penalties = Array.isArray(record?.penalties) ? record.penalties : []
    const comments = Array.isArray(record?.comments) ? record.comments : []
    penaltyCount += penalties.length
    commentCount += comments.length

    scoreRows.push([
      t.phase,
      t.day,
      t.order ?? '',
      t.task,
      resultLabel,
      penalties.length,
      comments.length,
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

    for (const c of comments) {
      commentRows.push([
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
  if (commentRows.length === 1) {
    commentRows.push(['—', '—', '', '', '', 'No comments recorded', ''])
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
    ['Exported', exportedAt.toLocaleString()],
    [],
    ['Totals'],
    ['Tasks', tasks.length],
    ['Pass', pass],
    ['Fail', fail],
    ['Not graded', ungraded],
    ['Penalty entries', penaltyCount],
    ['Comment entries', commentCount],
    [],
    ['Sheets'],
    ['Task Scores', 'One row per task with Pass/Fail and counts'],
    ['Penalties', 'One row per recorded penalty'],
    ['Comments', 'One row per recorded comment'],
  ]

  const wb = XLSX.utils.book_new()
  const summary = XLSX.utils.aoa_to_sheet(summaryRows)
  summary['!cols'] = [{ wch: 18 }, { wch: 56 }]
  XLSX.utils.book_append_sheet(wb, summary, 'Summary')

  const scores = XLSX.utils.aoa_to_sheet(scoreRows)
  scores['!cols'] = colWidths([10, 8, 8, 10, 12, 10, 10, 22])
  XLSX.utils.book_append_sheet(wb, scores, 'Task Scores')

  const penaltiesSheet = XLSX.utils.aoa_to_sheet(penaltyRows)
  penaltiesSheet['!cols'] = colWidths([10, 8, 8, 10, 12, 70, 22])
  XLSX.utils.book_append_sheet(wb, penaltiesSheet, 'Penalties')

  const commentsSheet = XLSX.utils.aoa_to_sheet(commentRows)
  commentsSheet['!cols'] = colWidths([10, 8, 8, 10, 12, 70, 22])
  XLSX.utils.book_append_sheet(wb, commentsSheet, 'Comments')

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
    pass,
    fail,
    penaltyCount,
    commentCount,
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

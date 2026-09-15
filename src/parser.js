import * as XLSX from 'xlsx'

const PHASE1_COLS = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']
const PHASE2_COLS = ['M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V']

function colIndex(letter) {
  let n = 0
  for (const ch of letter.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64)
  }
  return n - 1
}

function cell(sheet, row, colLetter) {
  const ref = `${colLetter}${row}`
  const cell = sheet[ref]
  if (!cell || cell.v == null || cell.v === '') return null
  return cell.v
}

function normalizeFlightId(raw) {
  if (raw == null) return null
  let text = String(raw).trim()
  if (!text) return null
  // Skip notes / non-flight rows
  if (!/^[A-Za-z]\d/.test(text)) return null
  const flagged = text.endsWith('*')
  if (flagged) text = text.slice(0, -1).trim()
  return { id: text.toUpperCase(), flagged }
}

function readPhaseTasks(sheet, row, cols) {
  return cols
    .map((col) => {
      const orderRaw = cell(sheet, 3, col)
      const taskRaw = cell(sheet, row, col)
      if (taskRaw == null || String(taskRaw).trim() === '') return null
      const order =
        orderRaw != null && !Number.isNaN(Number(orderRaw))
          ? Number(orderRaw)
          : null
      return {
        order,
        task: String(taskRaw).trim().toUpperCase(),
        column: col,
      }
    })
    .filter(Boolean)
}

/**
 * Parse SOS Project X workbook. Reads the "Data Entry Matrix" sheet:
 * - Col A: flight IDs
 * - Row 3: task order numbers
 * - Cols B–K: Phase I tasks
 * - Cols M–V: Phase II tasks
 */
export function parseProjectXWorkbook(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const sheetName =
    workbook.SheetNames.find((n) => /data\s*entry\s*matrix/i.test(n)) ||
    workbook.SheetNames[0]

  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    throw new Error('Could not find the Data Entry Matrix sheet.')
  }

  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
  const flights = []

  for (let r = 3; r <= range.e.r; r++) {
    const rowNum = r + 1 // 1-based Excel row
    const flightRaw = cell(sheet, rowNum, 'A')
    const parsed = normalizeFlightId(flightRaw)
    if (!parsed) continue

    flights.push({
      id: parsed.id,
      flagged: parsed.flagged,
      displayId: parsed.flagged ? `${parsed.id}*` : parsed.id,
      phase1: readPhaseTasks(sheet, rowNum, PHASE1_COLS),
      phase2: readPhaseTasks(sheet, rowNum, PHASE2_COLS),
    })
  }

  if (!flights.length) {
    throw new Error(
      'No flight rows found. Confirm you uploaded the SOS Project X workbook with a Data Entry Matrix sheet.',
    )
  }

  // Stable sort by letter then number
  flights.sort((a, b) => {
    const la = a.id.charAt(0)
    const lb = b.id.charAt(0)
    if (la !== lb) return la.localeCompare(lb)
    return parseInt(a.id.slice(1), 10) - parseInt(b.id.slice(1), 10)
  })

  return {
    sheetName,
    fileLabel: null,
    flights,
    phase1SlotCount: PHASE1_COLS.length,
    phase2SlotCount: PHASE2_COLS.length,
  }
}

export { colIndex }

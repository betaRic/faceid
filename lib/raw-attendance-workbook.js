export const RAW_ATTENDANCE_HEADERS = [
  'Name',
  'Employee ID',
  'Office',
  'Date',
  'AM In',
  'AM Out',
  'PM In',
  'PM Out',
  'Late (min)',
  'Undertime (min)',
  'Working Minutes',
  'Working Hours',
  'Status',
]

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const INVALID_SHEET_NAME_CHARS = /[\[\]:*?\/\\]/g
const encoder = new TextEncoder()
const crcTable = buildCrcTable()

function normalizeCell(value) {
  if (value == null) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? value : ''
  return String(value)
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function columnName(index) {
  let value = index + 1
  let name = ''
  while (value > 0) {
    const mod = (value - 1) % 26
    name = String.fromCharCode(65 + mod) + name
    value = Math.floor((value - mod) / 26)
  }
  return name
}

function cellRef(rowIndex, colIndex) {
  return `${columnName(colIndex)}${rowIndex + 1}`
}

function buildCellXml(value, rowIndex, colIndex) {
  const normalized = normalizeCell(value)
  const ref = cellRef(rowIndex, colIndex)
  if (typeof normalized === 'number') {
    return `<c r="${ref}"><v>${normalized}</v></c>`
  }
  return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(normalized)}</t></is></c>`
}

function buildRowsXml(rows) {
  return rows
    .map((row, rowIndex) => (
      `<row r="${rowIndex + 1}">${row.map((value, colIndex) => buildCellXml(value, rowIndex, colIndex)).join('')}</row>`
    ))
    .join('')
}

function buildSheetXml(rows) {
  const safeRows = Array.isArray(rows) && rows.length > 0 ? rows : [RAW_ATTENDANCE_HEADERS]
  const columnCount = Math.max(...safeRows.map(row => row.length), RAW_ATTENDANCE_HEADERS.length)
  const endRef = `${columnName(columnCount - 1)}${safeRows.length}`
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${endRef}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <sheetData>${buildRowsXml(safeRows)}</sheetData>
</worksheet>`
}

function sanitizeSheetName(value, fallback) {
  const raw = String(value || fallback || 'Employee').replace(INVALID_SHEET_NAME_CHARS, ' ').trim()
  return (raw || fallback || 'Employee').slice(0, 31)
}

function uniqueSheetName(baseName, usedNames) {
  let name = sanitizeSheetName(baseName, 'Employee')
  if (!usedNames.has(name.toLowerCase())) {
    usedNames.add(name.toLowerCase())
    return name
  }

  for (let index = 2; index < 10000; index += 1) {
    const suffix = ` ${index}`
    const candidate = `${name.slice(0, 31 - suffix.length)}${suffix}`
    if (!usedNames.has(candidate.toLowerCase())) {
      usedNames.add(candidate.toLowerCase())
      return candidate
    }
  }

  return name
}

function normalizeRawAttendanceRow(row) {
  return {
    name: String(row?.name || '').trim(),
    employeeId: String(row?.employeeId || '').trim(),
    officeName: String(row?.officeName || row?.office || '').trim(),
    dateKey: String(row?.dateKey || row?.date || '').trim(),
    amIn: String(row?.amIn || '').trim(),
    amOut: String(row?.amOut || '').trim(),
    pmIn: String(row?.pmIn || '').trim(),
    pmOut: String(row?.pmOut || '').trim(),
    lateMinutes: Number(row?.lateMinutes ?? 0) || 0,
    undertimeMinutes: Number(row?.undertimeMinutes ?? row?.undertime ?? 0) || 0,
    workingMinutes: Number(row?.workingMinutes ?? 0) || 0,
    workingHours: String(row?.workingHours || '').trim(),
    status: String(row?.status || '').trim(),
  }
}

function buildRawDataMatrix(rows) {
  return [
    RAW_ATTENDANCE_HEADERS,
    ...rows.map(row => [
      row.name,
      row.employeeId,
      row.officeName,
      row.dateKey,
      row.amIn || '--',
      row.amOut || '--',
      row.pmIn || '--',
      row.pmOut || '--',
      row.lateMinutes,
      row.undertimeMinutes,
      row.workingMinutes,
      row.workingHours,
      row.status,
    ]),
  ]
}

export function buildRawAttendanceWorksheets(attendanceRows = []) {
  const normalizedRows = attendanceRows
    .map(normalizeRawAttendanceRow)
    .filter(row => row.employeeId || row.name)
    .sort((left, right) => (
      left.name.localeCompare(right.name)
      || left.employeeId.localeCompare(right.employeeId)
      || left.dateKey.localeCompare(right.dateKey)
    ))

  const grouped = new Map()
  for (const row of normalizedRows) {
    const key = row.employeeId || row.name
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(row)
  }

  const usedNames = new Set()
  const worksheets = Array.from(grouped.entries()).map(([key, rows]) => {
    const first = rows[0] || {}
    const sheetName = uniqueSheetName(`${first.employeeId || key} ${first.name || ''}`.trim(), usedNames)
    return {
      name: sheetName,
      rows: buildRawDataMatrix(rows),
    }
  })

  if (worksheets.length > 0) return worksheets

  return [{
    name: 'No Data',
    rows: [RAW_ATTENDANCE_HEADERS],
  }]
}

function buildWorkbookXml(worksheets) {
  const sheetsXml = worksheets
    .map((sheet, index) => (
      `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
    ))
    .join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetsXml}</sheets>
</workbook>`
}

function buildWorkbookRelsXml(worksheets) {
  const sheetRels = worksheets
    .map((_, index) => (
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
    ))
    .join('')
  const styleRelId = `rId${worksheets.length + 1}`

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRels}
  <Relationship Id="${styleRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
}

function buildContentTypesXml(worksheets) {
  const sheetOverrides = worksheets
    .map((_, index) => (
      `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    ))
    .join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  ${sheetOverrides}
</Types>`
}

function buildRootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`
}

function buildCoreXml() {
  const now = new Date().toISOString()
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Raw Attendance Evidence</dc:title>
  <dc:creator>FaceAttend</dc:creator>
  <cp:lastModifiedBy>FaceAttend</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`
}

function buildAppXml(worksheets) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>FaceAttend</Application>
  <TitlesOfParts><vt:vector size="${worksheets.length}" baseType="lpstr">${worksheets.map(sheet => `<vt:lpstr>${xmlEscape(sheet.name)}</vt:lpstr>`).join('')}</vt:vector></TitlesOfParts>
</Properties>`
}

export function buildRawAttendanceWorkbookFiles(attendanceRows = []) {
  const worksheets = buildRawAttendanceWorksheets(attendanceRows)
  const files = [
    { name: '[Content_Types].xml', content: buildContentTypesXml(worksheets) },
    { name: '_rels/.rels', content: buildRootRelsXml() },
    { name: 'docProps/core.xml', content: buildCoreXml() },
    { name: 'docProps/app.xml', content: buildAppXml(worksheets) },
    { name: 'xl/workbook.xml', content: buildWorkbookXml(worksheets) },
    { name: 'xl/_rels/workbook.xml.rels', content: buildWorkbookRelsXml(worksheets) },
    { name: 'xl/styles.xml', content: buildStylesXml() },
    ...worksheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      content: buildSheetXml(sheet.rows),
    })),
  ]

  return { worksheets, files }
}

function buildCrcTable() {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[n] = c >>> 0
  }
  return table
}

function crc32(bytes) {
  let crc = 0xffffffff
  for (let index = 0; index < bytes.length; index += 1) {
    crc = crcTable[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function writeUint16(view, offset, value) {
  view.setUint16(offset, value, true)
}

function writeUint32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true)
}

function concatBytes(parts, totalSize) {
  const output = new Uint8Array(totalSize)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

function toZipFileEntry(file) {
  const nameBytes = encoder.encode(file.name)
  const dataBytes = encoder.encode(file.content)
  return {
    ...file,
    nameBytes,
    dataBytes,
    crc: crc32(dataBytes),
  }
}

export function buildRawAttendanceWorkbookBytes(attendanceRows = []) {
  const { files } = buildRawAttendanceWorkbookFiles(attendanceRows)
  const entries = files.map(toZipFileEntry)
  const parts = []
  const centralParts = []
  let offset = 0

  for (const entry of entries) {
    const local = new Uint8Array(30 + entry.nameBytes.length)
    const view = new DataView(local.buffer)
    writeUint32(view, 0, 0x04034b50)
    writeUint16(view, 4, 20)
    writeUint16(view, 6, 0)
    writeUint16(view, 8, 0)
    writeUint16(view, 10, 0)
    writeUint16(view, 12, 0)
    writeUint32(view, 14, entry.crc)
    writeUint32(view, 18, entry.dataBytes.length)
    writeUint32(view, 22, entry.dataBytes.length)
    writeUint16(view, 26, entry.nameBytes.length)
    writeUint16(view, 28, 0)
    local.set(entry.nameBytes, 30)
    parts.push(local, entry.dataBytes)

    const central = new Uint8Array(46 + entry.nameBytes.length)
    const centralView = new DataView(central.buffer)
    writeUint32(centralView, 0, 0x02014b50)
    writeUint16(centralView, 4, 20)
    writeUint16(centralView, 6, 20)
    writeUint16(centralView, 8, 0)
    writeUint16(centralView, 10, 0)
    writeUint16(centralView, 12, 0)
    writeUint16(centralView, 14, 0)
    writeUint32(centralView, 16, entry.crc)
    writeUint32(centralView, 20, entry.dataBytes.length)
    writeUint32(centralView, 24, entry.dataBytes.length)
    writeUint16(centralView, 28, entry.nameBytes.length)
    writeUint16(centralView, 30, 0)
    writeUint16(centralView, 32, 0)
    writeUint16(centralView, 34, 0)
    writeUint16(centralView, 36, 0)
    writeUint32(centralView, 38, 0)
    writeUint32(centralView, 42, offset)
    central.set(entry.nameBytes, 46)
    centralParts.push(central)

    offset += local.length + entry.dataBytes.length
  }

  const centralDirectorySize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  writeUint32(endView, 0, 0x06054b50)
  writeUint16(endView, 4, 0)
  writeUint16(endView, 6, 0)
  writeUint16(endView, 8, entries.length)
  writeUint16(endView, 10, entries.length)
  writeUint32(endView, 12, centralDirectorySize)
  writeUint32(endView, 16, offset)
  writeUint16(endView, 20, 0)

  const totalSize = offset + centralDirectorySize + end.length
  return concatBytes([...parts, ...centralParts, end], totalSize)
}

export function buildRawAttendanceWorkbookBlob(attendanceRows = []) {
  return new Blob([buildRawAttendanceWorkbookBytes(attendanceRows)], { type: XLSX_MIME })
}

export function downloadRawAttendanceWorkbook(attendanceRows = [], filename = 'attendance-raw') {
  const blob = buildRawAttendanceWorkbookBlob(attendanceRows)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${filename.replace(/\.xlsx$/i, '')}.xlsx`
  anchor.click()
  URL.revokeObjectURL(url)
}

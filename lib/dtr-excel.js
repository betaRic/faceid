import 'server-only'

import { readFile } from 'node:fs/promises'
import crypto from 'node:crypto'
import { strToU8, unzipSync, zipSync } from 'fflate'

export const DTR_EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const DTR_EXCEL_MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const TEMPLATE_PATH = './templates/dtr-format.xlsx'
const WORKSHEET_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'
const CALC_CHAIN_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml'
const WORKSHEET_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet'
const CALC_CHAIN_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/calcChain'
const SHEET_RELS_TEMPLATE_PATH = 'xl/worksheets/_rels/sheet1.xml.rels'
const SHEET_XML_TEMPLATE_PATH = 'xl/worksheets/sheet1.xml'
const STYLES_XML_PATH = 'xl/styles.xml'
const TIME_VALUE_FONT_COLOR = 'FFBFBFBF'

const COPY_DEFINITIONS = [
  {
    familyName: 'C6',
    firstName: 'G6',
    middleInitial: 'K6',
    period: 'G9',
    regularDays: 'G10',
    arrivalDeparture: 'G11',
    day: 'C',
    amIn: 'E',
    amOut: 'G',
    pmIn: 'I',
    pmOut: 'K',
    employeeName: 'C50',
    signatoryName: 'B56',
    signatoryPosition: 'B57',
  },
  {
    familyName: 'N6',
    firstName: 'R6',
    middleInitial: 'V6',
    period: 'R9',
    regularDays: 'R10',
    arrivalDeparture: 'R11',
    day: 'N',
    amIn: 'P',
    amOut: 'R',
    pmIn: 'T',
    pmOut: 'V',
    employeeName: 'M50',
    signatoryName: 'M56',
    signatoryPosition: 'M57',
  },
]

const TIME_STYLE_IDS = {
  normal: {
    amIn: '30',
    amOut: '31',
    pmIn: '30',
    pmOut: '31',
  },
  saturday: {
    amIn: '32',
    amOut: '32',
    pmIn: '32',
    pmOut: '32',
  },
  sunday: {
    amIn: '30',
    amOut: '31',
    pmIn: '30',
    pmOut: '31',
  },
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function regexEscape(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function columnIndex(column) {
  return String(column || '').toUpperCase().split('').reduce((sum, char) => (
    (sum * 26) + char.charCodeAt(0) - 64
  ), 0)
}

function parseCellRef(ref) {
  const match = String(ref || '').match(/^([A-Z]+)(\d+)$/i)
  if (!match) return null
  return {
    column: match[1].toUpperCase(),
    columnIndex: columnIndex(match[1]),
    row: Number.parseInt(match[2], 10),
  }
}

function getCellStyle(cellXml) {
  const match = String(cellXml || '').match(/\ss="([^"]+)"/)
  return match ? match[1] : ''
}

function getXmlAttribute(xml, name, fallback = '') {
  const match = String(xml || '').match(new RegExp(`\\b${regexEscape(name)}="([^"]*)"`))
  return match ? match[1] : fallback
}

function updateSectionCount(sectionXml, nextCount) {
  return sectionXml.replace(/\bcount="\d+"/, `count="${nextCount}"`)
}

function appendSectionElement(stylesXml, sectionName, elementXml) {
  const sectionPattern = new RegExp(`<${sectionName}\\b[^>]*>[\\s\\S]*?<\\/${sectionName}>`)
  const sectionXml = stylesXml.match(sectionPattern)?.[0] || ''
  if (!sectionXml) return { xml: stylesXml, index: -1 }

  const count = Number.parseInt(getXmlAttribute(sectionXml, 'count', '0'), 10)
  const nextIndex = Number.isFinite(count) ? count : 0
  const nextSectionXml = updateSectionCount(
    sectionXml.replace(`</${sectionName}>`, `${elementXml}</${sectionName}>`),
    nextIndex + 1,
  )

  return {
    xml: stylesXml.replace(sectionPattern, nextSectionXml),
    index: nextIndex,
  }
}

function getCellXfs(stylesXml) {
  const cellXfs = String(stylesXml || '').match(/<cellXfs[\s\S]*?<\/cellXfs>/)?.[0] || ''
  const body = cellXfs.replace(/^<cellXfs[^>]*>/, '').replace(/<\/cellXfs>$/, '')
  const xfs = []
  let cursor = 0

  while (cursor < body.length) {
    const start = body.indexOf('<xf', cursor)
    if (start < 0) break
    const openEnd = body.indexOf('>', start)
    if (openEnd < 0) break
    const open = body.slice(start, openEnd + 1)

    if (open.endsWith('/>')) {
      xfs.push(open)
      cursor = openEnd + 1
      continue
    }

    const end = body.indexOf('</xf>', openEnd)
    if (end < 0) break
    xfs.push(body.slice(start, end + 5))
    cursor = end + 5
  }

  return xfs
}

function buildDtrTimeValueXf(stylesXml, fontId) {
  const baseXf = getCellXfs(stylesXml)[Number.parseInt(TIME_STYLE_IDS.normal.amIn, 10)] || ''
  const numFmtId = getXmlAttribute(baseXf, 'numFmtId', '0')
  const fillId = getXmlAttribute(baseXf, 'fillId', '0')
  const borderId = getXmlAttribute(baseXf, 'borderId', '0')
  const xfId = getXmlAttribute(baseXf, 'xfId', '0')

  return (
    `<xf numFmtId="${xmlEscape(numFmtId)}" fontId="${fontId}" fillId="${xmlEscape(fillId)}" ` +
    `borderId="${xmlEscape(borderId)}" xfId="${xmlEscape(xfId)}" applyFont="1" applyBorder="1" applyAlignment="1">` +
    '<alignment horizontal="center" vertical="center"/></xf>'
  )
}

function appendDtrTimeValueStyle(stylesXml) {
  if (!stylesXml) return { stylesXml, timeValueStyleId: '' }

  const fontXml = `<font><sz val="9"/><color rgb="${TIME_VALUE_FONT_COLOR}"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>`
  const fontResult = appendSectionElement(stylesXml, 'fonts', fontXml)
  if (fontResult.index < 0) return { stylesXml, timeValueStyleId: '' }

  const xfXml = buildDtrTimeValueXf(fontResult.xml, fontResult.index)
  const styleResult = appendSectionElement(fontResult.xml, 'cellXfs', xfXml)
  if (styleResult.index < 0) return { stylesXml, timeValueStyleId: '' }

  return {
    stylesXml: styleResult.xml,
    timeValueStyleId: String(styleResult.index),
  }
}

function buildCellXml(ref, value, styleId = '') {
  const normalized = value == null ? '' : value
  const style = styleId ? ` s="${xmlEscape(styleId)}"` : ''

  if (normalized && typeof normalized === 'object' && Number.isInteger(normalized.sharedStringIndex)) {
    return `<c r="${ref}"${style} t="s"><v>${normalized.sharedStringIndex}</v></c>`
  }

  if (normalized === '') {
    return `<c r="${ref}"${style}/>`
  }

  if (typeof normalized === 'number' && Number.isFinite(normalized)) {
    return `<c r="${ref}"${style}><v>${normalized}</v></c>`
  }

  return `<c r="${ref}"${style} t="inlineStr"><is><t>${xmlEscape(normalized)}</t></is></c>`
}

function replaceCellXml(rowXml, ref, value, forcedStyleId = '') {
  const parsed = parseCellRef(ref)
  if (!parsed) return rowXml

  const cellPattern = new RegExp(`<c\\b(?=[^>]*\\br="${ref}")[\\s\\S]*?<\\/c>|<c\\b(?=[^>]*\\br="${ref}")[^>]*/>`)
  const existing = rowXml.match(cellPattern)?.[0] || ''
  const styleId = forcedStyleId || getCellStyle(existing)
  const nextCell = buildCellXml(ref, value, styleId)

  if (existing) {
    return rowXml.replace(cellPattern, nextCell)
  }

  const insertionPoint = rowXml.search(new RegExp(`<c\\b(?=[^>]*\\br="[A-Z]+${parsed.row}")`, 'g'))
  if (insertionPoint === -1) {
    return rowXml.replace('</row>', `${nextCell}</row>`)
  }

  const cells = [...rowXml.matchAll(/<c\b(?=[^>]*\br="([A-Z]+)\d+")[\s\S]*?(?:<\/c>|\/>)/g)]
  const next = cells.find(match => columnIndex(match[1]) > parsed.columnIndex)
  if (!next) return rowXml.replace('</row>', `${nextCell}</row>`)
  return `${rowXml.slice(0, next.index)}${nextCell}${rowXml.slice(next.index)}`
}

function setCell(sheetXml, ref, value, styleId = '') {
  const parsed = parseCellRef(ref)
  if (!parsed) return sheetXml
  const rowPattern = new RegExp(`<row\\b(?=[^>]*\\br="${parsed.row}")[\\s\\S]*?<\\/row>`)
  const rowXml = sheetXml.match(rowPattern)?.[0]
  if (!rowXml) return sheetXml
  return sheetXml.replace(rowPattern, replaceCellXml(rowXml, ref, value, styleId))
}

function hasRowTimes(row) {
  return Boolean(row?.amIn || row?.amOut || row?.pmIn || row?.pmOut)
}

function weekendLabel(row) {
  if (!row?.isWeekend || hasRowTimes(row)) return ''
  return row.dayOfWeek === 'SATURDAY'
    ? { sharedStringIndex: 15 }
    : { sharedStringIndex: 16 }
}

function styleKindForRow(row) {
  if (!row?.isWeekend || hasRowTimes(row)) return 'normal'
  return row.dayOfWeek === 'SATURDAY' ? 'saturday' : 'sunday'
}

function timeCellStyle(value, fallbackStyleId, timeValueStyleId) {
  return value && timeValueStyleId ? timeValueStyleId : fallbackStyleId
}

function formatEmployeeSignatureName(employee = {}) {
  const nameParts = employee.nameParts || {}
  const formatted = [
    nameParts.firstName,
    nameParts.middleInitial,
    nameParts.familyName,
  ].map(value => String(value || '').trim()).filter(Boolean).join(' ')
  return formatted || String(employee.name || '').trim()
}

function ensureCenterDivider(sheetXml) {
  let output = sheetXml
  // The template leaves the centre divider's blank rows without cells, so Excel has
  // no border to render there. These use the template's existing right-medium style.
  for (const row of [...Array(11).keys()].map(index => index + 14).concat([...Array(19).keys()].map(index => index + 26))) {
    output = setCell(output, `L${row}`, '', '5')
  }
  return output
}

function writeDtrCopy(sheetXml, dtr, copy, options = {}) {
  const employee = dtr?.employee || {}
  const nameParts = employee.nameParts || {}
  const officialHours = dtr?.officialHours || {}
  const signatory = dtr?.signatory || {}
  const timeValueStyleId = options.timeValueStyleId || ''

  let output = sheetXml
  output = setCell(output, copy.familyName, nameParts.familyName || '', '8')
  output = setCell(output, copy.firstName, nameParts.firstName || '', '8')
  output = setCell(output, copy.middleInitial, nameParts.middleInitial || '', '11')
  output = setCell(output, copy.period, dtr?.period?.periodLabel || '', '20')
  output = setCell(output, copy.regularDays, officialHours.regularDays || 'Monday- Friday', '23')
  output = setCell(output, copy.arrivalDeparture, officialHours.arrivalDeparture || '8:00-12:00 to 1:00-5:00', '23')
  output = setCell(output, copy.employeeName, formatEmployeeSignatureName(employee), copy.employeeName.startsWith('M') ? '51' : '48')
  output = setCell(output, copy.signatoryName, signatory.name || '', copy.signatoryName.startsWith('M') ? '51' : '51')
  output = setCell(output, copy.signatoryPosition, signatory.position || '', copy.signatoryPosition.startsWith('M') ? '56' : '56')

  for (const row of dtr?.rows || []) {
    const rowNumber = 13 + Number(row.day || 0)
    if (rowNumber < 14 || rowNumber > 44) continue

    const label = weekendLabel(row)
    const styles = TIME_STYLE_IDS[styleKindForRow(row)] || TIME_STYLE_IDS.normal
    const dayValue = row.inMonth ? row.day : ''

    output = setCell(output, `${copy.day}${rowNumber}`, dayValue, '29')

    if (!row.inMonth) {
      output = setCell(output, `${copy.amIn}${rowNumber}`, '', TIME_STYLE_IDS.normal.amIn)
      output = setCell(output, `${copy.amOut}${rowNumber}`, '', TIME_STYLE_IDS.normal.amOut)
      output = setCell(output, `${copy.pmIn}${rowNumber}`, '', TIME_STYLE_IDS.normal.pmIn)
      output = setCell(output, `${copy.pmOut}${rowNumber}`, '', TIME_STYLE_IDS.normal.pmOut)
      continue
    }

    if (label) {
      output = setCell(output, `${copy.amIn}${rowNumber}`, label, styles.amIn)
      output = setCell(output, `${copy.amOut}${rowNumber}`, '', styles.amOut)
      output = setCell(output, `${copy.pmIn}${rowNumber}`, label, styles.pmIn)
      output = setCell(output, `${copy.pmOut}${rowNumber}`, '', styles.pmOut)
      continue
    }

    const amIn = row.isActive ? row.amIn || '' : ''
    const amOut = row.isActive ? row.amOut || '' : ''
    const pmIn = row.isActive ? row.pmIn || '' : ''
    const pmOut = row.isActive ? row.pmOut || '' : ''

    output = setCell(output, `${copy.amIn}${rowNumber}`, amIn, timeCellStyle(amIn, styles.amIn, timeValueStyleId))
    output = setCell(output, `${copy.amOut}${rowNumber}`, amOut, timeCellStyle(amOut, styles.amOut, timeValueStyleId))
    output = setCell(output, `${copy.pmIn}${rowNumber}`, pmIn, timeCellStyle(pmIn, styles.pmIn, timeValueStyleId))
    output = setCell(output, `${copy.pmOut}${rowNumber}`, pmOut, timeCellStyle(pmOut, styles.pmOut, timeValueStyleId))
  }

  return output
}

function addDtrWatermark(sheetXml, verificationId) {
  const watermark = `&C&KCCCCCC&28SYSTEM GENERATED DTR\n&12Verification ID: ${verificationId}`
  const headerFooter = `<headerFooter><oddHeader>${xmlEscape(watermark)}</oddHeader><oddFooter>&amp;CGenerated by VeriFace • ${xmlEscape(verificationId)}</oddFooter></headerFooter>`
  return /<headerFooter\b[^>]*(?:\/>|>[\s\S]*?<\/headerFooter>)/.test(sheetXml)
    ? sheetXml.replace(/<headerFooter\b[^>]*(?:\/>|>[\s\S]*?<\/headerFooter>)/, headerFooter)
    : sheetXml.replace('</worksheet>', `${headerFooter}</worksheet>`)
}

function buildSheetXml(templateSheetXml, dtr, options = {}) {
  const filled = COPY_DEFINITIONS.reduce((xml, copy) => writeDtrCopy(xml, dtr, copy, options), templateSheetXml)
  return addDtrWatermark(ensureCenterDivider(filled), options.verificationId)
}

function sanitizeSheetName(value, fallback) {
  const raw = String(value || fallback || 'DTR')
    .replace(/[\[\]:*?/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return (raw || fallback || 'DTR').slice(0, 31)
}

function uniqueSheetName(baseName, usedNames) {
  const sanitized = sanitizeSheetName(baseName, 'DTR')
  if (!usedNames.has(sanitized.toLowerCase())) {
    usedNames.add(sanitized.toLowerCase())
    return sanitized
  }

  for (let index = 2; index < 1000; index += 1) {
    const suffix = ` ${index}`
    const candidate = `${sanitized.slice(0, 31 - suffix.length)}${suffix}`
    if (!usedNames.has(candidate.toLowerCase())) {
      usedNames.add(candidate.toLowerCase())
      return candidate
    }
  }

  return sanitized
}

function buildSheetEntries(dtrs) {
  const usedNames = new Set()
  const dtrSheets = dtrs.map((dtr, index) => {
    const employee = dtr?.employee || {}
    return {
      dtr,
      index: index + 1,
      name: uniqueSheetName(`${employee.employeeId || index + 1} ${employee.name || ''}`, usedNames),
      relId: `rIdDtrSheet${index + 1}`,
      path: `xl/worksheets/sheet${index + 1}.xml`,
      relsPath: `xl/worksheets/_rels/sheet${index + 1}.xml.rels`,
    }
  })

  const timeLogDetails = dtrs.flatMap(dtr => (dtr?.timeLogDetails || []).map(entry => ({
    department: dtr?.employee?.divisionName || dtr?.employee?.office || 'Unassigned',
    employeeId: dtr?.employee?.employeeId || '',
    employeeName: dtr?.employee?.name || '',
    ...entry,
  }))).sort((left, right) => (
    left.department.localeCompare(right.department)
    || left.employeeName.localeCompare(right.employeeName)
    || left.employeeId.localeCompare(right.employeeId)
    || left.dateKey.localeCompare(right.dateKey)
    || left.timestamp - right.timestamp
  ))
  if (timeLogDetails.length === 0) return dtrSheets

  const index = dtrSheets.length + 1
  return [...dtrSheets, {
    kind: 'remarks',
    remarks: timeLogDetails,
    index,
    name: uniqueSheetName('Time Log Details', usedNames),
    relId: `rIdDtrSheet${index}`,
    path: `xl/worksheets/sheet${index}.xml`,
    relsPath: `xl/worksheets/_rels/sheet${index}.xml.rels`,
  }]
}

function buildRemarksSheetXml(remarks = []) {
  const rows = [
    ['Department', 'Employee Name', 'Employee ID', 'Date', 'Time', 'Entry', 'Source', 'Remarks'],
    ...remarks.map(remark => [
      remark.department || 'Unassigned',
      remark.employeeName || '',
      remark.employeeId || '',
      remark.dateKey || '',
      remark.time || '',
      remark.action === 'checkin' ? 'Check in' : remark.action === 'checkout' ? 'Check out' : 'Attendance log',
      remark.source || 'System scan',
      remark.remark || '',
    ]),
  ]
  const columnNames = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
  const body = rows.map((values, rowIndex) => {
    const cells = values.map((value, columnIndex) => (
      buildCellXml(`${columnNames[columnIndex]}${rowIndex + 1}`, value, rowIndex === 0 ? '1' : '')
    )).join('')
    return `<row r="${rowIndex + 1}">${cells}</row>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:H${rows.length}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="24" customWidth="1"/><col min="2" max="2" width="28" customWidth="1"/><col min="3" max="3" width="16" customWidth="1"/><col min="4" max="5" width="14" customWidth="1"/><col min="6" max="7" width="18" customWidth="1"/><col min="8" max="8" width="60" customWidth="1"/></cols><sheetData>${body}</sheetData><autoFilter ref="A1:H${rows.length}"/></worksheet>`
}

function sheetNameForFormula(name) {
  return `'${String(name || 'DTR').replace(/'/g, "''")}'`
}

function replaceSheetsXml(workbookXml, sheets) {
  const sheetsXml = sheets
    .map(sheet => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${sheet.index}" r:id="${sheet.relId}"/>`)
    .join('')

  const definedNamesXml = `<definedNames>${sheets
    .map((sheet, index) => (
      `<definedName name="_xlnm.Print_Area" localSheetId="${index}">${sheetNameForFormula(sheet.name)}!${sheet.kind === 'remarks' ? '$A$1:$H$' + (sheet.remarks.length + 1) : '$B$1:$W$58'}</definedName>`
    ))
    .join('')}</definedNames>`

  let output = workbookXml.replace(/<sheets>[\s\S]*?<\/sheets>/, `<sheets>${sheetsXml}</sheets>`)

  if (/<definedNames>[\s\S]*?<\/definedNames>/.test(output)) {
    output = output.replace(/<definedNames>[\s\S]*?<\/definedNames>/, definedNamesXml)
  } else {
    output = output.replace('</workbook>', `${definedNamesXml}</workbook>`)
  }

  return output
}

function replaceWorkbookRelsXml(relsXml, sheets) {
  const preserved = [...relsXml.matchAll(/<Relationship\b[^>]*\/>/g)]
    .map(match => match[0])
    .filter(relationship => !relationship.includes(`Type="${WORKSHEET_REL_TYPE}"`))
    .filter(relationship => !relationship.includes(`Type="${CALC_CHAIN_REL_TYPE}"`))
    .join('')

  const worksheetRels = sheets
    .map(sheet => `<Relationship Id="${sheet.relId}" Type="${WORKSHEET_REL_TYPE}" Target="worksheets/sheet${sheet.index}.xml"/>`)
    .join('')

  return relsXml.replace(/<Relationships\b([^>]*)>[\s\S]*?<\/Relationships>/, `<Relationships$1>${preserved}${worksheetRels}</Relationships>`)
}

function replaceContentTypesXml(contentTypesXml, sheets) {
  const withoutWorksheets = contentTypesXml
    .replace(new RegExp(`<Override\\b[^>]*ContentType="${regexEscape(WORKSHEET_CONTENT_TYPE)}"[^>]*/>`, 'g'), '')
    .replace(new RegExp(`<Override\\b[^>]*ContentType="${regexEscape(CALC_CHAIN_CONTENT_TYPE)}"[^>]*/>`, 'g'), '')

  const worksheetOverrides = sheets
    .map(sheet => `<Override PartName="/xl/worksheets/sheet${sheet.index}.xml" ContentType="${WORKSHEET_CONTENT_TYPE}"/>`)
    .join('')

  return withoutWorksheets.replace('</Types>', `${worksheetOverrides}</Types>`)
}

function replaceAppXml(appXml, sheets) {
  const sheetNames = sheets.map(sheet => sheet.name)
  let output = appXml

  output = output.replace(
    /<TitlesOfParts><vt:vector\b[^>]*>[\s\S]*?<\/vt:vector><\/TitlesOfParts>/,
    `<TitlesOfParts><vt:vector size="${sheetNames.length}" baseType="lpstr">${sheetNames.map(name => `<vt:lpstr>${xmlEscape(name)}</vt:lpstr>`).join('')}</vt:vector></TitlesOfParts>`,
  )

  output = output.replace(
    /<HeadingPairs><vt:vector\b[^>]*>[\s\S]*?<\/vt:vector><\/HeadingPairs>/,
    `<HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${sheetNames.length}</vt:i4></vt:variant></vt:vector></HeadingPairs>`,
  )

  return output
}

export async function loadDtrTemplateBytes() {
  return new Uint8Array(await readFile(new URL(TEMPLATE_PATH, import.meta.url)))
}

export function buildDtrWorkbookFromTemplate(templateBytes, dtrs = []) {
  const documents = Array.isArray(dtrs) ? dtrs.filter(Boolean) : []
  if (documents.length === 0) {
    throw new Error('At least one DTR document is required.')
  }

  const files = unzipSync(templateBytes)
  const templateSheetXml = new TextDecoder().decode(files[SHEET_XML_TEMPLATE_PATH])
  const templateSheetRels = files[SHEET_RELS_TEMPLATE_PATH]
  const workbookXml = new TextDecoder().decode(files['xl/workbook.xml'])
  const styleResult = appendDtrTimeValueStyle(new TextDecoder().decode(files[STYLES_XML_PATH]))
  const sheets = buildSheetEntries(documents)
  const verificationId = `FA-${crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`

  for (const path of Object.keys(files)) {
    if (/^xl\/worksheets\/sheet\d+\.xml$/.test(path) || /^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/.test(path)) {
      delete files[path]
    }
  }

  delete files['xl/calcChain.xml']

  for (const sheet of sheets) {
    files[sheet.path] = strToU8(sheet.kind === 'remarks'
      ? buildRemarksSheetXml(sheet.remarks)
      : buildSheetXml(templateSheetXml, sheet.dtr, { timeValueStyleId: styleResult.timeValueStyleId, verificationId }))
    if (templateSheetRels && sheet.kind !== 'remarks') {
      files[sheet.relsPath] = templateSheetRels
    }
  }

  files[STYLES_XML_PATH] = strToU8(styleResult.stylesXml)
  files['xl/workbook.xml'] = strToU8(replaceSheetsXml(workbookXml, sheets))
  files['xl/_rels/workbook.xml.rels'] = strToU8(replaceWorkbookRelsXml(new TextDecoder().decode(files['xl/_rels/workbook.xml.rels']), sheets))
  files['[Content_Types].xml'] = strToU8(replaceContentTypesXml(new TextDecoder().decode(files['[Content_Types].xml']), sheets))

  if (files['docProps/app.xml']) {
    files['docProps/app.xml'] = strToU8(replaceAppXml(new TextDecoder().decode(files['docProps/app.xml']), sheets))
  }

  return zipSync(files, { level: 6 })
}

export async function buildDtrWorkbookBytes(dtrs = []) {
  return buildDtrWorkbookFromTemplate(await loadDtrTemplateBytes(), dtrs)
}

export function buildDtrWorkbookFilename(dtrs = [], { month, year, rangeLabel } = {}) {
  const documents = Array.isArray(dtrs) ? dtrs.filter(Boolean) : []
  const first = documents[0] || {}
  const range = rangeLabel || first.rangeSpec?.label || 'full'
  const monthLabel = DTR_EXCEL_MONTH_NAMES[(month || first.period?.month || 1) - 1] || 'Month'
  const targetYear = year || first.period?.year || new Date().getFullYear()

  if (documents.length === 1) {
    const employeeId = first.employee?.employeeId || 'employee'
    return `DTR_${employeeId}_${monthLabel}_${targetYear}_${range}.xlsx`
  }

  return `DTR_${monthLabel}_${targetYear}_${range}_${documents.length}employees.xlsx`
}

export function createDtrWorkbookResponse(bytes, filename) {
  return new Response(bytes, {
    headers: {
      'Content-Type': DTR_EXCEL_MIME,
      'Content-Disposition': `attachment; filename="${String(filename || 'DTR.xlsx').replace(/"/g, '')}"`,
      'Cache-Control': 'no-store',
    },
  })
}

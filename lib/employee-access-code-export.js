import { strToU8, zipSync } from 'fflate'

export const EMPLOYEE_ACCESS_CODE_XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

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

function cellXml(value, row, column, styleId = 0) {
  const reference = `${columnName(column)}${row}`
  return `<c r="${reference}" s="${styleId}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`
}

function completeName(person) {
  const name = String(person?.name || '').trim()
  if (name) return name
  return [person?.firstName, person?.middleName, person?.lastName]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
}

function accessCode(person) {
  const value = String(person?.accessCode || '').trim()
  return value || 'Not assigned'
}

/**
 * Produces a deterministic, presentation-ready directory for code handouts.
 * The office is the group heading; employee names are alphabetical within it.
 */
export function groupEmployeesByOffice(persons = []) {
  const groups = new Map()

  for (const person of persons) {
    const name = completeName(person)
    if (!name) continue
    const office = String(person?.officeName || '').trim() || 'Unassigned'
    if (!groups.has(office)) groups.set(office, [])
    groups.get(office).push({
      accessCode: accessCode(person),
      completeName: name,
    })
  }

  return Array.from(groups, ([officeName, employees]) => ({
    officeName,
    employees: employees.sort((left, right) => (
      left.completeName.localeCompare(right.completeName, undefined, { sensitivity: 'base' })
      || left.accessCode.localeCompare(right.accessCode, undefined, { numeric: true })
    )),
  })).sort((left, right) => left.officeName.localeCompare(right.officeName, undefined, { sensitivity: 'base' }))
}

function buildSheetXml(groups, generatedAt) {
  const rows = []
  const mergedRows = []
  let rowNumber = 1

  rows.push(`<row r="${rowNumber}" ht="24" customHeight="1">${cellXml('VeriFace Employee Access Codes', rowNumber, 0, 1)}</row>`)
  mergedRows.push(`A${rowNumber}:B${rowNumber}`)
  rowNumber += 1

  rows.push(`<row r="${rowNumber}">${cellXml(`Generated: ${generatedAt}`, rowNumber, 0, 4)}</row>`)
  mergedRows.push(`A${rowNumber}:B${rowNumber}`)
  rowNumber += 2

  if (groups.length === 0) {
    rows.push(`<row r="${rowNumber}">${cellXml('No employee records found.', rowNumber, 0, 0)}</row>`)
    mergedRows.push(`A${rowNumber}:B${rowNumber}`)
    rowNumber += 1
  }

  for (const group of groups) {
    rows.push(`<row r="${rowNumber}" ht="20" customHeight="1">${cellXml(`Office Assignment: ${group.officeName}`, rowNumber, 0, 2)}</row>`)
    mergedRows.push(`A${rowNumber}:B${rowNumber}`)
    rowNumber += 1

    rows.push(`<row r="${rowNumber}">${cellXml('Access Code', rowNumber, 0, 3)}${cellXml('Complete Name', rowNumber, 1, 3)}</row>`)
    rowNumber += 1

    for (const employee of group.employees) {
      rows.push(`<row r="${rowNumber}">${cellXml(employee.accessCode, rowNumber, 0)}${cellXml(employee.completeName, rowNumber, 1)}</row>`)
      rowNumber += 1
    }

    rowNumber += 1
  }

  const lastRow = Math.max(1, rowNumber - 1)
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:B${lastRow}"/>
  <sheetViews><sheetView workbookViewId="0"><selection activeCell="A1" sqref="A1"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols><col min="1" max="1" width="18" customWidth="1"/><col min="2" max="2" width="42" customWidth="1"/></cols>
  <sheetData>${rows.join('')}</sheetData>
  <mergeCells count="${mergedRows.length}">${mergedRows.map(ref => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>
</worksheet>`
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><color rgb="FFFFFFFF"/><sz val="14"/><name val="Calibri"/></font>
    <font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font>
    <font><i/><color rgb="FF666666"/><sz val="10"/><name val="Calibri"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF17365D"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD9EAF7"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2"><border/><border><left style="thin"><color rgb="FFB7C9D6"/></left><right style="thin"><color rgb="FFB7C9D6"/></right><top style="thin"><color rgb="FFB7C9D6"/></top><bottom style="thin"><color rgb="FFB7C9D6"/></bottom></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="5">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0"><alignment vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`
}

function buildWorkbookXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Access Codes" sheetId="1" r:id="rId1"/></sheets>
</workbook>`
}

function buildWorkbookRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
}

function buildContentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`
}

function buildRootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
}

export function buildEmployeeAccessCodeWorkbookBytes(persons = [], generatedAt = new Date().toLocaleString('en-PH')) {
  const groups = groupEmployeesByOffice(persons)
  const files = {
    '[Content_Types].xml': strToU8(buildContentTypesXml()),
    '_rels/.rels': strToU8(buildRootRelsXml()),
    'xl/workbook.xml': strToU8(buildWorkbookXml()),
    'xl/_rels/workbook.xml.rels': strToU8(buildWorkbookRelsXml()),
    'xl/styles.xml': strToU8(buildStylesXml()),
    'xl/worksheets/sheet1.xml': strToU8(buildSheetXml(groups, generatedAt)),
  }
  return zipSync(files, { level: 6 })
}

export function buildEmployeeAccessCodeWorkbookBlob(persons = [], generatedAt) {
  return new Blob([buildEmployeeAccessCodeWorkbookBytes(persons, generatedAt)], { type: EMPLOYEE_ACCESS_CODE_XLSX_MIME })
}

export function employeeAccessCodeExportFilename(date = new Date()) {
  const stamp = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
  return `VeriFace_Employee_Access_Codes_${stamp}.xlsx`
}

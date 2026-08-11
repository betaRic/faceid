import fs from 'node:fs/promises'
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

const repoTemplate = 'D:/projects/faceid/lib/templates/dtr-format.xlsx'
const outputDir = 'D:/projects/faceid/outputs/dtr-template-rebuild'

const workbook = Workbook.create()
const sheet = workbook.worksheets.add('DTR Template')
sheet.showGridLines = false

const navy = '#17365D'
const border = '#1F2937'
const soft = '#F8FAFC'
const header = '#E8EEF7'
const centered = { horizontalAlignment: 'center', verticalAlignment: 'center' }
const thin = { preset: 'all', style: 'thin', color: border }

sheet.getRange('A1:H58').format.font = { name: 'Arial', size: 9, color: '#000000' }
sheet.getRange('A1:H58').format.fill = '#FFFFFF'
sheet.getRange('A1:H58').format.rowHeight = 15
sheet.getRange('A:A').format.columnWidth = 2
sheet.getRange('B:B').format.columnWidth = 6
sheet.getRange('C:F').format.columnWidth = 11
sheet.getRange('G:H').format.columnWidth = 8

sheet.mergeCells('B2:H2'); sheet.getRange('B2').values = [['CIVIL SERVICE COMMISSION FORM NO. 48']]
sheet.getRange('B2:H2').format = { ...centered, font: { bold: true, size: 10 }, rowHeight: 18 }
sheet.mergeCells('B3:H4'); sheet.getRange('B3').values = [['DAILY TIME RECORD']]
sheet.getRange('B3:H4').format = { ...centered, font: { bold: true, size: 16, color: navy }, rowHeight: 20 }

sheet.getRange('B6:H6').values = [['Name:', '', '', '', '', '', '']]
sheet.mergeCells('C6:H6'); sheet.getRange('C6').values = [['EMPLOYEE NAME']]
sheet.getRange('B6:H6').format = { font: { size: 10 }, borders: { bottom: { style: 'thin', color: border } } }
sheet.getRange('C6:H6').format = { ...centered, font: { bold: true, size: 10 }, borders: { bottom: { style: 'thin', color: border } } }

sheet.mergeCells('B8:D8'); sheet.mergeCells('B9:D9'); sheet.mergeCells('B10:D10')
sheet.mergeCells('E8:H8'); sheet.mergeCells('E9:H9'); sheet.mergeCells('E10:H10')
sheet.getRange('B8').values = [['For the month of:']]
sheet.getRange('B9').values = [['Official hours for:']]
sheet.getRange('B10').values = [['Arrival / Departure:']]
sheet.getRange('E8').values = [['MONTH RANGE AND YEAR']]
sheet.getRange('E9').values = [['MONDAY - FRIDAY']]
sheet.getRange('E10').values = [['8:00-12:00 to 1:00-5:00']]
sheet.getRange('B8:H10').format = { borders: { bottom: { style: 'thin', color: '#A3A3A3' } }, font: { size: 9 } }
sheet.getRange('E8:H10').format.font = { bold: true, size: 9 }

sheet.getRange('B12:H13').format = { ...centered, fill: header, font: { bold: true, size: 8 }, borders: thin, wrapText: true }
sheet.mergeCells('B12:B13'); sheet.getRange('B12').values = [['Day']]
sheet.mergeCells('C12:D12'); sheet.getRange('C12').values = [['AM']]
sheet.mergeCells('E12:F12'); sheet.getRange('E12').values = [['PM']]
sheet.mergeCells('G12:H12'); sheet.getRange('G12').values = [['Under time']]
sheet.getRange('C13:H13').values = [['Arrival', 'Departure', 'Arrival', 'Departure', 'Hour(s)', 'Min.(s)']]

for (let row = 14; row <= 44; row += 1) {
  sheet.getRange(`B${row}:H${row}`).format = { ...centered, borders: thin, font: { size: 9 } }
  sheet.getRange(`B${row}`).values = [[row - 13]]
}

sheet.mergeCells('B46:H47'); sheet.getRange('B46').values = [[
  'I hereby CERTIFY on my honor that the above is true and correct report of the hours performed. Records of which was made daily at the time of arrival and departure from office.',
]]
sheet.getRange('B46:H47').format = { ...centered, font: { italic: true, size: 8 }, wrapText: true }
sheet.mergeCells('B49:H49'); sheet.getRange('B49').values = [['NAME & SIGNATURE OF EMPLOYEE']]
sheet.getRange('B49:H49').format = { ...centered, font: { bold: true, size: 10 }, borders: { bottom: { style: 'thin', color: border } } }
sheet.mergeCells('B52:H52'); sheet.getRange('B52').values = [['Validated as to the prescribed official hours:']]
sheet.getRange('B52:H52').format = { font: { italic: true, size: 8 } }
sheet.mergeCells('B55:H55'); sheet.getRange('B55').values = [['NAME OF HEAD OF OFFICE']]
sheet.getRange('B55:H55').format = { ...centered, font: { bold: true, size: 10 }, borders: { bottom: { style: 'thin', color: border } } }
sheet.mergeCells('B56:H56'); sheet.getRange('B56').values = [['POSITION OF HEAD OF OFFICE']]
sheet.getRange('B56:H56').format = { ...centered, font: { italic: true, size: 9 } }
sheet.getRange('B58:H58').values = [['System-generated DTR — preserve with source audit logs.']]
sheet.mergeCells('B58:H58'); sheet.getRange('B58:H58').format = { ...centered, font: { size: 7, color: '#64748B' } }

await fs.mkdir(outputDir, { recursive: true })
const xlsx = await SpreadsheetFile.exportXlsx(workbook)
await xlsx.save(`${outputDir}/dtr-format.xlsx`)
// The runtime writes namespace-prefixed worksheet XML.  The existing DTR
// generator operates on the standard unprefixed SpreadsheetML form, so retain
// the same valid XML while normalizing that harmless serialization detail.
const files = unzipSync(await fs.readFile(`${outputDir}/dtr-format.xlsx`))
for (const [path, bytes] of Object.entries(files)) {
  if (!path.endsWith('.xml')) continue
  const xml = strFromU8(bytes)
    .replace(/<\/?x:/g, match => match === '<x:' ? '<' : '</')
    .replace(/xmlns:x=/g, 'xmlns=')
  files[path] = strToU8(xml)
}
await fs.writeFile(`${outputDir}/dtr-format.xlsx`, zipSync(files, { level: 6 }))
await fs.copyFile(`${outputDir}/dtr-format.xlsx`, repoTemplate)

const preview = await workbook.render({ sheetName: 'DTR Template', range: 'A1:H58', scale: 1.5, format: 'png' })
await fs.writeFile(`${outputDir}/dtr-template-preview.png`, new Uint8Array(await preview.arrayBuffer()))
console.log((await workbook.inspect({ kind: 'table', range: 'B2:H16', include: 'values,formulas', tableMaxRows: 16, tableMaxCols: 7 })).ndjson)

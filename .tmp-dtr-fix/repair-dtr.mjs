import fs from 'node:fs/promises'
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool'

const inputPath = 'D:/Downloads/DTR_12254_July_2026_1-31 (1).xlsx'
const outputDir = 'D:/projects/faceid/outputs/dtr-repaired'
const outputPath = `${outputDir}/DTR_12254_July_2026_1-31_corrected.xlsx`

const input = await FileBlob.load(inputPath)
const workbook = await SpreadsheetFile.importXlsx(input)
const sheet = workbook.worksheets.getItemAt(0)

sheet.getRange('K6').values = [['L.']]
sheet.getRange('V6').values = [['L.']]
sheet.getRange('C50').values = [['JAN ERIC L. LONARIO']]
sheet.getRange('M50').values = [['JAN ERIC L. LONARIO']]
sheet.getRange('L14:L44').format.borders = {
  right: { style: 'medium', color: '#000000' },
}

const check = await workbook.inspect({
  kind: 'table',
  range: `'${sheet.name}'!C6:V50`,
  include: 'values,formulas',
  tableMaxRows: 45,
  tableMaxCols: 20,
  maxChars: 4000,
})
console.log(check.ndjson)
const preview = await workbook.render({ sheetName: sheet.name, range: 'B1:V57', scale: 2, format: 'png' })
await fs.mkdir(outputDir, { recursive: true })
await fs.writeFile(`${outputDir}/preview.png`, new Uint8Array(await preview.arrayBuffer()))
const output = await SpreadsheetFile.exportXlsx(workbook)
await output.save(outputPath)
console.log(outputPath)

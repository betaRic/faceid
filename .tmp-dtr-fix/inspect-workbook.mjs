import fs from 'node:fs/promises'
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool'

const inputPath = 'D:/Downloads/DTR_12254_July_2026_1-31 (1).xlsx'
const outputDir = 'D:/projects/faceid/.tmp-dtr-fix'
const input = await FileBlob.load(inputPath)
const workbook = await SpreadsheetFile.importXlsx(input)
const sheetName = workbook.worksheets.getItemAt(0).name
const sheets = await workbook.inspect({ kind: 'sheet', include: 'id,name', maxChars: 2000 })
const values = await workbook.inspect({
  kind: 'table',
  range: `'${sheetName}'!A1:V57`,
  include: 'values,formulas',
  tableMaxRows: 60,
  tableMaxCols: 26,
  maxChars: 9000,
})
const borders = await workbook.inspect({
  kind: 'computedStyle',
  range: `'${sheetName}'!K1:N57`,
  maxChars: 12000,
})
console.log(sheets.ndjson)
console.log(values.ndjson)
console.log(borders.ndjson)
const preview = await workbook.render({ sheetName, range: 'A1:V57', scale: 2, format: 'png' })
await fs.writeFile(`${outputDir}/original.png`, new Uint8Array(await preview.arrayBuffer()))

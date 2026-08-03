import fs from 'node:fs/promises'
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool'

const [inputPath, outputPath] = process.argv.slice(2)
const input = await FileBlob.load(inputPath)
const workbook = await SpreadsheetFile.importXlsx(input)
const sheet = workbook.worksheets.getItemAt(0)

const inspection = await workbook.inspect({
  kind: 'table,computedStyle',
  sheetId: sheet.name,
  range: 'A1:W58',
  include: 'values,formulas',
  tableMaxRows: 58,
  tableMaxCols: 23,
  maxChars: 16000,
})
console.log(inspection.ndjson)

const preview = await workbook.render({
  sheetName: sheet.name,
  range: 'A1:W58',
  scale: 2,
  format: 'png',
})
await fs.writeFile(outputPath, new Uint8Array(await preview.arrayBuffer()))

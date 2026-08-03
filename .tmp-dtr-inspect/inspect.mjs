import fs from 'node:fs/promises'
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool'

const files = process.argv.slice(2)
for (const file of files) {
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(file))
  const sheets = await workbook.inspect({ kind: 'sheet', include: 'id,name', maxChars: 4000 })
  console.log(`FILE: ${file}`)
  console.log(sheets.ndjson)

  const sheetName = workbook.worksheets.getItemAt(0).name
  const cells = await workbook.inspect({
    kind: 'table',
    range: `${sheetName}!C13:V44`,
    include: 'values,formulas',
    tableMaxRows: 32,
    tableMaxCols: 20,
    maxChars: 10000,
  })
  console.log(cells.ndjson)

  const preview = await workbook.render({ sheetName, range: 'A1:X58', scale: 1.5, format: 'png' })
  const previewPath = `${file.split(/[\\/]/).at(-1)}.png`
  await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()))
  console.log(`PREVIEW: ${previewPath}`)
}

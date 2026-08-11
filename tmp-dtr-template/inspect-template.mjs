import fs from 'node:fs/promises'
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool'

const source = 'D:/projects/faceid/lib/templates/dtr-format.xlsx'
const output = 'D:/projects/faceid/tmp-dtr-template/current-template.png'
const book = await SpreadsheetFile.importXlsx(await FileBlob.load(source))
const sheet = book.worksheets.getItemAt(0)
console.log((await book.inspect({ kind: 'workbook,sheet,table', maxChars: 3000, tableMaxRows: 8, tableMaxCols: 12 })).ndjson)
const preview = await book.render({ sheetName: sheet.name, autoCrop: 'all', scale: 1, format: 'png' })
await fs.writeFile(output, new Uint8Array(await preview.arrayBuffer()))

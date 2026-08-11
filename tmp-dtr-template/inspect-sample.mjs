import fs from 'node:fs/promises'
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool'

const source = 'C:/Users/ericj/OneDrive/Documents/DTR sample.xlsx'
const outputDir = 'D:/projects/faceid/outputs/dtr-sample-inspection'
await fs.mkdir(outputDir, { recursive: true })
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(source))
console.log((await workbook.inspect({ kind: 'workbook,sheet,table', maxChars: 6000, tableMaxRows: 20, tableMaxCols: 24 })).ndjson)
for (const sheet of [workbook.worksheets.getItemAt(0)]) {
  const image = await workbook.render({ sheetName: sheet.name, autoCrop: 'all', scale: 1.5, format: 'png' })
  await fs.writeFile(`${outputDir}/sample-${sheet.name.replace(/[^a-z0-9]/gi, '-')}.png`, new Uint8Array(await image.arrayBuffer()))
}

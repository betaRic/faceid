import { readFile } from 'node:fs/promises'
import { strFromU8, unzipSync } from 'fflate'

const files = unzipSync(await readFile('C:/Users/ericj/OneDrive/Documents/DTR sample.xlsx'))
const sheet = strFromU8(files['xl/worksheets/sheet1.xml'])
for (let row = 1; row <= 12; row += 1) {
  const start = sheet.indexOf(`<row r="${row}"`)
  const end = sheet.indexOf('</row>', start)
  console.log(sheet.slice(start, end + 6))
}
console.log(sheet.match(/<mergeCells[\s\S]*?<\/mergeCells>/)?.[0] || '')

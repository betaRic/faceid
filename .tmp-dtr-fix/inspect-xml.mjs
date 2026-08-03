import fs from 'node:fs/promises'
import { unzipSync, strFromU8 } from 'fflate'

const bytes = new Uint8Array(await fs.readFile('D:/Downloads/DTR_12254_July_2026_1-31 (1).xlsx'))
const files = unzipSync(bytes)
const sheetXml = strFromU8(files['xl/worksheets/sheet1.xml'])
const stylesXml = strFromU8(files['xl/styles.xml'])
console.log([...sheetXml.matchAll(/<c\b(?=[^>]*\br="[LM]\d+")[\s\S]*?(?:<\/c>|\/>)/g)].map(match => match[0]).join('\n'))
console.log(stylesXml.match(/<borders[\s\S]*?<\/borders>/)?.[0] || '')

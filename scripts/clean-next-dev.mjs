import fs from 'node:fs/promises'
import path from 'node:path'

const devOutputPath = path.resolve('.next', 'dev')

await fs.rm(devOutputPath, { recursive: true, force: true })
console.log('Removed .next/dev so the hosting upload contains production output only.')

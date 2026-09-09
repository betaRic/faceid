import { readFile } from 'node:fs/promises'
import { evaluateMemoryExperiment } from './lib/biometric-memory-evaluation.mjs'

if (process.argv.length !== 3) {
  console.error('Usage: node --experimental-loader ./tests/postgres/route-loader.mjs scripts/evaluate-biometric-memory.mjs <local-labelled-dataset.json>')
  process.exitCode = 1
} else {
  try {
    const data = JSON.parse(await readFile(process.argv[2], 'utf8'))
    console.log(JSON.stringify(evaluateMemoryExperiment(data), null, 2))
  } catch {
    console.error('Invalid experiment. Check labels, chronology, session separation, model versions and descriptor shape. No data was changed.')
    process.exitCode = 1
  }
}

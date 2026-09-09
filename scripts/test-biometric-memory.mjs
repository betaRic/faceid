import { readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
const files = (await readdir(new URL('../tests/', import.meta.url)))
  .filter(name => /^(biometric-memory.*|pipeline-fingerprint.*)\.test\.mjs$/.test(name)).sort()
if (!files.length) throw new Error('Memory tests missing')
const result = spawnSync(process.execPath, ['--experimental-loader', './tests/postgres/route-loader.mjs', '--test',
  ...files.map(name => `tests/${name}`)], { stdio: 'inherit', shell: false })
if (result.error) throw result.error
process.exitCode = result.status ?? 1

import { spawnSync } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const entries = await readdir(path.join(projectRoot, 'tests'), { withFileTypes: true })
const testFiles = entries
  .filter(entry => entry.isFile() && entry.name.endsWith('.test.mjs'))
  .map(entry => path.join(projectRoot, 'tests', entry.name))
  .sort()

if (testFiles.length === 0) {
  console.log('No contract tests found.')
} else {
  const result = spawnSync(process.execPath, ['--test', ...testFiles], {
    cwd: projectRoot,
    shell: false,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  process.exitCode = result.status === null ? 1 : result.status
}

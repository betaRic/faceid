import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { loadRepoEnv } from './lib/load-local-env.mjs'

const cwd = process.cwd()
loadRepoEnv({ cwd })

const command = String(process.argv[2] || 'status').toLowerCase()
const binDir = String(process.env.POSTGRES_BIN_DIR || '').trim()
const dataDir = String(process.env.POSTGRES_DATA_DIR || '').trim()
const logDir = String(process.env.POSTGRES_LOG_DIR || 'D:\\faceattend-data\\postgres-logs').trim()

if (!binDir || !dataDir) {
  console.error('POSTGRES_BIN_DIR and POSTGRES_DATA_DIR must be set in .env.local.')
  process.exit(1)
}

const pgCtl = path.join(binDir, 'pg_ctl.exe')
const logPath = path.join(logDir, 'postgresql.log')

function runPgCtl(args) {
  const result = spawnSync(pgCtl, args, {
    cwd,
    shell: false,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  process.exitCode = result.status || 0
}

switch (command) {
  case 'start':
    mkdirSync(logDir, { recursive: true })
    runPgCtl(['-D', dataDir, '-l', logPath, 'start'])
    break
  case 'stop':
    runPgCtl(['-D', dataDir, 'stop'])
    break
  case 'restart':
    mkdirSync(logDir, { recursive: true })
    runPgCtl(['-D', dataDir, '-l', logPath, 'restart'])
    break
  case 'status':
    runPgCtl(['-D', dataDir, 'status'])
    break
  default:
    console.error(`Unknown postgres-control command: ${command}`)
    console.error('Use start, stop, restart, or status.')
    process.exit(1)
}


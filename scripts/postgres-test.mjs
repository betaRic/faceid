import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { migrateTestDatabase } from '../tests/postgres/test-database.mjs'
import {
  assertOwnedPostgres18Cluster,
  assertRunningPostgres18Cluster,
  getPostgres18ClusterMarkerPath,
  getSafeTestClusterConfig,
  POSTGRES_18_CLUSTER_MARKER,
} from '../tests/postgres/test-cluster.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const command = String(process.argv[2] || 'status').toLowerCase()
const commands = new Set(['verify', 'init', 'start', 'stop', 'reset', 'status'])

function usage() {
  console.error('Usage: node scripts/postgres-test.mjs <verify|init|start|stop|reset|status>')
}

function run(executable, args) {
  const result = spawnSync(executable, args, {
    cwd: projectRoot,
    shell: false,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const error = new Error(`${path.basename(executable)} exited with status ${result.status}`)
    error.exitCode = result.status ?? 1
    throw error
  }
}

if (!commands.has(command)) {
  usage()
  process.exitCode = 1
} else {
  try {
    const { targetUrl, dataDir } = getSafeTestClusterConfig()
    const port = targetUrl.port ? Number(targetUrl.port) : 55432
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('FACEID_TEST_DATABASE_URL must use a valid PostgreSQL port')
    }
    const binDir = String(process.env.FACEID_TEST_PG_BIN || 'C:\\Program Files\\PostgreSQL\\18\\bin').trim()
    const runtimeDir = path.join(projectRoot, '.faceattend-test-runtime')
    const pgCtl = path.join(binDir, 'pg_ctl.exe')
    const initDb = path.join(binDir, 'initdb.exe')
    const logPath = path.join(runtimeDir, 'postgres-18.log')

    switch (command) {
      case 'verify':
        console.log(`FACEID_TEST_DATABASE_URL verified for ${targetUrl.hostname}:${port}${targetUrl.pathname}`)
        break
      case 'init':
        if (!existsSync(path.join(dataDir, 'PG_VERSION'))) {
          mkdirSync(dataDir, { recursive: true })
          run(initDb, ['-D', dataDir, '-U', 'postgres', '--encoding=UTF8', '--auth-local=trust', '--auth-host=trust'])
          assertOwnedPostgres18Cluster(dataDir, { requireMarker: false })
          writeFileSync(getPostgres18ClusterMarkerPath(dataDir), `${POSTGRES_18_CLUSTER_MARKER}\n`, 'utf8')
        } else {
          assertOwnedPostgres18Cluster(dataDir)
        }
        break
      case 'start':
        assertOwnedPostgres18Cluster(dataDir)
        mkdirSync(runtimeDir, { recursive: true })
        run(pgCtl, ['-D', dataDir, '-l', logPath, '-o', `-p ${port} -h 127.0.0.1`, '-w', 'start'])
        break
      case 'stop':
        assertOwnedPostgres18Cluster(dataDir)
        run(pgCtl, ['-D', dataDir, '-m', 'fast', '-w', 'stop'])
        break
      case 'reset':
        assertOwnedPostgres18Cluster(dataDir)
        assertRunningPostgres18Cluster({ dataDir, targetUrl })
        await migrateTestDatabase({ projectRoot, databaseUrl: targetUrl.toString() })
        break
      case 'status':
        assertOwnedPostgres18Cluster(dataDir)
        run(pgCtl, ['-D', dataDir, 'status'])
        break
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = error?.exitCode ?? 1
  }
}

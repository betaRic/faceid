import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { assertSafeTestDatabaseUrl } from './test-database.mjs'

const clusterMarker = '.faceattend-test-postgres-18'
const markerValue = 'faceattend-test-postgres-18'

export function getSafeTestClusterConfig() {
  const targetUrl = assertSafeTestDatabaseUrl()
  if (targetUrl.hostname !== '127.0.0.1') {
    throw new Error('FACEID_TEST_DATABASE_URL must use 127.0.0.1 because this test cluster binds IPv4 only')
  }
  if (!targetUrl.port) targetUrl.port = '55432'

  const rawDataDir = process.env.FACEID_TEST_PG_DATA === undefined
    ? 'D:\\faceattend-test-data\\postgres-18'
    : String(process.env.FACEID_TEST_PG_DATA).trim()
  if (!rawDataDir || !path.isAbsolute(rawDataDir)) {
    throw new Error('FACEID_TEST_PG_DATA must be a non-empty absolute path')
  }
  const dataDir = path.resolve(rawDataDir)

  return { targetUrl, dataDir }
}

export function assertOwnedPostgres18Cluster(dataDir, { requireMarker = true } = {}) {
  const versionPath = path.join(dataDir, 'PG_VERSION')
  const markerPath = path.join(dataDir, clusterMarker)
  const version = existsSync(versionPath) ? readFileSync(versionPath, 'utf8').trim() : ''
  const marker = existsSync(markerPath) ? readFileSync(markerPath, 'utf8').trim() : ''
  if (version !== '18' || (requireMarker && marker !== markerValue)) {
    throw new Error('FACEID_TEST_PG_DATA must be a test-owned PostgreSQL 18 cluster')
  }
}

export function getPostgres18ClusterMarkerPath(dataDir) {
  return path.join(dataDir, clusterMarker)
}

export function assertRunningPostgres18Cluster({ dataDir, targetUrl }) {
  assertOwnedPostgres18Cluster(dataDir)
  const binDir = String(process.env.FACEID_TEST_PG_BIN || 'C:\\Program Files\\PostgreSQL\\18\\bin').trim()
  const pgCtl = path.join(binDir, 'pg_ctl.exe')
  const result = spawnSync(pgCtl, ['-D', dataDir, 'status'], {
    shell: false,
    stdio: 'ignore',
  })
  if (result.error || result.status !== 0) {
    throw new Error('Test-owned PostgreSQL 18 cluster must be running from FACEID_TEST_PG_DATA')
  }

  const pidLines = readFileSync(path.join(dataDir, 'postmaster.pid'), 'utf8').split(/\r?\n/)
  const clusterPort = Number(pidLines[3])
  const targetPort = Number(targetUrl.port || 55432)
  if (clusterPort !== targetPort) {
    throw new Error('Test-owned PostgreSQL 18 cluster port must match FACEID_TEST_DATABASE_URL')
  }
}

export { markerValue as POSTGRES_18_CLUSTER_MARKER }

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const { Client } = pg
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

function getDatabaseName(url) {
  let databaseName
  try {
    databaseName = decodeURIComponent(url.pathname.slice(1))
  } catch {
    throw new Error('FACEID_TEST_DATABASE_URL must identify one database')
  }
  if (!/^faceid_rc_[A-Za-z0-9_-]+$/.test(databaseName)) {
    throw new Error('FACEID_TEST_DATABASE_URL database must be one faceid_rc_ name')
  }
  return databaseName
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`
}

export function canonicalDataDirectory(value, platform = process.platform) {
  const rawValue = String(value ?? '').trim()
  if (!rawValue) return ''
  const resolved = path.resolve(rawValue).replaceAll('\\', '/')
  return platform === 'win32' ? resolved.toLowerCase() : resolved
}

function assertConnectedTestServer(identity, { expectedDataDir, targetUrl }) {
  const expectedDirectory = canonicalDataDirectory(expectedDataDir)
  const actualDirectory = canonicalDataDirectory(identity?.data_directory)
  if (!expectedDirectory || actualDirectory !== expectedDirectory) {
    throw new Error('Connected PostgreSQL data directory does not match FACEID_TEST_PG_DATA')
  }

  const serverVersion = Number(identity?.server_version_num)
  if (!Number.isInteger(serverVersion) || serverVersion < 180000 || serverVersion >= 190000) {
    throw new Error('Connected PostgreSQL server is not PostgreSQL 18')
  }

  const serverAddress = String(identity?.server_addr ?? '').trim()
  if (serverAddress !== '127.0.0.1' && serverAddress !== '127.0.0.1/32') {
    throw new Error('Connected PostgreSQL server is not bound to 127.0.0.1')
  }

  const expectedPort = Number(targetUrl.port || 55432)
  if (Number(identity?.server_port) !== expectedPort) {
    throw new Error('Connected PostgreSQL server port does not match FACEID_TEST_DATABASE_URL')
  }
}

const serverIdentityQuery = `
  SELECT
    current_setting('data_directory') AS data_directory,
    current_setting('server_version_num') AS server_version_num,
    inet_server_addr()::text AS server_addr,
    inet_server_port() AS server_port
`

export function assertSafeTestDatabaseUrl(value = process.env.FACEID_TEST_DATABASE_URL) {
  const rawValue = String(value ?? '').trim()
  if (!rawValue) {
    throw new Error('FACEID_TEST_DATABASE_URL is required')
  }

  let url
  try {
    url = new URL(rawValue)
  } catch {
    throw new Error('FACEID_TEST_DATABASE_URL must be a valid PostgreSQL URL')
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('FACEID_TEST_DATABASE_URL must use postgres:// or postgresql://')
  }

  if (url.search || url.hash) {
    throw new Error('FACEID_TEST_DATABASE_URL must not include routing overrides')
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!LOOPBACK_HOSTS.has(hostname)) {
    throw new Error('FACEID_TEST_DATABASE_URL must use a loopback host')
  }

  getDatabaseName(url)
  return url
}

export async function migrateTestDatabase({
  projectRoot = process.cwd(),
  databaseUrl,
  expectedDataDir,
  createClient = options => new Client(options),
} = {}) {
  const targetUrl = assertSafeTestDatabaseUrl(databaseUrl)
  const targetDatabase = getDatabaseName(targetUrl)
  const adminUrl = new URL(targetUrl)
  adminUrl.pathname = '/postgres'

  const adminClient = createClient({ connectionString: adminUrl.toString() })
  let targetClient
  try {
    await adminClient.connect()
    const identityResult = await adminClient.query(serverIdentityQuery)
    assertConnectedTestServer(identityResult.rows?.[0], { expectedDataDir, targetUrl })
    const existing = await adminClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [targetDatabase],
    )
    if (existing.rowCount === 0) {
      await adminClient.query(`CREATE DATABASE ${quoteIdentifier(targetDatabase)}`)
    }

    targetClient = createClient({ connectionString: targetUrl.toString() })
    await targetClient.connect()
    const targetIdentityResult = await targetClient.query(serverIdentityQuery)
    assertConnectedTestServer(targetIdentityResult.rows?.[0], { expectedDataDir, targetUrl })
    await targetClient.query('DROP SCHEMA IF EXISTS public CASCADE')
    await targetClient.query('CREATE SCHEMA public')
    await targetClient.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    const migrationsDir = path.join(projectRoot, 'db', 'migrations')
    const files = (await readdir(migrationsDir))
      .filter(fileName => fileName.endsWith('.sql'))
      .sort()

    for (const fileName of files) {
      const sql = await readFile(path.join(migrationsDir, fileName), 'utf8')
      await targetClient.query('BEGIN')
      try {
        await targetClient.query(sql)
        await targetClient.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [fileName],
        )
        await targetClient.query('COMMIT')
      } catch (error) {
        await targetClient.query('ROLLBACK').catch(() => {})
        throw error
      }
    }
  } finally {
    await targetClient?.end().catch(() => {})
    await adminClient.end().catch(() => {})
  }
}

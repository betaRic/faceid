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

export async function migrateTestDatabase({ projectRoot = process.cwd(), databaseUrl } = {}) {
  const targetUrl = assertSafeTestDatabaseUrl(databaseUrl)
  const targetDatabase = getDatabaseName(targetUrl)
  const adminUrl = new URL(targetUrl)
  adminUrl.pathname = '/postgres'

  const adminClient = new Client({ connectionString: adminUrl.toString() })
  try {
    await adminClient.connect()
    const existing = await adminClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [targetDatabase],
    )
    if (existing.rowCount === 0) {
      await adminClient.query(`CREATE DATABASE ${quoteIdentifier(targetDatabase)}`)
    }
  } finally {
    await adminClient.end().catch(() => {})
  }

  const targetClient = new Client({ connectionString: targetUrl.toString() })
  try {
    await targetClient.connect()
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
    await targetClient.end().catch(() => {})
  }
}

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'
import { loadRepoEnv } from './lib/load-local-env.mjs'

const { Client } = pg

const cwd = process.cwd()
loadRepoEnv({ cwd })

const databaseUrl = String(process.env.DATABASE_URL || '').trim()
if (!databaseUrl) {
  console.error('DATABASE_URL is required. Set it in .env.local before running postgres:migrate.')
  process.exit(1)
}

const migrationsDir = path.join(cwd, 'db', 'migrations')
const client = new Client({ connectionString: databaseUrl })

async function ensureMigrationTable() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)
}

async function loadAppliedVersions() {
  const result = await client.query('SELECT version FROM schema_migrations')
  return new Set(result.rows.map(row => row.version))
}

async function applyMigration(fileName) {
  const filePath = path.join(migrationsDir, fileName)
  const sql = await readFile(filePath, 'utf8')

  await client.query('BEGIN')
  try {
    await client.query(sql)
    await client.query(
      'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING',
      [fileName],
    )
    await client.query('COMMIT')
    console.log(`applied ${fileName}`)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  }
}

try {
  await client.connect()
  await ensureMigrationTable()

  const files = (await readdir(migrationsDir))
    .filter(fileName => fileName.endsWith('.sql'))
    .sort()
  const applied = await loadAppliedVersions()

  let appliedCount = 0
  for (const fileName of files) {
    if (applied.has(fileName)) {
      console.log(`skip ${fileName}`)
      continue
    }
    await applyMigration(fileName)
    appliedCount += 1
  }

  console.log(appliedCount === 0 ? 'database already up to date' : `applied ${appliedCount} migration(s)`)
} finally {
  await client.end().catch(() => {})
}


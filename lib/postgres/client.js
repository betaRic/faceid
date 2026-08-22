import pg from 'pg'

const { Pool } = pg

let pool = null

function getDatabaseUrl() {
  const url = String(process.env.DATABASE_URL || '').trim()
  if (!url) {
    throw new Error('DATABASE_URL is required when DATA_BACKEND=postgres.')
  }
  return url
}

export function postgresEnabled() {
  const backend = String(process.env.DATA_BACKEND || '').trim().toLowerCase()
  if (backend) return backend === 'postgres' || backend === 'local'
  return Boolean(String(process.env.DATABASE_URL || '').trim())
}

export function getPostgresPool() {
  if (pool) return pool

  pool = new Pool({
    connectionString: getDatabaseUrl(),
    max: Number(process.env.POSTGRES_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.POSTGRES_IDLE_TIMEOUT_MS || 30_000),
    connectionTimeoutMillis: Number(process.env.POSTGRES_CONNECT_TIMEOUT_MS || 5_000),
  })
  pool.on('error', error => {
    console.error('[postgres] idle client error', {
      message: error.message,
      code: error.code,
    })
  })

  return pool
}

export async function closePostgresPool() {
  const current = pool
  pool = null
  if (current) await current.end()
}

export async function queryPostgres(text, params = []) {
  return getPostgresPool().query(text, params)
}

export async function withPostgresTransaction(fn) {
  const client = await getPostgresPool().connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

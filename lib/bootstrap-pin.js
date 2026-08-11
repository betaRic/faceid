import { postgresEnabled, queryPostgres } from './postgres/client'

const CONFIG_KEY = 'regional_pin_access'

function requirePostgresConfiguration() {
  if (!postgresEnabled()) {
    throw new Error('PostgreSQL is required for regional PIN configuration.')
  }
}

export async function isRegionalPinEnabled() {
  requirePostgresConfiguration()
  const result = await queryPostgres('SELECT value FROM system_config WHERE key = $1 LIMIT 1', [CONFIG_KEY])
  return result.rows[0]?.value?.enabled !== false
}

export async function setRegionalPinEnabled(enabled) {
  requirePostgresConfiguration()
  const value = { enabled: Boolean(enabled), updatedAt: Date.now() }
  await queryPostgres(
    `INSERT INTO system_config (key, value, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [CONFIG_KEY, JSON.stringify(value)],
  )
  return value.enabled
}

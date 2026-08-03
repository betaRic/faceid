import { postgresEnabled, queryPostgres } from './postgres/client'

const CONFIG_KEY = 'regional_pin_access'
const FIRESTORE_PATH = 'system_config/regional_pin_access'

export async function isRegionalPinEnabled(db) {
  if (postgresEnabled()) {
    const result = await queryPostgres('SELECT value FROM system_config WHERE key = $1 LIMIT 1', [CONFIG_KEY])
    return result.rows[0]?.value?.enabled !== false
  }
  const snapshot = await db.doc(FIRESTORE_PATH).get()
  return !snapshot.exists || snapshot.data()?.enabled !== false
}

export async function setRegionalPinEnabled(db, enabled) {
  const value = { enabled: Boolean(enabled), updatedAt: Date.now() }
  if (postgresEnabled()) {
    await queryPostgres(
      `INSERT INTO system_config (key, value, updated_at) VALUES ($1, $2::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [CONFIG_KEY, JSON.stringify(value)],
    )
  } else {
    await db.doc(FIRESTORE_PATH).set(value, { merge: true })
  }
  return value.enabled
}

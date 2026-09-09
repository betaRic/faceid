import 'server-only'
import { withPostgresTransaction } from './client'

export async function purgeExpiredBiometricMemory() {
  return withPostgresTransaction(async client => {
    await client.query("SET LOCAL statement_timeout = '1500ms'")
    const exists = await client.query("SELECT to_regclass('biometric_memory_candidates') AS table_name")
    if (!exists.rows[0]?.table_name) return 0 // Compatibility with pre-migration deployments.
    const result = await client.query(`DELETE FROM biometric_memory_candidates WHERE id IN (
      SELECT id FROM biometric_memory_candidates WHERE expires_at <= now() OR state = 'revoked'
      ORDER BY expires_at LIMIT 500 FOR UPDATE SKIP LOCKED
    )`)
    return result.rowCount
  })
}

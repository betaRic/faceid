import 'server-only'
import { withPostgresTransaction } from './client'
import { sanitizePhoneScanReport } from '../scan-report-policy.js'

export async function savePhoneScanReport(report) {
  const safe = sanitizePhoneScanReport(report)
  if (!safe) throw new Error('Invalid phone report')
  return withPostgresTransaction(async client => {
    await client.query("SET LOCAL statement_timeout = '1000ms'")
    await client.query("SET LOCAL lock_timeout = '100ms'")
    await client.query('INSERT INTO phone_scan_reports (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO NOTHING', [safe.id, JSON.stringify(safe)])
  })
}

export async function loadPhoneScanReports(window) {
  try {
    return await withPostgresTransaction(async client => {
      await client.query("SET LOCAL statement_timeout = '1500ms'")
      const result = await client.query(`SELECT data, received_at, count(*) OVER () AS total
        FROM phone_scan_reports WHERE received_at >= to_timestamp($1 / 1000.0)
        AND received_at < to_timestamp($2 / 1000.0) AND received_at > now() - interval '14 days'
        ORDER BY received_at DESC, id DESC LIMIT 500`, [window.startMs, window.endMs])
      const reports = result.rows.map(row => {
        const safe = sanitizePhoneScanReport(row.data)
        return safe ? { ...safe, receivedAt: new Date(row.received_at).toISOString() } : null
      }).filter(Boolean)
      const total = Number(result.rows[0]?.total || 0)
      return { available: true, source: 'unverified_phone_reports', retentionDays: 14,
        total, loaded: reports.length, truncated: total > reports.length, reports }
    })
  } catch {
    return { available: false, source: 'unverified_phone_reports', reports: [], reason: 'Phone reports unavailable.' }
  }
}

export async function purgePhoneScanReports() {
  return withPostgresTransaction(async client => {
    await client.query("SET LOCAL statement_timeout = '1500ms'")
    const table = await client.query("SELECT to_regclass('phone_scan_reports') AS name")
    if (!table.rows[0]?.name) return 0
    const result = await client.query(`DELETE FROM phone_scan_reports WHERE id IN (
      SELECT id FROM phone_scan_reports WHERE received_at <= now() - interval '14 days'
      ORDER BY received_at LIMIT 5000 FOR UPDATE SKIP LOCKED)`)
    return result.rowCount
  })
}

import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { queryPostgres, closePostgresPool } from '../../lib/postgres/client.js'
import { savePhoneScanReport, loadPhoneScanReports, purgePhoneScanReports } from '../../lib/postgres/phone-scan-reports.js'

after(closePostgresPool)
test('phone reports deduplicate, expire, redact and never write attendance', async () => {
  const before = await queryPostgres('SELECT count(*) AS n FROM attendance')
  const id = randomUUID()
  const report = { id, sessionId: randomUUID(), reason: 'no_usable_face', stage: 'capture',
    elapsedMs: 700, metrics: { trackWidth: 1280 }, accessCode: 'secret', photo: 'secret' }
  try {
    await Promise.all([savePhoneScanReport(report), savePhoneScanReport(report)])
    const saved = await queryPostgres('SELECT data FROM phone_scan_reports WHERE id = $1', [id])
    assert.equal(saved.rowCount, 1)
    assert.equal(JSON.stringify(saved.rows).includes('secret'), false)
    // Export must re-sanitize legacy/unexpected fields too, not blindly copy JSON.
    await queryPostgres(`UPDATE phone_scan_reports SET data = data || '{"accessCode":"secret"}'::jsonb WHERE id = $1`, [id])
    const result = await loadPhoneScanReports({ startMs: Date.now() - 60000, endMs: Date.now() + 60000 })
    assert.equal(result.available, true)
    assert.equal(result.reports.some(row => row.id === id), true)
    assert.equal(JSON.stringify(result).includes('secret'), false)
    await queryPostgres("UPDATE phone_scan_reports SET received_at = now() - interval '15 days' WHERE id = $1", [id])
    assert.equal((await loadPhoneScanReports({ startMs: 0, endMs: Date.now() + 60000 })).reports.some(row => row.id === id), false)
    assert.equal(await purgePhoneScanReports(), 1)
    assert.equal((await queryPostgres('SELECT count(*) AS n FROM attendance')).rows[0].n, before.rows[0].n)
  } finally { await queryPostgres('DELETE FROM phone_scan_reports WHERE id = $1', [id]) }
})

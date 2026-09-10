import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getLocationDeviceProfile, sanitizeLocationReport } from '../lib/location-report-policy.js'
import { buildLocationEvidence } from '../lib/maintenance/location-evidence.js'
import { loadLocationReports } from '../lib/postgres/phone-scan-reports.js'

const base = { id: 'a1111111-1111-4111-8111-111111111111', sessionId: 'b1111111-1111-4111-8111-111111111111',
  stage: 'location', reason: 'ready', elapsedMs: 100, device: 'desktop', browser: 'Edge', browserVersion: '140',
  os: 'Windows', connection: 'unknown', buildId: 'build-1', metrics: { firstAccuracy: 83, bestAccuracy: 83,
    firstReadingMs: 50, acceptedMs: 50, readingAgeMs: 0, readingCount: 1, maxAccuracy: 250,
    targetAccuracy: 250, maximumAge: 30000, timeout: 30000, attempt: 1 } }
test('location allowlist strips coordinates identity and unsupported values', () => {
  const safe = sanitizeLocationReport({ ...base, latitude: 6, employeeName: 'secret', metrics: { ...base.metrics, longitude: 125 } })
  assert.equal(safe.latitude, undefined); assert.equal(safe.employeeName, undefined)
  assert.equal(safe.metrics.longitude, undefined); assert.equal(safe.metrics.bestAccuracy, 83)
  assert.equal(sanitizeLocationReport({ ...base, reason: 'invented' }), null)
  assert.equal(sanitizeLocationReport({ ...base, metrics: { firstAccuracy: null } }).metrics.firstAccuracy, undefined)
})
test('connection quality never becomes physical connection type', () => {
  const p = getLocationDeviceProfile({ userAgent: 'Mozilla Windows NT Chrome/140.0 Edg/140.0', connection: { effectiveType: '4g' } })
  assert.equal(p.browser, 'Edge'); assert.equal(p.connection, 'unknown'); assert.equal(p.networkQuality, '4g')
})
test('iPad desktop browser and iOS browser versions are distinguished', () => {
  assert.equal(getLocationDeviceProfile({ userAgent: 'Macintosh Version/18.0 Safari/605', maxTouchPoints: 5 }).device, 'tablet')
  const p = getLocationDeviceProfile({ userAgent: 'iPhone CriOS/140.0 Safari/605' })
  assert.equal(p.browser, 'Chrome iOS'); assert.equal(p.os, 'iOS'); assert.equal(p.browserVersion, '140')
})
test('null measurements never count as zero and failures remain in denominator', () => {
  const report = buildLocationEvidence([base, { ...base, reason: 'timeout', elapsedMs: 30000, metrics: { ...base.metrics, bestAccuracy: null, firstReadingMs: null } }])
  assert.equal(report.groups[0].readyRate, .5)
  assert.equal(report.groups[0].medianAccuracy, 83)
  assert.equal(report.groups[0].completed, 2)
  assert.equal(report.groups[0].evidenceStatus, 'Not enough data')
})
test('different builds and policies cannot be combined', () => {
  const report = buildLocationEvidence([base, { ...base, buildId: 'build-2' }, { ...base, metrics: { ...base.metrics, maxAccuracy: 100 } }])
  assert.equal(report.groups.length, 3)
})
test('cancelled checks are reported separately from completed results', () => {
  const g = buildLocationEvidence([{ ...base, reason: 'cancelled' }]).groups[0]
  assert.equal(g.cancelled, 1); assert.equal(g.completed, 0); assert.equal(g.readyRate, null)
})

test('location storage reader keeps bounded window and sanitizes before aggregation', async () => {
  const queries = []
  const transaction = async callback => callback({ query: async (sql, args) => {
    queries.push({ sql, args })
    return { rows: sql.includes('SELECT data') ? [{ data: { ...base, latitude: 6 }, received_at: new Date(), total: '10001' }] : [] }
  } })
  const result = await loadLocationReports({ startMs: 100, endMs: 200 }, transaction)
  assert.equal(result.available, true); assert.equal(result.truncated, true)
  assert.equal(result.groups[0].evidenceStatus, 'Incomplete window')
  assert.equal(result.reports[0].latitude, undefined)
  const query = queries.find(q => q.sql.includes('SELECT data'))
  assert.deepEqual(query.args, [100, 200]); assert.match(query.sql, /LIMIT 10000/)
  assert.match(query.sql, /14 days/); assert.match(query.sql, /stage' = 'location'/)
})

test('unavailable location storage is distinct from a valid empty report', async () => {
  const failed = await loadLocationReports({}, async () => { throw Error('offline') })
  assert.equal(failed.available, false)
  const empty = await loadLocationReports({}, async callback => callback({ query: async () => ({ rows: [] }) }))
  assert.equal(empty.available, true); assert.equal(empty.total, 0)
})

test('sufficient observations are reviewable but incomplete windows never are', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ ...base, sessionId: `session-${i % 5}`, receivedAt: `2026-09-${10 + i % 3}T01:00:00Z` }))
  assert.equal(buildLocationEvidence(rows).groups[0].evidenceStatus, 'Ready for review')
  assert.equal(buildLocationEvidence(rows, { truncated: true }).groups[0].evidenceStatus, 'Incomplete window')
})

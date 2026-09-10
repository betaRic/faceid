function percentile(values, fraction) {
  const a = values.filter(v => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b)
  if (!a.length) return null
  const i = (a.length - 1) * fraction, lower = Math.floor(i)
  return a[lower] + (a[Math.ceil(i)] - a[lower]) * (i - lower)
}
export function buildLocationEvidence(reports = [], { truncated = false } = {}) {
  const groups = new Map()
  for (const row of reports) {
    const dimensions = { device: row.device, os: row.os, browser: row.browser, browserVersion: row.browserVersion,
      connection: row.connection, buildId: row.buildId, maxAccuracy: row.metrics?.maxAccuracy ?? null,
      targetAccuracy: row.metrics?.targetAccuracy ?? null, maximumAge: row.metrics?.maximumAge ?? null, timeout: row.metrics?.timeout ?? null }
    const key = JSON.stringify(dimensions)
    if (!groups.has(key)) groups.set(key, { ...dimensions, rows: [] })
    groups.get(key).rows.push(row)
  }
  return { groups: [...groups.values()].map(({ rows, ...group }) => {
    const complete = rows.filter(r => r.reason !== 'cancelled'), ready = rows.filter(r => r.reason === 'ready')
    const days = new Set(rows.filter(r => r.receivedAt).map(r => new Date(new Date(r.receivedAt).getTime() + 8 * 3600000).toISOString().slice(0, 10))).size
    const sessions = new Set(rows.map(r => r.sessionId)).size
    const outcomes = Object.fromEntries(['ready', 'imprecise', 'timeout', 'permission_denied', 'unavailable', 'unsupported', 'cancelled'].map(reason => [reason, rows.filter(r => r.reason === reason).length]))
    return { ...group, count: rows.length, completed: complete.length, ready: ready.length, cancelled: outcomes.cancelled,
      readyRate: complete.length ? ready.length / complete.length : null, outcomes, days, sessions,
      medianWaitMs: percentile(complete.map(r => r.elapsedMs), .5), slowWaitMs: percentile(complete.map(r => r.elapsedMs), .95),
      medianReadyMs: percentile(ready.map(r => r.elapsedMs), .5),
      medianAccuracy: percentile(rows.map(r => r.metrics?.bestAccuracy), .5),
      medianFirstReadingMs: percentile(rows.map(r => r.metrics?.firstReadingMs), .5),
      missingAccuracy: rows.filter(r => !Number.isFinite(r.metrics?.bestAccuracy)).length,
      evidenceStatus: truncated ? 'Incomplete window' : complete.length >= 30 && days >= 3 && sessions >= 5 && group.buildId !== 'unknown'
        ? 'Ready for review' : 'Not enough data',
    }
  }).sort((a, b) => b.count - a.count) }
}

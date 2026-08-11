export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminSessionCookieName, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'
import { resolveReportWindow } from '@/lib/report-window'
import { listLocalAuditLogs } from '@/lib/postgres/report-store'

function summarize(logs, window) {
  const byDecisionCode = {}; const byDate = {}; const byHour = {}
  for (const log of logs) {
    const code = log.metadata?.decisionCode || log.action
    byDecisionCode[code] = (byDecisionCode[code] || 0) + 1
    if (log.createdAt) {
      const date = log.createdAt.slice(0, 10); const hour = `${log.createdAt.slice(0, 13)}:00:00`
      byDate[date] = (byDate[date] || 0) + 1; byHour[hour] = (byHour[hour] || 0) + 1
    }
  }
  return { total: logs.length, window: { mode: window.mode, label: window.label, fromDateKey: window.fromDateKey, toDateKey: window.toDateKey, startUtc: window.startUtc, endUtcExclusive: window.endUtcExclusive }, byDecisionCode, byDate, byHour, recentLogs: logs.slice(0, 20).map(log => ({ id: log.id, action: log.action, summary: log.summary, decisionCode: log.metadata?.decisionCode, reason: log.metadata?.reason, createdAt: log.createdAt })) }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const summary = searchParams.get('summary') === 'true'
  const cookie = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!cookie) return NextResponse.json({ ok: false, message: 'Admin login is required.' }, { status: 401 })
  const session = await resolveAdminSession(null, cookie)
  if (!session) return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
  const limit = Math.min(Number.parseInt(searchParams.get('limit') || '100', 10) || 100, 500)
  const offset = searchParams.get('offset') || ''
  const requestedOfficeId = searchParams.get('officeId') || ''
  if (session.scope === 'office' && requestedOfficeId && requestedOfficeId !== session.officeId) return NextResponse.json({ ok: false, message: 'This session cannot access that office.' }, { status: 403 })
  const officeId = session.scope === 'office' ? session.officeId : requestedOfficeId
  const decisionCode = searchParams.get('decisionCode') || ''
  const window = resolveReportWindow(searchParams, { now: Date.now(), defaultDays: 14, maxDays: 62 })
  try {
    let logs = await listLocalAuditLogs({ officeId, limit, offset, startMs: window.startMs, endMs: window.endMs })
    if (decisionCode) logs = logs.filter(log => String(log.metadata?.decisionCode || log.action || '') === decisionCode)
    if (summary) return NextResponse.json(summarize(logs, window))
    return NextResponse.json({ logs, nextOffset: logs.length ? String(Number(offset || 0) + logs.length) : null, total: logs.length, window: summarize([], window).window })
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'Failed to load audit logs.' }, { status: 500 })
  }
}

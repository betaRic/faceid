export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import {
  getAdminSessionCookieName,
  parseAdminSessionCookieValue,
  resolveAdminSession,
} from '@/lib/admin-auth'

function safeSerialize(value) {
  if (value === null || value === undefined) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value.toDate === 'function') {
    try { return value.toDate().toISOString() } catch { return null }
  }
  if (Array.isArray(value)) return value.map(safeSerialize)
  if (typeof value === 'object') {
    const result = {}
    for (const [k, v] of Object.entries(value)) {
      result[k] = safeSerialize(v)
    }
    return result
  }
  return String(value)
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const summary = searchParams.get('summary') === 'true'
  const requireAuth = !summary

  const db = getAdminDb()

  if (requireAuth) {
    const session = parseAdminSessionCookieValue(
      request.cookies.get(getAdminSessionCookieName())?.value,
    )
    if (!session) {
      return NextResponse.json({ ok: false, message: 'Admin login is required.' }, { status: 401 })
    }
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }
  }
  const decisionCode = searchParams.get('decisionCode')
  const officeId = searchParams.get('officeId')
  const dateFrom = searchParams.get('from')
  const dateTo = searchParams.get('to')
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)
  const offset = searchParams.get('offset')
  let query = db.collection('audit_logs').orderBy('createdAt', 'desc')

  let snapshot = await query.limit(limit).get()

  if (offset && offset.length > 0) {
    const lastDoc = await db.collection('audit_logs').doc(offset).get()
    if (lastDoc.exists) {
      snapshot = await query.startAfter(lastDoc).limit(limit).get()
    }
  }

  const logs = snapshot.docs.map(doc => {
    const data = doc.data()
    return safeSerialize({
      id: doc.id,
      ...data,
      createdAt: data.createdAt,
    })
  })

  let filtered = logs
  if (dateFrom || dateTo) {
    const fromMs = dateFrom ? new Date(dateFrom).getTime() : 0
    const toMs = dateTo ? new Date(dateTo).getTime() : Date.now()
    filtered = logs.filter(log => {
      const ts = log.createdAt ? new Date(log.createdAt).getTime() : 0
      return ts >= fromMs && ts <= toMs
    })
  }

  if (summary) {
    const byDecision = {}
    const byDate = {}
    const byHour = {}

    filtered.forEach(log => {
      const code = log.metadata?.decisionCode || log.action
      byDecision[code] = (byDecision[code] || 0) + 1

      if (log.createdAt) {
        const date = log.createdAt.split('T')[0]
        byDate[date] = (byDate[date] || 0) + 1

        const hour = log.createdAt.slice(0, 13) + ':00:00'
        byHour[hour] = (byHour[hour] || 0) + 1
      }
    })

    const recentLogs = filtered.slice(0, 20).map(log => ({
      id: log.id,
      action: log.action,
      summary: log.summary,
      decisionCode: log.metadata?.decisionCode,
      reason: log.metadata?.reason,
      createdAt: log.createdAt,
    }))

    return NextResponse.json({
      total: filtered.length,
      byDecisionCode: byDecision,
      byDate,
      byHour,
      recentLogs,
    })
  }

  const nextOffset = logs.length > 0 ? logs[logs.length - 1].id : null

  return NextResponse.json({
    logs,
    nextOffset,
    total: snapshot.size,
  })
}
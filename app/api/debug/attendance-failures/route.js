export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { getAdminSessionCookieName, isRegionalAdminSession, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'

function safeTimestamp(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value
  if (typeof value === 'number') return new Date(value).toISOString()
  return null
}

function safeSerialize(value) {
  if (value === null || value === undefined) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value.toDate === 'function') return safeTimestamp(value)
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
  const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = getAdminDb()
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession || !isRegionalAdminSession(resolvedSession)) {
      return NextResponse.json({ error: 'Regional admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100)

    const snapshot = await db.collection('audit_logs')
      .where('action', '==', 'attendance_scan_failed')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get()

    const logs = snapshot.docs.map(doc => {
      const data = doc.data()
      return safeSerialize({
        id: doc.id,
        action: data.action,
        summary: data.summary,
        metadata: data.metadata,
        createdAt: data.createdAt,
      })
    })

    // Show matching-specific debug fields inline for quick diagnosis
    const diagnosed = logs.map(log => ({
      ...log,
      _diagnosis: {
        decisionCode: log.metadata?.decisionCode,
        bestDistance: log.metadata?.bestDistance ?? 'NOT_RECORDED',
        candidatesFound: log.metadata?.candidatesFound ?? 'NOT_RECORDED',
        candidateCount: log.metadata?.candidateCount ?? 'NOT_RECORDED',
        threshold: log.metadata?.threshold,
        storedMagnitude: log.metadata?.storedMagnitude,
        queryMagnitude: log.metadata?.queryMagnitude,
      },
    }))

    // Stats
    const byDecision = {}
    for (const log of logs) {
      const dc = log.metadata?.decisionCode || 'unknown'
      byDecision[dc] = (byDecision[dc] || 0) + 1
    }

    return NextResponse.json({ total: logs.length, byDecisionCode: byDecision, logs: diagnosed })
  } catch (err) {
    return NextResponse.json(
      { error: err.message, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined },
      { status: 500 },
    )
  }
}

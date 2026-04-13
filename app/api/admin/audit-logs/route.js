export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { resolveAdminSession } from '@/lib/admin-auth'

export async function GET(request) {
  const sessionError = await resolveAdminSession(request)
  if (sessionError) return sessionError

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')
  const decisionCode = searchParams.get('decisionCode')
  const officeId = searchParams.get('officeId')
  const dateFrom = searchParams.get('from')
  const dateTo = searchParams.get('to')
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)
  const offset = searchParams.get('offset')
  const summary = searchParams.get('summary') === 'true'

  const db = getAdminDb()
  let query = db.collection('audit_logs').orderBy('createdAt', 'desc')

  if (action) {
    query = query.where('action', '==', action)
  }
  if (decisionCode) {
    query = query.where('metadata.decisionCode', '==', decisionCode)
  }
  if (officeId) {
    query = query.where('officeId', '==', officeId)
  }

  let snapshot = await query.limit(limit).get()

  if (offset && offset.length > 0) {
    const lastDoc = await db.collection('audit_logs').doc(offset).get()
    if (lastDoc.exists) {
      snapshot = await query.startAfter(lastDoc).limit(limit).get()
    }
  }

  const logs = snapshot.docs.map(doc => {
    const data = doc.data()
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
    }
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
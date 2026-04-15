export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { getHrSessionCookieName, parseHrSessionCookieValue, resolveHrSession } from '@/lib/hr-auth'
import { getAdminSessionCookieName, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'

export async function GET(request) {
  const db = getAdminDb()

  const adminSession = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  const hrSession = parseHrSessionCookieValue(request.cookies.get(getHrSessionCookieName())?.value)

  let resolvedSession = null
  if (adminSession) {
    resolvedSession = await resolveAdminSession(db, adminSession)
  }
  if (!resolvedSession && hrSession) {
    resolvedSession = await resolveHrSession(db, hrSession)
  }
  if (!resolvedSession || !resolvedSession.active) {
    return NextResponse.json({ ok: false, message: 'Admin or HR login is required.' }, { status: 401 })
  }

  try {
    let query = db.collection('persons').orderBy('nameLower', 'asc')

    if (resolvedSession.scope === 'office' && resolvedSession.officeId) {
      query = query.where('officeId', '==', resolvedSession.officeId)
    } else if (resolvedSession.scope === 'regional') {
    } else if (resolvedSession.officeId) {
      query = query.where('officeId', '==', resolvedSession.officeId)
    }

    const snapshot = await query.get()

    const employees = snapshot.docs.map(doc => {
      const d = doc.data()
      return {
        id: doc.id,
        name: d.name || '',
        employeeId: d.employeeId || '',
        officeId: d.officeId || '',
        officeName: d.officeName || '',
        active: d.active !== false,
        approvalStatus: d.approvalStatus || 'pending',
      }
    })

    return NextResponse.json({ ok: true, employees })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load employees.' },
      { status: 500 },
    )
  }
}
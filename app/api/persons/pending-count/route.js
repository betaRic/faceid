export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import * as adminAuth from '@/lib/admin-auth'
import { countDirectoryRecords } from '@/lib/persons'

export async function GET(request) {
  const session = adminAuth.parseAdminSessionCookieValue(
    request.cookies.get(adminAuth.getAdminSessionCookieName())?.value,
  )
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin login is required.' }, { status: 401 })
  }

  try {
    const db = getAdminDb()
    const resolvedSession = await adminAuth.resolveAdminSession(db, session)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }

    const pending = await countDirectoryRecords(db, resolvedSession, {
      approval: 'pending',
      status: 'all',
      officeId: '',
      searchMode: 'name',
      searchValue: '',
    })

    return NextResponse.json({ ok: true, pending })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load pending count.' },
      { status: 500 },
    )
  }
}

import { NextResponse } from 'next/server'
import { getAdminDb } from '../../../../../lib/firebase-admin'
import {
  getAdminSessionCookieName,
  isRegionalAdminSession,
  parseAdminSessionCookieValue,
  resolveAdminSession,
} from '../../../../../lib/admin-auth'
import { writeAuditLog } from '../../../../../lib/audit-log'
import { summarizeFirestoreIndexSync, syncFirestoreIndexes } from '../../../../../lib/firestore-index-admin'

export const runtime = 'nodejs'

export async function POST(request) {
  const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin login is required.' }, { status: 401 })
  }

  try {
    const db = getAdminDb()
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }
    if (!isRegionalAdminSession(resolvedSession)) {
      return NextResponse.json({ ok: false, message: 'Regional admin access is required.' }, { status: 403 })
    }

    const summary = await syncFirestoreIndexes()
    const message = summarizeFirestoreIndexSync(summary)

    await writeAuditLog(db, {
      actorRole: resolvedSession.role,
      actorScope: resolvedSession.scope,
      actorOfficeId: resolvedSession.officeId,
      action: 'firestore_index_sync',
      targetType: 'system',
      targetId: 'firestore_indexes',
      officeId: '',
      summary: message,
      metadata: {
        projectId: summary.projectId,
        compositeRequested: summary.composite.requested,
        compositeSubmitted: summary.composite.submitted,
        compositeExisting: summary.composite.existing,
        compositeFailed: summary.composite.failed,
        fieldOverridesRequested: summary.fieldOverrides.requested,
        fieldOverridesSubmitted: summary.fieldOverrides.submitted,
        fieldOverridesFailed: summary.fieldOverrides.failed,
      },
    })

    return NextResponse.json({
      ok: summary.ok,
      message,
      summary,
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to sync Firestore indexes.' },
      { status: 500 },
    )
  }
}


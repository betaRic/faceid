export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { writeAuditLog } from '@/lib/audit-log'
import { createOriginGuard } from '@/lib/csrf'
import { resolveEmployeeManagementSession, sessionAllowsOffice } from '@/lib/employee-access'
import { getLocalPersonById } from '@/lib/postgres/person-store'

export async function GET(request, { params }) {
  const { personId } = await params
  if (!personId) {
    return NextResponse.json({ ok: false, message: 'Missing person ID.' }, { status: 400 })
  }

  try {
    const db = null
    const resolvedSession = await resolveEmployeeManagementSession(request, db)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin or HR login with employee access is required.' }, { status: 401 })
    }

    const person = await getLocalPersonById(personId)
    if (!person) {
      return NextResponse.json({ ok: false, message: 'Employee record was not found.' }, { status: 404 })
    }

    if (!sessionAllowsOffice(resolvedSession, person?.officeId || '')) {
      return NextResponse.json({ ok: false, message: 'This session cannot access that employee photo.' }, { status: 403 })
    }

    const { readLocalEnrollmentPhoto } = await import('@/lib/postgres/photo-store')
    const photo = await readLocalEnrollmentPhoto(person)
    if (!photo) {
      return NextResponse.json({ ok: false, message: 'Employee photo was not found.' }, { status: 404 })
    }

    return new NextResponse(photo.buffer, {
      status: 200,
      headers: {
        'Content-Type': photo.contentType,
        'Cache-Control': 'private, max-age=300, stale-while-revalidate=60',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load employee photo.' },
      { status: 500 },
    )
  }
}

export async function POST(request, { params }) {
  const originGuard = createOriginGuard()
  const originError = await originGuard(request)
  if (originError) return originError

  const { personId } = await params
  if (!personId) {
    return NextResponse.json({ ok: false, message: 'Missing person ID.' }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const photoDataUrl = String(body?.photoDataUrl || '').trim()
  if (!/^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(photoDataUrl)) {
    return NextResponse.json({ ok: false, message: 'Choose a valid JPEG, PNG, or WebP image.' }, { status: 400 })
  }
  if (photoDataUrl.length > 7 * 1024 * 1024) {
    return NextResponse.json({ ok: false, message: 'Profile photo must be 5 MB or smaller.' }, { status: 400 })
  }

  try {
    const db = null
    const resolvedSession = await resolveEmployeeManagementSession(request, db)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin or HR employee-management access is required.' }, { status: 403 })
    }

    const person = await getLocalPersonById(personId)
    if (!person) {
      return NextResponse.json({ ok: false, message: 'Employee record was not found.' }, { status: 404 })
    }
    if (!sessionAllowsOffice(resolvedSession, person.officeId || '')) {
      return NextResponse.json({ ok: false, message: 'This session cannot update that employee photo.' }, { status: 403 })
    }

    const { saveLocalEnrollmentPhoto } = await import('@/lib/postgres/photo-store')
    const savedPhoto = await saveLocalEnrollmentPhoto(personId, photoDataUrl)
    await writeAuditLog(db, {
      actorRole: resolvedSession.role,
      actorScope: resolvedSession.scope,
      actorOfficeId: resolvedSession.officeId,
      action: 'person_profile_photo_upload',
      targetType: 'person',
      targetId: personId,
      officeId: person.officeId || '',
      summary: `Updated profile photo for ${person.name || person.employeeId || personId}`,
      metadata: {
        employeeId: person.employeeId || '',
        contentType: savedPhoto.contentType,
      },
    })

    return NextResponse.json({
      ok: true,
      photoPath: savedPhoto.path,
      photoUrl: `/api/persons/${personId}/photo`,
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to save profile photo.' },
      { status: 500 },
    )
  }
}


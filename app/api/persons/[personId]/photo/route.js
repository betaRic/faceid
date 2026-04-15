export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { resolveEmployeeManagementSession, sessionAllowsOffice } from '@/lib/employee-access'
import { readEnrollmentPhoto } from '@/lib/storage'

export async function GET(request, { params }) {
  const { personId } = await params
  if (!personId) {
    return NextResponse.json({ ok: false, message: 'Missing person ID.' }, { status: 400 })
  }

  try {
    const db = getAdminDb()
    const resolvedSession = await resolveEmployeeManagementSession(request, db)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin or HR login with employee access is required.' }, { status: 401 })
    }

    const personDoc = await db.collection('persons').doc(personId).get()
    if (!personDoc.exists) {
      return NextResponse.json({ ok: false, message: 'Employee record was not found.' }, { status: 404 })
    }

    const person = personDoc.data()
    if (!sessionAllowsOffice(resolvedSession, person?.officeId || '')) {
      return NextResponse.json({ ok: false, message: 'This session cannot access that employee photo.' }, { status: 403 })
    }

    const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim()
    if (!storageBucket) {
      return NextResponse.json({ ok: false, message: 'Storage bucket is not configured.' }, { status: 503 })
    }

    const photo = await readEnrollmentPhoto(storageBucket, personId, person?.photoPath || '')
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

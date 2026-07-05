export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { resolveEmployeeManagementSession, sessionAllowsOffice } from '@/lib/employee-access'
import { readEnrollmentPhoto } from '@/lib/storage'
import { postgresEnabled } from '@/lib/postgres/client'
import { getLocalPersonById } from '@/lib/postgres/person-store'

export async function GET(request, { params }) {
  const { personId } = await params
  if (!personId) {
    return NextResponse.json({ ok: false, message: 'Missing person ID.' }, { status: 400 })
  }

  try {
    const usePostgres = postgresEnabled()
    const db = null
    const resolvedSession = await resolveEmployeeManagementSession(request, db)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin or HR login with employee access is required.' }, { status: 401 })
    }

    const personDoc = usePostgres ? await getLocalPersonById(personId) : await db.collection('persons').doc(personId).get()
    if (usePostgres ? !personDoc : !personDoc.exists) {
      return NextResponse.json({ ok: false, message: 'Employee record was not found.' }, { status: 404 })
    }

    const person = usePostgres ? personDoc : personDoc.data()
    if (!sessionAllowsOffice(resolvedSession, person?.officeId || '')) {
      return NextResponse.json({ ok: false, message: 'This session cannot access that employee photo.' }, { status: 403 })
    }

    if (usePostgres) {
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


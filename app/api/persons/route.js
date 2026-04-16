export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import * as adminAuth from '@/lib/admin-auth'
import { writeAuditLog } from '@/lib/audit-log'
import { enforceRateLimit, getRequestIp } from '@/lib/rate-limit'
import { getOfficeRecord } from '@/lib/office-directory'
import { createOriginGuard } from '@/lib/csrf'
import {
  normalizeBody,
  validateBody,
  parseDirectoryParams,
  mapPersonRecord,
  countDirectoryRecords,
  loadDirectoryPage,
  enrollPerson,
  uploadEnrollmentPhotoIfPending,
  writeEnrollmentAuditLog,
} from '@/lib/persons'
import { encodePersonDirectoryCursor } from '@/lib/person-directory'

export async function GET(request) {
  const session = adminAuth.parseAdminSessionCookieValue(
    request.cookies.get(adminAuth.getAdminSessionCookieName())?.value,
  )
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin login is required to load employees.' }, { status: 401 })
  }

  try {
    const db = getAdminDb()
    const resolvedSession = await adminAuth.resolveAdminSession(db, session)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }

    if (new URL(request.url).searchParams.get('mode') === 'directory') {
      return handleDirectoryGet(request, db, resolvedSession)
    }

    const snapshot = resolvedSession.scope === 'office'
      ? await db.collection('persons').where('officeId', '==', resolvedSession.officeId).get()
      : await db.collection('persons').orderBy('nameLower').get()

    const persons = snapshot.docs.map(mapPersonRecord)
      .filter(person => adminAuth.adminSessionAllowsOffice(resolvedSession, person.officeId))
      .sort((left, right) => left.name.localeCompare(right.name))

    return NextResponse.json({ ok: true, persons })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load employees.' },
      { status: 500 },
    )
  }
}

async function handleDirectoryGet(request, db, resolvedSession) {
  const params = parseDirectoryParams(request)

  const [allTotal, pending, rejected] = await Promise.all([
    countDirectoryRecords(db, resolvedSession, { ...params, approval: 'all' }),
    countDirectoryRecords(db, resolvedSession, { ...params, approval: 'pending' }),
    countDirectoryRecords(db, resolvedSession, { ...params, approval: 'rejected' }),
  ])

  const approved = Math.max(0, allTotal - pending - rejected)
  const total = params.approval === 'all' ? allTotal : params.approval === 'approved' ? approved : params.approval === 'pending' ? pending : rejected

  const pageResult = await loadDirectoryPage(db, resolvedSession, params)
  const persons = pageResult.docs
    .map(mapPersonRecord)
    .filter(person => adminAuth.adminSessionAllowsOffice(resolvedSession, person.officeId))

  const lastPerson = persons[persons.length - 1]
  const nextCursor = pageResult.hasMore && lastPerson
    ? encodePersonDirectoryCursor({
        ...lastPerson,
        [pageResult.primaryField]: lastPerson?.[pageResult.primaryField] || '',
        [pageResult.secondaryField]: lastPerson?.[pageResult.secondaryField] || '',
      }, params.searchMode)
    : ''

  return NextResponse.json({
    ok: true,
    persons,
    page: {
      limit: params.limit,
      hasMore: pageResult.hasMore,
      nextCursor,
      total,
      approved,
      pending,
      rejected,
      searchMode: params.searchMode,
    },
  })
}

export async function POST(request) {
  const guard = createOriginGuard()
  const originError = await guard(request)
  if (originError) return originError

  const body = normalizeBody(await request.json().catch(() => null))
  const validationError = validateBody(body)
  if (validationError) {
    return NextResponse.json({ ok: false, message: validationError }, { status: 400 })
  }

  let publicSubmission = true
  try {
    const db = getAdminDb()
    const session = adminAuth.parseAdminSessionCookieValue(
      request.cookies.get(adminAuth.getAdminSessionCookieName())?.value,
    )
    const resolvedSession = session ? await adminAuth.resolveAdminSession(db, session) : null
    publicSubmission = !resolvedSession
    const office = await getOfficeRecord(db, body.officeId)

    if (!office) {
      return NextResponse.json({ ok: false, message: 'Assigned office was not found.' }, { status: 400 })
    }

    if (resolvedSession && !adminAuth.adminSessionAllowsOffice(resolvedSession, office.id)) {
      return NextResponse.json(
        { ok: false, message: 'This admin session cannot enroll employees for that office.' },
        { status: 403 },
      )
    }

    const ip = getRequestIp(request)
    const ipLimit = await enforceRateLimit(db, {
      key: `persons-ip:${ip}`,
      limit: 30,
      windowMs: 60 * 1000,
    })
    if (!ipLimit.ok) {
      return NextResponse.json(
        { ok: false, message: 'Too many enrollment attempts from this device or network. Slow down and try again.' },
        { status: 429 },
      )
    }

    if (!resolvedSession) {
      const employeeLimit = await enforceRateLimit(db, {
        key: `persons-employee:${body.officeId}:${String(body.employeeId || '').toLowerCase()}`,
        limit: 6,
        windowMs: 60 * 60 * 1000,
      })
      if (!employeeLimit.ok) {
        return NextResponse.json(
          { ok: false, message: 'Too many enrollment attempts for this employee ID. Wait before trying again.' },
          { status: 429 },
        )
      }
    }

    const { transactionResult, sampleCount, indexSyncWarning } = await enrollPerson(db, body, office, resolvedSession)

    await uploadEnrollmentPhotoIfPending(
      db,
      transactionResult.personId,
      body.photoDataUrl,
      transactionResult.nextPerson.approvalStatus,
    )

    await writeEnrollmentAuditLog(db, transactionResult, body, office, resolvedSession)

    const message = transactionResult.nextPerson.approvalStatus === 'pending'
      ? 'Enrollment submitted for admin approval. The employee record and biometric samples are not active on the kiosk until approved.'
      : 'Enrollment saved.'

    return NextResponse.json({
      ok: true,
      personId: transactionResult.personId,
      approvalStatus: transactionResult.nextPerson.approvalStatus,
      sampleCount,
      savedSampleCount: transactionResult.uniqueCount,
      message: indexSyncWarning ? `${message} Warning: ${indexSyncWarning}` : message,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save enrollment.'
    const duplicateFace = error.duplicateFace

    if (duplicateFace) {
      return NextResponse.json(
        {
          ok: false,
          message: publicSubmission
            ? 'A face similar to an existing employee was found. Duplicate enrollment blocked.'
            : `Face is too similar to ${duplicateFace.person.name} (${duplicateFace.person.employeeId || 'no employee ID'}). Duplicate enrollment blocked.`,
        },
        { status: 409 },
      )
    }

    return NextResponse.json(
      { ok: false, message },
      { status: message.startsWith('Employee ID already exists.') ? 409 : 500 },
    )
  }
}

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import * as adminAuth from '@/lib/admin-auth'
import { enforceRateLimit, getRequestIp } from '@/lib/rate-limit'
import { getOfficeRecord } from '@/lib/office-directory'
import { createOriginGuard } from '@/lib/csrf'
import { buildAuthoritativeEnrollmentPayload } from '@/lib/biometrics/server-enrollment'
import {
  enrollLocalPerson,
  loadLocalPersonDirectory,
  listLocalPersons,
  writeLocalEnrollmentAuditLog,
} from '@/lib/postgres/person-store'
import {
  normalizeBody,
  validateBody,
  validateDivisionAgainstOffice,
  parseDirectoryParams,
} from '@/lib/persons'
import { encodePersonDirectoryCursor } from '@/lib/person-directory'
import { createPrivacyConsentRecord, PRIVACY_NOTICE_VERSION } from '@/lib/privacy-consent'

function toHttpStatus(value) {
  const status = Number(value)
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500
}

function createRouteTimer(operation) {
  const startedAt = Date.now()
  const marks = []
  return {
    mark(label) {
      marks.push({ label, elapsedMs: Date.now() - startedAt })
    },
    warnIfSlow(thresholdMs = 3000) {
      const elapsedMs = Date.now() - startedAt
      if (elapsedMs < thresholdMs) return
      console.warn(`[PersonsAPI] Slow ${operation}`, { elapsedMs, marks })
    },
  }
}

export async function GET(request) {
  const timer = createRouteTimer('GET /api/persons')
  const session = adminAuth.parseAdminSessionCookieValue(
    request.cookies.get(adminAuth.getAdminSessionCookieName())?.value,
  )
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin login is required to load employees.' }, { status: 401 })
  }

  try {
    const db = null
    const resolvedSession = await adminAuth.resolveAdminSession(db, session)
    timer.mark('session')
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }

    if (new URL(request.url).searchParams.get('mode') === 'directory') {
      const params = parseDirectoryParams(request)
      const effectiveOfficeId = resolvedSession.scope === 'office' ? resolvedSession.officeId : params.officeId
      if (params.divisionId) {
        if (!effectiveOfficeId) {
          return NextResponse.json({ ok: false, message: 'Choose the regional office before filtering by division.' }, { status: 400 })
        }
        const office = await getOfficeRecord(db, effectiveOfficeId)
        const validDivision = Array.isArray(office?.divisions)
          && office.divisions.some((division) => division?.id === params.divisionId)
        if (!validDivision) {
          return NextResponse.json({ ok: false, message: 'The selected division does not belong to this office.' }, { status: 400 })
        }
      }
      const directory = await loadLocalPersonDirectory({
        ...params,
        officeId: effectiveOfficeId,
      })
      const lastPerson = directory.persons[directory.persons.length - 1]
      const nextCursor = directory.hasMore && lastPerson
        ? encodePersonDirectoryCursor(lastPerson, params.searchMode)
        : ''
      return NextResponse.json({
        ok: true,
        persons: directory.persons,
        page: {
          limit: params.limit,
          hasMore: directory.hasMore,
          nextCursor,
          total: directory.total,
          approved: directory.approved,
          pending: directory.pending,
          rejected: directory.rejected,
          searchMode: params.searchMode,
        },
      })
    }

    const persons = (await listLocalPersons({
      officeId: resolvedSession.scope === 'office' ? resolvedSession.officeId : '',
    }))
      .filter(person => adminAuth.adminSessionAllowsOffice(resolvedSession, person.officeId))
    return NextResponse.json({ ok: true, persons })
  } catch (error) {
    timer.warnIfSlow(1000)
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load employees.' },
      { status: 500 },
    )
  }
}

export async function POST(request) {
  const timer = createRouteTimer('POST /api/persons')
  const guard = createOriginGuard()
  const originError = await guard(request)
  if (originError) return originError
  let body = normalizeBody(await request.json().catch(() => null))
  const validationError = validateBody(body)
  if (validationError) {
    return NextResponse.json({ ok: false, message: validationError }, { status: 400 })
  }
  timer.mark('body')

  let publicSubmission = true
  try {
    const db = null
    const session = adminAuth.parseAdminSessionCookieValue(
      request.cookies.get(adminAuth.getAdminSessionCookieName())?.value,
    )
    const resolvedSession = session ? await adminAuth.resolveAdminSession(db, session) : null
    publicSubmission = !resolvedSession
    if (publicSubmission && (!body.privacyConsent || body.privacyNoticeVersion !== PRIVACY_NOTICE_VERSION)) {
      return NextResponse.json(
        { ok: false, message: 'You must read and accept the Data Privacy Notice before submitting registration.' },
        { status: 400 },
      )
    }
    if (publicSubmission) {
      body = { ...body, privacyConsentRecord: createPrivacyConsentRecord() }
    }
    const office = await getOfficeRecord(db, body.officeId)
    timer.mark('session-office')

    if (!office) {
      return NextResponse.json({ ok: false, message: 'Assigned office was not found.' }, { status: 400 })
    }

    const divisionError = validateDivisionAgainstOffice(body, office)
    if (divisionError) {
      return NextResponse.json({ ok: false, message: divisionError }, { status: 400 })
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
    timer.mark('rate-limit-ip')
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
      timer.mark('rate-limit-employee')
      if (!employeeLimit.ok) {
        return NextResponse.json(
          { ok: false, message: 'Too many enrollment attempts for this employee ID. Wait before trying again.' },
          { status: 429 },
        )
      }
    }

    const authoritativePayload = await buildAuthoritativeEnrollmentPayload(
      body.sampleFrames,
      body.captureMetadata,
    )
    timer.mark('server-enrollment')
    if (Number(authoritativePayload.diagnostics?.totalWallMs || 0) >= 5000) {
      console.warn('[PersonsAPI] Slow enrollment embedding', {
        totalWallMs: authoritativePayload.diagnostics.totalWallMs,
        acceptedCount: authoritativePayload.diagnostics.acceptedCount,
        rejectedCount: authoritativePayload.diagnostics.rejectedFrames?.length || 0,
        frameTimings: authoritativePayload.diagnostics.frameTimings || [],
      })
    }
    body = {
      ...body,
      descriptors: authoritativePayload.descriptors,
      captureMetadata: authoritativePayload.captureMetadata,
      biometricModelVersion: authoritativePayload.biometricModelVersion,
    }

    const { transactionResult, sampleCount, indexSyncWarning, duplicateReviewRequired } =
      await enrollLocalPerson(body, office, resolvedSession)
    timer.mark('enroll-write')

    const { saveLocalEnrollmentPhoto } = await import('@/lib/postgres/photo-store')
    await saveLocalEnrollmentPhoto(transactionResult.personId, body.photoDataUrl)
    await writeLocalEnrollmentAuditLog(transactionResult, body, office, resolvedSession)
    timer.mark('photo')
    timer.mark('audit')

    const baseMessage = transactionResult.nextPerson.lifecycleStatus === 'pending'
      ? 'Enrollment submitted for HR review. The employee record and biometric samples are not active on the kiosk until activated.'
      : 'Enrollment saved.'
    const message = duplicateReviewRequired
      ? `${baseMessage} Similarity review required: an existing employee profile is close enough that an authorized reviewer should verify this submission before activation.`
      : baseMessage

    timer.warnIfSlow()
    return NextResponse.json({
      ok: true,
      personId: transactionResult.personId,
      accessCode: transactionResult.nextPerson.accessCode || '',
      lifecycleStatus: transactionResult.nextPerson.lifecycleStatus,
      sampleCount,
      savedSampleCount: transactionResult.uniqueCount,
      duplicateReviewRequired,
      duplicateReviewStatus: transactionResult.nextPerson.duplicateReviewStatus || 'clear',
      message: indexSyncWarning ? `${message} Warning: ${indexSyncWarning}` : message,
    })
  } catch (error) {
    timer.warnIfSlow(1000)
    const message = error instanceof Error ? error.message : 'Failed to save enrollment.'
    const duplicateFace = error.duplicateFace

    if (duplicateFace?.duplicate) {
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

    const duplicateRegistration = error?.code === 'duplicate_person_registration'
    return NextResponse.json(
      { ok: false, message },
      { status: duplicateFace?.duplicate || duplicateRegistration ? 409 : (message.startsWith('Employee ID already exists.') ? 409 : toHttpStatus(error?.status)) },
    )
  }
}


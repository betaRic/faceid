import { NextResponse } from 'next/server'
import * as adminAuth from '@/lib/admin-auth'
import { enforceRateLimit, getRequestIp } from '@/lib/rate-limit'
import { getOfficeRecord } from '@/lib/office-directory'
import { createOriginGuard } from '@/lib/csrf'
import {
  normalizeBody,
  validateBody,
  validateDivisionAgainstOffice,
} from '@/lib/persons'
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
    snapshot() {
      return { operation, elapsedMs: Date.now() - startedAt, marks }
    },
  }
}

export function createPersonsPostHandler({
  buildAuthoritativeEnrollmentPayload,
  enrollLocalPerson,
  normalizeDataImage,
  writeTelemetry = async () => {},
}) {
  return async function personsPostHandler(request) {
    const timer = createRouteTimer('POST /api/persons')
    const originError = await createOriginGuard()(request)
    if (originError) return originError

    let body = normalizeBody(await request.json().catch(() => null))
    const validationError = validateBody(body)
    if (validationError) {
      return NextResponse.json({ ok: false, message: validationError }, { status: 400 })
    }
    timer.mark('body')

    try {
      const session = adminAuth.parseAdminSessionCookieValue(
        request.cookies.get(adminAuth.getAdminSessionCookieName())?.value,
      )
      const resolvedSession = session ? await adminAuth.resolveAdminSession(null, session) : null
      const publicSubmission = !resolvedSession
      if (publicSubmission && (!body.privacyConsent || body.privacyNoticeVersion !== PRIVACY_NOTICE_VERSION)) {
        return NextResponse.json(
          { ok: false, message: 'You must read and accept the Data Privacy Notice before submitting registration.' },
          { status: 400 },
        )
      }
      if (publicSubmission) {
        body = { ...body, privacyConsentRecord: createPrivacyConsentRecord() }
      }

      const office = await getOfficeRecord(null, body.officeId)
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

      const ipLimit = await enforceRateLimit(null, {
        key: `persons-ip:${getRequestIp(request)}`,
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

      if (publicSubmission) {
        const employeeLimit = await enforceRateLimit(null, {
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

      const normalizedPhoto = await normalizeDataImage(body.photoDataUrl)
      timer.mark('photo-normalize')
      const authoritativePayload = await buildAuthoritativeEnrollmentPayload(
        body.sampleFrames,
        body.captureMetadata,
      )
      timer.mark('server-enrollment')
      body = {
        ...body,
        normalizedPhoto,
        descriptors: authoritativePayload.descriptors,
        captureMetadata: authoritativePayload.captureMetadata,
        biometricModelVersion: authoritativePayload.biometricModelVersion,
      }

      const { transactionResult, sampleCount, indexSyncWarning, duplicateReviewRequired } =
        await enrollLocalPerson(body, office, resolvedSession)
      timer.mark('enroll-write')

      const baseMessage = transactionResult.nextPerson.lifecycleStatus === 'pending'
        ? 'Enrollment submitted for HR review. The employee record and biometric samples are not active on the kiosk until activated.'
        : 'Enrollment saved.'
      const message = duplicateReviewRequired
        ? `${baseMessage} Similarity review required: an existing employee profile is close enough that an authorized reviewer should verify this submission before activation.`
        : baseMessage

      const telemetry = timer.snapshot()
      await Promise.resolve(writeTelemetry({
        ...telemetry,
        personId: transactionResult.personId,
        lifecycleStatus: transactionResult.nextPerson.lifecycleStatus,
      })).catch(error => {
        console.warn('[PersonsAPI] Registration telemetry failed', {
          code: error?.code,
          message: error?.message,
        })
      })

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
      const duplicateFace = error?.duplicateFace
      const duplicateRegistration = error?.code === 'duplicate_person_registration'
      const status = duplicateFace?.duplicate || duplicateRegistration
        ? 409
        : toHttpStatus(error?.status)
      console.error('[PersonsAPI] Registration failed', {
        code: error?.code || 'registration_failed',
        message: error instanceof Error ? error.message : String(error),
      })
      const publicMessage = status === 409
        ? 'This registration matches an existing employee record and cannot be submitted again.'
        : 'Registration could not be completed. Please try again or contact HR.'
      return NextResponse.json({
        ok: false,
        code: error?.code || 'registration_failed',
        message: publicMessage,
      }, { status })
    }
  }
}

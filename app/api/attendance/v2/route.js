export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createOriginGuard } from '@/lib/csrf'
import { consumeAttendanceChallenge } from '@/lib/attendance-challenge'
import { processAttendanceSubmission } from '@/lib/attendance/process'
import { warmServerAttendanceEmbedding } from '@/lib/biometrics/server-embedding'
import { getRequestIp } from '@/lib/rate-limit'
import { writeAuditLog } from '@/lib/audit-log'

export function createAttendanceV2PostHandler({ services = null } = {}) {
  return async function handleAttendanceV2Post(request) {
    const errorId = crypto.randomUUID()
    let stage = 'origin_guard'
    let body = null
    try {
      const guard = createOriginGuard()
      const originError = await guard(request)
      if (originError) return originError

      stage = 'parse_request'
      body = await request.json().catch(() => null)
      if (!body || typeof body !== 'object') {
        return NextResponse.json({ ok: false, message: 'Invalid request body.' }, { status: 400 })
      }

      stage = 'consume_challenge'
      const db = null
      if (!services) warmServerAttendanceEmbedding().catch(() => {})
      const challengeResult = await consumeAttendanceChallenge(db, body.challenge, {
        kioskId: body?.kioskContext?.kioskId,
        source: body?.kioskContext?.source || 'web-scan',
        userAgent: request.headers.get('user-agent') || '',
        clientIp: getRequestIp(request),
        clientKey: body?.kioskContext?.clientKey || body?.captureContext?.clientKey || '',
        employeeId: body?.employeeId || '',
      })

      if (!challengeResult.ok) {
        return NextResponse.json(
          {
            ok: false,
            message: challengeResult.message,
            decisionCode: challengeResult.decisionCode,
          },
          { status: 403 },
        )
      }

      stage = 'process_submission'
      return await processAttendanceSubmission({
        db,
        request,
        body: {
          ...body,
          verificationMode: 'challenge_v2',
        },
        consumedChallenge: challengeResult.challenge,
        services,
      })
    } catch (error) {
      // Keep failure details in the server log only. A correlation ID is safe to
      // return and lets support find the exact failure without exposing database,
      // biometric, or stack details to a kiosk browser.
      console.error('[attendance/v2] Unhandled error', {
        errorId,
        stage: error?.attendanceStage || stage,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      await writeAuditLog(null, {
        actorRole: 'system',
        actorScope: 'server',
        action: 'attendance_server_error',
        targetType: 'attendance',
        targetId: errorId,
        summary: `Attendance submission failed at ${error?.attendanceStage || stage}.`,
        metadata: {
          errorId,
          stage: error?.attendanceStage || stage,
          errorType: error?.constructor?.name || 'UnknownError',
          // Internal audit detail only. Do not return this to the browser.
          errorMessage: String(error?.message || error || 'Unknown error').slice(0, 500),
          source: String(body?.kioskContext?.source || 'web-scan').slice(0, 40),
          kioskId: String(body?.kioskContext?.kioskId || body?.captureContext?.kioskId || '').slice(0, 120),
          employeeId: String(body?.employeeId || '').slice(0, 64),
        },
      }).catch(() => {})
      return NextResponse.json(
        {
          ok: false,
          message: 'Attendance service encountered an unexpected error. Please try again.',
          decisionCode: 'blocked_server_error',
          errorId,
        },
        { status: 500 },
      )
    }
  }
}

export const POST = createAttendanceV2PostHandler()


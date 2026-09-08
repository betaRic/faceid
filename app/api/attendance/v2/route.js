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

const SAFE_ATTENDANCE_ERROR_STAGES = new Set([
  'origin_guard',
  'parse_request',
  'consume_challenge',
  'process_submission',
  'rate_limit',
  'server_embed_1',
  'server_embed_2',
  'offices',
  'match_1',
  'match_2',
  'office',
  'daily_logs',
  'workforce_policy',
  'employee_session',
  'write_attendance',
])

function resolveSafeErrorStage(reportedStage, routeStage) {
  if (SAFE_ATTENDANCE_ERROR_STAGES.has(reportedStage)) return reportedStage
  if (SAFE_ATTENDANCE_ERROR_STAGES.has(routeStage)) return routeStage
  return 'process_submission'
}

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
      const safeErrorStage = resolveSafeErrorStage(error?.attendanceStage, stage)
      console.error('[attendance/v2] Unhandled error', {
        errorId,
        stage: safeErrorStage,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      await writeAuditLog(null, {
        actorRole: 'system',
        actorScope: 'server',
        action: 'attendance_server_error',
        targetType: 'attendance',
        targetId: errorId,
        summary: `Attendance submission failed at ${safeErrorStage}.`,
        metadata: {
          errorId,
          stage: safeErrorStage,
          errorType: error?.constructor?.name || 'UnknownError',
        },
      }).catch(() => {})
      return NextResponse.json(
        {
          ok: false,
          message: `Attendance service encountered an unexpected error. Please try again. Reference: ${errorId}`,
          decisionCode: 'blocked_server_error',
          errorId,
        },
        { status: 500 },
      )
    }
  }
}

export const POST = createAttendanceV2PostHandler()


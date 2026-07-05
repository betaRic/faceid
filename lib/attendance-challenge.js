import 'server-only'

import crypto from 'crypto'
import { queryPostgres, withPostgresTransaction } from '@/lib/postgres/client'

const ATTENDANCE_CHALLENGE_TTL_MS = 30 * 1000

function sanitizeContext(context) {
  const value = context && typeof context === 'object' ? context : {}
  const rawRiskFlags = Array.isArray(value.riskFlags) ? value.riskFlags : []
  const riskFlags = Array.from(new Set(
    rawRiskFlags
      .map(flag => String(flag || '').trim().toLowerCase())
      .filter(Boolean),
  )).slice(0, 16)
  return {
    kioskId: String(value.kioskId || '').slice(0, 120),
    source: String(value.source || '').slice(0, 40),
    userAgent: String(value.userAgent || '').slice(0, 512),
    mode: 'passive',
    motionType: '',
    riskFlags,
    verificationStage: 'passive',
    employeeId: String(value.employeeId || '').trim().slice(0, 64),
    clientIp: String(value.clientIp || '').slice(0, 80),
    clientKey: String(value.clientKey || '').slice(0, 160),
    capturePolicyVersion: String(value.capturePolicyVersion || '').slice(0, 40),
  }
}

export async function issueAttendanceChallenge(db, context) {
  const token = crypto.randomUUID()
  const now = Date.now()
  const expiresAt = now + ATTENDANCE_CHALLENGE_TTL_MS
  const safeContext = sanitizeContext(context)

  await queryPostgres(
    `
      INSERT INTO attendance_challenges (
        token, challenge_id, employee_id, kiosk_id, source, client_ip, client_key,
        user_agent, mode, motion_type, verification_stage, capture_policy_version,
        risk_flags, issued_at_ms, expires_at_ms, expires_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12,
        $13::jsonb, $14, $15, to_timestamp($16 / 1000.0)
      )
    `,
    [
      token,
      token,
      safeContext.employeeId,
      safeContext.kioskId,
      safeContext.source,
      safeContext.clientIp,
      safeContext.clientKey,
      safeContext.userAgent,
      safeContext.mode,
      safeContext.motionType,
      safeContext.verificationStage,
      safeContext.capturePolicyVersion,
      JSON.stringify(safeContext.riskFlags),
      now,
      expiresAt,
      expiresAt,
    ],
  )

  return {
    challengeId: token,
    token,
    expiresAt,
    mode: safeContext.mode,
    motionType: safeContext.motionType || null,
    riskFlags: safeContext.riskFlags,
    verificationStage: safeContext.verificationStage,
    employeeId: safeContext.employeeId || null,
    capturePolicyVersion: safeContext.capturePolicyVersion || null,
  }
}

export async function consumeAttendanceChallenge(db, challenge, context) {
  const token = String(challenge?.token || challenge?.challengeId || '').trim()
  if (!token) {
    return {
      ok: false,
      message: 'Attendance challenge is missing.',
      decisionCode: 'blocked_invalid_challenge',
    }
  }

  const safeContext = sanitizeContext(context)

  return withPostgresTransaction(async client => {
      const result = await client.query(
        'SELECT * FROM attendance_challenges WHERE token = $1 LIMIT 1 FOR UPDATE',
        [token],
      )
      const data = result.rows[0]
      if (!data) {
        return {
          ok: false,
          message: 'Attendance challenge is invalid or already consumed.',
          decisionCode: 'blocked_invalid_challenge',
        }
      }

      if (data.used_at) {
        return {
          ok: false,
          message: 'Attendance challenge was already consumed.',
          decisionCode: 'blocked_invalid_challenge',
        }
      }

      if (Number(data.expires_at_ms || 0) < Date.now()) {
        await client.query('DELETE FROM attendance_challenges WHERE token = $1', [token])
        return {
          ok: false,
          message: 'Attendance challenge expired. Retry the scan.',
          decisionCode: 'blocked_expired_challenge',
        }
      }

      if (data.kiosk_id && safeContext.kioskId && String(data.kiosk_id) !== safeContext.kioskId) {
        return {
          ok: false,
          message: 'Attendance challenge does not belong to this kiosk session.',
          decisionCode: 'blocked_invalid_challenge',
        }
      }

      if (data.employee_id && safeContext.employeeId && String(data.employee_id) !== safeContext.employeeId) {
        return {
          ok: false,
          message: 'Attendance challenge does not belong to this employee ID.',
          decisionCode: 'blocked_invalid_challenge',
        }
      }

      await client.query(
        `
          UPDATE attendance_challenges
          SET used_at = now(),
              used_context = $2::jsonb
          WHERE token = $1
        `,
        [
          token,
          JSON.stringify({
            kioskId: safeContext.kioskId,
            employeeId: safeContext.employeeId,
            source: safeContext.source,
            userAgent: safeContext.userAgent,
            clientIp: safeContext.clientIp,
            clientKey: safeContext.clientKey,
          }),
        ],
      )

      return {
        ok: true,
        challenge: {
          challengeId: String(data.challenge_id || token),
          token,
          expiresAt: Number(data.expires_at_ms || 0) || null,
          issuedAt: Number(data.issued_at_ms || 0) || null,
          mode: String(data.mode || 'passive'),
          motionType: String(data.motion_type || '') || null,
          riskFlags: Array.isArray(data.risk_flags) ? data.risk_flags : [],
          verificationStage: String(data.verification_stage || 'passive'),
          employeeId: String(data.employee_id || '') || null,
          capturePolicyVersion: String(data.capture_policy_version || '') || null,
        },
      }
  })
}

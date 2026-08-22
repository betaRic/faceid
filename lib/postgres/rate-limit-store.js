import 'server-only'

import crypto from 'node:crypto'
import { queryPostgres } from './client'

function normalizeRateLimitKey(value) {
  return String(value || '').trim().toLowerCase()
    .replace(/[^a-z0-9:_.@-]/g, '-')
    .slice(0, 500)
}

function positiveInteger(value, fallback) {
  const number = Math.floor(Number(value))
  return Number.isSafeInteger(number) && number > 0 ? number : fallback
}

export function hashRateLimitKey(key) {
  const normalizedKey = normalizeRateLimitKey(key)
  if (!normalizedKey) return ''
  return crypto.createHash('sha256').update(normalizedKey).digest('hex')
}

export async function consumePostgresRateLimit({
  key,
  limit,
  windowMs,
  nowMs = Date.now(),
} = {}) {
  const keyHash = hashRateLimitKey(key)
  const safeLimit = positiveInteger(limit, 1)
  const safeWindowMs = positiveInteger(windowMs, 60_000)
  if (!keyHash) {
    return { ok: false, remaining: 0, resetAt: Number(nowMs) + safeWindowMs, backend: 'invalid' }
  }

  const currentMs = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now()
  const windowStartMs = Math.floor(currentMs / safeWindowMs) * safeWindowMs
  const resetAt = windowStartMs + safeWindowMs
  const expiresAt = resetAt + 60_000
  const result = await queryPostgres(
    `
      WITH expired AS (
        DELETE FROM request_rate_limits
        WHERE ctid IN (
          SELECT ctid
          FROM request_rate_limits
          WHERE expires_at <= now()
          ORDER BY expires_at
          LIMIT 100
          FOR UPDATE SKIP LOCKED
        )
      )
      INSERT INTO request_rate_limits (key_hash, window_start, request_count, expires_at)
      VALUES ($1, $2, 1, $3)
      ON CONFLICT (key_hash, window_start)
      DO UPDATE SET
        request_count = request_rate_limits.request_count + 1,
        expires_at = GREATEST(request_rate_limits.expires_at, EXCLUDED.expires_at)
      RETURNING request_count
    `,
    [keyHash, new Date(windowStartMs), new Date(expiresAt)],
  )
  const count = Number(result.rows[0]?.request_count || 0)
  return {
    ok: count <= safeLimit,
    remaining: Math.max(0, safeLimit - count),
    resetAt,
    backend: 'postgres',
  }
}

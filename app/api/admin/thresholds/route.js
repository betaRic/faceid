export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  getAdminSessionCookieName,
  isRegionalAdminSession,
  parseAdminSessionCookieValue,
  resolveAdminSession,
} from '@/lib/admin-auth'
import {
  getHrSessionCookieName,
  parseHrSessionCookieValue,
  resolveHrSession,
} from '@/lib/hr-auth'
import { getActiveThresholds, getActiveThresholdsForUpdate, setActiveThresholds, resetThresholdsToDefaults, invalidateThresholdCache, validateThresholdUpdate, DEFAULTS, THRESHOLD_META } from '@/lib/thresholds'
import { writeAuditLog } from '@/lib/audit-log'
import { createOriginGuard } from '@/lib/csrf'
import { withPostgresTransaction } from '@/lib/postgres/client'

async function resolveSession(request) {
  const adminCookie = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (adminCookie) {
    const db = null
    const resolved = await resolveAdminSession(db, adminCookie)
    if (resolved) return { role: 'admin', resolved, db }
  }

  const hrCookie = parseHrSessionCookieValue(request.cookies.get(getHrSessionCookieName())?.value)
  if (hrCookie) {
    const db = null
    const resolved = await resolveHrSession(db, hrCookie)
    if (resolved) return { role: 'hr', resolved, db }
  }

  return null
}

export async function GET(request) {
  const ctx = await resolveSession(request)
  if (!ctx) {
    return NextResponse.json({ ok: false, message: 'Login required.' }, { status: 401 })
  }
  if (ctx.role !== 'admin' || !isRegionalAdminSession(ctx.resolved)) {
    return NextResponse.json({ ok: false, message: 'Regional admin access is required.' }, { status: 403 })
  }

  try {
    const current = await getActiveThresholds(ctx.db)
    const categorized = {}
    for (const [sectionKey, section] of Object.entries(THRESHOLD_META)) {
      const fields = {}
      for (const [fieldKey, meta] of Object.entries(section.fields)) {
        fields[fieldKey] = {
          ...meta,
          current: current[fieldKey],
          changed: current[fieldKey] !== meta.default,
        }
      }
      categorized[sectionKey] = { label: section.label, description: section.description, fields }
    }

    return NextResponse.json({
      ok: true,
      sections: categorized,
      defaults: DEFAULTS,
    })
  } catch (error) {
    console.error('[thresholds] Read failed', { code: error?.code || 'unknown' })
    return NextResponse.json(
      { ok: false, message: 'Failed to load thresholds.' },
      { status: 500 },
    )
  }
}

export async function POST(request) {
  const checkOrigin = createOriginGuard()
  const originError = await checkOrigin(request)
  if (originError) return originError

  const ctx = await resolveSession(request)
  if (!ctx) {
    return NextResponse.json({ ok: false, message: 'Login required.' }, { status: 401 })
  }
  if (ctx.role !== 'admin' || !isRegionalAdminSession(ctx.resolved)) {
    return NextResponse.json({ ok: false, message: 'Regional admin access is required.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, message: 'Invalid request body.' }, { status: 400 })
  }

  const { action, values } = body

  try {
    if (action === 'reset') {
      await withPostgresTransaction(async client => {
        const previous = await getActiveThresholdsForUpdate(ctx.db, { client })
        await resetThresholdsToDefaults(ctx.db, { client })
        await writeAuditLog(ctx.db, {
          actorRole: ctx.role,
          actorScope: ctx.resolved.scope,
          actorOfficeId: ctx.resolved.officeId,
          action: 'thresholds.reset',
          targetType: 'system_config',
          targetId: 'thresholds',
          officeId: ctx.resolved.officeId,
          summary: 'Thresholds reset to defaults',
          metadata: {
            changed: Object.fromEntries(
              Object.values(THRESHOLD_META).flatMap(section =>
                Object.keys(section.fields || {}).map(key => [key, {
                  from: previous[key],
                  to: DEFAULTS[key],
                }]),
              ),
            ),
          },
        }, { client })
      })
      invalidateThresholdCache()
      return NextResponse.json({ ok: true, message: 'Thresholds reset to defaults.' })
    }

    if (action === 'update') {
      const validation = validateThresholdUpdate(values)
      if (!validation.ok) {
        return NextResponse.json({ ok: false, message: validation.message }, { status: 400 })
      }

      const validated = validation.values
      await withPostgresTransaction(async client => {
        const previous = await getActiveThresholdsForUpdate(ctx.db, { client })
        await setActiveThresholds(ctx.db, validated, { client })
        await writeAuditLog(ctx.db, {
          actorRole: ctx.role,
          actorScope: ctx.resolved.scope,
          actorOfficeId: ctx.resolved.officeId,
          action: 'thresholds.updated',
          targetType: 'system_config',
          targetId: 'thresholds',
          officeId: ctx.resolved.officeId,
          summary: `Threshold settings updated: ${Object.keys(validated).join(', ')}`,
          metadata: {
            changed: Object.fromEntries(
              Object.entries(validated).map(([key, value]) => [key, { from: previous[key], to: value }]),
            ),
          },
        }, { client })
      })
      invalidateThresholdCache()

      return NextResponse.json({ ok: true, message: 'Thresholds updated.', values: validated })
    }

    return NextResponse.json({ ok: false, message: 'Unknown action.' }, { status: 400 })
  } catch (error) {
    console.error('[thresholds] Update failed', { code: error?.code || 'unknown' })
    return NextResponse.json(
      { ok: false, message: 'Failed to update thresholds.' },
      { status: 500 },
    )
  }
}


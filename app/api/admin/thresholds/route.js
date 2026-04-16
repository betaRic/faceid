export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import {
  getAdminSessionCookieName,
  parseAdminSessionCookieValue,
  resolveAdminSession,
} from '@/lib/admin-auth'
import {
  getHrSessionCookieName,
  parseHrSessionCookieValue,
  resolveHrSession,
} from '@/lib/hr-auth'
import { getActiveThresholds, setActiveThresholds, resetThresholdsToDefaults, DEFAULTS, THRESHOLD_META } from '@/lib/thresholds'
import { writeAuditLog } from '@/lib/audit-log'
import { createOriginGuard } from '@/lib/csrf'

async function resolveSession(request) {
  const adminCookie = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (adminCookie) {
    const db = getAdminDb()
    const resolved = await resolveAdminSession(db, adminCookie)
    if (resolved) return { role: 'admin', resolved, db }
  }

  const hrCookie = parseHrSessionCookieValue(request.cookies.get(getHrSessionCookieName())?.value)
  if (hrCookie) {
    const db = getAdminDb()
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
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load thresholds.' },
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

  if (ctx.role !== 'admin') {
    return NextResponse.json({ ok: false, message: 'Admin access required.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, message: 'Invalid request body.' }, { status: 400 })
  }

  const { action, values } = body

  try {
    if (action === 'reset') {
      await resetThresholdsToDefaults(ctx.db)
      await writeAuditLog(ctx.db, {
        actorRole: ctx.role,
        actorScope: ctx.resolved.scope,
        actorOfficeId: ctx.resolved.officeId,
        action: 'thresholds.reset',
        targetType: 'system_config',
        targetId: 'thresholds',
        officeId: ctx.resolved.officeId,
        summary: 'Thresholds reset to defaults',
      })
      return NextResponse.json({ ok: true, message: 'Thresholds reset to defaults.' })
    }

    if (action === 'update') {
      if (!values || typeof values !== 'object') {
        return NextResponse.json({ ok: false, message: 'values object required.' }, { status: 400 })
      }

      const validated = {}
      for (const [key, rawValue] of Object.entries(values)) {
        let found = null
        for (const section of Object.values(THRESHOLD_META)) {
          if (section.fields?.[key]) { found = section.fields[key]; break }
        }
        if (!found) continue
        const num = Number(rawValue)
        if (!Number.isFinite(num)) continue
        if (num < found.min || num > found.max) continue
        validated[key] = num
      }

      if (Object.keys(validated).length === 0) {
        return NextResponse.json({ ok: false, message: 'No valid values to update.' }, { status: 400 })
      }

      const previous = await getActiveThresholds(ctx.db)
      const updated = await setActiveThresholds(ctx.db, validated)

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
            Object.entries(validated).map(([k, v]) => [k, { from: previous[k], to: v }])
          ),
        },
      })

      return NextResponse.json({ ok: true, message: 'Thresholds updated.', values: validated })
    }

    return NextResponse.json({ ok: false, message: 'Unknown action.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to update thresholds.' },
      { status: 500 },
    )
  }
}

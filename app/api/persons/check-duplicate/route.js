export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { DESCRIPTOR_LENGTH } from '@/lib/config'
import { createOriginGuard } from '@/lib/csrf'
import { enforceRateLimit, getRequestIp } from '@/lib/rate-limit'
import { checkDuplicateFace } from '@/lib/persons/enrollment'

function toHttpStatus(value) {
  const status = Number(value)
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500
}

export async function POST(request) {
  const guard = createOriginGuard()
  const originError = await guard(request)
  if (originError) return originError

  try {
    const db = getAdminDb()

    const ip = getRequestIp(request)
    const limit = await enforceRateLimit(db, {
      key: `dup-check-ip:${ip}`,
      limit: 10,
      windowMs: 60 * 1000,
    })
    if (!limit.ok) {
      return NextResponse.json({ ok: false, message: 'Too many requests.' }, { status: 429 })
    }

    const body = await request.json().catch(() => null)
    const descriptors = body?.descriptors

    if (!descriptors?.length || !Array.isArray(descriptors)) {
      return NextResponse.json({ ok: false, message: 'Descriptors are required.' }, { status: 400 })
    }
    for (const d of descriptors) {
      if (!Array.isArray(d) || d.length !== DESCRIPTOR_LENGTH) {
        return NextResponse.json({ ok: false, message: `Invalid descriptor length.` }, { status: 400 })
      }
    }

    const duplicateFace = await checkDuplicateFace(
      db,
      descriptors,
      String(body.personId || '').trim(),
    )

    if (duplicateFace?.duplicate) {
      // Do not expose which employee matched — a duplicate check is public/unauthenticated
      // and returning name/employeeId would leak PII to any caller with a face descriptor.
      return NextResponse.json({
        ok: true,
        duplicate: true,
        reviewRequired: false,
        message: 'A face similar to an existing employee was found. Duplicate enrollment blocked.',
      })
    }

    if (duplicateFace?.reviewRequired) {
      return NextResponse.json({
        ok: true,
        duplicate: false,
        reviewRequired: true,
        message: 'A similar face was found. Registration can continue, but this submission will be flagged for admin review.',
      })
    }

    return NextResponse.json({ ok: true, duplicate: false, reviewRequired: false })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to check duplicate.' },
      { status: toHttpStatus(error?.status) },
    )
  }
}

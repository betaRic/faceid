export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { DESCRIPTOR_LENGTH } from '@/lib/config'
import { getAdminDb } from '@/lib/firebase-admin'
import {
  getAdminSessionCookieName,
  isRegionalAdminSession,
  parseAdminSessionCookieValue,
  resolveAdminSession,
} from '@/lib/admin-auth'
import { clearBiometricIndexCache, syncPersonBiometricIndex } from '@/lib/biometric-index'
import { writeAuditLog } from '@/lib/audit-log'
import { normalizeStoredDescriptors } from '@/lib/biometrics/descriptor-utils'
import { createOriginGuard } from '@/lib/csrf'

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function serializeDescriptorSample(descriptor) {
  return { vector: safeArray(descriptor).map(Number) }
}

export async function POST(request) {
  const checkOrigin = createOriginGuard()
  const originError = await checkOrigin(request)
  if (originError) return originError

  const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin login is required.' }, { status: 401 })
  }

  try {
    const db = getAdminDb()
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }
    if (!isRegionalAdminSession(resolvedSession)) {
      return NextResponse.json({ ok: false, message: 'Regional admin access is required.' }, { status: 403 })
    }

    const snapshot = await db.collection('persons').get()
    let normalizedCount = 0
    let reindexedCount = 0

    for (const record of snapshot.docs) {
      const data = record.data()
      const allDescriptors = normalizeStoredDescriptors(data.descriptors)
      const validDescriptors = allDescriptors.filter(d => d.length === DESCRIPTOR_LENGTH && d.every(Number.isFinite))
      const currentDescriptors = safeArray(data.descriptors)
      const name = String(data.name || '').trim().toUpperCase()
      const nextPerson = {
        ...data,
        name,
        nameLower: name.toLowerCase(),
        descriptors: validDescriptors.map(serializeDescriptorSample),
        updatedAt: FieldValue.serverTimestamp(),
      }

      const descriptorShapeChanged = JSON.stringify(currentDescriptors) !== JSON.stringify(nextPerson.descriptors)
      const nameChanged = name !== String(data.name || '')

      if (descriptorShapeChanged || nameChanged) {
        await record.ref.set(nextPerson, { merge: true })
        normalizedCount += 1
      }

      await syncPersonBiometricIndex(db, record.id, nextPerson)
      reindexedCount += 1
    }

    const cacheInvalidation = await clearBiometricIndexCache()

    await writeAuditLog(db, {
      actorRole: resolvedSession.role,
      actorScope: resolvedSession.scope,
      actorOfficeId: resolvedSession.officeId,
      action: 'biometric_index_repair',
      targetType: 'system',
      targetId: 'biometric_index',
      officeId: '',
      summary: 'Normalized person descriptors and rebuilt biometric index',
      metadata: {
        normalizedCount,
        reindexedCount,
        cacheKeysCleared: cacheInvalidation.cleared,
      },
    })

    return NextResponse.json({
      ok: true,
      normalizedCount,
      reindexedCount,
      clearedBiometricCacheKeys: cacheInvalidation.cleared,
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to repair biometric index.' },
      { status: 500 },
    )
  }
}


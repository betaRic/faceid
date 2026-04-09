import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb } from '../../../../../lib/firebase-admin'
import {
  getAdminSessionCookieName,
  isRegionalAdminSession,
  parseAdminSessionCookieValue,
  resolveAdminSession,
} from '../../../../../lib/admin-auth'
import { syncPersonBiometricIndex } from '../../../../../lib/biometric-index'
import { writeAuditLog } from '../../../../../lib/audit-log'

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeStoredDescriptors(value) {
  return safeArray(value)
    .map(sample => {
      if (Array.isArray(sample)) return sample.map(Number)
      if (sample && typeof sample === 'object' && Array.isArray(sample.vector)) {
        return sample.vector.map(Number)
      }
      return null
    })
    .filter(sample => Array.isArray(sample) && sample.length === 128 && sample.every(Number.isFinite))
}

function serializeDescriptorSample(descriptor) {
  return { vector: safeArray(descriptor).map(Number) }
}

export async function POST(request) {
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
      const normalizedDescriptors = normalizeStoredDescriptors(data.descriptors)
      const currentDescriptors = safeArray(data.descriptors)
      const name = String(data.name || '').trim().toUpperCase()
      const nextPerson = {
        ...data,
        name,
        nameLower: name.toLowerCase(),
        descriptors: normalizedDescriptors.map(serializeDescriptorSample),
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
      },
    })

    return NextResponse.json({
      ok: true,
      normalizedCount,
      reindexedCount,
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to repair biometric index.' },
      { status: 500 },
    )
  }
}

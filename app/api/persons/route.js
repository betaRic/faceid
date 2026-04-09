import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb } from '../../../lib/firebase-admin'
import {
  getAdminSessionCookieName,
  parseAdminSessionCookieValue,
  resolveAdminSession,
} from '../../../lib/admin-auth'
import { DUPLICATE_FACE_THRESHOLD } from '../../../lib/config'
import { writeAuditLog } from '../../../lib/audit-log'
import { syncPersonBiometricIndex } from '../../../lib/biometric-index'
import { enforceRateLimit, getRequestIp } from '../../../lib/rate-limit'

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
    .filter(sample => Array.isArray(sample) && sample.length > 0)
}

function serializeDescriptorSample(descriptor) {
  return { vector: safeArray(descriptor).map(Number) }
}

function euclideanDistance(left, right) {
  let total = 0

  for (let index = 0; index < left.length; index += 1) {
    const diff = left[index] - right[index]
    total += diff * diff
  }

  return Math.sqrt(total)
}

function findDuplicateFace(persons, employeeId, descriptor) {
  let bestMatch = null

  persons.forEach(person => {
    if (employeeId && person.employeeId === employeeId) return

    normalizeStoredDescriptors(person.descriptors).forEach(sample => {
      const distance = euclideanDistance(sample, descriptor)
      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = {
          person,
          distance,
        }
      }
    })
  })

  if (!bestMatch || bestMatch.distance > DUPLICATE_FACE_THRESHOLD) return null
  return bestMatch
}

function normalizeBody(body) {
  return {
    name: String(body?.profile?.name || '').trim(),
    employeeId: String(body?.profile?.employeeId || '').trim(),
    officeId: String(body?.profile?.officeId || '').trim(),
    officeName: String(body?.profile?.officeName || '').trim(),
    descriptor: safeArray(body?.descriptor).map(Number),
  }
}

function validateBody(body) {
  if (!body.name) return 'Employee name is required.'
  if (!body.employeeId) return 'Employee ID is required.'
  if (!body.officeId || !body.officeName) return 'Assigned office is required.'
  if (body.descriptor.length === 0) return 'Face descriptor is required.'
  if (body.descriptor.some(value => !Number.isFinite(value))) return 'Face descriptor contains invalid values.'
  return null
}

export async function GET(request) {
  const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin login is required to load employees.' }, { status: 401 })
  }

  try {
    const db = getAdminDb()
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }

    const snapshot = await db.collection('persons').orderBy('nameLower').get()
    const persons = snapshot.docs.map(record => {
      const data = record.data()
      const descriptors = normalizeStoredDescriptors(data.descriptors)

      return {
        id: record.id,
        name: data.name || '',
        employeeId: data.employeeId || '',
        nameLower: data.nameLower || String(data.name || '').toLowerCase(),
        officeId: data.officeId || '',
        officeName: data.officeName || 'Unassigned',
        active: data.active !== false,
        sampleCount: descriptors.length,
      }
    }).filter(person => adminSessionAllowsOffice(resolvedSession, person.officeId))

    return NextResponse.json({ ok: true, persons })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load employees.' },
      { status: 500 },
    )
  }
}

export async function POST(request) {
  const body = normalizeBody(await request.json().catch(() => null))
  const validationError = validateBody(body)
  if (validationError) {
    return NextResponse.json({ ok: false, message: validationError }, { status: 400 })
  }

  try {
    const db = getAdminDb()
    const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
    const resolvedSession = session ? await resolveAdminSession(db, session) : null

    const ip = getRequestIp(request)
    const ipLimit = await enforceRateLimit(db, {
      key: `persons-ip:${ip}`,
      limit: 30,
      windowMs: 60 * 1000,
    })

    if (!ipLimit.ok) {
      return NextResponse.json(
        { ok: false, message: 'Too many enrollment attempts from this device or network. Slow down and try again.' },
        { status: 429 },
      )
    }

    const snapshot = await db.collection('persons').get()
    const persons = snapshot.docs.map(record => ({ id: record.id, ...record.data() }))

    const duplicateFace = findDuplicateFace(persons, body.employeeId, body.descriptor)
    if (duplicateFace) {
      return NextResponse.json(
        {
          ok: false,
          message: `Face is too similar to ${duplicateFace.person.name} (${duplicateFace.person.employeeId || 'no employee ID'})`,
        },
        { status: 409 },
      )
    }

    const payload = {
      name: body.name.toUpperCase(),
      employeeId: body.employeeId,
      nameLower: body.name.toUpperCase().toLowerCase(),
      officeId: body.officeId,
      officeName: body.officeName,
      updatedAt: FieldValue.serverTimestamp(),
    }

    const transactionResult = await db.runTransaction(async transaction => {
      const employeeLockRef = db.collection('person_enrollment_locks').doc(body.employeeId)
      await transaction.get(employeeLockRef)
      const existingSnapshot = await transaction.get(
        db.collection('persons').where('employeeId', '==', body.employeeId).limit(1),
      )
      const existingRecord = existingSnapshot.docs[0] || null
      const existing = existingRecord ? { id: existingRecord.id, ...existingRecord.data() } : null
      const personRef = existingRecord ? existingRecord.ref : db.collection('persons').doc()
      const nextPerson = existing
        ? {
            ...existing,
            ...payload,
            active: existing.active !== false,
            descriptors: [...safeArray(existing.descriptors), serializeDescriptorSample(body.descriptor)],
          }
        : {
            ...payload,
            active: true,
            descriptors: [serializeDescriptorSample(body.descriptor)],
            createdAt: FieldValue.serverTimestamp(),
          }

      transaction.set(personRef, nextPerson, { merge: true })
      transaction.set(employeeLockRef, {
        updatedAt: FieldValue.serverTimestamp(),
        personId: personRef.id,
      }, { merge: true })

      return {
        existing,
        personId: personRef.id,
        nextPerson,
      }
    })

    await syncPersonBiometricIndex(db, transactionResult.personId, transactionResult.nextPerson)

    if (resolvedSession && transactionResult.existing) {
      await writeAuditLog(db, {
        actorRole: resolvedSession.role,
        actorScope: resolvedSession.scope,
        actorOfficeId: resolvedSession.officeId,
        action: 'person_sample_add',
        targetType: 'person',
        targetId: transactionResult.personId,
        officeId: body.officeId,
        summary: `Added enrollment sample for ${body.name}`,
        metadata: {
          employeeId: body.employeeId,
          officeName: body.officeName,
        },
      })
    } else if (resolvedSession) {
      await writeAuditLog(db, {
        actorRole: resolvedSession.role,
        actorScope: resolvedSession.scope,
        actorOfficeId: resolvedSession.officeId,
        action: 'person_create',
        targetType: 'person',
        targetId: transactionResult.personId,
        officeId: body.officeId,
        summary: `Created employee record for ${body.name}`,
        metadata: {
          employeeId: body.employeeId,
          officeName: body.officeName,
        },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to save enrollment.' },
      { status: 500 },
    )
  }
}

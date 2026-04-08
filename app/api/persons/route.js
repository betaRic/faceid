import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb } from '../../../lib/firebase-admin'
import {
  adminSessionAllowsOffice,
  getAdminSessionCookieName,
  parseAdminSessionCookieValue,
} from '../../../lib/admin-auth'
import { DUPLICATE_FACE_THRESHOLD } from '../../../lib/config'
import { writeAuditLog } from '../../../lib/audit-log'
import { syncPersonBiometricIndex } from '../../../lib/biometric-index'

function safeArray(value) {
  return Array.isArray(value) ? value : []
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

    safeArray(person.descriptors).forEach(sample => {
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
  try {
    const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
    const db = getAdminDb()
    const snapshot = await db.collection('persons').orderBy('nameLower').get()
    const persons = snapshot.docs.map(record => {
      const data = record.data()
      const descriptors = safeArray(data.descriptors)

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
    }).filter(person => adminSessionAllowsOffice(session, person.officeId))

    return NextResponse.json({ ok: true, persons })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load employees.' },
      { status: 500 },
    )
  }
}

export async function POST(request) {
  const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin login is required for registration.' }, { status: 401 })
  }

  const body = normalizeBody(await request.json().catch(() => null))
  const validationError = validateBody(body)
  if (validationError) {
    return NextResponse.json({ ok: false, message: validationError }, { status: 400 })
  }

  if (!adminSessionAllowsOffice(session, body.officeId)) {
    return NextResponse.json({ ok: false, message: 'This admin session cannot register employees for that office.' }, { status: 403 })
  }

  try {
    const db = getAdminDb()
    const snapshot = await db.collection('persons').get()
    const persons = snapshot.docs.map(record => ({ id: record.id, ...record.data() }))
    const existing = persons.find(person => person.employeeId === body.employeeId) || null

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
      name: body.name,
      employeeId: body.employeeId,
      nameLower: body.name.toLowerCase(),
      officeId: body.officeId,
      officeName: body.officeName,
      active: existing?.active !== false,
      updatedAt: FieldValue.serverTimestamp(),
    }

    if (existing) {
      const nextPerson = {
        ...existing,
        ...payload,
        descriptors: [...safeArray(existing.descriptors), body.descriptor],
      }

      await db.collection('persons').doc(existing.id).set(nextPerson, { merge: true })
      await syncPersonBiometricIndex(db, existing.id, nextPerson)

      await writeAuditLog(db, {
        actorRole: session.role,
        actorScope: session.scope,
        actorOfficeId: session.officeId,
        action: 'person_sample_add',
        targetType: 'person',
        targetId: existing.id,
        officeId: body.officeId,
        summary: `Added enrollment sample for ${body.name}`,
        metadata: {
          employeeId: body.employeeId,
          officeName: body.officeName,
        },
      })
    } else {
      const nextPerson = {
        ...payload,
        descriptors: [body.descriptor],
        createdAt: FieldValue.serverTimestamp(),
      }
      const record = await db.collection('persons').add(nextPerson)
      await syncPersonBiometricIndex(db, record.id, nextPerson)

      await writeAuditLog(db, {
        actorRole: session.role,
        actorScope: session.scope,
        actorOfficeId: session.officeId,
        action: 'person_create',
        targetType: 'person',
        targetId: record.id,
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

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb } from '../../../lib/firebase-admin'
import {
  getAdminSessionCookieName,
  verifyAdminSessionCookieValue,
} from '../../../lib/admin-auth'
import { DUPLICATE_FACE_THRESHOLD } from '../../../lib/config'

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

export async function POST(request) {
  const session = request.cookies.get(getAdminSessionCookieName())?.value
  if (!verifyAdminSessionCookieValue(session)) {
    return NextResponse.json({ ok: false, message: 'Admin login is required for registration.' }, { status: 401 })
  }

  const body = normalizeBody(await request.json().catch(() => null))
  const validationError = validateBody(body)
  if (validationError) {
    return NextResponse.json({ ok: false, message: validationError }, { status: 400 })
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
      await db.collection('persons').doc(existing.id).set(
        {
          ...payload,
          descriptors: [...safeArray(existing.descriptors), body.descriptor],
        },
        { merge: true },
      )
    } else {
      await db.collection('persons').add({
        ...payload,
        descriptors: [body.descriptor],
        createdAt: FieldValue.serverTimestamp(),
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

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb } from '../../../../lib/firebase-admin'
import {
  getAdminSessionCookieName,
  verifyAdminSessionCookieValue,
} from '../../../../lib/admin-auth'

function normalizeBody(body) {
  return {
    name: String(body?.name || '').trim(),
    officeId: String(body?.officeId || '').trim(),
    officeName: String(body?.officeName || '').trim(),
    active: body?.active !== false,
  }
}

function validateBody(body) {
  if (!body.name) return 'Employee name is required.'
  if (!body.officeId || !body.officeName) return 'Assigned office is required.'
  return null
}

export async function PUT(request, { params }) {
  const session = request.cookies.get(getAdminSessionCookieName())?.value
  if (!verifyAdminSessionCookieValue(session)) {
    return NextResponse.json({ ok: false, message: 'Admin login is required to update employees.' }, { status: 401 })
  }

  const body = normalizeBody(await request.json().catch(() => null))
  const validationError = validateBody(body)
  if (validationError) {
    return NextResponse.json({ ok: false, message: validationError }, { status: 400 })
  }

  try {
    const db = getAdminDb()
    await db.collection('persons').doc(params.personId).set({
      ...body,
      nameLower: body.name.toLowerCase(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to update employee.' },
      { status: 500 },
    )
  }
}

export async function DELETE(request, { params }) {
  const session = request.cookies.get(getAdminSessionCookieName())?.value
  if (!verifyAdminSessionCookieValue(session)) {
    return NextResponse.json({ ok: false, message: 'Admin login is required to delete employees.' }, { status: 401 })
  }

  try {
    const db = getAdminDb()
    await db.collection('persons').doc(params.personId).delete()
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to delete employee.' },
      { status: 500 },
    )
  }
}

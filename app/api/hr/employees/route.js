export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { getHrSessionCookieName, parseHrSessionCookieValue, resolveHrSession } from '@/lib/hr-auth'

const PAGE_SIZE = 20

function normalizeQueryParam(value) {
  return String(value || '').trim()
}

function normalizeFilters(body) {
  return {
    query: normalizeQueryParam(body?.query),
    officeId: normalizeQueryParam(body?.officeId),
    status: normalizeQueryParam(body?.status),
    approval: normalizeQueryParam(body?.approval),
    page: Math.max(1, Number(body?.page) || 1),
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)

  const session = parseHrSessionCookieValue(request.cookies.get(getHrSessionCookieName())?.value)
  if (!session) {
    return NextResponse.json({ ok: false, message: 'HR login is required.' }, { status: 401 })
  }

  try {
    const db = getAdminDb()
    const resolvedSession = await resolveHrSession(db, session)

    if (!resolvedSession || !resolvedSession.active) {
      return NextResponse.json({ ok: false, message: 'HR session is no longer valid.' }, { status: 403 })
    }

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const query = normalizeQueryParam(searchParams.get('query'))
    const officeFilter = normalizeQueryParam(searchParams.get('officeId'))
    const statusFilter = normalizeQueryParam(searchParams.get('status'))
    const approvalFilter = normalizeQueryParam(searchParams.get('approval'))

    let baseQuery = db.collection('persons')

    if (resolvedSession.scope === 'office' && resolvedSession.officeId) {
      baseQuery = baseQuery.where('officeId', '==', resolvedSession.officeId)
    } else if (officeFilter) {
      baseQuery = baseQuery.where('officeId', '==', officeFilter)
    }

    const conditions = []

    if (query) {
      conditions.push({ field: 'nameLower', op: '>=', value: query.toLowerCase() })
      conditions.push({ field: 'nameLower', op: '<=', value: query.toLowerCase() + '\uf8ff' })
    }

    if (statusFilter === 'active') {
      conditions.push({ field: 'active', op: '==', value: true })
    } else if (statusFilter === 'inactive') {
      conditions.push({ field: 'active', op: '==', value: false })
    }

    if (approvalFilter && ['pending', 'approved', 'rejected'].includes(approvalFilter)) {
      conditions.push({ field: 'approvalStatus', op: '==', value: approvalFilter })
    }

    let filteredQuery = baseQuery
    if (conditions.length > 0) {
      conditions.forEach(({ field, op, value }) => {
        if (op === '==') {
          filteredQuery = filteredQuery.where(field, '==', value)
        } else if (op === '>=') {
          filteredQuery = filteredQuery.where(field, '>=', value)
        } else if (op === '<=') {
          filteredQuery = filteredQuery.where(field, '<=', value)
        }
      })
    }

    const totalSnapshot = await filteredQuery.count().get()
    const total = totalSnapshot.data().count || 0

    const snapshot = await filteredQuery
      .orderBy('nameLower', 'asc')
      .offset((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .get()

    const employees = snapshot.docs.map(doc => {
      const d = doc.data()
      return {
        id: doc.id,
        name: d.name || '',
        nameLower: d.nameLower || '',
        employeeId: d.employeeId || '',
        officeId: d.officeId || '',
        officeName: d.officeName || '',
        active: d.active !== false,
        approvalStatus: d.approvalStatus || 'pending',
        approvedAt: d.approvedAt || null,
        createdAt: d.createdAt || null,
      }
    })

    return NextResponse.json({
      ok: true,
      employees,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        hasMore: page * PAGE_SIZE < total,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load employees.' },
      { status: 500 },
    )
  }
}
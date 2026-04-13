export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { parseAdminSessionCookieValue, getAdminSessionCookieName, resolveAdminSession } from '@/lib/admin-auth'
import { kvKeys } from '@/lib/kv-utils'

export async function GET(request) {
  const cookieStore = await import('next/headers').then(m => m.cookies())
  const sessionValue = cookieStore.get(getAdminSessionCookieName())?.value
  const session = parseAdminSessionCookieValue(sessionValue)
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
  }

  const db = getAdminDb()
  const resolvedSession = await resolveAdminSession(db, session)
  if (!resolvedSession) {
    return NextResponse.json({ ok: false, message: 'Session invalid' }, { status: 401 })
  }

  try {
    const [personsSnapshot, indexSnapshot] = await Promise.all([
      db.collection('persons').get(),
      db.collection('biometric_index').get(),
    ])

    const personsCount = personsSnapshot.size
    const indexEntriesCount = indexSnapshot.size

    const personsWithSamples = personsSnapshot.docs.filter(doc => {
      const data = doc.data()
      const descriptors = data.descriptors || []
      return descriptors.length > 0
    }).length

    const uniquePersonIds = new Set()
    indexSnapshot.docs.forEach(doc => {
      const data = doc.data()
      if (data.personId) uniquePersonIds.add(data.personId)
    })

    const indexedPersonsCount = uniquePersonIds.size
    const missingFromIndex = personsWithSamples - indexedPersonsCount

    let oldestUpdate = null
    let newestUpdate = null
    indexSnapshot.docs.forEach(doc => {
      const data = doc.data()
      if (data.updatedAt) {
        const timestamp = data.updatedAt?.toDate?.()?.getTime?.() || new Date(data.updatedAt).getTime()
        if (!oldestUpdate || timestamp < oldestUpdate) oldestUpdate = timestamp
        if (!newestUpdate || timestamp > newestUpdate) newestUpdate = timestamp
      }
    })

    let cacheStats = { available: false }
    try {
      const keys = await kvKeys('bioidx:*')
      cacheStats = {
        available: true,
        cachedOffices: keys.length,
        cachePrefix: 'bioidx:',
        cacheTtlSeconds: 300,
      }
    } catch (err) {
      cacheStats = { available: false, reason: err.message }
    }

    const byApprovalStatus = { approved: 0, pending: 0, rejected: 0, unknown: 0 }
    indexSnapshot.docs.forEach(doc => {
      const data = doc.data()
      const status = data.approvalStatus || 'unknown'
      byApprovalStatus[status] = (byApprovalStatus[status] || 0) + 1
    })

    const byActiveStatus = { true: 0, false: 0, unknown: 0 }
    indexSnapshot.docs.forEach(doc => {
      const data = doc.data()
      const active = data.active
      byActiveStatus[active === true ? 'true' : active === false ? 'false' : 'unknown']++
    })

    const health = {
      ok: true,
      personsCount,
      personsWithSamples,
      indexEntriesCount,
      indexedPersonsCount,
      missingFromIndex,
      oldestUpdate: oldestUpdate ? new Date(oldestUpdate).toISOString() : null,
      newestUpdate: newestUpdate ? new Date(newestUpdate).toISOString() : null,
      status: missingFromIndex === 0 ? 'healthy' : missingFromIndex > 10 ? 'critical' : 'warning',
      cache: cacheStats,
      indexBreakdown: {
        byApprovalStatus,
        byActiveStatus,
      },
      recommendation: missingFromIndex > 0 
        ? `Rebuild index - ${missingFromIndex} persons with samples missing from index` 
        : byApprovalStatus.pending > 0 
          ? `Approve or rebuild - ${byApprovalStatus.pending} entries still pending approval`
          : byActiveStatus.false > 0 
            ? `${byActiveStatus.false} entries are marked inactive`
            : 'Index healthy',
    }

    return NextResponse.json(health)
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to check index health' },
      { status: 500 },
    )
  }
}
import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb } from '../../../lib/firebase-admin'
import * as adminAuth from '../../../lib/admin-auth'
import { DUPLICATE_FACE_THRESHOLD } from '../../../lib/config'
import { writeAuditLog } from '../../../lib/audit-log'
import { syncPersonBiometricIndex } from '../../../lib/biometric-index'
import { uploadEnrollmentPhoto } from '../../../lib/storage'
import {
  normalizeEnrollmentDescriptorBatch,
  validateEnrollmentDescriptorBatch,
} from '../../../lib/biometrics/enrollment-burst'
import {
  euclideanDistance,
  findClosestPerson,
  normalizeStoredDescriptors,
} from '../../../lib/biometrics/descriptor-utils'
import { enforceRateLimit, getRequestIp } from '../../../lib/rate-limit'
import { getOfficeRecord } from '../../../lib/office-directory'
import {
  getEffectivePersonApprovalStatus,
  PERSON_APPROVAL_APPROVED,
  PERSON_APPROVAL_PENDING,
  PERSON_APPROVAL_REJECTED,
} from '../../../lib/person-approval'
import {
  clampPersonDirectoryLimit,
  decodePersonDirectoryCursor,
  encodePersonDirectoryCursor,
  getPersonDirectorySortFields,
  inferPersonDirectorySearchMode,
  normalizePersonDirectorySearchValue,
} from '../../../lib/person-directory'
import { normalizeDescriptor } from '../../../lib/biometrics/descriptor-utils';

function serializeDescriptorSample(descriptor) {
  const normalized = normalizeDescriptor(descriptor);
  return { vector: normalized };
}

function normalizeBody(body) {
  return {
    name: String(body?.profile?.name || '').trim(),
    employeeId: String(body?.profile?.employeeId || '').trim(),
    officeId: String(body?.profile?.officeId || '').trim(),
    officeName: String(body?.profile?.officeName || '').trim(),
    photoDataUrl: typeof body?.profile?.photoDataUrl === 'string' ? body.profile.photoDataUrl : null,
    descriptors: normalizeEnrollmentDescriptorBatch(body?.descriptors ?? body?.descriptor),
  }
}

function validateBody(body) {
  if (!body.name) return 'Employee name is required.'
  if (!body.employeeId) return 'Employee ID is required.'
  if (!body.officeId) return 'Assigned office is required.'
  return validateEnrollmentDescriptorBatch(body.descriptors)
}

function normalizeDirectoryStatus(value) {
  const normalized = String(value || 'all').trim().toLowerCase()
  if (normalized === 'active' || normalized === 'inactive') return normalized
  return 'all'
}

function normalizeDirectoryApprovalFilter(value) {
  const normalized = String(value || 'all').trim().toLowerCase()
  if (normalized === PERSON_APPROVAL_PENDING) return PERSON_APPROVAL_PENDING
  if (normalized === PERSON_APPROVAL_APPROVED) return PERSON_APPROVAL_APPROVED
  if (normalized === PERSON_APPROVAL_REJECTED) return PERSON_APPROVAL_REJECTED
  return 'all'
}

function parseDirectoryParams(request) {
  const searchParams = new URL(request.url).searchParams
  const query = String(searchParams.get('q') || '').trim()
  const searchMode = inferPersonDirectorySearchMode(query)

  return {
    officeId: String(searchParams.get('officeId') || '').trim(),
    status: normalizeDirectoryStatus(searchParams.get('status')),
    approval: normalizeDirectoryApprovalFilter(searchParams.get('approval')),
    limit: clampPersonDirectoryLimit(searchParams.get('limit')),
    query,
    searchMode,
    searchValue: normalizePersonDirectorySearchValue(query, searchMode),
    cursor: decodePersonDirectoryCursor(searchParams.get('cursor')),
  }
}

function mapPersonDirectoryRecord(record) {
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
    approvalStatus: getEffectivePersonApprovalStatus(data),
    sampleCount: descriptors.length,
    photoUrl: data.photoUrl || null,
    submittedAt: data.submittedAt || null,
  }
}

function buildDirectoryQuery(db, resolvedSession, params, overrides = {}) {
  const scopedOfficeId = resolvedSession.scope === 'office'
    ? resolvedSession.officeId
    : overrides.officeId ?? params.officeId
  const activeStatus = overrides.status ?? params.status
  const approvalStatus = overrides.approval ?? params.approval
  const [primaryField, secondaryField] = getPersonDirectorySortFields(params.searchMode)

  let query = db.collection('persons')

  if (scopedOfficeId) query = query.where('officeId', '==', scopedOfficeId)
  if (activeStatus === 'active') query = query.where('active', '==', true)
  else if (activeStatus === 'inactive') query = query.where('active', '==', false)

  if (approvalStatus === PERSON_APPROVAL_PENDING || approvalStatus === PERSON_APPROVAL_REJECTED) {
    query = query.where('approvalStatus', '==', approvalStatus)
  }

  if (params.searchValue) {
    query = query
      .where(primaryField, '>=', params.searchValue)
      .where(primaryField, '<=', `${params.searchValue}\uf8ff`)
  }

  return {
    query: query.orderBy(primaryField, 'asc').orderBy(secondaryField, 'asc'),
    primaryField,
    secondaryField,
  }
}

async function countDirectoryRecords(db, resolvedSession, params) {
  const { query } = buildDirectoryQuery(db, resolvedSession, params)
  const snapshot = await query.count().get()
  return Number(snapshot.data().count || 0)
}

function matchesApprovalFilter(data, approvalFilter) {
  if (approvalFilter === 'all') return true
  return getEffectivePersonApprovalStatus(data) === approvalFilter
}

async function loadDirectoryPage(db, resolvedSession, params) {
  const { query, primaryField, secondaryField } = buildDirectoryQuery(db, resolvedSession, params)

  if (params.approval !== PERSON_APPROVAL_APPROVED) {
    let pageQuery = query.limit(params.limit + 1)
    if (params.cursor) {
      pageQuery = pageQuery.startAfter(params.cursor.primary, params.cursor.secondary)
    }
    const snapshot = await pageQuery.get()
    return {
      docs: snapshot.docs.slice(0, params.limit),
      hasMore: snapshot.docs.length > params.limit,
      primaryField,
      secondaryField,
    }
  }

  const collected = []
  const batchSize = Math.max(params.limit * 3, params.limit + 1, 12)
  let hasMore = false
  let scanQuery = query

  if (params.cursor) {
    scanQuery = scanQuery.startAfter(params.cursor.primary, params.cursor.secondary)
  }

  while (collected.length < params.limit + 1) {
    const snapshot = await scanQuery.limit(batchSize).get()
    if (snapshot.empty) break

    snapshot.docs.forEach(record => {
      if (matchesApprovalFilter(record.data(), params.approval)) {
        collected.push(record)
      }
    })

    if (collected.length > params.limit) { hasMore = true; break }
    if (snapshot.size < batchSize) break

    const lastRecord = snapshot.docs[snapshot.docs.length - 1]
    scanQuery = query.startAfter(lastRecord.get(primaryField), lastRecord.get(secondaryField))
  }

  return {
    docs: collected.slice(0, params.limit),
    hasMore,
    primaryField,
    secondaryField,
  }
}

async function handleDirectoryGet(request, db, resolvedSession) {
  const params = parseDirectoryParams(request)
  const metricsPromise = Promise.all([
    countDirectoryRecords(db, resolvedSession, { ...params, approval: 'all' }),
    countDirectoryRecords(db, resolvedSession, { ...params, approval: PERSON_APPROVAL_PENDING }),
    countDirectoryRecords(db, resolvedSession, { ...params, approval: PERSON_APPROVAL_REJECTED }),
  ]).then(([allTotal, pending, rejected]) => {
    const approved = Math.max(0, allTotal - pending - rejected)
    const total = params.approval === 'all'
      ? allTotal
      : params.approval === PERSON_APPROVAL_APPROVED
        ? approved
        : params.approval === PERSON_APPROVAL_PENDING
          ? pending
          : rejected
    return { total, approved, pending, rejected }
  })

  const [pageResult, metrics] = await Promise.all([
    loadDirectoryPage(db, resolvedSession, params),
    metricsPromise,
  ])

  const persons = pageResult.docs
    .map(mapPersonDirectoryRecord)
    .filter(person => adminAuth.adminSessionAllowsOffice(resolvedSession, person.officeId))
  const nextCursor = pageResult.hasMore
    ? encodePersonDirectoryCursor({
      ...persons[persons.length - 1],
      [pageResult.primaryField]: persons[persons.length - 1]?.[pageResult.primaryField] || '',
      [pageResult.secondaryField]: persons[persons.length - 1]?.[pageResult.secondaryField] || '',
    }, params.searchMode)
    : ''

  return NextResponse.json({
    ok: true,
    persons,
    page: {
      limit: params.limit,
      hasMore: pageResult.hasMore,
      nextCursor,
      total: metrics.total,
      approved: metrics.approved,
      pending: metrics.pending,
      rejected: metrics.rejected,
      searchMode: params.searchMode,
    },
  })
}

export async function GET(request) {
  const session = adminAuth.parseAdminSessionCookieValue(
    request.cookies.get(adminAuth.getAdminSessionCookieName())?.value,
  )
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin login is required to load employees.' }, { status: 401 })
  }

  try {
    const db = getAdminDb()
    const resolvedSession = await adminAuth.resolveAdminSession(db, session)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }

    if (new URL(request.url).searchParams.get('mode') === 'directory') {
      return handleDirectoryGet(request, db, resolvedSession)
    }

    const snapshot = resolvedSession.scope === 'office'
      ? await db.collection('persons').where('officeId', '==', resolvedSession.officeId).get()
      : await db.collection('persons').orderBy('nameLower').get()

    const persons = snapshot.docs.map(mapPersonDirectoryRecord)
      .filter(person => adminAuth.adminSessionAllowsOffice(resolvedSession, person.officeId))
      .sort((left, right) => left.name.localeCompare(right.name))

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
    const session = adminAuth.parseAdminSessionCookieValue(
      request.cookies.get(adminAuth.getAdminSessionCookieName())?.value,
    )
    const resolvedSession = session ? await adminAuth.resolveAdminSession(db, session) : null
    const office = await getOfficeRecord(db, body.officeId)

    if (!office) {
      return NextResponse.json({ ok: false, message: 'Assigned office was not found.' }, { status: 400 })
    }

    if (resolvedSession && !adminAuth.adminSessionAllowsOffice(resolvedSession, office.id)) {
      return NextResponse.json(
        { ok: false, message: 'This admin session cannot enroll employees for that office.' },
        { status: 403 },
      )
    }

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

    // Duplicate face check via biometric index (fast, no full table scan).
    // Falls back to a full scan only if the index is empty, which shouldn't happen after backfill.
    const { queryBiometricIndexCandidates, matchBiometricIndexCandidates } = await import('../../../lib/biometric-index')
    let duplicateFace = null

    for (const descriptor of body.descriptors) {
      const indexCandidates = await queryBiometricIndexCandidates(db, [body.officeId], descriptor)

      if (indexCandidates.length > 0) {
        const match = matchBiometricIndexCandidates(indexCandidates, descriptor, DUPLICATE_FACE_THRESHOLD, 0.02)
        if (match.ok && match.personId) {
          const personRecord = await db.collection('persons').doc(match.personId).get()
          const personData = personRecord.exists ? { id: personRecord.id, ...personRecord.data() } : null
          if (personData && personData.employeeId !== body.employeeId) {
            duplicateFace = { person: personData, distance: match.distance }
            break
          }
        }
      }
    }

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
      officeId: office.id,
      officeName: office.name,
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
      const existingApprovalStatus = getEffectivePersonApprovalStatus(existing)

      if (!resolvedSession && existing && existingApprovalStatus === PERSON_APPROVAL_APPROVED) {
        throw new Error('Employee ID already exists. Additional biometric samples for approved employees must be handled by an admin.')
      }

      const personRef = existingRecord ? existingRecord.ref : db.collection('persons').doc()
      const nextApprovalStatus = existing
        ? (resolvedSession ? existingApprovalStatus : PERSON_APPROVAL_PENDING)
        : (resolvedSession ? PERSON_APPROVAL_APPROVED : PERSON_APPROVAL_PENDING)

      const nextPerson = existing
        ? {
            ...existing,
            ...payload,
            active: existing.active !== false,
            approvalStatus: nextApprovalStatus,
            descriptors: [
              ...(existing.descriptors || []),
              ...body.descriptors.map(serializeDescriptorSample),
            ],
            lastSubmittedAt: FieldValue.serverTimestamp(),
          }
        : {
            ...payload,
            active: true,
            approvalStatus: nextApprovalStatus,
            descriptors: body.descriptors.map(serializeDescriptorSample),
            createdAt: FieldValue.serverTimestamp(),
            submittedAt: FieldValue.serverTimestamp(),
            lastSubmittedAt: FieldValue.serverTimestamp(),
          }

      transaction.set(personRef, nextPerson, { merge: true })
      transaction.set(employeeLockRef, {
        updatedAt: FieldValue.serverTimestamp(),
        personId: personRef.id,
      }, { merge: true })

      return { existing, personId: personRef.id, nextPerson }
    })

    await syncPersonBiometricIndex(db, transactionResult.personId, transactionResult.nextPerson)

    // Store the enrollment photo for pending submissions so admins can review visually.
    // Requires Firebase Storage bucket and service account with Storage Object Admin role.
    if (body.photoDataUrl && transactionResult.nextPerson.approvalStatus === PERSON_APPROVAL_PENDING) {
      const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
      if (storageBucket) {
        const photoUrl = await uploadEnrollmentPhoto(
          storageBucket,
          transactionResult.personId,
          body.photoDataUrl,
        ).catch(err => {
          console.error('Enrollment photo upload failed (non-fatal):', err?.message)
          return null
        })

        if (photoUrl) {
          await db.collection('persons').doc(transactionResult.personId)
            .update({ photoUrl })
            .catch(() => null)
        }
      }
    }

    // Audit log
    const sampleCount = normalizeStoredDescriptors(transactionResult.nextPerson.descriptors).length
    const auditBase = {
      targetType: 'person',
      targetId: transactionResult.personId,
      officeId: office.id,
      metadata: {
        employeeId: body.employeeId,
        officeName: office.name,
        approvalStatus: transactionResult.nextPerson.approvalStatus,
        savedSampleCount: body.descriptors.length,
      },
    }

    if (resolvedSession && transactionResult.existing) {
      await writeAuditLog(db, {
        ...auditBase,
        actorRole: resolvedSession.role,
        actorScope: resolvedSession.scope,
        actorOfficeId: resolvedSession.officeId,
        action: 'person_sample_add',
        summary: `Added enrollment sample for ${body.name}`,
      })
    } else if (resolvedSession) {
      await writeAuditLog(db, {
        ...auditBase,
        actorRole: resolvedSession.role,
        actorScope: resolvedSession.scope,
        actorOfficeId: resolvedSession.officeId,
        action: 'person_create',
        summary: `Created employee record for ${body.name}`,
      })
    } else {
      await writeAuditLog(db, {
        ...auditBase,
        actorRole: 'public',
        actorScope: 'public',
        action: transactionResult.existing ? 'person_submission_update' : 'person_submission_create',
        summary: transactionResult.existing
          ? `Public enrollment resubmitted for ${body.name}`
          : `Public enrollment submitted for ${body.name}`,
      })
    }

    return NextResponse.json({
      ok: true,
      personId: transactionResult.personId,
      approvalStatus: transactionResult.nextPerson.approvalStatus,
      sampleCount,
      savedSampleCount: body.descriptors.length,
      message: transactionResult.nextPerson.approvalStatus === PERSON_APPROVAL_PENDING
        ? 'Enrollment submitted for admin approval.'
        : 'Enrollment saved.',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save enrollment.'
    return NextResponse.json(
      { ok: false, message },
      { status: message.startsWith('Employee ID already exists.') ? 409 : 500 },
    )
  }
}

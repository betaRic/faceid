import crypto from 'crypto'
import { buildDescriptorBuckets } from '@/lib/biometric-index'
import { normalizeStoredDescriptors } from '@/lib/biometrics/descriptor-utils'
import {
  ENROLLMENT_MIN_SAMPLES,
  ENROLLMENT_SUPPORT_SAMPLE_MIN_DIVERSITY,
} from '@/lib/biometrics/enrollment-burst'
import {
  getEffectivePersonApprovalStatus,
  isPersonBiometricActive,
  PERSON_APPROVAL_APPROVED,
  PERSON_APPROVAL_PENDING,
} from '@/lib/person-approval'
import { evaluateDuplicateFaceCandidates, DUPLICATE_STATUS_REVIEW_REQUIRED } from '@/lib/persons/duplicate-face'
import { deduplicateDescriptors, serializeDescriptorSample } from '@/lib/persons/enrollment'
import { validatePublicEnrollmentIdentity } from '@/lib/persons/enrollment-policy'
import { getPostgresPool, queryPostgres, withPostgresTransaction } from './client'

function safeJson(value, fallback) {
  return value == null ? fallback : value
}

export function mapLocalPersonRow(row) {
  if (!row) return null
  const data = safeJson(row.data, {})
  return {
    id: row.id,
    name: row.name || '',
    employeeId: row.employee_id || '',
    position: row.position || '',
    nameLower: row.name_lower || String(row.name || '').toLowerCase(),
    officeId: row.office_id || '',
    officeName: row.office_name || '',
    divisionId: row.division_id || '',
    divisionName: row.division_name || '',
    active: row.active !== false,
    approvalStatus: row.approval_status || PERSON_APPROVAL_PENDING,
    descriptors: safeJson(row.descriptors, []),
    sampleCount: Number(row.sample_count || 0),
    duplicateReviewRequired: row.duplicate_review_required === true,
    duplicateReviewStatus: row.duplicate_review_status || 'clear',
    duplicateReviewCandidateName: row.duplicate_review_candidate_name || '',
    duplicateReviewCandidateEmployeeId: row.duplicate_review_candidate_employee_id || '',
    duplicateReviewDistance: Number.isFinite(row.duplicate_review_distance) ? Number(row.duplicate_review_distance) : null,
    duplicateReviewReasonCode: row.duplicate_review_reason_code || '',
    photoPath: row.photo_path || '',
    photoUrl: row.photo_url || '',
    photoContentType: row.photo_content_type || '',
    approvalUpdatedAt: row.approval_updated_at || null,
    approvalUpdatedByEmail: row.approval_updated_by_email || '',
    submittedAt: row.submitted_at || null,
    approvedAt: row.approved_at || null,
    captureMetadata: data.captureMetadata || {},
    biometricModelVersion: data.biometricModelVersion || '',
    biometricQualityScore: Number.isFinite(data.biometricQualityScore) ? Number(data.biometricQualityScore) : null,
  }
}

function buildDuplicateReviewFields(evaluation) {
  if (!evaluation || evaluation.status !== DUPLICATE_STATUS_REVIEW_REQUIRED) {
    return {
      duplicateReviewRequired: false,
      duplicateReviewStatus: 'clear',
      duplicateReviewReasonCode: '',
      duplicateReviewDistance: null,
      duplicateReviewCandidateEmployeeId: '',
      duplicateReviewCandidateName: '',
    }
  }

  const candidate = evaluation.person || {}
  return {
    duplicateReviewRequired: true,
    duplicateReviewStatus: DUPLICATE_STATUS_REVIEW_REQUIRED,
    duplicateReviewReasonCode: String(evaluation.reasonCode || 'duplicate_review_match'),
    duplicateReviewDistance: Number(evaluation.distance || 0),
    duplicateReviewCandidateEmployeeId: String(candidate.employeeId || ''),
    duplicateReviewCandidateName: String(candidate.name || ''),
  }
}

async function loadDuplicateCandidates(client, { includePending = true } = {}) {
  const approvals = includePending
    ? [PERSON_APPROVAL_APPROVED, PERSON_APPROVAL_PENDING]
    : [PERSON_APPROVAL_APPROVED]
  const result = await client.query(
    `
      SELECT *
      FROM persons
      WHERE active = true
        AND approval_status = ANY($1::text[])
        AND jsonb_array_length(descriptors) > 0
    `,
    [approvals],
  )
  return result.rows.map(mapLocalPersonRow)
}

export async function checkLocalDuplicateFace(descriptors, excludePersonId = '') {
  if (!Array.isArray(descriptors) || descriptors.length === 0) return null
  const client = await getPostgresPool().connect()
  try {
    const candidates = await loadDuplicateCandidates(client, { includePending: true })
    return evaluateDuplicateFaceCandidates(candidates, descriptors, excludePersonId)
  } finally {
    client.release()
  }
}

export async function syncLocalPersonBiometricIndex(client, personId, personData) {
  const descriptors = normalizeStoredDescriptors(personData.descriptors)
  await client.query('DELETE FROM biometric_index WHERE person_id = $1', [personId])

  for (let sampleIndex = 0; sampleIndex < descriptors.length; sampleIndex += 1) {
    const descriptor = descriptors[sampleIndex]
    const { normalizedDescriptor, bucketA, bucketB } = buildDescriptorBuckets(descriptor)
    const biometricEnabled = isPersonBiometricActive(personData)
    await client.query(
      `
        INSERT INTO biometric_index (
          id, person_id, sample_index, employee_id, name, office_id, office_name,
          active, biometric_enabled, approval_status, descriptor, normalized_descriptor,
          bucket_a, bucket_b, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11::jsonb, $12::jsonb,
          $13, $14, now()
        )
      `,
      [
        `${personId}_${sampleIndex}`,
        personId,
        sampleIndex,
        personData.employeeId || '',
        personData.name || '',
        personData.officeId || '',
        personData.officeName || '',
        personData.active !== false,
        biometricEnabled,
        getEffectivePersonApprovalStatus(personData),
        JSON.stringify(descriptor),
        JSON.stringify(normalizedDescriptor),
        bucketA,
        bucketB,
      ],
    )
  }
}

export async function getLocalPersonById(personId) {
  const result = await queryPostgres(
    'SELECT * FROM persons WHERE id = $1 LIMIT 1',
    [String(personId || '')],
  )
  return mapLocalPersonRow(result.rows[0])
}

export async function listLocalPersons(options = {}) {
  const officeId = String(options.officeId || '').trim()
  const result = await queryPostgres(
    `
      SELECT *
      FROM persons
      WHERE ($1 = '' OR office_id = $1)
      ORDER BY name_lower ASC, employee_id_lower ASC
    `,
    [officeId],
  )
  return result.rows.map(mapLocalPersonRow)
}

export async function countLocalPersonsByApproval(approval = '') {
  const normalized = String(approval || '').trim().toLowerCase()
  const result = await queryPostgres(
    `
      SELECT count(*)::integer AS count
      FROM persons
      WHERE ($1 = '' OR approval_status = $1)
    `,
    [normalized],
  )
  return Number(result.rows[0]?.count || 0)
}


export async function enrollLocalPerson(body, office, resolvedSession = null) {
  const division = body.divisionId
    ? (Array.isArray(office?.divisions) ? office.divisions : []).find(d => d?.id === body.divisionId) || null
    : null
  const employeeIdLower = String(body.employeeId || '').trim().toLowerCase()
  const existingBeforeWrite = await getPostgresPool().query(
    'SELECT id FROM persons WHERE employee_id_lower = $1 LIMIT 1',
    [employeeIdLower],
  )
  const duplicateBeforeWrite = await checkLocalDuplicateFace(
    body.descriptors,
    existingBeforeWrite.rows[0]?.id || '',
  )

  if (duplicateBeforeWrite?.duplicate) {
    const dup = duplicateBeforeWrite.person
    throw Object.assign(
      new Error(`Face is too similar to ${dup.name} (${dup.employeeId || 'no employee ID'}). Duplicate enrollment blocked.`),
      { duplicateFace: duplicateBeforeWrite },
    )
  }

  const transactionResult = await withPostgresTransaction(async client => {
    const existingResult = await client.query(
      'SELECT * FROM persons WHERE employee_id_lower = $1 LIMIT 1 FOR UPDATE',
      [employeeIdLower],
    )
    const existing = mapLocalPersonRow(existingResult.rows[0])

    if (!resolvedSession && existing) {
      const publicIdentityError = validatePublicEnrollmentIdentity(existing, body)
      if (publicIdentityError) throw new Error(publicIdentityError)
    }

    const duplicateFace = evaluateDuplicateFaceCandidates(
      await loadDuplicateCandidates(client, { includePending: true }),
      body.descriptors,
      existing?.id || '',
    )
    if (duplicateFace?.duplicate) {
      const dup = duplicateFace.person
      throw Object.assign(
        new Error(`Face is too similar to ${dup.name} (${dup.employeeId || 'no employee ID'}). Duplicate enrollment blocked.`),
        { duplicateFace },
      )
    }

    const existingStoredDescriptors = existing
      ? normalizeStoredDescriptors(existing.descriptors || [])
      : []
    const { accepted: uniqueDescriptors, rejected: duplicateDescriptors } =
      deduplicateDescriptors(body.descriptors, existingStoredDescriptors, {
        minSampleDiversity: ENROLLMENT_SUPPORT_SAMPLE_MIN_DIVERSITY,
      })

    if (uniqueDescriptors.length === 0) {
      throw Object.assign(
        new Error('All submitted face samples are too similar to already-stored samples. Re-enroll with fresh captures in different lighting or angles.'),
        { code: 'all_samples_duplicate' },
      )
    }

    if (existingStoredDescriptors.length + uniqueDescriptors.length < ENROLLMENT_MIN_SAMPLES) {
      throw Object.assign(
        new Error(`Enrollment must save at least ${ENROLLMENT_MIN_SAMPLES} validated support samples before the profile can be used for attendance.`),
        { code: 'insufficient_support_samples' },
      )
    }

    const previousApprovalStatus = getEffectivePersonApprovalStatus(existing, PERSON_APPROVAL_PENDING)
    const nextApprovalStatus = existing
      ? (resolvedSession ? previousApprovalStatus : PERSON_APPROVAL_PENDING)
      : (resolvedSession ? PERSON_APPROVAL_APPROVED : PERSON_APPROVAL_PENDING)
    const duplicateReviewFields = buildDuplicateReviewFields(duplicateFace)
    const personId = existing?.id || crypto.randomUUID()
    const now = new Date()
    const effectiveName = existing && !resolvedSession ? existing.name : body.name.toUpperCase()
    const effectiveOfficeId = existing && !resolvedSession ? existing.officeId : office.id
    const effectiveOfficeName = existing && !resolvedSession ? existing.officeName : office.name
    const effectivePosition = existing && !resolvedSession ? existing.position : String(body.position || '').trim()
    const effectiveDivisionId = existing && !resolvedSession ? existing.divisionId : (division?.id || '')
    const effectiveDivisionName = existing && !resolvedSession ? existing.divisionName : (division?.name || '')
    const nextDescriptors = [
      ...(existing?.descriptors || []),
      ...uniqueDescriptors.map(serializeDescriptorSample),
    ]
    const nextPerson = {
      id: personId,
      name: effectiveName,
      employeeId: existing?.employeeId || body.employeeId,
      position: effectivePosition,
      nameLower: effectiveName.toLowerCase(),
      officeId: effectiveOfficeId,
      officeName: effectiveOfficeName,
      divisionId: effectiveDivisionId,
      divisionName: effectiveDivisionName,
      active: true,
      approvalStatus: nextApprovalStatus,
      ...duplicateReviewFields,
      descriptors: nextDescriptors,
      sampleCount: nextDescriptors.length,
      captureMetadata: body.captureMetadata || {},
      biometricModelVersion: String(
        body.biometricModelVersion
        || body.captureMetadata?.modelVersion
        || 'human-faceres-browser-v1',
      ),
      biometricQualityScore: Number.isFinite(body.captureMetadata?.qualityScore)
        ? Number(body.captureMetadata.qualityScore)
        : null,
      submittedAt: existing?.submittedAt || now,
      approvedAt: nextApprovalStatus === PERSON_APPROVAL_APPROVED ? (existing?.approvedAt || now) : null,
    }
    const data = {
      captureMetadata: nextPerson.captureMetadata,
      biometricModelVersion: nextPerson.biometricModelVersion,
      biometricQualityScore: nextPerson.biometricQualityScore,
      lastSubmittedAt: now.toISOString(),
    }

    await client.query(
      `
        INSERT INTO persons (
          id, employee_id, employee_id_lower, name, name_lower, position,
          office_id, office_name, division_id, division_name, active, approval_status,
          descriptors, sample_count, duplicate_review_status, duplicate_review_required,
          duplicate_review_candidate_name, duplicate_review_candidate_employee_id,
          duplicate_review_distance, duplicate_review_reason_code, data, submitted_at,
          approved_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12,
          $13::jsonb, $14, $15, $16,
          $17, $18, $19, $20, $21::jsonb, $22,
          $23, now()
        )
        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          name_lower = EXCLUDED.name_lower,
          position = EXCLUDED.position,
          office_id = EXCLUDED.office_id,
          office_name = EXCLUDED.office_name,
          division_id = EXCLUDED.division_id,
          division_name = EXCLUDED.division_name,
          active = EXCLUDED.active,
          approval_status = EXCLUDED.approval_status,
          descriptors = EXCLUDED.descriptors,
          sample_count = EXCLUDED.sample_count,
          duplicate_review_status = EXCLUDED.duplicate_review_status,
          duplicate_review_required = EXCLUDED.duplicate_review_required,
          duplicate_review_candidate_name = EXCLUDED.duplicate_review_candidate_name,
          duplicate_review_candidate_employee_id = EXCLUDED.duplicate_review_candidate_employee_id,
          duplicate_review_distance = EXCLUDED.duplicate_review_distance,
          duplicate_review_reason_code = EXCLUDED.duplicate_review_reason_code,
          data = EXCLUDED.data,
          approved_at = EXCLUDED.approved_at,
          updated_at = now()
      `,
      [
        personId,
        nextPerson.employeeId,
        employeeIdLower,
        nextPerson.name,
        nextPerson.nameLower,
        nextPerson.position,
        nextPerson.officeId,
        nextPerson.officeName,
        nextPerson.divisionId,
        nextPerson.divisionName,
        nextPerson.active,
        nextPerson.approvalStatus,
        JSON.stringify(nextPerson.descriptors),
        nextPerson.sampleCount,
        nextPerson.duplicateReviewStatus,
        nextPerson.duplicateReviewRequired,
        nextPerson.duplicateReviewCandidateName,
        nextPerson.duplicateReviewCandidateEmployeeId,
        nextPerson.duplicateReviewDistance,
        nextPerson.duplicateReviewReasonCode,
        JSON.stringify(data),
        nextPerson.submittedAt,
        nextPerson.approvedAt,
      ],
    )

    await syncLocalPersonBiometricIndex(client, personId, nextPerson)

    return {
      existing,
      personId,
      nextPerson,
      uniqueCount: uniqueDescriptors.length,
      duplicateCount: duplicateDescriptors.length,
      duplicateReview: duplicateFace?.reviewRequired ? duplicateFace : null,
    }
  })

  return {
    transactionResult,
    sampleCount: normalizeStoredDescriptors(transactionResult.nextPerson.descriptors).length,
    indexSyncWarning: null,
    duplicateReviewRequired: Boolean(transactionResult.duplicateReview),
  }
}

export async function writeLocalEnrollmentAuditLog(transactionResult, body, office, resolvedSession = null) {
  await getPostgresPool().query(
    `
      INSERT INTO audit_logs (
        actor_role, actor_scope, actor_office_id, action, target_type,
        target_id, office_id, summary, metadata
      )
      VALUES ($1, $2, $3, $4, 'person', $5, $6, $7, $8::jsonb)
    `,
    [
      resolvedSession?.role || 'public',
      resolvedSession?.scope || 'public',
      resolvedSession?.officeId || '',
      transactionResult.existing ? 'person_submission_update' : 'person_submission_create',
      transactionResult.personId,
      office.id,
      transactionResult.existing
        ? `Public enrollment resubmitted for ${body.name}`
        : `Public enrollment submitted for ${body.name}`,
      JSON.stringify({
        employeeId: body.employeeId,
        officeName: office.name,
        approvalStatus: transactionResult.nextPerson.approvalStatus,
        savedSampleCount: transactionResult.uniqueCount,
        duplicatesDropped: transactionResult.duplicateCount,
        duplicateReviewRequired: transactionResult.nextPerson.duplicateReviewRequired === true,
        duplicateReviewStatus: transactionResult.nextPerson.duplicateReviewStatus || 'clear',
      }),
    ],
  )
}

export async function updateLocalPersonProfile(personId, body, office, resolvedSession = {}) {
  return withPostgresTransaction(async client => {
    const existingResult = await client.query('SELECT * FROM persons WHERE id = $1 LIMIT 1 FOR UPDATE', [personId])
    const existing = mapLocalPersonRow(existingResult.rows[0])
    if (!existing) return null

    const isRegional = String(office.officeType || '').trim() === 'Regional Office'
    const division = isRegional
      ? (Array.isArray(office.divisions) ? office.divisions : []).find(d => d?.id === body.divisionId) || null
      : null
    const previousApprovalStatus = getEffectivePersonApprovalStatus(existing, PERSON_APPROVAL_PENDING)
    const nextApprovalStatus = body.approvalStatus || previousApprovalStatus
    const approvalChanged = previousApprovalStatus !== nextApprovalStatus
    const approvedAt = nextApprovalStatus === PERSON_APPROVAL_APPROVED
      ? (existing.approvedAt || new Date())
      : null
    const duplicateResolved = approvalChanged
      && existing.duplicateReviewRequired === true
      && nextApprovalStatus !== PERSON_APPROVAL_PENDING

    const nextPerson = {
      ...existing,
      name: String(body.name || '').trim(),
      position: String(body.position || '').trim(),
      nameLower: String(body.name || '').trim().toLowerCase(),
      officeId: office.id,
      officeName: office.name,
      divisionId: isRegional ? (division?.id || '') : '',
      divisionName: isRegional ? (division?.name || '') : '',
      active: body.active !== false,
      approvalStatus: nextApprovalStatus,
      approvedAt,
      approvalUpdatedAt: approvalChanged ? new Date() : existing.approvalUpdatedAt,
      approvalUpdatedByEmail: approvalChanged ? (resolvedSession.email || '') : existing.approvalUpdatedByEmail,
      duplicateReviewRequired: duplicateResolved ? false : existing.duplicateReviewRequired,
      duplicateReviewStatus: duplicateResolved ? 'resolved' : existing.duplicateReviewStatus,
    }

    await client.query(
      `
        UPDATE persons
        SET name = $2,
            name_lower = $3,
            position = $4,
            office_id = $5,
            office_name = $6,
            division_id = $7,
            division_name = $8,
            active = $9,
            approval_status = $10,
            approved_at = $11,
            approval_updated_at = $12,
            approval_updated_by_email = $13,
            duplicate_review_required = $14,
            duplicate_review_status = $15,
            updated_at = now()
        WHERE id = $1
      `,
      [
        personId,
        nextPerson.name,
        nextPerson.nameLower,
        nextPerson.position,
        nextPerson.officeId,
        nextPerson.officeName,
        nextPerson.divisionId,
        nextPerson.divisionName,
        nextPerson.active,
        nextPerson.approvalStatus,
        nextPerson.approvedAt,
        nextPerson.approvalUpdatedAt,
        nextPerson.approvalUpdatedByEmail,
        nextPerson.duplicateReviewRequired,
        nextPerson.duplicateReviewStatus,
      ],
    )
    await syncLocalPersonBiometricIndex(client, personId, nextPerson)
    return { existing, nextPerson, approvalChanged, officeChanged: existing.officeId !== nextPerson.officeId }
  })
}

export async function resetLocalPersonBiometrics(personId) {
  return withPostgresTransaction(async client => {
    const result = await client.query('SELECT * FROM persons WHERE id = $1 LIMIT 1 FOR UPDATE', [personId])
    const person = mapLocalPersonRow(result.rows[0])
    if (!person) return null
    const previousSampleCount = normalizeStoredDescriptors(person.descriptors).length
    const nextPerson = {
      ...person,
      descriptors: [],
      sampleCount: 0,
      approvalStatus: PERSON_APPROVAL_PENDING,
      approvedAt: null,
    }
    await client.query(
      `
        UPDATE persons
        SET descriptors = '[]'::jsonb,
            sample_count = 0,
            approval_status = 'pending',
            approved_at = NULL,
            updated_at = now()
        WHERE id = $1
      `,
      [personId],
    )
    await syncLocalPersonBiometricIndex(client, personId, nextPerson)
    return { person: nextPerson, previousSampleCount }
  })
}

export async function replaceLocalPersonDescriptors(personId, descriptors, metadata = {}) {
  return withPostgresTransaction(async client => {
    const result = await client.query('SELECT * FROM persons WHERE id = $1 LIMIT 1 FOR UPDATE', [personId])
    const person = mapLocalPersonRow(result.rows[0])
    if (!person) return null
    const previousSampleCount = normalizeStoredDescriptors(person.descriptors).length
    const serialized = descriptors.map(serializeDescriptorSample)
    const approvalStatus = metadata.approvalStatus || person.approvalStatus || PERSON_APPROVAL_PENDING
    const nextPerson = {
      ...person,
      descriptors: serialized,
      sampleCount: serialized.length,
      approvalStatus,
      approvedAt: approvalStatus === PERSON_APPROVAL_APPROVED ? (person.approvedAt || new Date()) : null,
      captureMetadata: metadata.captureMetadata || {},
      biometricModelVersion: metadata.biometricModelVersion || person.biometricModelVersion || 'human-faceres-browser-v1',
      biometricQualityScore: Number.isFinite(metadata.biometricQualityScore) ? Number(metadata.biometricQualityScore) : person.biometricQualityScore,
    }
    await client.query(
      `
        UPDATE persons
        SET descriptors = $2::jsonb,
            sample_count = $3,
            approval_status = $4,
            approved_at = $5,
            data = data || $6::jsonb,
            updated_at = now()
        WHERE id = $1
      `,
      [
        personId,
        JSON.stringify(serialized),
        serialized.length,
        approvalStatus,
        nextPerson.approvedAt,
        JSON.stringify({
          captureMetadata: nextPerson.captureMetadata,
          biometricModelVersion: nextPerson.biometricModelVersion,
          biometricQualityScore: nextPerson.biometricQualityScore,
          reenrolledAt: new Date().toISOString(),
          reenrollSource: metadata.reenrollSource || 'admin',
        }),
      ],
    )
    await syncLocalPersonBiometricIndex(client, personId, nextPerson)
    return { person: nextPerson, previousSampleCount, sampleCount: serialized.length }
  })
}

export async function deleteLocalPerson(personId, { hardDelete = false } = {}) {
  return withPostgresTransaction(async client => {
    const result = await client.query('SELECT * FROM persons WHERE id = $1 LIMIT 1 FOR UPDATE', [personId])
    const person = mapLocalPersonRow(result.rows[0])
    if (!person) return null
    const employeeId = person.employeeId || ''
    const counts = {
      biometricDeleted: normalizeStoredDescriptors(person.descriptors).length,
      attendanceDeleted: 0,
      attendanceDailyDeleted: 0,
      attendanceLocksDeleted: 0,
      scanEventsDeleted: 0,
    }

    if (hardDelete && employeeId) {
      counts.attendanceDeleted = Number((await client.query('DELETE FROM attendance WHERE employee_id = $1', [employeeId])).rowCount || 0)
      counts.attendanceDailyDeleted = Number((await client.query('DELETE FROM attendance_daily WHERE employee_id = $1', [employeeId])).rowCount || 0)
      counts.attendanceLocksDeleted = Number((await client.query('DELETE FROM attendance_locks WHERE employee_id = $1', [employeeId])).rowCount || 0)
      counts.scanEventsDeleted = Number((await client.query('DELETE FROM scan_events WHERE employee_id = $1 OR person_id = $2', [employeeId, personId])).rowCount || 0)
    }

    await client.query('DELETE FROM biometric_index WHERE person_id = $1', [personId])
    await client.query('DELETE FROM persons WHERE id = $1', [personId])
    return { person, counts }
  })
}

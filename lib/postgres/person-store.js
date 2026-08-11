import crypto from 'crypto'
import { buildDescriptorBuckets } from '@/lib/biometric-index'
import { normalizeStoredDescriptors } from '@/lib/biometrics/descriptor-utils'
import {
  ENROLLMENT_MIN_SAMPLES,
  ENROLLMENT_SUPPORT_SAMPLE_MIN_DIVERSITY,
} from '@/lib/biometrics/enrollment-burst'
import {
  getEffectivePersonApprovalStatus,
  getPersonLifecycleStatus,
  normalizePersonLifecycleStatus,
  isPersonBiometricActive,
  PERSON_APPROVAL_APPROVED,
  PERSON_APPROVAL_PENDING,
} from '@/lib/person-approval'
import { evaluateDuplicateFaceCandidates, DUPLICATE_STATUS_REVIEW_REQUIRED } from '@/lib/persons/duplicate-face'
import { deduplicateDescriptors, serializeDescriptorSample } from '@/lib/persons/enrollment'
import { validatePublicEnrollmentIdentity } from '@/lib/persons/enrollment-policy'
import { normalizeEmployeeNameFields, normalizePersonNamePart } from '@/lib/person-name'
import { normalizeEmployeeWfhDays } from '@/lib/employee-wfh'
import { getPostgresPool, queryPostgres, withPostgresTransaction } from './client'

function safeJson(value, fallback) {
  return value == null ? fallback : value
}

export function mapLocalPersonRow(row) {
  if (!row) return null
  const data = safeJson(row.data, {})
  const names = normalizeEmployeeNameFields({
    lastName: row.last_name,
    firstName: row.first_name,
    middleName: row.middle_name,
  })
  return {
    id: row.id,
    name: normalizePersonNamePart(row.name) || names.name,
    lastName: names.lastName,
    firstName: names.firstName,
    middleName: names.middleName,
    employeeId: row.employee_id || '',
    accessCode: row.access_code || '',
    position: row.position || '',
    nameLower: row.name_lower || String(row.name || '').toLowerCase(),
    officeId: row.office_id || '',
    officeName: row.office_name || '',
    divisionId: row.division_id || '',
    divisionName: row.division_name || '',
    weeklySchedule: safeJson(row.weekly_schedule, {}),
    flexitime: safeJson(row.flexitime, {}),
    individualWfhDays: normalizeEmployeeWfhDays(data.individualWfhDays),
    lifecycleStatus: row.lifecycle_status || (row.approval_status === 'pending' ? 'pending' : (row.active !== false && row.approval_status === 'approved' ? 'active' : 'inactive')),
    active: row.lifecycle_status ? row.lifecycle_status === 'active' : row.active !== false,
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
    photoUrl: row.photo_path ? `/api/persons/${row.id}/photo` : (row.photo_url || ''),
    photoContentType: row.photo_content_type || '',
    approvalUpdatedAt: row.approval_updated_at || null,
    approvalUpdatedByEmail: row.approval_updated_by_email || '',
    submittedAt: row.submitted_at || null,
    approvedAt: row.approved_at || null,
    captureMetadata: data.captureMetadata || {},
    biometricModelVersion: data.biometricModelVersion || '',
    biometricQualityScore: Number.isFinite(data.biometricQualityScore) ? Number(data.biometricQualityScore) : null,
    privacyConsent: data.privacyConsent || null,
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
      WHERE lifecycle_status IN ('active', 'pending')
        AND jsonb_array_length(descriptors) > 0
    `,
    [],
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

async function generateLocalAccessCode(client) {
  // Serialize allocation. The unique database index remains the hard guard,
  // while this lock avoids handing two concurrent requests the same candidate.
  await client.query("SELECT pg_advisory_xact_lock(hashtext('persons_access_code'))")
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const accessCode = String(Math.floor(Math.random() * 10_000)).padStart(4, '0')
    const existing = await client.query('SELECT 1 FROM persons WHERE access_code = $1 LIMIT 1', [accessCode])
    if (existing.rowCount === 0) return accessCode
  }
  throw new Error('Could not generate a unique employee access code. Please try again.')
}

export async function loadLocalPersonDirectory(options = {}) {
  const officeId = String(options.officeId || '').trim()
  const divisionId = String(options.divisionId || '').trim()
  const status = String(options.status || 'all').trim().toLowerCase()
  const approval = String(options.approval || 'all').trim().toLowerCase()
  // "none" and "name" share the alphabetical SQL sort, but are distinct
  // cursor modes.  Collapsing none to name here made an unfiltered directory
  // reject its own cursor and return page one again.
  const requestedSearchMode = options.searchMode === 'employeeId'
    ? 'employeeId'
    : options.searchMode === 'name'
      ? 'name'
      : 'none'
  const searchMode = requestedSearchMode === 'employeeId' ? 'employeeId' : 'name'
  const searchValue = String(options.searchValue || '').trim().toLowerCase()
  const limit = Math.max(1, Math.min(50, Number(options.limit) || 25))
  const cursor = options.cursor && options.cursor.mode === requestedSearchMode ? options.cursor : null
  const values = []
  const addValue = (value) => {
    values.push(value)
    return `$${values.length}`
  }
  const filters = []

  if (officeId) filters.push(`office_id = ${addValue(officeId)}`)
  if (divisionId) filters.push(`division_id = ${addValue(divisionId)}`)
  if (status === 'active' || status === 'pending' || status === 'inactive') filters.push(`lifecycle_status = ${addValue(status)}`)
  // "approval" is accepted only for older bookmarked links.  New callers use
  // the one lifecycle filter; this keeps a rolling deployment safe.
  if (approval !== 'all') filters.push(`lifecycle_status = ${addValue(approval === 'approved' ? 'active' : approval === 'rejected' ? 'inactive' : approval)}`)

  if (searchValue) {
    if (searchMode === 'employeeId') {
      filters.push(`employee_id_lower LIKE ${addValue(`%${searchValue}%`)}`)
    } else {
      // Match the displayed name as well as individual name parts, so a first-name search works.
      const search = addValue(`%${searchValue}%`)
      filters.push(`(
        name_lower LIKE ${search}
        OR lower(first_name) LIKE ${search}
        OR lower(last_name) LIKE ${search}
        OR lower(middle_name) LIKE ${search}
      )`)
    }
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
  const [primaryField, secondaryField] = searchMode === 'employeeId'
    ? ['employee_id_lower', 'name_lower']
    : ['name_lower', 'employee_id_lower']
  const cursorValues = [...values]
  let pageWhereClause = whereClause
  if (cursor) {
    cursorValues.push(String(cursor.primary || ''), String(cursor.secondary || ''), String(cursor.id || ''))
    const cursorFilter = `(${primaryField}, ${secondaryField}, id) > ($${cursorValues.length - 2}, $${cursorValues.length - 1}, $${cursorValues.length})`
    pageWhereClause = `${whereClause}${whereClause ? ' AND' : 'WHERE'} ${cursorFilter}`
  }
  cursorValues.push(limit + 1)

  const [countResult, pageResult] = await Promise.all([
    queryPostgres(
      `SELECT
        count(*)::integer AS total,
        count(*) FILTER (WHERE lifecycle_status = 'active')::integer AS approved,
        count(*) FILTER (WHERE lifecycle_status = 'pending')::integer AS pending,
        count(*) FILTER (WHERE lifecycle_status = 'inactive')::integer AS rejected
       FROM persons
       ${whereClause}`,
      values,
    ),
    queryPostgres(
      // The directory is a high-frequency, unprivileged-by-default list view.
      // Never fetch facial descriptors or the general-purpose JSON document here:
      // neither is displayed and descriptors can make a small page response huge.
      `SELECT
        id, employee_id, employee_id_lower, access_code, name, name_lower,
        last_name, first_name, middle_name, position,
        office_id, office_name, division_id, division_name,
        active, approval_status, lifecycle_status, sample_count,
        weekly_schedule, flexitime,
        duplicate_review_status, duplicate_review_required,
        duplicate_review_candidate_name, duplicate_review_candidate_employee_id,
        duplicate_review_distance, duplicate_review_reason_code,
        approval_updated_at, approval_updated_by_email, submitted_at, approved_at
       FROM persons
       ${pageWhereClause}
       ORDER BY ${primaryField} ASC, ${secondaryField} ASC, id ASC
       LIMIT $${cursorValues.length}`,
      cursorValues,
    ),
  ])

  const rows = pageResult.rows.slice(0, limit).map(mapLocalPersonRow)
  const counts = countResult.rows[0] || {}
  return {
    persons: rows,
    hasMore: pageResult.rows.length > limit,
    total: Number(counts.total || 0),
    approved: Number(counts.approved || 0),
    pending: Number(counts.pending || 0),
    rejected: Number(counts.rejected || 0),
    primaryField: primaryField === 'employee_id_lower' ? 'employeeId' : 'nameLower',
    secondaryField: secondaryField === 'employee_id_lower' ? 'employeeId' : 'nameLower',
  }
}

export async function countLocalPersonsByApproval(approval = '') {
  const normalized = String(approval || '').trim().toLowerCase()
  const result = await queryPostgres(
    `
      SELECT count(*)::integer AS count
      FROM persons
      WHERE ($1 = '' OR lifecycle_status = CASE $1 WHEN 'approved' THEN 'active' WHEN 'rejected' THEN 'inactive' ELSE $1 END)
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
  const duplicateBeforeWrite = await checkLocalDuplicateFace(
    body.descriptors,
    '',
  )

  if (duplicateBeforeWrite?.duplicate) {
    const dup = duplicateBeforeWrite.person
    throw Object.assign(
      new Error(`Face is too similar to ${dup.name} (${dup.employeeId || 'no employee ID'}). Duplicate enrollment blocked.`),
      { duplicateFace: duplicateBeforeWrite },
    )
  }

  const transactionResult = await withPostgresTransaction(async client => {
    // Plantilla and COS staff can share an Employee ID, so that field alone is
    // not an identity key.  The same normalized name plus non-empty ID is a
    // repeat enrollment, however, and must never create a second biometric
    // profile.  The advisory lock closes the concurrent-submit race without
    // imposing a false global-unique employee-ID constraint.
    const submittedNames = normalizeEmployeeNameFields(body)
    if (employeeIdLower && submittedNames.nameLower) {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        [`person_registration:${employeeIdLower}:${submittedNames.nameLower}`],
      )
      const existingIdentity = await client.query(
        "SELECT id FROM persons WHERE employee_id_lower = $1 AND name_lower = $2 LIMIT 1 FOR UPDATE",
        [employeeIdLower, submittedNames.nameLower],
      )
      if (existingIdentity.rowCount > 0) {
        throw Object.assign(
          new Error("An enrollment already exists for this employee. Contact HR to review the existing record."),
          { code: "duplicate_person_registration" },
        )
      }
    }

    // Public registration is always a new person.  Existing records are only
    // changed through the authorized employee-management workflow.
    const existing = null

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
    const nextLifecycleStatus = nextApprovalStatus === PERSON_APPROVAL_APPROVED ? 'active' : 'pending'
    const duplicateReviewFields = buildDuplicateReviewFields(duplicateFace)
    const personId = existing?.id || crypto.randomUUID()
    const accessCode = existing?.accessCode || await generateLocalAccessCode(client)
    const now = new Date()
    const effectiveNames = existing && !resolvedSession
      ? normalizeEmployeeNameFields(existing)
      : submittedNames
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
      name: effectiveNames.name,
      lastName: effectiveNames.lastName,
      firstName: effectiveNames.firstName,
      middleName: effectiveNames.middleName,
      employeeId: existing?.employeeId || body.employeeId,
      accessCode,
      position: effectivePosition,
      nameLower: effectiveNames.nameLower,
      officeId: effectiveOfficeId,
      officeName: effectiveOfficeName,
      divisionId: effectiveDivisionId,
      divisionName: effectiveDivisionName,
      lifecycleStatus: nextLifecycleStatus,
      active: nextLifecycleStatus === 'active',
      approvalStatus: nextApprovalStatus,
      ...duplicateReviewFields,
      descriptors: nextDescriptors,
      sampleCount: nextDescriptors.length,
      captureMetadata: body.captureMetadata || {},
      privacyConsent: body.privacyConsentRecord || existing?.privacyConsent || null,
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
      privacyConsent: nextPerson.privacyConsent,
      lastName: nextPerson.lastName,
      firstName: nextPerson.firstName,
      middleName: nextPerson.middleName,
      lastSubmittedAt: now.toISOString(),
    }

    await client.query(
      `
        INSERT INTO persons (
          id, employee_id, employee_id_lower, access_code, name, name_lower, last_name, first_name, middle_name, position,
          office_id, office_name, division_id, division_name, lifecycle_status, active, approval_status,
          descriptors, sample_count, duplicate_review_status, duplicate_review_required,
          duplicate_review_candidate_name, duplicate_review_candidate_employee_id,
          duplicate_review_distance, duplicate_review_reason_code, data, submitted_at,
          approved_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17,
          $18::jsonb, $19, $20, $21,
          $22, $23, $24, $25, $26::jsonb, $27,
          $28, now()
        )
        ON CONFLICT (id)
        DO UPDATE SET
          employee_id = EXCLUDED.employee_id,
          employee_id_lower = EXCLUDED.employee_id_lower,
          access_code = EXCLUDED.access_code,
          name = EXCLUDED.name,
          name_lower = EXCLUDED.name_lower,
          last_name = EXCLUDED.last_name,
          first_name = EXCLUDED.first_name,
          middle_name = EXCLUDED.middle_name,
          position = EXCLUDED.position,
          office_id = EXCLUDED.office_id,
          office_name = EXCLUDED.office_name,
          division_id = EXCLUDED.division_id,
          division_name = EXCLUDED.division_name,
          lifecycle_status = EXCLUDED.lifecycle_status,
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
        nextPerson.accessCode,
        nextPerson.name,
        nextPerson.nameLower,
        nextPerson.lastName,
        nextPerson.firstName,
        nextPerson.middleName,
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
    const previousLifecycleStatus = getPersonLifecycleStatus(existing)
    const requestedLifecycle = body.lifecycleStatus || (body.approvalStatus === 'approved' ? 'active' : body.approvalStatus === 'rejected' ? 'inactive' : body.approvalStatus === 'pending' ? 'pending' : (body.active === false ? 'inactive' : previousLifecycleStatus))
    const nextLifecycleStatus = normalizePersonLifecycleStatus(requestedLifecycle, previousLifecycleStatus)
    const nextApprovalStatus = nextLifecycleStatus === 'active' ? 'approved' : nextLifecycleStatus === 'pending' ? 'pending' : 'rejected'
    const names = normalizeEmployeeNameFields({ ...existing, ...body })
    const employeeId = String(body.employeeId || existing.employeeId || '').trim()
    const employeeIdLower = employeeId.toLowerCase()
    const employeeIdChanged = employeeIdLower !== String(existing.employeeId || '').trim().toLowerCase()
    const approvalChanged = previousApprovalStatus !== nextApprovalStatus
    const approvedAt = nextApprovalStatus === PERSON_APPROVAL_APPROVED
      ? (existing.approvedAt || new Date())
      : null
    const duplicateResolved = approvalChanged
      && existing.duplicateReviewRequired === true
      && nextApprovalStatus !== PERSON_APPROVAL_PENDING

    const nextPerson = {
      ...existing,
      name: names.name,
      lastName: names.lastName,
      firstName: names.firstName,
      middleName: names.middleName,
      employeeId,
      position: String(body.position || '').trim(),
      nameLower: names.nameLower,
      officeId: office.id,
      officeName: office.name,
      divisionId: isRegional ? (division?.id || '') : '',
      divisionName: isRegional ? (division?.name || '') : '',
      individualWfhDays: normalizeEmployeeWfhDays(body.individualWfhDays),
      weeklySchedule: body.weeklySchedule === undefined ? existing.weeklySchedule : body.weeklySchedule,
      flexitime: body.flexitime === undefined ? existing.flexitime : body.flexitime,
      lifecycleStatus: nextLifecycleStatus,
      active: nextLifecycleStatus === 'active',
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
        SET employee_id = $2,
            employee_id_lower = $3,
            name = $4,
            name_lower = $5,
            last_name = $6,
            first_name = $7,
            middle_name = $8,
            position = $9,
            office_id = $10,
            office_name = $11,
            division_id = $12,
            division_name = $13,
            lifecycle_status = $14,
            active = $15,
            approval_status = $16,
            approved_at = $17,
            approval_updated_at = $18,
            approval_updated_by_email = $19,
            duplicate_review_required = $20,
            duplicate_review_status = $21,
            weekly_schedule = $22::jsonb,
            flexitime = $23::jsonb,
            data = data || $24::jsonb,
            updated_at = now()
        WHERE id = $1
      `,
      [
        personId,
        nextPerson.employeeId,
        employeeIdLower,
        nextPerson.name,
        nextPerson.nameLower,
        nextPerson.lastName,
        nextPerson.firstName,
        nextPerson.middleName,
        nextPerson.position,
        nextPerson.officeId,
        nextPerson.officeName,
        nextPerson.divisionId,
        nextPerson.divisionName,
        nextPerson.lifecycleStatus,
        nextPerson.active,
        nextPerson.approvalStatus,
        nextPerson.approvedAt,
        nextPerson.approvalUpdatedAt,
        nextPerson.approvalUpdatedByEmail,
        nextPerson.duplicateReviewRequired,
        nextPerson.duplicateReviewStatus,
        JSON.stringify(nextPerson.weeklySchedule || {}),
        JSON.stringify(nextPerson.flexitime || {}),
        JSON.stringify({
          lastName: nextPerson.lastName,
          firstName: nextPerson.firstName,
          middleName: nextPerson.middleName,
          individualWfhDays: nextPerson.individualWfhDays,
        }),
      ],
    )
    if (employeeIdChanged) {
      await client.query('UPDATE attendance SET employee_id = $2, name = $3 WHERE person_id = $1', [personId, nextPerson.employeeId, nextPerson.name])
      await client.query('UPDATE attendance_daily SET employee_id = $2, name = $3 WHERE person_id = $1', [personId, nextPerson.employeeId, nextPerson.name])
      await client.query('UPDATE scan_events SET employee_id = $2, name = $3 WHERE person_id = $1', [personId, nextPerson.employeeId, nextPerson.name])
    } else if (existing.name !== nextPerson.name) {
      await client.query('UPDATE attendance SET name = $2 WHERE person_id = $1', [personId, nextPerson.name])
      await client.query('UPDATE attendance_daily SET name = $2 WHERE person_id = $1', [personId, nextPerson.name])
      await client.query('UPDATE scan_events SET name = $2 WHERE person_id = $1', [personId, nextPerson.name])
    }
    await syncLocalPersonBiometricIndex(client, personId, nextPerson)
    return { existing, nextPerson, approvalChanged, officeChanged: existing.officeId !== nextPerson.officeId, employeeIdChanged }
  })
}

export async function regenerateLocalAccessCode(personId) {
  return withPostgresTransaction(async client => {
    const current = await client.query('SELECT * FROM persons WHERE id = $1 LIMIT 1 FOR UPDATE', [String(personId || '')])
    const person = mapLocalPersonRow(current.rows[0])
    if (!person) return null

    const accessCode = await generateLocalAccessCode(client)
    await client.query('UPDATE persons SET access_code = $2, updated_at = now() WHERE id = $1', [person.id, accessCode])
    return { ...person, accessCode }
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
      lifecycleStatus: 'pending',
      approvalStatus: PERSON_APPROVAL_PENDING,
      approvedAt: null,
    }
    await client.query(
      `
        UPDATE persons
        SET descriptors = '[]'::jsonb,
            sample_count = 0,
            lifecycle_status = 'pending',
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
    const lifecycleStatus = approvalStatus === PERSON_APPROVAL_APPROVED ? 'active' : 'pending'
    const nextPerson = {
      ...person,
      descriptors: serialized,
      sampleCount: serialized.length,
      lifecycleStatus,
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
            lifecycle_status = $4,
            approval_status = $5,
            approved_at = $6,
            data = data || $7::jsonb,
            updated_at = now()
        WHERE id = $1
      `,
      [
        personId,
        JSON.stringify(serialized),
        serialized.length,
        lifecycleStatus,
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
    const counts = {
      biometricDeleted: normalizeStoredDescriptors(person.descriptors).length,
      attendanceDeleted: 0,
      attendanceDailyDeleted: 0,
      attendanceLocksDeleted: 0,
      scanEventsDeleted: 0,
    }

    if (hardDelete) {
      counts.attendanceDeleted = Number((await client.query('DELETE FROM attendance WHERE person_id = $1', [personId])).rowCount || 0)
      counts.attendanceDailyDeleted = Number((await client.query('DELETE FROM attendance_daily WHERE person_id = $1', [personId])).rowCount || 0)
      counts.attendanceLocksDeleted = Number((await client.query('DELETE FROM attendance_locks WHERE employee_id = $1', [personId])).rowCount || 0)
      counts.scanEventsDeleted = Number((await client.query('DELETE FROM scan_events WHERE person_id = $1', [personId])).rowCount || 0)
    }

    await client.query('DELETE FROM biometric_index WHERE person_id = $1', [personId])
    await client.query('DELETE FROM persons WHERE id = $1', [personId])
    return { person, counts }
  })
}

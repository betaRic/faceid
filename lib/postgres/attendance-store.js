import { normalizeOfficeRecord } from '@/lib/offices'
import { sanitizeAttendanceEntryForStorage } from '@/lib/attendance/storage'
import { normalizeEmployeeNameFields } from '@/lib/person-name'
import { getPostgresPool, withPostgresTransaction } from './client'

function safeJson(value, fallback) {
  if (value == null) return fallback
  return value
}

function mapOfficeRow(row) {
  if (!row) return null
  return normalizeOfficeRecord({
    id: row.id,
    name: row.name,
    officeType: row.office_type,
    active: row.active,
    latitude: row.latitude,
    longitude: row.longitude,
    radiusMeters: row.radius_meters,
    workPolicy: safeJson(row.work_policy, {}),
    divisions: safeJson(row.divisions, []),
    ...(safeJson(row.data, {})),
  })
}

function mapPersonRow(row) {
  if (!row) return null
  const names = normalizeEmployeeNameFields({
    lastName: row.last_name,
    firstName: row.first_name,
    middleName: row.middle_name,
  })
  return {
    id: row.id,
    employeeId: row.employee_id,
    accessCode: row.access_code || '',
    name: row.name || names.name,
    lastName: names.lastName,
    firstName: names.firstName,
    middleName: names.middleName,
    nameLower: row.name_lower,
    position: row.position,
    officeId: row.office_id,
    officeName: row.office_name,
    divisionId: row.division_id,
    divisionName: row.division_name,
    active: row.active,
    approvalStatus: row.approval_status,
    descriptors: safeJson(row.descriptors, []),
    sampleCount: row.sample_count,
    duplicateReviewStatus: row.duplicate_review_status,
    duplicateReviewRequired: row.duplicate_review_required,
    duplicateReviewCandidateName: row.duplicate_review_candidate_name,
    duplicateReviewCandidateEmployeeId: row.duplicate_review_candidate_employee_id,
    duplicateReviewDistance: row.duplicate_review_distance,
    duplicateReviewReasonCode: row.duplicate_review_reason_code,
    photoPath: row.photo_path,
    photoUrl: row.photo_url,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    ...(safeJson(row.data, {})),
  }
}

function buildAttendancePreview(entry, attendanceId) {
  return {
    id: attendanceId,
    name: entry.name || '',
    employeeId: entry.employeeId || '',
    officeId: entry.officeId || '',
    officeName: entry.officeName || '',
    action: entry.action || '',
    attendanceMode: entry.attendanceMode || '',
    geofenceStatus: entry.geofenceStatus || '',
    decisionCode: entry.decisionCode || '',
    confidence: Number(entry.confidence ?? 0),
    timestamp: Number(entry.timestamp ?? 0),
    dateKey: entry.dateKey || '',
    dateLabel: entry.dateLabel || entry.date || '',
    date: entry.dateLabel || entry.date || '',
    time: entry.time || '',
  }
}

export function mapLocalAttendanceRow(row) {
  if (!row) return null
  const data = safeJson(row.data, {})
  return {
    id: row.id,
    ...data,
    employeeId: row.employee_id,
    personId: row.person_id,
    name: row.name,
    action: row.action,
    timestamp: Number(row.timestamp_ms || data.timestamp || 0),
    dateKey: row.date_key,
    dateLabel: row.date_label || data.dateLabel || data.date || '',
    date: row.date_label || data.date || '',
    time: row.time_label || data.time || '',
    officeId: row.office_id,
    officeName: row.office_name,
    attendanceMode: row.attendance_mode,
    geofenceStatus: row.geofence_status,
    decisionCode: row.decision_code,
    confidence: row.confidence,
    latitude: row.latitude,
    longitude: row.longitude,
  }
}

export async function getLocalPersonByEmployeeId(employeeId) {
  const normalized = String(employeeId || '').trim().toLowerCase()
  if (!normalized) return null

  const result = await getPostgresPool().query(
    'SELECT * FROM persons WHERE employee_id_lower = $1 LIMIT 2',
    [normalized],
  )
  // A shared plantilla/COS ID is not sufficient to identify a person.
  if (result.rows.length !== 1) return null
  return mapPersonRow(result.rows[0])
}

export async function getLocalPersonByAccessCode(accessCode) {
  const normalized = String(accessCode || '').trim()
  if (!/^\d{4}$/.test(normalized)) return null

  const result = await getPostgresPool().query(
    'SELECT * FROM persons WHERE access_code = $1 LIMIT 1',
    [normalized],
  )
  return mapPersonRow(result.rows[0])
}

export async function listLocalOfficeRecords() {
  const result = await getPostgresPool().query(
    'SELECT * FROM offices ORDER BY name_lower ASC, name ASC',
  )
  return result.rows.map(mapOfficeRow)
}

export async function getLocalOfficeRecord(officeId) {
  const id = String(officeId || '').trim()
  if (!id) return null

  const result = await getPostgresPool().query(
    'SELECT * FROM offices WHERE id = $1 LIMIT 1',
    [id],
  )
  return mapOfficeRow(result.rows[0])
}

export async function getLocalOfficeEmployeeCounts(officeIds) {
  const ids = Array.from(new Set((officeIds || []).map(id => String(id || '').trim()).filter(Boolean)))
  if (ids.length === 0) return {}

  const result = await getPostgresPool().query(
    `
      SELECT office_id, count(*)::integer AS count
      FROM persons
      WHERE office_id = ANY($1::text[])
      GROUP BY office_id
    `,
    [ids],
  )

  const counts = Object.fromEntries(ids.map(id => [id, 0]))
  result.rows.forEach(row => {
    counts[row.office_id] = Number(row.count || 0)
  })
  return counts
}

export async function getLocalAttendanceLogsForDate(employeeId, dateKey, personId = '') {
  const result = await getPostgresPool().query(
    `
      SELECT *
      FROM attendance
      WHERE ($1 = '' OR person_id = $1)
        AND ($1 <> '' OR employee_id = $2)
        AND date_key = $3
      ORDER BY timestamp_ms ASC
    `,
    [String(personId || ''), String(employeeId || ''), String(dateKey || '')],
  )
  return result.rows.map(mapLocalAttendanceRow)
}

export async function writeLocalAttendanceAtomically(entry, cooldownMs) {
  const identityKey = String(entry.personId || entry.employeeId || '').trim()
  const attendanceId = `${identityKey}_${entry.timestamp}`
  const storedEntry = sanitizeAttendanceEntryForStorage(entry)
  const entryPreview = buildAttendancePreview(entry, attendanceId)

  return withPostgresTransaction(async client => {
    const existing = await client.query(
      'SELECT * FROM attendance WHERE id = $1 LIMIT 1',
      [attendanceId],
    )
    if (existing.rows[0]) {
      return {
        ok: false,
        duplicate: true,
        entry: mapLocalAttendanceRow(existing.rows[0]),
      }
    }

    const lock = await client.query(
      'SELECT * FROM attendance_locks WHERE employee_id = $1 FOR UPDATE',
      [identityKey],
    )
    const lastTimestamp = Number(lock.rows[0]?.last_timestamp_ms || 0)
    if (cooldownMs > 0 && lastTimestamp && Number(entry.timestamp || 0) - lastTimestamp < cooldownMs) {
      return {
        ok: false,
        duplicate: true,
        entry: lock.rows[0]?.last_entry_preview || null,
      }
    }

    await client.query(
      `
        INSERT INTO attendance (
          id, employee_id, person_id, name, action, timestamp_ms, date_key, date_label,
          time_label, office_id, office_name, attendance_mode, geofence_status,
          decision_code, confidence, latitude, longitude, risk_flags, capture_context,
          scan_diagnostics, data
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13,
          $14, $15, $16, $17, $18::jsonb, $19::jsonb,
          $20::jsonb, $21::jsonb
        )
      `,
      [
        attendanceId,
        identityKey,
        entry.personId || '',
        entry.name || '',
        entry.action || '',
        Number(entry.timestamp || 0),
        entry.dateKey || '',
        entry.dateLabel || entry.date || '',
        entry.time || '',
        entry.officeId || '',
        entry.officeName || '',
        entry.attendanceMode || '',
        entry.geofenceStatus || '',
        entry.decisionCode || '',
        Number.isFinite(entry.confidence) ? Number(entry.confidence) : null,
        Number.isFinite(entry.latitude) ? Number(entry.latitude) : null,
        Number.isFinite(entry.longitude) ? Number(entry.longitude) : null,
        JSON.stringify(entry.riskFlags || []),
        JSON.stringify(entry.captureContext || {}),
        JSON.stringify(entry.scanDiagnostics || {}),
        JSON.stringify(storedEntry),
      ],
    )

    await client.query(
      `
        INSERT INTO attendance_locks (
          employee_id, office_id, last_timestamp_ms, last_attendance_id,
          last_action, last_entry_preview, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, now())
        ON CONFLICT (employee_id)
        DO UPDATE SET
          office_id = EXCLUDED.office_id,
          last_timestamp_ms = EXCLUDED.last_timestamp_ms,
          last_attendance_id = EXCLUDED.last_attendance_id,
          last_action = EXCLUDED.last_action,
          last_entry_preview = EXCLUDED.last_entry_preview,
          updated_at = now()
      `,
      [
        identityKey,
        entry.officeId || '',
        Number(entry.timestamp || 0),
        attendanceId,
        entry.action || '',
        JSON.stringify(entryPreview),
      ],
    )

    return { ok: true, attendanceId, storedEntry, entryPreview }
  })
}

export async function upsertLocalDailyAttendanceRecord(record) {
  const personId = String(record.personId || '').trim()
  if (!personId) throw new Error('A person ID is required to save a daily attendance record.')
  const id = record.id || `${personId}_${record.dateKey}`
  await getPostgresPool().query(
    `
      INSERT INTO attendance_daily (
        id, person_id, employee_id, date_key, name, office_id, office_name,
        status, log_count, data, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, now())
      ON CONFLICT (person_id, date_key)
      DO UPDATE SET
        employee_id = EXCLUDED.employee_id,
        name = EXCLUDED.name,
        office_id = EXCLUDED.office_id,
        office_name = EXCLUDED.office_name,
        status = EXCLUDED.status,
        log_count = EXCLUDED.log_count,
        data = EXCLUDED.data,
        updated_at = now()
    `,
    [
      id,
      personId,
      record.employeeId || '',
      record.dateKey || '',
      record.name || '',
      record.officeId || '',
      record.officeName || '',
      record.status || '',
      Number(record.logCount || 0),
      JSON.stringify(record),
    ],
  )
}

export async function writeLocalScanEvent(event) {
  await getPostgresPool().query(
    `
      INSERT INTO scan_events (
        status, decision_code, reason, timestamp_ms, employee_id, person_id,
        name, office_id, office_name, attendance_mode, geofence_status,
        location, risk_flags, capture_context, scan_diagnostics, performance,
        match_debug, request_meta, data
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb,
        $17::jsonb, $18::jsonb, $19::jsonb
      )
    `,
    [
      event.status || 'blocked',
      event.decisionCode || 'blocked_unknown',
      event.reason || '',
      Number(event.timestamp || Date.now()),
      event.employeeId || '',
      event.personId || '',
      event.name || '',
      event.officeId || '',
      event.officeName || '',
      event.attendanceMode || '',
      event.geofenceStatus || '',
      JSON.stringify(event.location || {}),
      JSON.stringify(event.riskFlags || []),
      JSON.stringify(event.captureContext || {}),
      JSON.stringify(event.scanDiagnostics || {}),
      JSON.stringify(event.performance || {}),
      JSON.stringify(event.matchDebug || {}),
      JSON.stringify(event.requestMeta || {}),
      JSON.stringify(event.data || {}),
    ],
  )
}

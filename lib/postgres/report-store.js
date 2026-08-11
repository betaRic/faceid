import { queryPostgres, withPostgresTransaction } from './client'
import { mapLocalAttendanceRow } from './attendance-store'
import { mapLocalPersonRow } from './person-store'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLimit(value, fallback = 500, max = 1000) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(parsed, max)
}

export async function listLocalAttendanceLogs(options = {}) {
  const employeeId = normalizeText(options.employeeId)
  const personId = normalizeText(options.personId)
  const officeId = normalizeText(options.officeId)
  const dateKey = normalizeText(options.dateKey)
  const startMs = Number.isFinite(Number(options.startMs)) ? Number(options.startMs) : null
  const endMs = Number.isFinite(Number(options.endMs)) ? Number(options.endMs) : null
  const limit = normalizeLimit(options.limit, 500, 2000)
  const direction = String(options.direction || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC'

  const result = await queryPostgres(
    `
      SELECT *
      FROM attendance
      WHERE ($1 = '' OR employee_id = $1)
        AND ($2 = '' OR person_id = $2)
        AND ($3 = '' OR office_id = $3)
        AND ($4 = '' OR date_key = $4)
        AND ($5::bigint IS NULL OR timestamp_ms >= $5)
        AND ($6::bigint IS NULL OR timestamp_ms <= $6)
      ORDER BY timestamp_ms ${direction}
      LIMIT $7
    `,
    [employeeId, personId, officeId, dateKey, startMs, endMs, limit],
  )

  return result.rows.map(mapLocalAttendanceRow)
}

export async function countLocalAttendanceForDate(dateKey) {
  const normalizedDate = normalizeText(dateKey)
  if (!normalizedDate) return 0
  const result = await queryPostgres(
    'SELECT count(*)::integer AS count FROM attendance WHERE date_key = $1',
    [normalizedDate],
  )
  return Number(result.rows[0]?.count || 0)
}

export async function getLocalAttendanceById(attendanceId) {
  const result = await queryPostgres(
    'SELECT * FROM attendance WHERE id = $1 LIMIT 1',
    [normalizeText(attendanceId)],
  )
  return mapLocalAttendanceRow(result.rows[0])
}

export async function insertLocalAttendanceEntry(attendanceId, entry = {}) {
  await queryPostgres(
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
      entry.employeeId || '',
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
      Number.isFinite(Number(entry.confidence)) ? Number(entry.confidence) : null,
      Number.isFinite(Number(entry.latitude)) ? Number(entry.latitude) : null,
      Number.isFinite(Number(entry.longitude)) ? Number(entry.longitude) : null,
      JSON.stringify(entry.riskFlags || []),
      JSON.stringify(entry.captureContext || {}),
      JSON.stringify(entry.scanDiagnostics || {}),
      JSON.stringify(entry),
    ],
  )
}

export async function deleteLocalAttendanceById(attendanceId) {
  return withPostgresTransaction(async client => {
    const result = await client.query('SELECT * FROM attendance WHERE id = $1 LIMIT 1 FOR UPDATE', [normalizeText(attendanceId)])
    const entry = mapLocalAttendanceRow(result.rows[0])
    if (!entry) return null
    await client.query('DELETE FROM attendance WHERE id = $1', [normalizeText(attendanceId)])
    return entry
  })
}

export async function updateLocalFieldDutyStatus(attendanceId, status, reviewer = {}) {
  const normalizedStatus = status === 'approved' ? 'approved' : 'rejected'
  const result = await queryPostgres(
    `
      UPDATE attendance
      SET data = data || $2::jsonb
      WHERE id = $1
      RETURNING *
    `,
    [
      normalizeText(attendanceId),
      JSON.stringify({
        fieldDutyStatus: normalizedStatus,
        fieldDutyReviewedAt: new Date().toISOString(),
        fieldDutyReviewedBy: String(reviewer.email || '').trim(),
      }),
    ],
  )
  return mapLocalAttendanceRow(result.rows[0])
}

export async function listLocalHrEmployees(options = {}) {
  const page = Math.max(1, Number.parseInt(options.page, 10) || 1)
  const pageSize = normalizeLimit(options.pageSize, 20, 200)
  const sessionOfficeId = normalizeText(options.sessionOfficeId)
  const officeId = sessionOfficeId || normalizeText(options.officeId)
  const query = normalizeText(options.query).toLowerCase()
  const status = normalizeText(options.status).toLowerCase()
  const offset = (page - 1) * pageSize

  const filterParams = [officeId, query, status]
  const where = `
    WHERE ($1 = '' OR office_id = $1)
      AND ($2 = '' OR name_lower LIKE $2 || '%' OR employee_id_lower LIKE $2 || '%')
      AND ($3 = '' OR lifecycle_status = $3)
  `

  const [totalResult, rowsResult] = await Promise.all([
    queryPostgres(`SELECT count(*)::integer AS count FROM persons ${where}`, filterParams),
    queryPostgres(
      `
        SELECT *
        FROM persons
        ${where}
        ORDER BY name_lower ASC, employee_id_lower ASC
        LIMIT $4 OFFSET $5
      `,
      [...filterParams, pageSize, offset],
    ),
  ])

  return {
    total: Number(totalResult.rows[0]?.count || 0),
    employees: rowsResult.rows.map(mapLocalPersonRow),
  }
}

// Export deliberately returns only the directory fields needed for handing out
// VeriFace access codes. It never exposes biometric or enrollment data.
export async function listLocalHrEmployeeAccessCodeDirectory(options = {}) {
  const officeId = normalizeText(options.sessionOfficeId)
  const result = await queryPostgres(
    `
      SELECT id, name, first_name, middle_name, last_name, access_code, office_id, office_name
      FROM persons
      WHERE ($1 = '' OR office_id = $1)
      ORDER BY office_name ASC, name_lower ASC, employee_id_lower ASC
    `,
    [officeId],
  )

  return result.rows.map(row => ({
    id: row.id,
    name: row.name || '',
    firstName: row.first_name || '',
    middleName: row.middle_name || '',
    lastName: row.last_name || '',
    accessCode: row.access_code || '',
    officeId: row.office_id || '',
    officeName: row.office_name || '',
  }))
}

export async function listLocalDtrEmployees(session = {}) {
  const officeId = session?.scope === 'office' ? normalizeText(session.officeId) : ''
  const divisionId = normalizeText(session?.divisionId)
  const result = await queryPostgres(
    `
      SELECT *
      FROM persons
      WHERE ($1 = '' OR office_id = $1)
        AND ($2 = '' OR division_id = $2)
        AND lifecycle_status = 'active'
      ORDER BY name_lower ASC, employee_id_lower ASC
    `,
    [officeId, divisionId],
  )
  return result.rows.map(mapLocalPersonRow)
}

export async function localOfficeExists(officeId) {
  const result = await queryPostgres('SELECT 1 FROM offices WHERE id = $1 LIMIT 1', [normalizeText(officeId)])
  return result.rows.length > 0
}

export async function upsertLocalOffice(office) {
  const id = normalizeText(office?.id)
  await queryPostgres(
    `
      INSERT INTO offices (
        id, name, name_lower, office_type, active, latitude, longitude,
        radius_meters, work_policy, divisions, data, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, now())
      ON CONFLICT (id)
      DO UPDATE SET
        name = EXCLUDED.name,
        name_lower = EXCLUDED.name_lower,
        office_type = EXCLUDED.office_type,
        active = EXCLUDED.active,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        radius_meters = EXCLUDED.radius_meters,
        work_policy = EXCLUDED.work_policy,
        divisions = EXCLUDED.divisions,
        data = EXCLUDED.data,
        updated_at = now()
    `,
    [
      id,
      office.name || '',
      String(office.name || '').toLowerCase(),
      office.officeType || '',
      office.status !== 'inactive',
      Number.isFinite(Number(office.gps?.latitude)) ? Number(office.gps.latitude) : null,
      Number.isFinite(Number(office.gps?.longitude)) ? Number(office.gps.longitude) : null,
      Number.isFinite(Number(office.gps?.radiusMeters)) ? Number(office.gps.radiusMeters) : null,
      JSON.stringify(office.workPolicy || {}),
      JSON.stringify(office.divisions || []),
      JSON.stringify(office),
    ],
  )
}

export async function getLocalOfficeReferenceCounts(officeId) {
  const id = normalizeText(officeId)
  const result = await queryPostgres(
    `
      SELECT
        (SELECT count(*)::integer FROM persons WHERE office_id = $1) AS persons,
        (SELECT count(*)::integer FROM admin_users WHERE office_id = $1) AS admins,
        (SELECT count(*)::integer FROM attendance WHERE office_id = $1) AS attendance,
        (SELECT count(*)::integer FROM attendance_daily WHERE office_id = $1) AS attendance_daily
    `,
    [id],
  )
  const row = result.rows[0] || {}
  return {
    persons: Number(row.persons || 0),
    admins: Number(row.admins || 0),
    attendance: Number(row.attendance || 0),
    attendanceDaily: Number(row.attendance_daily || 0),
  }
}

export async function deleteLocalOffice(officeId) {
  const result = await queryPostgres('DELETE FROM offices WHERE id = $1', [normalizeText(officeId)])
  return Number(result.rowCount || 0) > 0
}

export async function listLocalAuditLogs(options = {}) {
  const limit = normalizeLimit(options.limit, 100, 500)
  const offset = Math.max(0, Number.parseInt(options.offset, 10) || 0)
  const action = normalizeText(options.action)
  const officeId = normalizeText(options.officeId)
  const startDate = Number.isFinite(Number(options.startMs)) ? new Date(Number(options.startMs)) : null
  const endDate = Number.isFinite(Number(options.endMs)) ? new Date(Number(options.endMs)) : null

  const result = await queryPostgres(
    `
      SELECT *
      FROM audit_logs
      WHERE ($1 = '' OR action = $1)
        AND ($2 = '' OR office_id = $2 OR actor_office_id = $2)
        AND ($3::timestamptz IS NULL OR created_at >= $3)
        AND ($4::timestamptz IS NULL OR created_at < $4)
      ORDER BY created_at DESC, id DESC
      LIMIT $5 OFFSET $6
    `,
    [action, officeId, startDate, endDate, limit, offset],
  )

  return result.rows.map(row => ({
    id: String(row.id),
    actorRole: row.actor_role || '',
    actorScope: row.actor_scope || '',
    actorOfficeId: row.actor_office_id || '',
    action: row.action || '',
    targetType: row.target_type || '',
    targetId: row.target_id || '',
    officeId: row.office_id || '',
    summary: row.summary || '',
    metadata: row.metadata || {},
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  }))
}

export async function getLocalRuntimeCounts() {
  const result = await queryPostgres(`
    SELECT
      (SELECT count(*)::integer FROM offices) AS offices,
      (SELECT count(*)::integer FROM persons) AS persons,
      (SELECT count(*)::integer FROM persons WHERE approval_status = 'pending') AS pending_persons,
      (SELECT count(*)::integer FROM biometric_index) AS biometric_index,
      (SELECT count(*)::integer FROM attendance) AS attendance,
      (SELECT count(*)::integer FROM attendance_daily) AS attendance_daily,
      (SELECT count(*)::integer FROM scan_events) AS scan_events,
      (SELECT count(*)::integer FROM audit_logs) AS audit_logs,
      (SELECT count(*)::integer FROM admin_users) AS admin_users,
      (SELECT count(*)::integer FROM hr_users) AS hr_users
  `)
  return result.rows[0] || {}
}

export async function countLocalRowsBefore(cutoffMs) {
  const cutoff = Number(cutoffMs || 0)
  const result = await queryPostgres(
    `
      SELECT
        (SELECT count(*)::integer FROM scan_events WHERE timestamp_ms < $1) AS scan_events,
        (SELECT count(*)::integer FROM attendance_challenges WHERE expires_at_ms < $1) AS attendance_challenges
    `,
    [cutoff],
  )
  return result.rows[0] || { scan_events: 0, attendance_challenges: 0 }
}

export async function deleteLocalRowsBefore(cutoffMs) {
  const cutoff = Number(cutoffMs || 0)
  return withPostgresTransaction(async client => {
    const scanEvents = await client.query('DELETE FROM scan_events WHERE timestamp_ms < $1', [cutoff])
    const challenges = await client.query('DELETE FROM attendance_challenges WHERE expires_at_ms < $1', [cutoff])
    return {
      scanEventsDeleted: Number(scanEvents.rowCount || 0),
      attendanceChallengesDeleted: Number(challenges.rowCount || 0),
    }
  })
}


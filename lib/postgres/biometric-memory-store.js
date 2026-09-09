import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { withPostgresTransaction } from './client'
import { mapLocalPersonRow } from './person-store'
import { assessMemoryCandidate, enrollmentFingerprint, MEMORY_POLICY } from '../biometrics/memory-policy.js'
import { euclideanDistance } from '../biometrics/descriptor-utils.js'

// This store deliberately exposes NO function to load candidates for recognition.
export async function collectBiometricMemoryCandidate(candidate) {
  if (!/^[a-f0-9]{64}$/.test(candidate?.pipelineFingerprint || '')) return { stored: false, reason: 'pipeline_missing' }
  if (!Number.isSafeInteger(candidate?.timestamp) || candidate.timestamp > Date.now() + 5000
    || Date.now() - candidate.timestamp > 120000) return { stored: false, reason: 'source_not_fresh' }
  return withPostgresTransaction(async client => {
    await client.query("SET LOCAL statement_timeout = '1500ms'")
    await client.query("SET LOCAL lock_timeout = '100ms'")
    const { rows } = await client.query('SELECT * FROM persons WHERE id = $1 FOR UPDATE', [candidate.personId])
    const person = mapLocalPersonRow(rows[0])
    if (!person || person.lifecycleStatus !== 'active' || !person.active || person.approvalStatus !== 'approved') return { stored: false, reason: 'inactive' }
    if (enrollmentFingerprint(person) !== candidate.enrollmentFingerprint) return { stored: false, reason: 'enrollment_changed' }
    const source = await client.query(
      `SELECT id, person_id, timestamp_ms, action, attendance_mode, decision_code, data FROM attendance WHERE id = $1 AND person_id = $2 FOR SHARE`,
      [candidate.attendanceId, person.id],
    )
    const attendance = source.rows[0]
    if (!attendance || !['checkin', 'checkout'].includes(attendance.action)
      || attendance.data?.verificationMode !== 'challenge_v2'
      || attendance.data?.fieldDutyStatus === 'pending'
      || attendance.data?.isManualOverride || attendance.data?.manualOverride
      || attendance.attendance_mode === 'manual_override' || attendance.decision_code === 'manual_admin_override'
      || attendance.data?.source === 'manual_override'
      || Number(attendance.timestamp_ms) !== candidate.timestamp) return { stored: false, reason: 'source_not_accepted' }
    const others = await client.query(
      `SELECT id, descriptors, data FROM persons WHERE id <> $1 AND lifecycle_status = 'active'
         AND active = true AND approval_status = 'approved' ORDER BY id`, [person.id],
    )
    const otherPersons = others.rows.map(row => ({ id: row.id, descriptors: row.descriptors, biometricModelVersion: row.data?.biometricModelVersion || '' }))
    if (otherPersons.some(other => other.biometricModelVersion !== person.biometricModelVersion)) return { stored: false, reason: 'incompatible_gallery' }
    const assessed = assessMemoryCandidate({ person, frames: candidate.frames, otherPersons, originalAccepted: candidate.originalAccepted })
    if (!assessed.ok) return { stored: false, reason: assessed.reason }
    await client.query('DELETE FROM biometric_memory_candidates WHERE person_id = $1 AND expires_at <= now()', [person.id])
    await client.query("UPDATE biometric_memory_candidates SET state = 'revoked' WHERE person_id = $1 AND enrollment_fingerprint <> $2", [person.id, candidate.enrollmentFingerprint])
    const existing = await client.query('SELECT descriptor FROM biometric_memory_candidates WHERE person_id = $1', [person.id])
    if (existing.rows.length >= MEMORY_POLICY.maxCandidates) return { stored: false, reason: 'candidate_limit' }
    const frameIndex = assessed.frames[1].quality.sharpness > assessed.frames[0].quality.sharpness ? 1 : 0
    const descriptor = assessed.frames[frameIndex].descriptor
    if (existing.rows.some(row => euclideanDistance(row.descriptor, descriptor) < MEMORY_POLICY.minCandidateDiversity)) return { stored: false, reason: 'duplicate_appearance' }
    const galleryFingerprint = createHash('sha256').update(JSON.stringify(otherPersons.map(other => [other.id, enrollmentFingerprint(other)]))).digest('hex')
    const evidence = {
      source: 'original_enrollment_1to1', frameIndex,
      frames: assessed.frames.map((frame, index) => ({ quality: frame.quality, antispoof: frame.antispoof, ...assessed.evidence[index] })),
    }
    const inserted = await client.query(
      `INSERT INTO biometric_memory_candidates (
        id, person_id, source_attendance_id, captured_day, enrollment_fingerprint,
        pipeline_fingerprint, gallery_fingerprint, policy_version, descriptor, evidence, expires_at
      ) VALUES ($1, $2, $3, (to_timestamp($4 / 1000.0) AT TIME ZONE 'Asia/Manila')::date,
        $5, $6, $7, $8, $9::jsonb, $10::jsonb, to_timestamp($4 / 1000.0) + interval '30 days')
      ON CONFLICT DO NOTHING RETURNING id`,
      [randomUUID(), person.id, attendance.id, candidate.timestamp, candidate.enrollmentFingerprint,
        candidate.pipelineFingerprint, galleryFingerprint, MEMORY_POLICY.version, JSON.stringify(descriptor), JSON.stringify(evidence)],
    )
    return { stored: inserted.rowCount === 1, reason: inserted.rowCount ? 'quarantined' : 'duplicate_source_or_day' }
  })
}

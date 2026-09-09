import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { queryPostgres, closePostgresPool } from '../../lib/postgres/client.js'
import { collectBiometricMemoryCandidate } from '../../lib/postgres/biometric-memory-store.js'
import { enrollmentFingerprint } from '../../lib/biometrics/memory-policy.js'
import { purgeExpiredBiometricMemory } from '../../lib/postgres/biometric-memory-retention.js'

const vector = angle => [Math.cos(angle), Math.sin(angle), ...Array(1022).fill(0)]
const person = { id: 'memory-fixture-a', descriptors: [vector(0), vector(.08)], biometricModelVersion: 'human-faceres-server-wasm-v1' }
const timestamp = Date.now()
const frames = [.10, .12].map(angle => ({ descriptor: vector(angle), antispoof: .95,
  quality: { faceScore: .99, faceWidth: 120, faceHeight: 160, meanBrightness: 128, clippedFraction: .01, sharpness: 200 } }))
const candidate = { personId: person.id, attendanceId: 'memory-attendance-a', timestamp,
  enrollmentFingerprint: enrollmentFingerprint(person), pipelineFingerprint: 'a'.repeat(64), originalAccepted: true, frames }

before(async () => {
  for (const [id, descriptors] of [[person.id, person.descriptors], ['memory-fixture-b', [vector(1.4), vector(1.5)]]]) {
    await queryPostgres(`INSERT INTO persons (id, employee_id, employee_id_lower, name, descriptors, sample_count, active, approval_status, lifecycle_status, data, access_code)
      VALUES ($1,$1,$1,$1,$2::jsonb,2,true,'approved','active',$3::jsonb,$4)`,
    [id, JSON.stringify(descriptors), JSON.stringify({ biometricModelVersion: person.biometricModelVersion }), id === person.id ? '9801' : '9802'])
  }
  await queryPostgres(`INSERT INTO attendance (id, person_id, employee_id, action, timestamp_ms, date_key, attendance_mode, decision_code, data)
    VALUES ($1,$2,$2,'checkin',$3,'2026-09-08','onsite','accepted','{"verificationMode":"challenge_v2"}'::jsonb)`, [candidate.attendanceId, person.id, timestamp])
})
after(async () => {
  await queryPostgres("DELETE FROM attendance WHERE id LIKE 'memory-attendance-%'")
  await queryPostgres("DELETE FROM persons WHERE id IN ('memory-fixture-a','memory-fixture-b')")
  await closePostgresPool()
})

test('memory storage excludes manual attendance, preserves originals and serializes duplicate submissions', async () => {
  await queryPostgres("UPDATE attendance SET attendance_mode = 'manual_override' WHERE id = $1", [candidate.attendanceId])
  assert.equal((await collectBiometricMemoryCandidate(candidate)).stored, false)
  await queryPostgres("UPDATE attendance SET attendance_mode = 'onsite' WHERE id = $1", [candidate.attendanceId])
  const results = await Promise.all([collectBiometricMemoryCandidate(candidate), collectBiometricMemoryCandidate(candidate)])
  assert.equal(results.filter(result => result.stored).length, 1)
  const saved = await queryPostgres('SELECT * FROM biometric_memory_candidates WHERE person_id = $1', [person.id])
  assert.equal(saved.rowCount, 1)
  assert.equal(saved.rows[0].state, 'quarantined')
  assert.equal(saved.rows[0].descriptor.length, 1024)
  assert.equal(JSON.stringify(saved.rows[0]).includes('frameDataUrl'), false)
  const original = await queryPostgres('SELECT descriptors, sample_count FROM persons WHERE id = $1', [person.id])
  assert.deepEqual(original.rows[0].descriptors, person.descriptors)
  assert.equal(original.rows[0].sample_count, 2)
  assert.equal((await collectBiometricMemoryCandidate({ ...candidate, enrollmentFingerprint: 'old-enrollment' })).reason, 'enrollment_changed')
  assert.equal((await collectBiometricMemoryCandidate({ ...candidate, timestamp: Date.now() - 180000 })).reason, 'source_not_fresh')
  assert.equal((await collectBiometricMemoryCandidate({ ...candidate, timestamp: Date.now() + 60000 })).reason, 'source_not_fresh')
  await queryPostgres("UPDATE persons SET active = false, lifecycle_status = 'inactive' WHERE id = $1", [person.id])
  await queryPostgres("UPDATE biometric_memory_candidates SET expires_at = now() - interval '1 second' WHERE person_id = $1", [person.id])
  assert.equal(await purgeExpiredBiometricMemory(), 1)
  assert.equal((await queryPostgres('SELECT id FROM biometric_memory_candidates WHERE person_id = $1', [person.id])).rowCount, 0)
})

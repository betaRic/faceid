import 'server-only'
import { after } from 'next/server'
import { acceptedFramesPipelineFingerprint } from './pipeline-fingerprint.js'
import { scheduleMemoryCollection } from './memory-queue.js'
import { enrollmentFingerprint } from './memory-policy.js'
import { collectBiometricMemoryCandidate } from '../postgres/biometric-memory-store'

export function queueBiometricMemoryCollection({ person, entry, attendanceId, personMatch, authoritativePayload }) {
  if (process.env.BIOMETRIC_MEMORY_COLLECT_ENABLED !== 'true') return false
  try {
    const pipelineFingerprint = acceptedFramesPipelineFingerprint(authoritativePayload?.acceptedFrames)
    if (!pipelineFingerprint) return false
    return scheduleMemoryCollection({
      pipelineFingerprint,
      attendanceId, personId: person.id, timestamp: Number(entry.timestamp),
      enrollmentFingerprint: enrollmentFingerprint(person),
      originalAccepted: personMatch?.ok === true && personMatch?.debug?.matchMode === 'claimed_access_code_1to1',
      fieldDutyPending: entry.fieldDutyStatus === 'pending',
      frames: authoritativePayload?.acceptedFrames,
    }, {
      enabled: true, schedule: after,
      collect: collectBiometricMemoryCandidate,
      onFailure: () => console.warn('[biometric-memory] Optional candidate collection failed.'),
    })
  } catch {
    // A successful attendance must survive missing metadata or optional imports.
    return false
  }
}

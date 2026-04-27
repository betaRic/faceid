import 'server-only'

import { normalizeDescriptor, euclideanDistance } from '@/lib/biometrics/descriptor-utils'
import { generateServerAttendanceEmbedding } from '@/lib/biometrics/server-embedding'

export const AUTHORITATIVE_ATTENDANCE_MODEL_VERSION = 'human-faceres-server-wasm-v1'
export const ATTENDANCE_SERVER_FRAME_LIMIT = 2
export const ATTENDANCE_MIN_SERVER_FRAMES = 2

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function buildAttendanceError(message, decisionCode = 'blocked_no_reliable_match', status = 403) {
  return Object.assign(new Error(message), { decisionCode, status })
}

export function normalizeAttendanceScanFrames(value, maxCount = ATTENDANCE_SERVER_FRAME_LIMIT) {
  return safeArray(value)
    .slice(0, maxCount)
    .map(frame => {
      if (typeof frame === 'string') {
        return { frameDataUrl: String(frame || '') }
      }
      const sample = frame && typeof frame === 'object' ? frame : {}
      return {
        frameDataUrl: String(sample.frameDataUrl || sample.previewUrl || '').trim(),
      }
    })
    .filter(frame => Boolean(frame.frameDataUrl))
}

export function validateAttendanceScanFrames(scanFrames) {
  if (!Array.isArray(scanFrames) || scanFrames.length < ATTENDANCE_MIN_SERVER_FRAMES) {
    return `At least ${ATTENDANCE_MIN_SERVER_FRAMES} server-authoritative scan frames are required.`
  }

  for (const frame of scanFrames) {
    if (!/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(String(frame?.frameDataUrl || ''))) {
      return 'Scan frames must be JPEG, PNG, or WebP image data URLs.'
    }
  }

  return null
}

function aggregateDescriptors(descriptors) {
  const normalized = safeArray(descriptors)
    .map(normalizeDescriptor)
    .filter(descriptor => descriptor.length > 0)
  if (normalized.length === 0) return []
  if (normalized.length === 1) return normalized[0]

  const merged = normalized[0].map((_, index) => (
    normalized.reduce((sum, descriptor) => sum + Number(descriptor[index] || 0), 0) / normalized.length
  ))
  return normalizeDescriptor(merged)
}

function summarizeDescriptorSpread(descriptors) {
  const normalized = safeArray(descriptors).map(normalizeDescriptor)
  let spread = 0
  for (let left = 0; left < normalized.length; left += 1) {
    for (let right = left + 1; right < normalized.length; right += 1) {
      spread = Math.max(spread, euclideanDistance(normalized[left], normalized[right]))
    }
  }
  return spread
}

export async function buildAuthoritativeAttendancePayload(scanFrames) {
  const normalizedFrames = normalizeAttendanceScanFrames(scanFrames)
  const validationError = validateAttendanceScanFrames(normalizedFrames)
  if (validationError) {
    throw buildAttendanceError(validationError, 'blocked_missing_scan_frames', 400)
  }

  const acceptedFrames = []
  const rejectedFrames = []

  for (const frame of normalizedFrames) {
    const embedding = await generateServerAttendanceEmbedding(frame.frameDataUrl)
    if (!embedding.ok) {
      rejectedFrames.push({
        decisionCode: String(embedding.decisionCode || 'blocked_invalid_scan_frame'),
      })
      continue
    }

    acceptedFrames.push({
      descriptor: embedding.descriptor,
      antispoof: embedding.face?.antispoof ?? null,
      liveness: embedding.face?.liveness ?? null,
      performanceMs: Number(embedding.performanceMs || 0),
    })
  }

  if (acceptedFrames.length < ATTENDANCE_MIN_SERVER_FRAMES) {
    const multipleFaceFrame = rejectedFrames.find(frame => frame.decisionCode === 'blocked_multiple_faces')
    if (multipleFaceFrame) {
      throw buildAttendanceError('Multiple faces detected. One employee at a time.', 'blocked_multiple_faces')
    }
    throw buildAttendanceError(
      'Server could not verify enough scan frames. Hold still and scan again.',
      'blocked_no_reliable_match',
    )
  }

  const descriptors = acceptedFrames.map(frame => frame.descriptor)
  const averagePerformanceMs = Math.round(
    acceptedFrames.reduce((sum, frame) => sum + Number(frame.performanceMs || 0), 0) / acceptedFrames.length,
  )
  const antispoofValues = acceptedFrames
    .map(frame => Number(frame.antispoof))
    .filter(Number.isFinite)
  const livenessValues = acceptedFrames
    .map(frame => Number(frame.liveness))
    .filter(Number.isFinite)

  return {
    descriptor: aggregateDescriptors(descriptors),
    descriptors,
    descriptorSpread: summarizeDescriptorSpread(descriptors),
    antispoof: antispoofValues.length
      ? antispoofValues.reduce((sum, value) => sum + value, 0) / antispoofValues.length
      : null,
    liveness: livenessValues.length
      ? livenessValues.reduce((sum, value) => sum + value, 0) / livenessValues.length
      : null,
    diagnostics: {
      modelVersion: AUTHORITATIVE_ATTENDANCE_MODEL_VERSION,
      acceptedCount: acceptedFrames.length,
      rejectedCount: rejectedFrames.length,
      averagePerformanceMs,
    },
  }
}

import 'server-only'

import {
  ENROLLMENT_MIN_SAMPLES,
  ENROLLMENT_REQUIRED_PHASE_SAMPLE_COUNTS,
  ENROLLMENT_REQUIRED_PHASE_IDS,
  normalizeEnrollmentSampleFrames,
  validateEnrollmentCaptureMetadata,
  validateEnrollmentSampleFrames,
  validateEnrollmentServerDescriptorSet,
} from '@/lib/biometrics/enrollment-burst'
import { verifyGuidedCapturePoseCoverage } from '@/lib/biometrics/guided-capture-validation'
import {
  generateServerEnrollmentEmbedding,
  generateServerEnrollmentSupportEmbedding,
} from '@/lib/biometrics/server-embedding'

export const AUTHORITATIVE_BIOMETRIC_MODEL_VERSION = 'human-faceres-server-wasm-v1'

function buildValidationError(message, status = 400) {
  return Object.assign(new Error(message), { status })
}

function selectRequiredSupportFrames(frames) {
  const byPhase = new Map()
  for (const frame of frames) {
    const phaseId = String(frame?.phaseId || '').trim()
    if (!ENROLLMENT_REQUIRED_PHASE_IDS.includes(phaseId)) continue
    if (!byPhase.has(phaseId)) byPhase.set(phaseId, [])
    byPhase.get(phaseId).push(frame)
  }

  return ENROLLMENT_REQUIRED_PHASE_IDS.flatMap(phaseId => {
    const requiredCount = Number(ENROLLMENT_REQUIRED_PHASE_SAMPLE_COUNTS[phaseId] || 0)
    return (byPhase.get(phaseId) || []).slice(0, requiredCount).map((frame, index) => ({
      ...frame,
      requiresPoseVerification: index === 0,
    }))
  })
}

export async function buildAuthoritativeEnrollmentPayload(sampleFrames, captureMetadata) {
  const startedAt = Date.now()
  const normalizedFrames = normalizeEnrollmentSampleFrames(sampleFrames)
  const sampleFrameError = validateEnrollmentSampleFrames(normalizedFrames)
  if (sampleFrameError) {
    throw buildValidationError(sampleFrameError)
  }

  const captureMetadataError = validateEnrollmentCaptureMetadata(captureMetadata, normalizedFrames)
  if (captureMetadataError) {
    throw buildValidationError(captureMetadataError)
  }

  const acceptedFrames = []
  const rejectedFrames = []
  const frameTimings = []

  const requiredSupportFrames = selectRequiredSupportFrames(normalizedFrames)

  for (const frame of requiredSupportFrames) {
    const frameStartedAt = Date.now()
    const embedding = frame.requiresPoseVerification
      ? await generateServerEnrollmentEmbedding(frame.frameDataUrl)
      : await generateServerEnrollmentSupportEmbedding(frame.frameDataUrl)
    const wallMs = Date.now() - frameStartedAt
    frameTimings.push({
      phaseId: frame.phaseId,
      mode: frame.requiresPoseVerification ? 'pose' : 'support',
      ok: Boolean(embedding.ok),
      wallMs,
      detectMs: Number(embedding.performanceMs || 0),
    })

    if (!embedding.ok) {
      rejectedFrames.push({
        phaseId: frame.phaseId,
        decisionCode: String(embedding.decisionCode || 'blocked_invalid_frame'),
      })
      continue
    }

    acceptedFrames.push({
      phaseId: frame.phaseId,
      descriptor: embedding.descriptor,
      rotation: embedding.face?.rotation || null,
      requiresPoseVerification: Boolean(frame.requiresPoseVerification),
      performanceMs: Number(embedding.performanceMs || 0),
    })
  }

  if (acceptedFrames.length < ENROLLMENT_MIN_SAMPLES) {
    throw buildValidationError(
      'Server could not validate enough guided face support snapshots. Retake the capture and keep each pose inside the oval.',
      400,
    )
  }

  const poseVerification = verifyGuidedCapturePoseCoverage(
    acceptedFrames.filter(frame => frame.requiresPoseVerification),
  )
  if (!poseVerification.ok) {
    throw buildValidationError(poseVerification.message || 'Server could not verify guided pose coverage.')
  }

  const descriptorSetValidation = validateEnrollmentServerDescriptorSet(acceptedFrames)
  if (!descriptorSetValidation.ok) {
    throw buildValidationError(
      descriptorSetValidation.message || 'Server could not validate enrollment sample consistency.',
      400,
    )
  }

  const averagePerformanceMs = acceptedFrames.length > 0
    ? Math.round(
        acceptedFrames.reduce((sum, frame) => sum + Number(frame.performanceMs || 0), 0) / acceptedFrames.length,
      )
    : 0
  const totalPerformanceMs = acceptedFrames.reduce((sum, frame) => sum + Number(frame.performanceMs || 0), 0)
  const totalWallMs = Date.now() - startedAt
  const maxFrameWallMs = frameTimings.reduce((max, frame) => Math.max(max, Number(frame.wallMs || 0)), 0)

  return {
    descriptors: acceptedFrames.map(frame => frame.descriptor),
    biometricModelVersion: AUTHORITATIVE_BIOMETRIC_MODEL_VERSION,
    captureMetadata: {
      ...(captureMetadata && typeof captureMetadata === 'object' ? captureMetadata : {}),
      authoritativeDescriptorSource: AUTHORITATIVE_BIOMETRIC_MODEL_VERSION,
      serverEmbeddingAcceptedCount: acceptedFrames.length,
      serverEmbeddingRejectedCount: rejectedFrames.length,
      serverPoseVerified: true,
      serverVerifiedPhaseIds: poseVerification.verifiedPhaseIds,
      serverEmbeddingAverageMs: averagePerformanceMs,
      serverEmbeddingTotalMs: totalPerformanceMs,
      serverEnrollmentWallMs: totalWallMs,
      serverEmbeddingMaxFrameMs: maxFrameWallMs,
    },
    diagnostics: {
      acceptedCount: acceptedFrames.length,
      rejectedFrames,
      frameTimings,
      totalWallMs,
    },
  }
}

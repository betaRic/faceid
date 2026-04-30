import 'server-only'

import { FieldValue } from 'firebase-admin/firestore'
import {
  getBiometricReenrollmentAssessment,
  normalizeStoredDescriptors,
} from '@/lib/biometrics/descriptor-utils'
import { getEffectivePersonApprovalStatus, isPersonBiometricActive } from '@/lib/person-approval'

const PERSON_BIOMETRICS_COLLECTION = 'person_biometrics'

function toFiniteNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function normalizeCaptureMetadata(value) {
  const metadata = value && typeof value === 'object' ? value : {}
  const device = metadata.device && typeof metadata.device === 'object' ? metadata.device : {}
  const primaryMetrics = metadata.primaryMetrics && typeof metadata.primaryMetrics === 'object'
    ? metadata.primaryMetrics
    : {}

  return {
    modelVersion: String(metadata.modelVersion || 'human-faceres-browser-v1').slice(0, 80),
    captureProfile: String(metadata.captureProfile || '').slice(0, 80),
    keptCount: Number.isFinite(metadata.keptCount) ? Number(metadata.keptCount) : null,
    detectedCount: Number.isFinite(metadata.detectedCount) ? Number(metadata.detectedCount) : null,
    phasesCompleted: Number.isFinite(metadata.phasesCompleted) ? Number(metadata.phasesCompleted) : null,
    phasesCaptured: Array.isArray(metadata.phasesCaptured)
      ? metadata.phasesCaptured.slice(0, 8).map(value => String(value).slice(0, 40))
      : [],
    genuinelyDiverse: Boolean(metadata.genuinelyDiverse),
    qualityScore: toFiniteNumber(metadata.qualityScore),
    primaryMetrics: {
      detectionScore: toFiniteNumber(primaryMetrics.detectionScore),
      faceAreaRatio: toFiniteNumber(primaryMetrics.faceAreaRatio),
      centeredness: toFiniteNumber(primaryMetrics.centeredness),
      brightness: toFiniteNumber(primaryMetrics.brightness),
      contrast: toFiniteNumber(primaryMetrics.contrast),
      sharpness: toFiniteNumber(primaryMetrics.sharpness),
    },
    device: {
      mobile: Boolean(device.mobile),
      platform: String(device.platform || '').slice(0, 120),
      userAgent: String(device.userAgent || '').slice(0, 512),
      deviceMemoryGb: toFiniteNumber(device.deviceMemoryGb),
      hardwareConcurrency: toFiniteNumber(device.hardwareConcurrency),
    },
  }
}

function serializeStoredEmbeddings(descriptors) {
  return descriptors.map(vector => ({ vector }))
}

export async function syncPersonBiometricsRecord(db, personId, personData) {
  const descriptors = normalizeStoredDescriptors(personData?.descriptors)
  const reenrollmentAssessment = getBiometricReenrollmentAssessment(personData)
  await db.collection(PERSON_BIOMETRICS_COLLECTION).doc(String(personId)).set({
    personId: String(personId),
    employeeId: String(personData?.employeeId || ''),
    name: String(personData?.name || ''),
    officeId: String(personData?.officeId || ''),
    officeName: String(personData?.officeName || ''),
    active: personData?.active !== false,
    biometricEnabled: isPersonBiometricActive(personData),
    approvalStatus: getEffectivePersonApprovalStatus(personData),
    modelVersion: String(personData?.biometricModelVersion || 'human-faceres-browser-v1'),
    descriptorCount: descriptors.length,
    embeddings: serializeStoredEmbeddings(descriptors),
    qualityScore: toFiniteNumber(personData?.biometricQualityScore),
    needsReenrollment: reenrollmentAssessment.needed,
    reenrollmentReason: reenrollmentAssessment.reasonCode,
    captureMetadata: normalizeCaptureMetadata(personData?.captureMetadata),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })
}

export async function deletePersonBiometricsRecord(db, personId) {
  await db.collection(PERSON_BIOMETRICS_COLLECTION).doc(String(personId)).delete().catch(() => {})
}

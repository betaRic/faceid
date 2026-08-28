import { ENROLLMENT_MIN_SAMPLE_DIVERSITY } from '@/lib/config'
import {
  normalizeDescriptor,
  euclideanDistance,
} from '@/lib/biometrics/descriptor-utils'

export function serializeDescriptorSample(descriptor) {
  return { vector: normalizeDescriptor(descriptor) }
}

export function deduplicateDescriptors(incomingDescriptors, existingDescriptors = [], options = {}) {
  const minSampleDiversity = Number.isFinite(Number(options.minSampleDiversity))
    ? Number(options.minSampleDiversity)
    : ENROLLMENT_MIN_SAMPLE_DIVERSITY
  const normalizedExisting = existingDescriptors.map(normalizeDescriptor)
  const accepted = []
  const rejected = []

  for (const raw of incomingDescriptors) {
    const normalized = normalizeDescriptor(raw)
    const tooCloseToExisting = normalizedExisting.some(
      stored => euclideanDistance(stored, normalized) < minSampleDiversity,
    )

    if (tooCloseToExisting) {
      rejected.push({ reason: 'too_similar_to_stored', descriptor: raw })
      continue
    }

    const tooCloseToBatch = accepted.some(
      acceptedDescriptor => (
        euclideanDistance(normalizeDescriptor(acceptedDescriptor), normalized) < minSampleDiversity
      ),
    )

    if (tooCloseToBatch) {
      rejected.push({ reason: 'too_similar_to_batch', descriptor: raw })
      continue
    }

    accepted.push(raw)
    normalizedExisting.push(normalized)
  }

  return { accepted, rejected }
}

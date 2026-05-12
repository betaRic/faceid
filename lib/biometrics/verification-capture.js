import { euclideanDistance, normalizeDescriptor } from './descriptor-utils'
import { scoreCaptureFaceArea } from './face-size-guidance'

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0))
}

function getCaptureDescriptor(capture) {
  const descriptor = capture?.primary?.detection?.descriptor || capture?.descriptor
  return Array.isArray(descriptor) && descriptor.length > 0 ? descriptor : null
}

function getCaptureQuality(capture) {
  return toFiniteNumber(capture?.qualityScore, 0)
}

function averageQuality(captures) {
  const usable = safeArray(captures)
  if (usable.length === 0) return 0
  return usable.reduce((sum, capture) => sum + getCaptureQuality(capture), 0) / usable.length
}

function buildCombinations(items, size, start = 0, prefix = [], output = []) {
  if (prefix.length === size) {
    output.push(prefix)
    return output
  }

  for (let index = start; index <= items.length - (size - prefix.length); index += 1) {
    buildCombinations(items, size, index + 1, [...prefix, items[index]], output)
  }

  return output
}

export function descriptorDistance(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return Number.POSITIVE_INFINITY
  }

  return euclideanDistance(normalizeDescriptor(left), normalizeDescriptor(right))
}

export function summarizeDescriptorSpread(descriptors) {
  const usable = safeArray(descriptors).filter(descriptor => Array.isArray(descriptor) && descriptor.length > 0)
  if (usable.length < 2) return 0

  let spread = 0
  for (let left = 0; left < usable.length; left += 1) {
    for (let right = left + 1; right < usable.length; right += 1) {
      spread = Math.max(spread, descriptorDistance(usable[left], usable[right]))
    }
  }
  return spread
}

export function aggregateDescriptors(descriptors) {
  const normalized = safeArray(descriptors)
    .map(normalizeDescriptor)
    .filter(descriptor => descriptor.length > 0)

  if (normalized.length === 0) return null
  if (normalized.length === 1) return Array.from(normalized[0])

  const merged = normalized[0].map((_, index) => (
    normalized.reduce((sum, vector) => sum + Number(vector[index] || 0), 0) / normalized.length
  ))
  return Array.from(normalizeDescriptor(merged))
}

export function scoreVerificationCaptureQuality(detection, metrics) {
  const yawAbs = Math.abs(toFiniteNumber(detection?.rotation?.yaw, 0))
  const pitchAbs = Math.abs(toFiniteNumber(detection?.rotation?.pitch, 0))
  const rollAbs = Math.abs(toFiniteNumber(detection?.rotation?.roll, 0))
  const detectionScore = clamp01(detection?.detection?.score)
  const faceAreaScore = scoreCaptureFaceArea(metrics?.faceAreaRatio)
  const centeredness = clamp01(metrics?.centeredness)
  const poseScore = clamp01(1 - ((yawAbs * 0.7) + (pitchAbs * 0.4) + (rollAbs * 0.8)))

  return (
    (detectionScore * 2.4)
    + (faceAreaScore * 2.0)
    + (centeredness * 1.8)
    + (poseScore * 1.2)
  )
}

function rankCaptureClusters(left, right) {
  const spreadDelta = left.spread - right.spread
  if (Math.abs(spreadDelta) > 0.01) return spreadDelta

  const qualityDelta = right.quality - left.quality
  if (Math.abs(qualityDelta) > 0.01) return qualityDelta

  return right.maxQuality - left.maxQuality
}

function rankStablePairs(left, right) {
  const spreadDelta = left.spread - right.spread
  if (Math.abs(spreadDelta) > 0.005) return spreadDelta
  return right.quality - left.quality
}

export function selectStableVerificationCaptures(captures, options = {}) {
  const aggregationCount = Math.max(1, Math.floor(Number(options.aggregationCount || 3)))
  const serverFrameLimit = Math.max(1, Math.floor(Number(options.serverFrameLimit || 2)))
  const usable = safeArray(captures).filter(capture => Boolean(getCaptureDescriptor(capture)))

  if (usable.length === 0) {
    return {
      aggregationCaptures: [],
      serverFrameCaptures: [],
      bestCapture: null,
      descriptorSpread: 0,
    }
  }

  const targetAggregationCount = Math.min(aggregationCount, usable.length)
  const clusters = buildCombinations(usable, targetAggregationCount)
    .map(cluster => {
      const descriptors = cluster.map(getCaptureDescriptor)
      return {
        captures: cluster,
        spread: summarizeDescriptorSpread(descriptors),
        quality: averageQuality(cluster),
        maxQuality: Math.max(...cluster.map(getCaptureQuality)),
      }
    })
    .sort(rankCaptureClusters)

  const aggregationCaptures = (clusters[0]?.captures || usable.slice(0, targetAggregationCount))
    .slice()
    .sort((left, right) => getCaptureQuality(right) - getCaptureQuality(left))
  const pairSource = aggregationCaptures.length >= serverFrameLimit ? aggregationCaptures : usable
  const pairCount = Math.min(serverFrameLimit, pairSource.length)
  const serverPairs = buildCombinations(pairSource, pairCount)
    .map(pair => ({
      captures: pair,
      spread: summarizeDescriptorSpread(pair.map(getCaptureDescriptor)),
      quality: averageQuality(pair),
    }))
    .sort(rankStablePairs)

  const serverFrameCaptures = (serverPairs[0]?.captures || aggregationCaptures.slice(0, pairCount))
    .slice()
    .sort((left, right) => getCaptureQuality(right) - getCaptureQuality(left))

  return {
    aggregationCaptures,
    serverFrameCaptures,
    bestCapture: aggregationCaptures[0] || serverFrameCaptures[0] || usable[0],
    descriptorSpread: summarizeDescriptorSpread(aggregationCaptures.map(getCaptureDescriptor)),
  }
}

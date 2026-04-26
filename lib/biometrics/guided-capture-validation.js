const REQUIRED_GUIDED_PHASE_IDS = ['center', 'side_a', 'side_b', 'chin_down']

export const GUIDED_CAPTURE_CENTER_YAW_MAX = 0.10
export const GUIDED_CAPTURE_SIDE_YAW_MIN = 0.10
export const GUIDED_CAPTURE_CHIN_DOWN_PITCH_MIN = 0.14

function toFiniteNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function normalizeRotation(rotation) {
  const value = rotation && typeof rotation === 'object' ? rotation : {}
  return {
    yaw: toFiniteNumber(value.yaw),
    pitch: toFiniteNumber(value.pitch),
    roll: toFiniteNumber(value.roll),
  }
}

function hasOppositeYaw(yaw, referenceYaw) {
  if (!Number.isFinite(yaw) || !Number.isFinite(referenceYaw) || referenceYaw === 0) return false
  return Math.sign(yaw) !== Math.sign(referenceYaw) && Math.abs(yaw) >= GUIDED_CAPTURE_SIDE_YAW_MIN
}

function findPhaseRotation(samples, phaseId, predicate) {
  return samples.find(sample => (
    String(sample?.phaseId || '').trim() === phaseId
    && predicate(normalizeRotation(sample?.rotation))
  )) || null
}

export function verifyGuidedCapturePoseCoverage(samples) {
  const normalizedSamples = Array.isArray(samples) ? samples : []

  const centerMatch = findPhaseRotation(
    normalizedSamples,
    'center',
    rotation => Number.isFinite(rotation.yaw) && Math.abs(rotation.yaw) <= GUIDED_CAPTURE_CENTER_YAW_MAX,
  )
  if (!centerMatch) {
    return {
      ok: false,
      reasonCode: 'missing_center_pose',
      message: 'Server could not verify the straight-ahead pose. Retake and hold still on the center step.',
      verifiedPhaseIds: [],
    }
  }

  const sideAMatch = findPhaseRotation(
    normalizedSamples,
    'side_a',
    rotation => Number.isFinite(rotation.yaw) && Math.abs(rotation.yaw) >= GUIDED_CAPTURE_SIDE_YAW_MIN,
  )
  if (!sideAMatch) {
    return {
      ok: false,
      reasonCode: 'missing_side_a_pose',
      message: 'Server could not verify the first side pose. Retake and turn your head farther on step 2.',
      verifiedPhaseIds: ['center'],
    }
  }

  const sideAYaw = normalizeRotation(sideAMatch.rotation).yaw
  const sideBMatch = findPhaseRotation(
    normalizedSamples,
    'side_b',
    rotation => hasOppositeYaw(rotation.yaw, sideAYaw),
  )
  if (!sideBMatch) {
    return {
      ok: false,
      reasonCode: 'missing_side_b_pose',
      message: 'Server could not verify the opposite side pose. Retake and turn the other way on step 3.',
      verifiedPhaseIds: ['center', 'side_a'],
    }
  }

  const chinDownMatch = findPhaseRotation(
    normalizedSamples,
    'chin_down',
    rotation => Number.isFinite(rotation.pitch) && rotation.pitch >= GUIDED_CAPTURE_CHIN_DOWN_PITCH_MIN,
  )
  if (!chinDownMatch) {
    return {
      ok: false,
      reasonCode: 'missing_chin_down_pose',
      message: 'Server could not verify the chin-down mobile pose. Retake and lower your chin slightly on the final step.',
      verifiedPhaseIds: ['center', 'side_a', 'side_b'],
    }
  }

  return {
    ok: true,
    reasonCode: '',
    message: '',
    verifiedPhaseIds: REQUIRED_GUIDED_PHASE_IDS.slice(),
  }
}

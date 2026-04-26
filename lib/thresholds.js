import {
  DISTANCE_THRESHOLD_KIOSK,
  DISTANCE_THRESHOLD_ENROLLMENT,
  DISTANCE_THRESHOLD,
  AMBIGUOUS_MATCH_MARGIN,
  ENROLLMENT_MIN_SAMPLE_DIVERSITY,
  CONFIRM_FRAMES,
  KIOSK_IDLE_SCAN_MS,
  KIOSK_ACTIVE_SCAN_MS,
  VERIFICATION_BURST_FRAMES,
  VERIFICATION_BURST_INTERVAL_MS,
  KIOSK_MAX_CENTER_OFFSET_RATIO,
  DETECTION_MAX_DIMENSION,
  KIOSK_IDLE_DETECTION_MAX_DIMENSION,
  CONFIRMED_HOLD_MS,
  UNKNOWN_DEBOUNCE_MS,
  KIOSK_ATTEMPT_COOLDOWN_MS,
  KIOSK_FACE_LOSS_GRACE_MS,
  REGISTRATION_SCAN_INTERVAL_MS,
  LOCATION_BOOT_TIMEOUT_MS,
  LOCATION_REFRESH_INTERVAL_MS,
  LOCATION_CACHE_MAX_AGE_MS,
} from '@/lib/config'
import {
  ENROLLMENT_MIN_SAMPLES,
  ENROLLMENT_BURST_CAPTURE_ATTEMPTS,
  ENROLLMENT_BURST_CAPTURE_INTERVAL_MS,
  ENROLLMENT_TARGET_BURST_SAMPLES,
} from '@/lib/biometrics/enrollment-burst'

export const DEFAULTS = {
  kioskMatchDistance: DISTANCE_THRESHOLD_KIOSK,
  enrollmentMatchDistance: DISTANCE_THRESHOLD_ENROLLMENT,
  legacyMatchDistance: DISTANCE_THRESHOLD,
  ambiguousMargin: AMBIGUOUS_MATCH_MARGIN,
  enrollmentMinSampleDiversity: ENROLLMENT_MIN_SAMPLE_DIVERSITY,
  confirmFrames: CONFIRM_FRAMES,
  idleScanMs: KIOSK_IDLE_SCAN_MS,
  activeScanMs: KIOSK_ACTIVE_SCAN_MS,
  verificationBurstFrames: VERIFICATION_BURST_FRAMES,
  verificationBurstIntervalMs: VERIFICATION_BURST_INTERVAL_MS,
  maxCenterOffsetRatio: KIOSK_MAX_CENTER_OFFSET_RATIO,
  idleDetectionMaxDimension: KIOSK_IDLE_DETECTION_MAX_DIMENSION,
  detectionMaxDimension: DETECTION_MAX_DIMENSION,
  confirmedHoldMs: CONFIRMED_HOLD_MS,
  unknownDebounceMs: UNKNOWN_DEBOUNCE_MS,
  attemptCooldownMs: KIOSK_ATTEMPT_COOLDOWN_MS,
  faceLossGraceMs: KIOSK_FACE_LOSS_GRACE_MS,
  enrollmentMinSamples: ENROLLMENT_MIN_SAMPLES,
  enrollmentBurstAttempts: ENROLLMENT_BURST_CAPTURE_ATTEMPTS,
  enrollmentBurstIntervalMs: ENROLLMENT_BURST_CAPTURE_INTERVAL_MS,
  enrollmentTargetSamples: ENROLLMENT_TARGET_BURST_SAMPLES,
  registrationScanIntervalMs: REGISTRATION_SCAN_INTERVAL_MS,
  locationBootTimeoutMs: LOCATION_BOOT_TIMEOUT_MS,
  locationRefreshIntervalMs: LOCATION_REFRESH_INTERVAL_MS,
  locationCacheMaxAgeMs: LOCATION_CACHE_MAX_AGE_MS,
}

const THRESHOLD_DOC = 'system_config/thresholds'
const THRESHOLD_CACHE_TTL_MS = 30_000

let cache = null
let cacheTs = 0

function sanitizeThresholds(values) {
  const merged = { ...DEFAULTS, ...(values || {}) }
  if (!Number.isFinite(Number(merged.ambiguousMargin)) || Number(merged.ambiguousMargin) < 0.02) {
    merged.ambiguousMargin = 0.02
  }
  return merged
}

export async function getActiveThresholds(db) {
  const now = Date.now()
  if (cache && now - cacheTs < THRESHOLD_CACHE_TTL_MS) return cache

  try {
    const snap = await db.doc(THRESHOLD_DOC).get()
    if (snap.exists) {
      cache = sanitizeThresholds(snap.data())
    } else {
      cache = DEFAULTS
    }
    cacheTs = now
  } catch {
    cache = DEFAULTS
  }

  return cache
}

export async function setActiveThresholds(db, values) {
  const merged = { ...sanitizeThresholds(values), updatedAt: Date.now() }
  await db.doc(THRESHOLD_DOC).set(merged, { merge: true })
  cache = merged
  cacheTs = Date.now()
  return merged
}

export async function resetThresholdsToDefaults(db) {
  await db.doc(THRESHOLD_DOC).delete()
  cache = DEFAULTS
  cacheTs = Date.now()
}

export const THRESHOLD_META = {
  biometric: {
    label: 'Biometric Matching',
    description: 'Face recognition distance thresholds and ambiguity rules',
    fields: {
      kioskMatchDistance: {
        label: 'Kiosk Match Distance',
        description: 'Max L2 distance to recognize an employee. Higher = more lenient but more false positives.',
        min: 0.5, max: 1.0, step: 0.01, default: DISTANCE_THRESHOLD_KIOSK,
        format: v => v.toFixed(2),
      },
      ambiguousMargin: {
        label: 'Ambiguity Margin',
        description: 'Best match must beat 2nd best by this much. Lower values reduce false rejects but increase false accepts.',
        min: 0.02, max: 0.10, step: 0.01, default: AMBIGUOUS_MATCH_MARGIN,
        format: v => v.toFixed(2),
      },
      enrollmentMinSampleDiversity: {
        label: 'Sample Diversity',
        description: 'Min L2 distance between samples of the same person during enrollment.',
        min: 0.0, max: 0.30, step: 0.01, default: ENROLLMENT_MIN_SAMPLE_DIVERSITY,
        format: v => v.toFixed(2),
      },
    },
  },
  kiosk: {
    label: 'Kiosk Behavior',
    description: 'Scan speed, debounce timers, and face quality gates',
    fields: {
      confirmFrames: {
        label: 'Confirm Frames',
        description: 'Consecutive oval-ready frames before triggering verification burst.',
        min: 2, max: 15, step: 1, default: CONFIRM_FRAMES,
        format: v => `${v}`,
      },
      activeScanMs: {
        label: 'Active Scan (ms)',
        description: 'Scan interval when a face is being tracked.',
        min: 40, max: 200, step: 10, default: KIOSK_ACTIVE_SCAN_MS,
        format: v => `${v}ms`,
      },
      idleScanMs: {
        label: 'Idle Scan (ms)',
        description: 'Scan interval when no face is detected.',
        min: 100, max: 1000, step: 50, default: KIOSK_IDLE_SCAN_MS,
        format: v => `${v}ms`,
      },
      maxCenterOffsetRatio: {
        label: 'Max Center Offset',
        description: 'Face center can be this fraction off-center from the oval.',
        min: 0.10, max: 0.50, step: 0.01, default: KIOSK_MAX_CENTER_OFFSET_RATIO,
        format: v => `${Math.round(v * 100)}%`,
      },
      confirmedHoldMs: {
        label: 'Confirmed Hold (ms)',
        description: 'Unknown face must stay detected this long before triggering verification.',
        min: 1000, max: 10000, step: 500, default: CONFIRMED_HOLD_MS,
        format: v => `${(v / 1000).toFixed(1)}s`,
      },
      unknownDebounceMs: {
        label: 'Unknown Debounce (ms)',
        description: 'Delay before showing unknown-face alert.',
        min: 500, max: 5000, step: 100, default: UNKNOWN_DEBOUNCE_MS,
        format: v => `${v}ms`,
      },
      attemptCooldownMs: {
        label: 'Attempt Cooldown (ms)',
        description: 'Cooldown after a failed verification before allowing another attempt.',
        min: 1000, max: 10000, step: 500, default: KIOSK_ATTEMPT_COOLDOWN_MS,
        format: v => `${(v / 1000).toFixed(1)}s`,
      },
    },
  },
  enrollment: {
    label: 'Enrollment Capture',
    description: 'Burst capture settings and minimum sample requirements',
    fields: {
      enrollmentMinSamples: {
        label: 'Min Enrollment Samples',
        description: 'Minimum biometric samples required to complete enrollment.',
        min: 2, max: 6, step: 1, default: ENROLLMENT_MIN_SAMPLES,
        format: v => `${v} samples`,
      },
      enrollmentTargetSamples: {
        label: 'Target Burst Samples',
        description: 'Target number of high-quality samples per enrollment attempt.',
        min: 3, max: 8, step: 1, default: ENROLLMENT_TARGET_BURST_SAMPLES,
        format: v => `${v} samples`,
      },
      registrationScanIntervalMs: {
        label: 'Registration Scan (ms)',
        description: 'How often to scan for faces during enrollment.',
        min: 100, max: 1000, step: 50, default: REGISTRATION_SCAN_INTERVAL_MS,
        format: v => `${v}ms`,
      },
    },
  },
}

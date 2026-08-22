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
  LOCATION_TARGET_ACCURACY_METERS,
  LOCATION_MAX_ACCURACY_METERS,
  LOCATION_SAMPLE_COUNT,
} from '@/lib/config'
import {
  ENROLLMENT_MIN_SAMPLES,
  ENROLLMENT_BURST_CAPTURE_ATTEMPTS,
  ENROLLMENT_BURST_CAPTURE_INTERVAL_MS,
  ENROLLMENT_TARGET_BURST_SAMPLES,
} from '@/lib/biometrics/enrollment-burst'
import { postgresEnabled, queryPostgres } from '@/lib/postgres/client'

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
  locationTargetAccuracyMeters: LOCATION_TARGET_ACCURACY_METERS,
  locationMaxAccuracyMeters: LOCATION_MAX_ACCURACY_METERS,
  locationSampleCount: LOCATION_SAMPLE_COUNT,
}

const THRESHOLD_CACHE_TTL_MS = 30_000
const MIN_AMBIGUOUS_MARGIN = 0.04

let cache = null
let cacheTs = 0

function sanitizeThresholds(values) {
  const merged = { ...DEFAULTS, ...(values || {}) }
  if (!Number.isFinite(Number(merged.ambiguousMargin)) || Number(merged.ambiguousMargin) < MIN_AMBIGUOUS_MARGIN) {
    merged.ambiguousMargin = MIN_AMBIGUOUS_MARGIN
  }
  return merged
}

export async function getActiveThresholds(db) {
  return getActiveThresholdsWithOptions(db)
}

async function getActiveThresholdsWithOptions(_db, { client, bypassCache = false } = {}) {
  if (!postgresEnabled()) {
    throw new Error('PostgreSQL is required for threshold configuration.')
  }
  const now = Date.now()
  if (!client && !bypassCache && cache && now - cacheTs < THRESHOLD_CACHE_TTL_MS) return cache

  const database = client || { query: queryPostgres }
  const result = await database.query('SELECT value FROM system_config WHERE key = $1 LIMIT 1', ['thresholds'])
  const thresholds = result.rows[0] ? sanitizeThresholds(result.rows[0].value) : { ...DEFAULTS }
  if (!client) {
    cache = thresholds
    cacheTs = now
  }
  return thresholds
}

export async function getActiveThresholdsForUpdate(db, options = {}) {
  if (!options.client) {
    throw new Error('A PostgreSQL transaction client is required for threshold updates.')
  }
  await options.client.query(
    'SELECT pg_advisory_xact_lock(hashtext($1))',
    ['faceattend:system_config:thresholds'],
  )
  return getActiveThresholdsWithOptions(db, { ...options, bypassCache: true })
}

export async function setActiveThresholds(_db, values, { client } = {}) {
  if (!postgresEnabled()) {
    throw new Error('PostgreSQL is required for threshold configuration.')
  }
  const database = client || { query: queryPostgres }
  const changes = { ...(values || {}), updatedAt: Date.now() }
  const result = await database.query(
    `
      INSERT INTO system_config (key, value, updated_at)
      VALUES ('thresholds', $1::jsonb, now())
      ON CONFLICT (key)
      DO UPDATE SET value = system_config.value || EXCLUDED.value, updated_at = now()
      RETURNING value
    `,
    [JSON.stringify(changes)],
  )
  const updated = sanitizeThresholds(result.rows[0]?.value)
  if (!client) {
    cache = updated
    cacheTs = Date.now()
  }
  return updated
}

export async function resetThresholdsToDefaults(_db, { client } = {}) {
  if (!postgresEnabled()) {
    throw new Error('PostgreSQL is required for threshold configuration.')
  }
  const database = client || { query: queryPostgres }
  await database.query('DELETE FROM system_config WHERE key = $1', ['thresholds'])
  if (!client) {
    cache = { ...DEFAULTS }
    cacheTs = Date.now()
  }
}

export function invalidateThresholdCache() {
  cache = null
  cacheTs = 0
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
        min: MIN_AMBIGUOUS_MARGIN, max: 0.10, step: 0.01, default: AMBIGUOUS_MATCH_MARGIN,
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
        min: 4, max: 8, step: 1, default: ENROLLMENT_MIN_SAMPLES,
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
  location: {
    label: 'Device Location Accuracy',
    description: 'Desktop browsers often use Wi-Fi positioning. The kiosk collects fresh readings and selects the most accurate one.',
    fields: {
      locationBootTimeoutMs: { label: 'Initial Location Timeout', description: 'Maximum wait for the first GPS reading. Increase this for phones that need more time to acquire GPS.', min: 10000, max: 60000, step: 5000, default: LOCATION_BOOT_TIMEOUT_MS, format: v => `${Math.round(v / 1000)} seconds` },
      locationTargetAccuracyMeters: { label: 'Target Accuracy', description: 'Stop sampling early at this reported accuracy.', min: 10, max: 200, step: 5, default: LOCATION_TARGET_ACCURACY_METERS, format: v => `±${v} m` },
      locationMaxAccuracyMeters: { label: 'Maximum Accepted Accuracy', description: 'Block attendance when the browser reports a less accurate location.', min: 50, max: 1000, step: 25, default: LOCATION_MAX_ACCURACY_METERS, format: v => `±${v} m` },
      locationSampleCount: { label: 'Location Samples', description: 'Fresh readings collected before the best reading is selected.', min: 1, max: 5, step: 1, default: LOCATION_SAMPLE_COUNT, format: v => `${v}` },
    },
  },
}

export function validateThresholdUpdate(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    return { ok: false, message: 'values object required.' }
  }

  const entries = Object.entries(values)
  if (entries.length === 0) {
    return { ok: false, message: 'At least one threshold value is required.' }
  }

  const allowedFields = new Map()
  for (const section of Object.values(THRESHOLD_META)) {
    for (const [key, meta] of Object.entries(section.fields || {})) {
      allowedFields.set(key, meta)
    }
  }

  const normalized = {}
  for (const [key, rawValue] of entries) {
    const meta = allowedFields.get(key)
    if (!meta) return { ok: false, message: `Unknown threshold: ${key}.` }
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
      return { ok: false, message: `${key} must be a finite number.` }
    }
    if (rawValue < meta.min || rawValue > meta.max) {
      return { ok: false, message: `${key} must be between ${meta.min} and ${meta.max}.` }
    }
    normalized[key] = rawValue
  }

  return { ok: true, values: normalized }
}

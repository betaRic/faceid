export const FACE_COLORS = [
  '#1a56db', '#f59e0b', '#16a34a', '#e53e3e',
  '#8b5cf6', '#06b6d4', '#ec4899', '#f97316',
]

const USE_LOCAL_MODELS = process.env.NEXT_PUBLIC_USE_LOCAL_MODELS === 'true'
const LOCAL_MODEL_PATH = '/models/human'
const CDN_MODEL_PATH = 'https://cdn.jsdelivr.net/npm/@vladmandic/human@3.3.6/models'

function normalizeModelUrl(value) {
  const cleaned = String(value || '').trim()
  return cleaned ? cleaned.replace(/\/+$/, '') : ''
}

const EXPLICIT_MODEL_URL = normalizeModelUrl(process.env.NEXT_PUBLIC_HUMAN_MODEL_URL)

export const MODEL_URL = EXPLICIT_MODEL_URL || (USE_LOCAL_MODELS ? LOCAL_MODEL_PATH : CDN_MODEL_PATH)
export const LOCAL_MODELS_AVAILABLE = MODEL_URL === LOCAL_MODEL_PATH
export const STORAGE_KEY = 'face_id_persons'
export const ATTENDANCE_KEY = 'face_id_attendance'
export const PERSONS_COLLECTION = 'persons'
export const ATTENDANCE_COLLECTION = 'attendance'

export const DESCRIPTOR_LENGTH = 1024

// --- Matching thresholds ---
// DISTANCE_THRESHOLD_KIOSK: L2 on unit vectors. Empirically, same-person distance
// is typically 0.4–0.7, different-person 0.8–1.3 with FaceRes 1024-dim.
// 0.80 is intentionally conservative for public personal scans: a failed scan
// is operationally annoying, but a false accept records the wrong employee.
export const DISTANCE_THRESHOLD_KIOSK = 0.80
// Enrollment duplicate blocking must be stricter than kiosk recognition.
// Recognition optimizes recall; duplicate blocking must optimize precision.
export const DISTANCE_THRESHOLD_ENROLLMENT = 0.50
export const DISTANCE_THRESHOLD = 0.70
// Legacy alias retained for local/dev code paths.
export const DUPLICATE_FACE_THRESHOLD = DISTANCE_THRESHOLD_ENROLLMENT

// AMBIGUOUS_MATCH_MARGIN: how much better the best match must be vs the 2nd best.
// Public personal scans must optimize against false accepts. Similar employees
// should be blocked for admin review/re-enrollment instead of guessing.
export const AMBIGUOUS_MATCH_MARGIN = 0.06

// --- Kiosk loop timing ---
// WASM backend is ~2x slower than WebGL but produces deterministic descriptors
// across all devices/GPUs, which is critical for cross-device recognition accuracy.
// Timings are set for WASM inference speed.
export const CONFIRM_FRAMES = 4
export const KIOSK_IDLE_SCAN_MS = 400
export const KIOSK_ACTIVE_SCAN_MS = 120
export const REGISTRATION_SCAN_INTERVAL_MS = 600
export const CONFIRMED_HOLD_MS = 4000
export const UNKNOWN_DEBOUNCE_MS = 1500
export const KIOSK_ATTEMPT_COOLDOWN_MS = 2200
export const KIOSK_FACE_LOSS_GRACE_MS = 600

// --- Capture dimensions ---
// WASM is slower per-pixel, so keep dimensions moderate.
export const DETECTION_MAX_DIMENSION = 640
export const KIOSK_IDLE_DETECTION_MAX_DIMENSION = 480
export const PREVIEW_MAX_DIMENSION = 640
export const VERIFICATION_BURST_FRAMES = 5
export const VERIFICATION_BURST_INTERVAL_MS = 100
export const VERIFICATION_BURST_MOBILE_FRAMES = 4
export const VERIFICATION_BURST_MOBILE_INTERVAL_MS = 120
export const VERIFICATION_TOP_DESCRIPTORS = 3

// --- Kiosk quality gate before triggering verification burst ---
// Face-size readiness is defined in lib/biometrics/face-size-guidance.js and
// shared across kiosk, registration, and admin re-enrollment.
// Face center must be within this fraction of oval width from center
// (0 = dead center required, 0.3 = 30% off-center still allowed)
export const KIOSK_MAX_CENTER_OFFSET_RATIO = 0.30

// --- Enrollment diversity ---
// Minimum euclidean distance between stored samples for the SAME person.
// Samples closer than this are considered duplicates and rejected.
export const ENROLLMENT_MIN_SAMPLE_DIVERSITY = 0.10

// --- Location ---
export const LOCATION_BOOT_TIMEOUT_MS = 12000
export const LOCATION_REFRESH_INTERVAL_MS = 60000
export const LOCATION_CACHE_MAX_AGE_MS = 30000

export const FACE_COLORS = [
  '#1a56db',
  '#f59e0b',
  '#16a34a',
  '#e53e3e',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#f97316',
]

export const MODEL_URL = '/models'
export const STORAGE_KEY = 'face_id_persons'
export const ATTENDANCE_KEY = 'face_id_attendance'
export const PERSONS_COLLECTION = 'persons'
export const ATTENDANCE_COLLECTION = 'attendance'

// @vladmandic/human v3.x outputs 1024-dim FaceNet embeddings (unit-normalized to sphere).
// Verify against your actual output: in browser console, log face.embedding.length during a scan.
// If the library is configured with a different model, update this constant to match.
export const DESCRIPTOR_LENGTH = 1024

// Distance thresholds for unit-normalized 1024-dim embeddings.
// These MUST be calibrated with real enrolled pairs from your offices before production.
// Strategy: compute pairwise distances between same-person enrollments (should be low)
// and different-person pairs (should be high). Set DISTANCE_THRESHOLD at the crossover point.
// Conservative defaults: stricter = more scan retries, zero false identity matches.
export const DISTANCE_THRESHOLD = 0.42
export const DUPLICATE_FACE_THRESHOLD = 0.32
export const AMBIGUOUS_MATCH_MARGIN = 0.06

export const CONFIRM_FRAMES = 2
export const SCAN_INTERVAL_MS = 260
export const REGISTRATION_SCAN_INTERVAL_MS = 300
export const CONFIRMED_HOLD_MS = 4000
export const UNKNOWN_DEBOUNCE_MS = 1500
export const KIOSK_ATTEMPT_COOLDOWN_MS = 2200
export const KIOSK_FACE_LOSS_GRACE_MS = 450
export const DETECTION_MAX_DIMENSION = 640
export const KIOSK_IDLE_DETECTION_MAX_DIMENSION = 480
export const PREVIEW_MAX_DIMENSION = 960
export const LOCATION_BOOT_TIMEOUT_MS = 12000
export const LOCATION_REFRESH_INTERVAL_MS = 15000
export const LOCATION_CACHE_MAX_AGE_MS = 30000

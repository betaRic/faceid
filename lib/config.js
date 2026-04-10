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

// @vladmandic/human v3.x outputs 1024-dim unit-normalized FaceNet embeddings.
// face.embedding is Float32Array(1024), norm ≈ 1.0.
// This constant is used everywhere — do NOT hardcode 128 anywhere in the codebase.
export const DESCRIPTOR_LENGTH = 1024

// Distance thresholds for 1024-dim unit-normalized FaceNet embeddings.
//
// CALIBRATION NOTES (update after real-world testing with your enrolled data):
//   same-person pairs:      typically 0.30 – 0.50
//   different-person pairs: typically 0.60 – 0.90
//
// DISTANCE_THRESHOLD: reject matches above this distance (no reliable match).
//   Start at 0.60. Tighten to 0.55 if you see false accepts in the field.
//   Was 0.42 — that was calibrated for 128-dim face-api.js vectors and is TOO STRICT
//   for 1024-dim embeddings; it will cause excessive false rejects.
//
// DUPLICATE_FACE_THRESHOLD: flag as duplicate during enrollment if below this value.
//   Should be tighter than DISTANCE_THRESHOLD to avoid blocking legitimate re-enrollments.
//
// AMBIGUOUS_MATCH_MARGIN: if the top-2 matches are within this margin, block (ambiguous).
//   Prevents confident mis-identification between similar-looking employees.
export const DISTANCE_THRESHOLD = 0.60
export const DUPLICATE_FACE_THRESHOLD = 0.45
export const AMBIGUOUS_MATCH_MARGIN = 0.08

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

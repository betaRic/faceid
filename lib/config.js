export const FACE_COLORS = [
  '#1a56db', '#f59e0b', '#16a34a', '#e53e3e',
  '#8b5cf6', '#06b6d4', '#ec4899', '#f97316',
]

const USE_LOCAL_MODELS = process.env.NEXT_PUBLIC_USE_LOCAL_MODELS === 'true'
const LOCAL_MODEL_PATH = '/models/human'

export const MODEL_URL = USE_LOCAL_MODELS
  ? LOCAL_MODEL_PATH
  : 'https://cdn.jsdelivr.net/npm/@vladmandic/human@3.3.6/models'

export const LOCAL_MODELS_AVAILABLE = USE_LOCAL_MODELS
export const STORAGE_KEY = 'face_id_persons'
export const ATTENDANCE_KEY = 'face_id_attendance'
export const PERSONS_COLLECTION = 'persons'
export const ATTENDANCE_COLLECTION = 'attendance'

export const DESCRIPTOR_LENGTH = 1024

// --- Matching thresholds ---
// DISTANCE_THRESHOLD_KIOSK: L2 on unit vectors. Empirically, same-person distance
// is typically 0.4–0.7, different-person 0.8–1.3 with FaceRes 1024-dim.
// 0.85 is lenient enough for real lighting/angle variation.
export const DISTANCE_THRESHOLD_KIOSK = 0.85
// Enrollment duplicate blocking must be stricter than kiosk recognition.
// Recognition optimizes recall; duplicate blocking must optimize precision.
export const DISTANCE_THRESHOLD_ENROLLMENT = 0.50
export const DISTANCE_THRESHOLD = 0.70
// Legacy alias retained for local/dev code paths.
export const DUPLICATE_FACE_THRESHOLD = DISTANCE_THRESHOLD_ENROLLMENT

// AMBIGUOUS_MATCH_MARGIN: how much better the best match must be vs the 2nd best.
// ❌ OLD: 0.08 — designed for large databases. With 9–50 people, this blocks
//    valid matches because inter-person distances are naturally compressed.
// ❌ OLD: 0.04 — still too strict when stored descriptors are low-quality (e.g.
//    center-only captures from old skipFrames bug), compressing inter-person distances.
// ✅ NEW: 0.02 — only blocks truly ambiguous matches. Combined with distance gate
//    in matchBiometricIndexCandidates (only applies when best.distance >= 0.60),
//    strong matches are never blocked by ambiguity from bad-quality descriptors.
export const AMBIGUOUS_MATCH_MARGIN = 0.02

// --- Kiosk loop timing ---
// CONFIRM_FRAMES: number of consecutive oval-ready frames before triggering
// verification burst. 3 @ 80ms = 240ms — too fast, triggers on transient faces.
// 5 @ 80ms = 400ms — user must hold steady for ~0.4s before verification fires.
export const CONFIRM_FRAMES = 5
export const KIOSK_IDLE_SCAN_MS = 300
export const KIOSK_ACTIVE_SCAN_MS = 80
export const REGISTRATION_SCAN_INTERVAL_MS = 500
export const CONFIRMED_HOLD_MS = 4000
export const UNKNOWN_DEBOUNCE_MS = 1500
export const KIOSK_ATTEMPT_COOLDOWN_MS = 2200
export const KIOSK_FACE_LOSS_GRACE_MS = 450

// --- Capture dimensions ---
export const DETECTION_MAX_DIMENSION = 640
export const KIOSK_IDLE_DETECTION_MAX_DIMENSION = 480
export const PREVIEW_MAX_DIMENSION = 640
export const VERIFICATION_BURST_FRAMES = 4
export const VERIFICATION_BURST_INTERVAL_MS = 60

// --- Kiosk quality gate before triggering verification burst ---
// Face must occupy at least this fraction of the oval canvas area
// to avoid verifying partial/distant faces. 0.06 = 6% of oval area.
export const KIOSK_MIN_FACE_AREA_RATIO = 0.06
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

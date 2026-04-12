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

export const DISTANCE_THRESHOLD = 0.55;
export const DUPLICATE_FACE_THRESHOLD = 0.45;
export const AMBIGUOUS_MATCH_MARGIN = 0.15;

export const CONFIRM_FRAMES = 2
export const KIOSK_IDLE_SCAN_MS = 300
export const KIOSK_ACTIVE_SCAN_MS = 80
export const REGISTRATION_SCAN_INTERVAL_MS = 300
export const CONFIRMED_HOLD_MS = 4000
export const UNKNOWN_DEBOUNCE_MS = 1500
export const KIOSK_ATTEMPT_COOLDOWN_MS = 2200
export const KIOSK_FACE_LOSS_GRACE_MS = 450
export const DETECTION_MAX_DIMENSION = 640
export const KIOSK_IDLE_DETECTION_MAX_DIMENSION = 480
export const PREVIEW_MAX_DIMENSION = 640
export const VERIFICATION_BURST_FRAMES = 4
export const VERIFICATION_BURST_INTERVAL_MS = 60
export const LOCATION_BOOT_TIMEOUT_MS = 12000
export const LOCATION_REFRESH_INTERVAL_MS = 15000
export const LOCATION_CACHE_MAX_AGE_MS = 30000

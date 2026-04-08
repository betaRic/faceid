export const AZURE_ENDPOINT = 'https://faceattendsrv.cognitiveservices.azure.com'
export const AZURE_KEY = '8IQgKOWv7iwT0HMyyUse9y4PQve4NYf4y07QhHtfPyy6ndVMufnSJQQJ99CDACYeBjFXJ3w3AAAKACOGoaSx'

export const FACE_COLORS = [
  '#1a56db', '#f59e0b', '#16a34a', '#e53e3e',
  '#8b5cf6', '#06b6d4', '#ec4899', '#f97316',
]

export const MODEL_URL = '/models'
export const STORAGE_KEY = 'face_id_persons'
export const ATTENDANCE_KEY = 'face_id_attendance'
export const DISTANCE_THRESHOLD = 0.45   // stricter = fewer false positives

// Kiosk scan tuning
export const CONFIDENCE_MIN   = 0.52    // min confidence to count as a match
export const CONFIRM_FRAMES   = 2       // frames needed before logging (was 3)
export const SCAN_INTERVAL_MS = 300     // scan every 300 ms (was 600)
export const COOLDOWN_MS      = 30000   // 30 s between duplicate logs
export const CONFIRMED_HOLD_MS = 4000  // keep "confirmed" card visible for 4 s
export const UNKNOWN_DEBOUNCE_MS = 800  // wait before flipping to "unknown"
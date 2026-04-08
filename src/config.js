// Azure Face API — used for DETECTION only (attributes: age, gender, emotion, etc.)
// Identification & Verification require Microsoft approval — we use face-api.js locally instead.
export const AZURE_ENDPOINT = 'https://faceattendsrv.cognitiveservices.azure.com'
export const AZURE_KEY = '8IQgKOWv7iwT0HMyyUse9y4PQve4NYf4y07QhHtfPyy6ndVMufnSJQQJ99CDACYeBjFXJ3w3AAAKACOGoaSx'

export const FACE_COLORS = [
  '#1a56db', '#f59e0b', '#16a34a', '#e53e3e',
  '#8b5cf6', '#06b6d4', '#ec4899', '#f97316',
]

// face-api.js model weights (loaded from npm package)
export const MODEL_URL = '/models'

// localStorage key for registered persons
export const STORAGE_KEY = 'face_id_persons'

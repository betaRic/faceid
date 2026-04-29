import { firebaseAdminConfigured } from './firebase-admin'
import { isPublicAttendanceEnabled } from './public-features'

export const PUBLIC_FIREBASE_ENV_KEYS = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
]

export const SERVER_ENV_KEYS = [
  'ADMIN_SESSION_SECRET',
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'HR_SESSION_SECRET',
  'HR_PIN_SALT',
  'CRON_SECRET',
  'NEXT_PUBLIC_SITE_URL',
  'EMPLOYEE_VIEW_SESSION_SECRET',
]

function hasValue(key) {
  return Boolean(process.env[key]?.trim())
}

function boolEnv(key, fallback = false) {
  const value = process.env[key]
  if (value == null || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase())
}

function defaultOpenVinoShadowEnabled() {
  return hasValue('RAILWAY_SERVICE_ID') || process.env.INCLUDE_OPENVINO_RUNTIME === 'true'
}

function getOpenVinoReadiness() {
  return {
    shadowEnabled: boolEnv('OPENVINO_SHADOW_ENABLED', defaultOpenVinoShadowEnabled()),
    defaultShadowEnabled: defaultOpenVinoShadowEnabled(),
    modelRoot: process.env.OPENVINO_MODEL_DIR || 'public/models/openvino',
    modelsAvailable: null,
    missingModelFiles: [],
  }
}

export function getRuntimeReadiness() {
  const publicEnv = Object.fromEntries(PUBLIC_FIREBASE_ENV_KEYS.map(key => [key, hasValue(key)]))
  const serverEnv = Object.fromEntries(SERVER_ENV_KEYS.map(key => [key, hasValue(key)]))
  const firebaseClientConfigured = Object.values(publicEnv).every(Boolean)
  const firebaseServerConfigured = firebaseAdminConfigured()
  const adminSessionConfigured = serverEnv.ADMIN_SESSION_SECRET
  const hrSessionConfigured = serverEnv.HR_SESSION_SECRET
  const hrPinSaltConfigured = serverEnv.HR_PIN_SALT
  const cronSecretConfigured = serverEnv.CRON_SECRET
  const railwayPublicDomainConfigured = hasValue('RAILWAY_PUBLIC_DOMAIN')
  const siteUrlConfigured = serverEnv.NEXT_PUBLIC_SITE_URL || railwayPublicDomainConfigured
  const employeeViewSessionConfigured = serverEnv.EMPLOYEE_VIEW_SESSION_SECRET || firebaseServerConfigured
  const redisConfigured = hasValue('REDIS_URL')
  const publicAttendanceEnabled = isPublicAttendanceEnabled()
  const openvino = getOpenVinoReadiness()
  const warnings = []
  const baselineReadyChecks = [
    firebaseClientConfigured,
    firebaseServerConfigured,
    adminSessionConfigured,
    hrSessionConfigured,
    hrPinSaltConfigured,
    cronSecretConfigured,
    siteUrlConfigured,
    employeeViewSessionConfigured,
  ]
  const productionReady = baselineReadyChecks.every(Boolean)
  const scaleReady = productionReady && redisConfigured

  if (!firebaseClientConfigured) {
    warnings.push('Firebase web SDK environment variables are incomplete.')
  }

  if (!firebaseServerConfigured) {
    warnings.push('Firebase Admin SDK is not configured. Protected server writes will fail.')
  }

  if (!adminSessionConfigured) {
    warnings.push('Admin session signing is not configured.')
  }

  if (!hrSessionConfigured) {
    warnings.push('HR session signing is not configured.')
  }

  if (!hrPinSaltConfigured) {
    warnings.push('HR PIN hashing salt is not configured.')
  }

  if (!cronSecretConfigured) {
    warnings.push('Cron protection secret is not configured.')
  }

  if (!siteUrlConfigured) {
    warnings.push('NEXT_PUBLIC_SITE_URL is not configured; CSRF protection will reject writes.')
  } else if (!serverEnv.NEXT_PUBLIC_SITE_URL && railwayPublicDomainConfigured) {
    warnings.push('Using RAILWAY_PUBLIC_DOMAIN for CSRF origin checks. Set NEXT_PUBLIC_SITE_URL explicitly after the Railway URL is final.')
  }

  if (!employeeViewSessionConfigured) {
    warnings.push('Employee self-view sessions are unavailable because neither EMPLOYEE_VIEW_SESSION_SECRET nor Firebase Admin storage is available.')
  } else if (!serverEnv.EMPLOYEE_VIEW_SESSION_SECRET) {
    warnings.push('EMPLOYEE_VIEW_SESSION_SECRET is not configured; employee self-view falls back to Firestore-backed sessions.')
  }

  if (!redisConfigured) {
    warnings.push('REDIS_URL is not configured; cache misses and rate limits will fall back to Firestore and cost more at scale.')
  }

  if (publicAttendanceEnabled) {
    warnings.push('Public attendance browsing is enabled. Disable it unless broad visibility is an explicit requirement.')
  }

  if (openvino.shadowEnabled) {
    warnings.push('OpenVINO is enabled for shadow profile collection only; Human matching remains primary until real scan benchmarks justify promotion.')
  }

  warnings.push('Attendance descriptors are server-generated from submitted still frames, but frames, GPS, and liveness evidence still originate from the browser.')

  return {
    firebaseClientConfigured,
    firebaseServerConfigured,
    adminSessionConfigured,
    hrSessionConfigured,
    hrPinSaltConfigured,
    cronSecretConfigured,
    siteUrlConfigured,
    employeeViewSessionConfigured,
    redisConfigured,
    publicAttendanceEnabled,
    railwayPublicDomainConfigured,
    openvino,
    publicEnv,
    serverEnv,
    productionReady,
    scaleReady,
    warnings,
  }
}


import { createClient } from 'redis'
import { existsSync } from 'fs'
import path from 'path'

import { loadRepoEnv } from './lib/load-local-env.mjs'

loadRepoEnv()

async function pingRedis() {
  const url = process.env.REDIS_URL?.trim()
  if (!url) {
    return { configured: false, reachable: false, message: 'REDIS_URL is not configured.' }
  }

  const client = createClient({
    url,
    socket: {
      connectTimeout: 10_000,
    },
  })

  try {
    await client.connect()
    const response = await client.ping()
    return {
      configured: true,
      reachable: String(response || '').toUpperCase() === 'PONG',
      message: String(response || ''),
    }
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      message: error instanceof Error ? error.message : String(error),
    }
  } finally {
    try {
      if (client.isOpen) await client.quit()
    } catch {}
  }
}

const PUBLIC_FIREBASE_ENV_KEYS = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
]

const SERVER_ENV_KEYS = [
  'ADMIN_SESSION_SECRET',
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'HR_SESSION_SECRET',
  'HR_PIN_SALT',
  'CRON_SECRET',
  'NEXT_PUBLIC_SITE_URL',
  'EMPLOYEE_VIEW_SESSION_SECRET',
]

const OPENVINO_MODEL_ROOT = process.env.OPENVINO_MODEL_DIR
  ? path.resolve(process.env.OPENVINO_MODEL_DIR)
  : path.join(process.cwd(), 'public', 'models', 'openvino')

const OPENVINO_REQUIRED_MODEL_FILES = [
  'face-detection-retail-0004/FP16/face-detection-retail-0004.xml',
  'face-detection-retail-0004/FP16/face-detection-retail-0004.bin',
  'landmarks-regression-retail-0009/FP16/landmarks-regression-retail-0009.xml',
  'landmarks-regression-retail-0009/FP16/landmarks-regression-retail-0009.bin',
  'face-reidentification-retail-0095/FP16/face-reidentification-retail-0095.xml',
  'face-reidentification-retail-0095/FP16/face-reidentification-retail-0095.bin',
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
  const missingModelFiles = OPENVINO_REQUIRED_MODEL_FILES
    .map(relativePath => path.join(OPENVINO_MODEL_ROOT, relativePath))
    .filter(filePath => !existsSync(filePath))

  return {
    shadowEnabled: boolEnv('OPENVINO_SHADOW_ENABLED', defaultOpenVinoShadowEnabled()),
    defaultShadowEnabled: defaultOpenVinoShadowEnabled(),
    modelRoot: OPENVINO_MODEL_ROOT,
    modelsAvailable: missingModelFiles.length === 0,
    missingModelFiles,
  }
}

function firebaseAdminConfigured() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
  if (!raw) return false

  try {
    const parsed = JSON.parse(raw)
    return Boolean(parsed?.project_id && parsed?.private_key && parsed?.client_email)
  } catch {
    return false
  }
}

function isPublicAttendanceEnabled() {
  const publicFlag = String(process.env.NEXT_PUBLIC_ENABLE_PUBLIC_ATTENDANCE || '').trim().toLowerCase()
  const serverFlag = String(process.env.PUBLIC_ATTENDANCE_ENABLED || '').trim().toLowerCase()
  return publicFlag === 'true' || serverFlag === 'true'
}

function getRuntimeReadiness() {
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

  if (!firebaseClientConfigured) warnings.push('Firebase web SDK environment variables are incomplete.')
  if (!firebaseServerConfigured) warnings.push('Firebase Admin SDK is not configured.')
  if (!adminSessionConfigured) warnings.push('Admin session signing is not configured.')
  if (!hrSessionConfigured) warnings.push('HR session signing is not configured.')
  if (!hrPinSaltConfigured) warnings.push('HR PIN hashing salt is not configured.')
  if (!cronSecretConfigured) warnings.push('Cron protection secret is not configured.')
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
  if (!redisConfigured) warnings.push('REDIS_URL is not configured; cache misses and rate limits will fall back to Firestore.')
  if (publicAttendanceEnabled) warnings.push('Public attendance browsing is enabled. Disable it unless broad visibility is intentional.')
  if (openvino.shadowEnabled && !openvino.modelsAvailable) {
    warnings.push('OpenVINO shadow collection is enabled but retail model files are missing. Run npm run openvino:download-models before Railway deployment.')
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

const readiness = getRuntimeReadiness()
const redis = await pingRedis()
const ok = readiness.productionReady && readiness.scaleReady && redis.reachable

const output = {
  ok,
  checkedAt: new Date().toISOString(),
  ...readiness,
  redis,
  recommendation: !readiness.productionReady
    ? 'Set the missing baseline environment variables before deployment.'
    : !readiness.redisConfigured || !redis.reachable
      ? 'Baseline runtime is present, but Redis is not healthy. Fix Redis before broad rollout.'
      : 'Runtime configuration is present and Redis is reachable. Continue with Firestore index sync, biometric cache warm, and real-device pilot testing.',
}

console.log(JSON.stringify(output, null, 2))

if (!ok) {
  process.exit(1)
}

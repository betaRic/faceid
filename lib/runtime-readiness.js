import { adminAuthConfigured } from './admin-auth'
import { firebaseAdminConfigured } from './firebase-admin'

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
]

function hasValue(key) {
  return Boolean(process.env[key]?.trim())
}

export function getRuntimeReadiness() {
  const publicEnv = Object.fromEntries(PUBLIC_FIREBASE_ENV_KEYS.map(key => [key, hasValue(key)]))
  const serverEnv = Object.fromEntries(SERVER_ENV_KEYS.map(key => [key, hasValue(key)]))
  const firebaseClientConfigured = Object.values(publicEnv).every(Boolean)
  const firebaseServerConfigured = firebaseAdminConfigured()
  const adminSessionConfigured = adminAuthConfigured()
  const warnings = []

  if (!firebaseClientConfigured) {
    warnings.push('Firebase web SDK environment variables are incomplete.')
  }

  if (!firebaseServerConfigured) {
    warnings.push('Firebase Admin SDK is not configured. Protected server writes will fail.')
  }

  if (!adminSessionConfigured) {
    warnings.push('Admin session signing is not configured.')
  }

  warnings.push('Biometric descriptors are still loaded to clients for face matching. Treat this deployment as pilot-grade, not fully hardened.')

  return {
    firebaseClientConfigured,
    firebaseServerConfigured,
    adminSessionConfigured,
    publicEnv,
    serverEnv,
    productionReady: firebaseClientConfigured && firebaseServerConfigured && adminSessionConfigured,
    warnings,
  }
}

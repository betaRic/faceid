const requiredPublicKeys = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
]

const requiredServerKeys = [
  'ADMIN_SESSION_SECRET',
  'FIREBASE_SERVICE_ACCOUNT_JSON',
]

const optionalKeys = [
  'ADMIN_PIN_HASH',
  'ADMIN_PIN',
]

function hasValue(key) {
  return Boolean(process.env[key]?.trim())
}

const missingPublic = requiredPublicKeys.filter(key => !hasValue(key))
const missingServer = requiredServerKeys.filter(key => !hasValue(key))
const hasAdminAuthSecret = hasValue('ADMIN_PIN_HASH') || hasValue('ADMIN_PIN')

if (!hasAdminAuthSecret) {
  missingServer.push('ADMIN_PIN_HASH or ADMIN_PIN')
}

const lines = []

lines.push('Environment check')
lines.push(`Public Firebase vars: ${missingPublic.length === 0 ? 'ok' : `missing ${missingPublic.join(', ')}`}`)
lines.push(`Server vars: ${missingServer.length === 0 ? 'ok' : `missing ${missingServer.join(', ')}`}`)
lines.push(`Optional vars present: ${optionalKeys.filter(hasValue).join(', ') || 'none'}`)
lines.push('Warning: biometric descriptors are still delivered to clients for matching. This is suitable for pilot deployment, not a fully hardened biometric deployment.')

console.log(lines.join('\n'))

if (missingPublic.length > 0 || missingServer.length > 0) {
  process.exitCode = 1
}

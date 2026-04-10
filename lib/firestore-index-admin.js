import crypto from 'crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const FIRESTORE_ADMIN_BASE_URL = 'https://firestore.googleapis.com'
const FIRESTORE_DATABASE_ID = '(default)'
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DATASTORE_SCOPE = 'https://www.googleapis.com/auth/datastore'

let cachedAccessToken = null

function readFirebaseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    return {
      ...parsed,
      private_key: parsed.private_key?.replace(/\\n/g, '\n'),
    }
  } catch {
    return null
  }
}

function getFirebaseProjectId() {
  return readFirebaseServiceAccount()?.project_id || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || ''
}

function encodeJwtPart(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function normalizeIndexField(field) {
  const nextField = {
    fieldPath: String(field?.fieldPath || '').trim(),
  }

  if (field?.order) nextField.order = String(field.order)
  if (field?.arrayConfig) nextField.arrayConfig = String(field.arrayConfig)
  if (field?.vectorConfig) nextField.vectorConfig = field.vectorConfig

  return nextField
}

function createServiceAccountAssertion(serviceAccount) {
  const now = Math.floor(Date.now() / 1000)
  const header = encodeJwtPart({ alg: 'RS256', typ: 'JWT' })
  const claims = encodeJwtPart({
    iss: serviceAccount.client_email,
    scope: DATASTORE_SCOPE,
    aud: OAUTH_TOKEN_URL,
    exp: now + (60 * 60),
    iat: now,
  })
  const unsignedToken = `${header}.${claims}`
  const signer = crypto.createSign('RSA-SHA256')

  signer.update(unsignedToken)
  signer.end()

  return `${unsignedToken}.${signer.sign(serviceAccount.private_key, 'base64url')}`
}

async function getFirestoreAdminAccessToken() {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 30_000) {
    return cachedAccessToken.value
  }

  const serviceAccount = readFirebaseServiceAccount()
  if (!serviceAccount?.client_email || !serviceAccount?.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured')
  }

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: createServiceAccountAssertion(serviceAccount),
    }),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error_description || payload?.error || 'Failed to fetch Firestore Admin access token')
  }

  cachedAccessToken = {
    value: payload.access_token,
    expiresAt: Date.now() + (Number(payload.expires_in || 3600) * 1000),
  }

  return cachedAccessToken.value
}

function createApiError(payload, fallbackMessage) {
  const error = new Error(payload?.error?.message || payload?.message || fallbackMessage)
  error.status = Number(payload?.error?.code || payload?.code || 0)
  error.code = String(payload?.error?.status || payload?.status || '')
  return error
}

async function callFirestoreAdmin(path, init = {}) {
  const token = await getFirestoreAdminAccessToken()
  const response = await fetch(`${FIRESTORE_ADMIN_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw createApiError(payload, `Firestore Admin request failed with ${response.status}`)
  }

  return payload
}

function isAlreadyExistsError(error) {
  return (
    Number(error?.status) === 409
    || String(error?.code || '').toUpperCase() === 'ALREADY_EXISTS'
    || /already exists/i.test(String(error?.message || ''))
  )
}

function getCompositeIndexPath(projectId, collectionGroup) {
  return `/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(FIRESTORE_DATABASE_ID)}/collectionGroups/${encodeURIComponent(collectionGroup)}/indexes`
}

function getFieldOverridePath(projectId, collectionGroup, fieldPath) {
  return `/v1beta2/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(FIRESTORE_DATABASE_ID)}/collectionGroups/${encodeURIComponent(collectionGroup)}/fields/${encodeURIComponent(fieldPath)}?updateMask=indexConfig`
}

export async function loadFirestoreIndexManifest() {
  const manifestPath = path.join(process.cwd(), 'firestore.indexes.json')
  const payload = JSON.parse(await readFile(manifestPath, 'utf8'))

  return {
    indexes: Array.isArray(payload?.indexes) ? payload.indexes : [],
    fieldOverrides: Array.isArray(payload?.fieldOverrides) ? payload.fieldOverrides : [],
  }
}

export async function syncFirestoreIndexes() {
  const projectId = getFirebaseProjectId()
  if (!projectId) {
    throw new Error('Firebase project ID is not configured')
  }

  const manifest = await loadFirestoreIndexManifest()
  const summary = {
    projectId,
    composite: {
      requested: manifest.indexes.length,
      submitted: 0,
      existing: 0,
      failed: 0,
      operations: [],
    },
    fieldOverrides: {
      requested: manifest.fieldOverrides.length,
      submitted: 0,
      failed: 0,
      operations: [],
    },
  }

  for (const index of manifest.indexes) {
    const operationLabel = `${index.collectionGroup}:${index.fields.map(field => field.fieldPath).join(',')}`

    try {
      const operation = await callFirestoreAdmin(getCompositeIndexPath(projectId, index.collectionGroup), {
        method: 'POST',
        body: JSON.stringify({
          queryScope: String(index.queryScope || 'COLLECTION'),
          fields: (Array.isArray(index.fields) ? index.fields : []).map(normalizeIndexField),
        }),
      })

      summary.composite.submitted += 1
      summary.composite.operations.push({
        label: operationLabel,
        state: 'submitted',
        operationName: operation?.name || '',
      })
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        summary.composite.existing += 1
        summary.composite.operations.push({
          label: operationLabel,
          state: 'existing',
          message: String(error.message || 'Index already exists'),
        })
        continue
      }

      summary.composite.failed += 1
      summary.composite.operations.push({
        label: operationLabel,
        state: 'failed',
        message: String(error instanceof Error ? error.message : error),
      })
    }
  }

  for (const override of manifest.fieldOverrides) {
    const operationLabel = `${override.collectionGroup}:${override.fieldPath}`

    try {
      const operation = await callFirestoreAdmin(
        getFieldOverridePath(projectId, override.collectionGroup, override.fieldPath),
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: `projects/${projectId}/databases/${FIRESTORE_DATABASE_ID}/collectionGroups/${override.collectionGroup}/fields/${override.fieldPath}`,
            indexConfig: {
              indexes: (Array.isArray(override.indexes) ? override.indexes : []).map(index => ({
                queryScope: String(index.queryScope || 'COLLECTION'),
                ...normalizeIndexField(index),
              })),
            },
          }),
        },
      )

      summary.fieldOverrides.submitted += 1
      summary.fieldOverrides.operations.push({
        label: operationLabel,
        state: 'submitted',
        operationName: operation?.name || '',
      })
    } catch (error) {
      summary.fieldOverrides.failed += 1
      summary.fieldOverrides.operations.push({
        label: operationLabel,
        state: 'failed',
        message: String(error instanceof Error ? error.message : error),
      })
    }
  }

  return {
    ok: summary.composite.failed === 0 && summary.fieldOverrides.failed === 0,
    ...summary,
  }
}

export function summarizeFirestoreIndexSync(result) {
  const compositeSummary = `${result.composite.submitted} submitted, ${result.composite.existing} existing`
  const fieldSummary = `${result.fieldOverrides.submitted} field updates`
  const failedCount = result.composite.failed + result.fieldOverrides.failed

  if (failedCount === 0) {
    return `Index sync submitted. Composite: ${compositeSummary}. Field overrides: ${fieldSummary}.`
  }

  const operations = [
    ...(result.composite?.operations || []),
    ...(result.fieldOverrides?.operations || []),
  ]
  const failedOperations = operations.filter(op => op?.state === 'failed')
  const permissionDeniedCount = failedOperations.filter(op => /permission/i.test(String(op?.message || ''))).length
  const allPermissionDenied = failedOperations.length > 0 && permissionDeniedCount === failedOperations.length

  if (allPermissionDenied) {
    return (
      `Index sync finished with ${failedCount} failures (permission denied). `
      + `Grant the server identity an index-admin role (for example \`roles/datastore.indexAdmin\`) or deploy with `
      + `\`firebase deploy --only firestore:indexes\` using an authorized account.`
    )
  }

  return `Index sync finished with ${failedCount} failures. Composite: ${compositeSummary}. Field overrides: ${fieldSummary}.`
}


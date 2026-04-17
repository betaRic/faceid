import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

let cachedServiceAccount = null
let parsedServiceAccount = false

export function readFirebaseServiceAccount() {
  if (!parsedServiceAccount) {
    parsedServiceAccount = true
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        cachedServiceAccount = {
          ...parsed,
          private_key: parsed.private_key?.replace(/\\n/g, '\n'),
        }
      } catch {
        cachedServiceAccount = null
      }
    }
  }

  return cachedServiceAccount
}

export function getFirebaseProjectId() {
  return readFirebaseServiceAccount()?.project_id || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || ''
}

function getFirebaseAdminApp() {
  const serviceAccount = readFirebaseServiceAccount()
  if (!serviceAccount) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured')
  }

  return getApps().length
    ? getApp()
    : initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      })
}

export function getAdminDb() {
  const db = getFirestore(getFirebaseAdminApp())
  db.settings({ preferRest: true })
  return db
}

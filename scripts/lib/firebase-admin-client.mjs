import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { parseFirebaseServiceAccount } from '../../lib/firebase-service-account.js'

let cachedServiceAccount = null
let parsedServiceAccount = false

export function readFirebaseServiceAccount() {
  if (!parsedServiceAccount) {
    parsedServiceAccount = true
    cachedServiceAccount = parseFirebaseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
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

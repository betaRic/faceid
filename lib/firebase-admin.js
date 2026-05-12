import 'server-only'

import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { parseFirebaseServiceAccount } from './firebase-service-account'

let _cachedServiceAccount = null
let _parseAttempted = false

function getCachedServiceAccount() {
  if (!_parseAttempted) {
    _parseAttempted = true
    _cachedServiceAccount = parseFirebaseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  }
  return _cachedServiceAccount
}

export function firebaseAdminConfigured() {
  return Boolean(getCachedServiceAccount())
}

export function readFirebaseServiceAccount() {
  return getCachedServiceAccount()
}

export function getFirebaseProjectId() {
  return getCachedServiceAccount()?.project_id || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || ''
}

export function getAdminDb() {
  const app = getFirebaseAdminApp()
  return getFirestore(app)
}

export function getAdminAuth() {
  const app = getFirebaseAdminApp()
  return getAuth(app)
}

function getFirebaseAdminApp() {
  const serviceAccount = getCachedServiceAccount()
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


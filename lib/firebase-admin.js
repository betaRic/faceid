import 'server-only'

import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

let _cachedServiceAccount = null
let _parseAttempted = false

function getCachedServiceAccount() {
  if (!_parseAttempted) {
    _parseAttempted = true
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        _cachedServiceAccount = {
          ...parsed,
          private_key: parsed.private_key?.replace(/\\n/g, '\n'),
        }
      } catch {
        _cachedServiceAccount = null
      }
    }
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


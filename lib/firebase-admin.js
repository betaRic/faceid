import 'server-only'

import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

function readServiceAccount() {
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

export function firebaseAdminConfigured() {
  return Boolean(readServiceAccount())
}

export function getAdminDb() {
  const serviceAccount = readServiceAccount()
  if (!serviceAccount) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured')
  }

  const app = getApps().length
    ? getApp()
    : initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      })

  return getFirestore(app)
}

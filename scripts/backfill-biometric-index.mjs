import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

function readServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured')
  }

  const parsed = JSON.parse(raw)
  return {
    ...parsed,
    private_key: parsed.private_key?.replace(/\\n/g, '\n'),
  }
}

function getDb() {
  const serviceAccount = readServiceAccount()
  const app = getApps().length
    ? getApp()
    : initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      })

  return getFirestore(app)
}

function safeArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeDescriptor(descriptor) {
  const vector = safeArray(descriptor).map(Number)
  const magnitude = Math.sqrt(vector.reduce((total, value) => total + (value * value), 0))
  if (!magnitude) return vector.map(() => 0)
  return vector.map(value => value / magnitude)
}

function descriptorBucket(normalizedDescriptor, dimensions) {
  return dimensions
    .map(index => (Number(normalizedDescriptor[index] || 0) >= 0 ? '1' : '0'))
    .join('')
}

const BUCKET_DIMENSIONS_A = [0, 7, 15, 23, 31, 39, 47, 55, 63, 71, 79, 87]
const BUCKET_DIMENSIONS_B = [3, 11, 19, 27, 35, 43, 51, 59, 67, 75, 83, 91]

async function main() {
  const db = getDb()
  const personsSnapshot = await db.collection('persons').get()
  let indexedSamples = 0

  for (const personRecord of personsSnapshot.docs) {
    const person = personRecord.data()
    const descriptors = safeArray(person.descriptors)
    const batch = db.batch()

    descriptors.forEach((descriptor, sampleIndex) => {
      const normalizedDescriptor = normalizeDescriptor(descriptor)
      const bucketA = descriptorBucket(normalizedDescriptor, BUCKET_DIMENSIONS_A)
      const bucketB = descriptorBucket(normalizedDescriptor, BUCKET_DIMENSIONS_B)

      batch.set(db.collection('biometric_index').doc(`${personRecord.id}_${sampleIndex}`), {
        personId: personRecord.id,
        sampleIndex,
        employeeId: String(person.employeeId || ''),
        name: String(person.name || ''),
        officeId: String(person.officeId || ''),
        officeName: String(person.officeName || ''),
        active: person.active !== false,
        descriptor: safeArray(descriptor).map(Number),
        normalizedDescriptor,
        bucketA,
        bucketB,
        updatedAt: new Date().toISOString(),
      }, { merge: true })
    })

    await batch.commit()
    indexedSamples += descriptors.length
  }

  console.log(`Indexed ${indexedSamples} biometric samples from ${personsSnapshot.size} person records.`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack : error)
  process.exit(1)
})

import 'server-only'
import { getStorage } from 'firebase-admin/storage'

export function getEnrollmentPhotoPath(personId) {
  return `enrollment-photos/${personId}.jpg`
}

export async function uploadEnrollmentPhoto(bucketName, personId, dataUrl) {
  const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64Data, 'base64')
  const storage = getStorage()
  const bucket = storage.bucket(bucketName)
  const file = bucket.file(getEnrollmentPhotoPath(personId))
  await file.save(buffer, {
    contentType: 'image/jpeg',
    resumable: false,
    metadata: {
      cacheControl: 'private, max-age=0, no-transform',
    },
  })
  return { path: file.name, contentType: 'image/jpeg' }
}

export async function readEnrollmentPhoto(bucketName, personId, photoPath = '') {
  const storage = getStorage()
  const bucket = storage.bucket(bucketName)
  const defaultPath = getEnrollmentPhotoPath(personId)
  const candidatePaths = Array.from(new Set([String(photoPath || '').trim(), defaultPath].filter(Boolean)))

  for (const candidatePath of candidatePaths) {
    const file = bucket.file(candidatePath)
    const [exists] = await file.exists()
    if (!exists) continue

    const [buffer] = await file.download()
    const [metadata] = await file.getMetadata().catch(() => [{ contentType: 'image/jpeg' }])
    return {
      buffer,
      path: candidatePath,
      contentType: metadata?.contentType || 'image/jpeg',
    }
  }

  return null
}

export async function deleteEnrollmentPhoto(bucketName, personId) {
  const storage = getStorage()
  const bucket = storage.bucket(bucketName)
  const candidatePaths = Array.from(new Set([
    getEnrollmentPhotoPath(personId),
    `enrollment-photos/${personId}`,
  ]))

  let deleted = false
  for (const candidatePath of candidatePaths) {
    const file = bucket.file(candidatePath)
    try {
      await file.delete({ ignoreNotFound: true })
      deleted = true
    } catch {
      // Non-fatal: try the next legacy path.
    }
  }

  return deleted
}


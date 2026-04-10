import 'server-only'
import { getStorage } from 'firebase-admin/storage'

export async function uploadEnrollmentPhoto(bucketName, personId, dataUrl) {
  const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64Data, 'base64')
  const storage = getStorage()
  const bucket = storage.bucket(bucketName)
  const file = bucket.file(`enrollment-photos/${personId}.jpg`)
  await file.save(buffer, { contentType: 'image/jpeg', public: true })
  await file.makePublic()
  return file.publicUrl()
}

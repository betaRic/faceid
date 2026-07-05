import fs from 'fs/promises'
import path from 'path'
import { queryPostgres } from './client'

function getStorageRoot() {
  const configured = String(process.env.LOCAL_FILE_STORAGE_DIR || '').trim()
  return configured || '.local-files'
}

function getEnrollmentPhotoDir() {
  return path.join(/*turbopackIgnore: true*/ getStorageRoot(), 'photos', 'enrollments')
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  }
}

function extensionForContentType(contentType) {
  if (contentType === 'image/png') return 'png'
  if (contentType === 'image/webp') return 'webp'
  return 'jpg'
}

export async function saveLocalEnrollmentPhoto(personId, dataUrl) {
  const parsed = parseDataUrl(dataUrl)
  if (!personId || !parsed?.buffer?.length) return null

  const directory = getEnrollmentPhotoDir()
  await fs.mkdir(directory, { recursive: true })
  const extension = extensionForContentType(parsed.contentType)
  const fileName = `${personId}.${extension}`
  const absolutePath = path.join(/*turbopackIgnore: true*/ directory, fileName)
  await fs.writeFile(absolutePath, parsed.buffer)

  const relativePath = path.join(/*turbopackIgnore: true*/ 'photos', 'enrollments', fileName).replace(/\\/g, '/')
  await queryPostgres(
    `
      UPDATE persons
      SET photo_path = $2,
          photo_content_type = $3,
          photo_url = NULL,
          updated_at = now()
      WHERE id = $1
    `,
    [personId, relativePath, parsed.contentType],
  )
  return { path: relativePath, contentType: parsed.contentType }
}

export async function readLocalEnrollmentPhoto(person = {}) {
  const photoPath = String(person.photoPath || person.photo_path || '').trim()
  if (!photoPath) return null
  const normalizedRelative = photoPath.replace(/\//g, path.sep)
  const absolutePath = path.resolve(/*turbopackIgnore: true*/ getStorageRoot(), normalizedRelative)
  const root = path.resolve(/*turbopackIgnore: true*/ getStorageRoot())
  if (!absolutePath.startsWith(root)) return null
  const buffer = await fs.readFile(absolutePath)
  return {
    buffer,
    contentType: person.photoContentType || person.photo_content_type || 'image/jpeg',
  }
}

export async function deleteLocalEnrollmentPhoto(person = {}) {
  const photoPath = String(person.photoPath || person.photo_path || '').trim()
  if (!photoPath) return false
  const absolutePath = path.resolve(/*turbopackIgnore: true*/ getStorageRoot(), photoPath.replace(/\//g, path.sep))
  const root = path.resolve(/*turbopackIgnore: true*/ getStorageRoot())
  if (!absolutePath.startsWith(root)) return false
  try {
    await fs.unlink(absolutePath)
    return true
  } catch {
    return false
  }
}

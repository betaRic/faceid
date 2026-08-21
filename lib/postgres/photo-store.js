import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { queryPostgres } from './client'
import { normalizeDataImage } from '@/lib/images/safe-data-image'

export function getLocalFileStorageRoot() {
  const configured = String(process.env.LOCAL_FILE_STORAGE_DIR || '').trim()
  // Keep enrollment images outside .next. Hosting deployments replace .next,
  // while App_Data is an IIS/SmartASP-friendly persistent application folder.
  const storageRoot = configured || path.join('App_Data', 'veriface-files')
  // The location is an operator-controlled persistent directory, not a build
  // dependency. Prevent Turbopack from tracing the application tree into a
  // hosting package while preserving the runtime containment checks below.
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), storageRoot)
}

function getReadableStorageRoots() {
  const currentRoot = getLocalFileStorageRoot()
  // Keep previously saved photos visible after moving a deployed server from
  // the old implicit .local-files directory to the persistent App_Data folder.
  const legacyRoot = path.resolve(/* turbopackIgnore: true */ process.cwd(), '.local-files')
  return currentRoot === legacyRoot ? [currentRoot] : [currentRoot, legacyRoot]
}

function resolvePhotoPath(root, relativePath) {
  const absolutePath = path.resolve(/*turbopackIgnore: true*/ root, relativePath.replace(/\//g, path.sep))
  const relativeToRoot = path.relative(root, absolutePath)
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) return null
  return absolutePath
}

function getEnrollmentPhotoDir() {
  return path.join(/*turbopackIgnore: true*/ getLocalFileStorageRoot(), 'photos', 'enrollments')
}

export async function saveNormalizedEnrollmentPhoto(personId, normalized, { client } = {}) {
  if (!personId) throw new Error('Cannot save enrollment photo: employee record ID is missing.')
  if (
    !Buffer.isBuffer(normalized?.buffer)
    || normalized.buffer.length === 0
    || normalized.extension !== '.jpg'
    || normalized.mimeType !== 'image/jpeg'
  ) {
    throw new Error('Cannot save enrollment photo: normalized JPEG bytes are required.')
  }

  const database = client || { query: queryPostgres }
  const existing = await database.query(
    'SELECT photo_path FROM persons WHERE id = $1 LIMIT 1',
    [personId],
  )
  if (existing.rowCount !== 1) {
    throw new Error('Cannot save enrollment photo: employee record was not found.')
  }

  const previousPath = String(existing.rows[0]?.photo_path || '').trim()
  const previousAbsolutePath = previousPath
    ? resolvePhotoPath(getLocalFileStorageRoot(), previousPath)
    : null
  const directory = getEnrollmentPhotoDir()
  await fs.mkdir(directory, { recursive: true })
  const fileName = `${crypto.randomUUID()}.jpg`
  const absolutePath = path.join(/*turbopackIgnore: true*/ directory, fileName)
  const temporaryPath = `${absolutePath}.${process.pid}.${Date.now()}.tmp`
  try {
    // A temporary file prevents the employee directory from exposing a partial
    // image if the process is interrupted while a camera capture is being saved.
    await fs.writeFile(temporaryPath, normalized.buffer)
    await fs.rename(temporaryPath, absolutePath)
  } catch (error) {
    await fs.unlink(temporaryPath).catch(() => {})
    const detail = error instanceof Error ? error.message : 'Unknown filesystem error.'
    throw new Error(`Cannot save enrollment photo in ${getLocalFileStorageRoot()}: ${detail}`)
  }

  const relativePath = path.join(/*turbopackIgnore: true*/ 'photos', 'enrollments', fileName).replace(/\\/g, '/')
  const cleanup = async () => fs.unlink(absolutePath).catch(() => {})
  let finalized = false
  const finalize = async () => {
    if (finalized) return
    finalized = true
    if (previousAbsolutePath && previousAbsolutePath !== absolutePath) {
      await fs.unlink(previousAbsolutePath).catch(() => {})
    }
  }
  try {
    const update = await database.query(
      `
        UPDATE persons
        SET photo_path = $2,
            photo_content_type = $3,
            photo_url = NULL,
            updated_at = now()
        WHERE id = $1
      `,
      [personId, relativePath, normalized.mimeType],
    )
    if (update.rowCount !== 1) {
      throw new Error('Cannot save enrollment photo: employee record was not found.')
    }
  } catch (error) {
    await fs.unlink(absolutePath).catch(() => {})
    throw error
  }
  if (!client) await finalize()
  return {
    path: relativePath,
    contentType: normalized.mimeType,
    cleanup,
    finalize,
  }
}

export async function saveLocalEnrollmentPhoto(personId, dataUrl, options) {
  const normalized = await normalizeDataImage(dataUrl)
  return saveNormalizedEnrollmentPhoto(personId, normalized, options)
}

export async function readLocalEnrollmentPhoto(person = {}) {
  const photoPath = String(person.photoPath || person.photo_path || '').trim()
  if (!photoPath) return null
  for (const root of getReadableStorageRoots()) {
    const absolutePath = resolvePhotoPath(root, photoPath)
    if (!absolutePath) return null
    try {
      const buffer = await fs.readFile(/* turbopackIgnore: true */ absolutePath)
      return {
        buffer,
        contentType: person.photoContentType || person.photo_content_type || 'image/jpeg',
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  return null
}

export async function deleteLocalEnrollmentPhoto(person = {}) {
  const photoPath = String(person.photoPath || person.photo_path || '').trim()
  if (!photoPath) return false
  for (const root of getReadableStorageRoots()) {
    const absolutePath = resolvePhotoPath(root, photoPath)
    if (!absolutePath) return false
    try {
      await fs.unlink(absolutePath)
      return true
    } catch (error) {
      if (error?.code !== 'ENOENT') return false
    }
  }
  return false
}

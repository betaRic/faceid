import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { queryPostgres, withPostgresTransaction } from './client'
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

export async function processEnrollmentPhotoDeletionJobs({ personId = '', limit = 25 } = {}) {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(limit) || 25)))
  const normalizedPersonId = String(personId || '').trim()
  const claimToken = crypto.randomUUID()
  const jobs = await withPostgresTransaction(client => client.query(
    `
      WITH candidates AS (
        SELECT id
        FROM enrollment_photo_deletion_jobs
        WHERE ($1::text = '' OR person_id = $1)
          AND (claimed_at IS NULL OR claimed_at < now() - interval '5 minutes')
        ORDER BY created_at, id
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE enrollment_photo_deletion_jobs AS job
      SET claim_token = $3, claimed_at = now()
      FROM candidates
      WHERE job.id = candidates.id
      RETURNING job.id, job.person_id, job.photo_path
    `,
    [normalizedPersonId, safeLimit, claimToken],
  ))
  let completed = 0
  let failed = 0
  for (const job of jobs.rows) {
    try {
      const photoPath = String(job.photo_path || '').trim()
      if (!photoPath) throw Object.assign(new Error('Queued photo path is empty.'), { code: 'invalid_photo_path' })
      for (const root of getReadableStorageRoots()) {
        const absolutePath = resolvePhotoPath(root, photoPath)
        if (!absolutePath) throw Object.assign(new Error('Queued photo path is invalid.'), { code: 'invalid_photo_path' })
        await fs.unlink(absolutePath).catch(error => {
          if (error?.code !== 'ENOENT') throw error
        })
      }
      const removed = await queryPostgres(
        'DELETE FROM enrollment_photo_deletion_jobs WHERE id = $1 AND claim_token = $2',
        [job.id, claimToken],
      )
      if (removed.rowCount !== 1) {
        throw Object.assign(new Error('Photo cleanup lease was lost.'), { code: 'photo_cleanup_lease_lost' })
      }
      completed += 1
    } catch (error) {
      failed += 1
      await queryPostgres(
        `
          UPDATE enrollment_photo_deletion_jobs
          SET attempt_count = attempt_count + 1,
              last_attempt_at = now(),
              last_error = $2,
              claim_token = '',
              claimed_at = NULL
          WHERE id = $1 AND claim_token = $3
        `,
        [job.id, String(error?.code || 'photo_unlink_failed').slice(0, 120), claimToken],
      )
    }
  }
  const pending = await queryPostgres(
    `
      SELECT count(*)::integer AS count
      FROM enrollment_photo_deletion_jobs
      ${normalizedPersonId ? 'WHERE person_id = $1' : ''}
    `,
    normalizedPersonId ? [normalizedPersonId] : [],
  )
  return {
    attempted: jobs.rowCount,
    completed,
    failed,
    pending: Number(pending.rows[0]?.count || 0),
  }
}

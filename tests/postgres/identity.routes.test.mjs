import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { normalizeDataImage } from '../../lib/images/safe-data-image.js'
import { createPersonsPostHandler } from '../../lib/routes/persons-route.js'
import { closePostgresPool, queryPostgres } from '../../lib/postgres/client.js'
import { enrollLocalPerson } from '../../lib/postgres/person-store.js'
import {
  getLocalFileStorageRoot,
  saveNormalizedEnrollmentPhoto,
} from '../../lib/postgres/photo-store.js'
import { sameOriginRequest } from './route-request.mjs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const office = {
  id: 'office-route-test',
  name: 'Route Test Field Office',
  officeType: 'Field Office',
  divisions: [],
}
let registrationSequence = 0

before(async () => {
  await queryPostgres(`
    INSERT INTO offices (id, name, name_lower, office_type, divisions)
    VALUES ($1, $2, $3, $4, $5::jsonb)
  `, [office.id, office.name, office.name.toLowerCase(), office.officeType, '[]'])
})

after(async () => {
  await closePostgresPool()
})

async function pngDataUrl({ width = 2, height = 2 } = {}) {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 20, g: 80, b: 140, alpha: 1 },
    },
  }).png().toBuffer()
  return `data:image/png;base64,${buffer.toString('base64')}`
}

function registrationFixture({
  employeeId,
  lastName = 'Route',
  photoDataUrl,
} = {}) {
  const resolvedEmployeeId = employeeId || String(700000 + registrationSequence++)
  const phaseIds = ['center', 'center', 'side_a', 'side_a', 'side_b', 'side_b', 'chin_down', 'chin_down']
  return {
    profile: {
      employeeId: resolvedEmployeeId,
      lastName,
      firstName: 'Test',
      middleName: '',
      position: 'Tester',
      officeId: office.id,
      officeName: office.name,
      divisionId: '',
      photoDataUrl,
      privacyConsent: true,
      privacyNoticeVersion: '2026-07-28',
      captureMetadata: {
        phasesCaptured: ['center', 'side_a', 'side_b', 'chin_down'],
        genuinelyDiverse: true,
        keptCount: 8,
        phaseSampleCounts: { center: 2, side_a: 2, side_b: 2, chin_down: 2 },
      },
    },
    sampleFrames: phaseIds.map((phaseId, index) => ({
      phaseId,
      frameDataUrl: `data:image/jpeg;base64,AAA${index}`,
    })),
  }
}

async function deterministicEnrollmentPayload() {
  return {
    descriptors: Array.from({ length: 8 }, (_, sampleIndex) => (
      Array.from({ length: 128 }, (_, dimension) => (dimension === sampleIndex ? 1 : 0))
    )),
    captureMetadata: { qualityScore: 0.9 },
    biometricModelVersion: 'route-test-model-v1',
    diagnostics: {},
  }
}

function registrationHandler(overrides = {}) {
  return createPersonsPostHandler({
    buildAuthoritativeEnrollmentPayload: deterministicEnrollmentPayload,
    enrollLocalPerson,
    normalizeDataImage,
    writeTelemetry: async () => {},
    ...overrides,
  })
}

async function register(body, overrides) {
  return registrationHandler(overrides)(sameOriginRequest('/api/persons', {
    method: 'POST',
    body,
  }))
}

test('photo normalization rejects SVG and malformed image data', async () => {
  const disguisedSvg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2"/></svg>',
  ).toString('base64')
  await assert.rejects(
    normalizeDataImage('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='),
    error => error?.status === 400 && error?.code === 'invalid_enrollment_photo',
  )
  await assert.rejects(
    normalizeDataImage(`data:image/jpeg;base64,${disguisedSvg}`),
    error => error?.status === 400 && error?.code === 'invalid_enrollment_photo',
  )
  await assert.rejects(
    normalizeDataImage('data:image/jpeg;base64,not-valid-base64%%%'),
    error => error?.status === 400 && error?.code === 'invalid_enrollment_photo',
  )
})

test('photo normalization enforces decoded-byte and pixel limits', async () => {
  const dataUrl = await pngDataUrl()
  await assert.rejects(normalizeDataImage(dataUrl, { maxBytes: 1 }), /too large/i)
  await assert.rejects(normalizeDataImage(dataUrl, { maxPixels: 3 }), /dimension|pixel/i)
})

test('photo normalization returns server-encoded JPEG bytes', async () => {
  const normalized = await normalizeDataImage(await pngDataUrl())
  const metadata = await sharp(normalized.buffer).metadata()

  assert.equal(normalized.extension, '.jpg')
  assert.equal(normalized.mimeType, 'image/jpeg')
  assert.equal(metadata.format, 'jpeg')
  assert.equal(metadata.width, 2)
  assert.equal(metadata.height, 2)
})

test('registration photo rejects SVG and malformed image data without leaking internals', async () => {
  for (const photoDataUrl of [
    'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+',
    'data:image/jpeg;base64,not-valid-base64%%%',
  ]) {
    const response = await register(registrationFixture({ photoDataUrl }))
    const payload = await response.json()
    assert.equal(response.status, 400)
    assert.doesNotMatch(payload.message, /sharp|SQL|bind|D:\\|node_modules/i)
  }
})

test('saved profile photo is server-encoded JPEG', async () => {
  const employeeId = '812345'
  const response = await register(registrationFixture({
    employeeId,
    lastName: 'Jpeg',
    photoDataUrl: await pngDataUrl(),
  }))
  const payload = await response.json()
  assert.equal(response.status, 200, JSON.stringify(payload))

  const saved = await queryPostgres(
    'SELECT photo_path, photo_content_type FROM persons WHERE employee_id = $1',
    [employeeId],
  )
  assert.match(saved.rows[0]?.photo_path || '', /\.jpg$/)
  assert.equal(saved.rows[0]?.photo_content_type, 'image/jpeg')
  const audit = await queryPostgres(
    "SELECT count(*)::integer AS count FROM audit_logs WHERE target_id = $1 AND action = 'person_submission_create'",
    [payload.personId],
  )
  assert.equal(audit.rows[0]?.count, 1)
})

test('photo persistence removes a new file when database update fails', async () => {
  const personId = 'missing-photo-person'
  const normalized = await normalizeDataImage(await pngDataUrl())
  await assert.rejects(
    saveNormalizedEnrollmentPhoto(personId, normalized),
    /employee record was not found/i,
  )
  const file = path.join(getLocalFileStorageRoot(), 'photos', 'enrollments', `${personId}.jpg`)
  await assert.rejects(stat(file), /ENOENT/)
})

test('photo persistence preserves the previous file when database update fails', async () => {
  const personId = 'existing-photo-person'
  const relativePath = `photos/enrollments/${personId}.jpg`
  const existingFile = path.join(getLocalFileStorageRoot(), ...relativePath.split('/'))
  await mkdir(path.dirname(existingFile), { recursive: true })
  await writeFile(existingFile, 'previous-photo')
  const normalized = await normalizeDataImage(await pngDataUrl())
  const client = {
    async query(sql) {
      if (/SELECT photo_path/i.test(sql)) {
        return { rowCount: 1, rows: [{ photo_path: relativePath }] }
      }
      throw new Error('forced update failure')
    },
  }

  await assert.rejects(
    saveNormalizedEnrollmentPhoto(personId, normalized, { client }),
    /forced update failure/,
  )
  assert.equal((await readFile(existingFile, 'utf8')), 'previous-photo')
})

test('public error response hides database and filesystem details', async () => {
  const response = await register(
    registrationFixture({ photoDataUrl: await pngDataUrl() }),
    {
      enrollLocalPerson: async () => {
        throw Object.assign(
          new Error('bind SQL failed in D:\\app\\node_modules\\pg'),
          { code: 'internal_database_failure' },
        )
      },
    },
  )
  const payload = await response.json()
  assert.equal(response.status, 500)
  assert.equal(payload.message, 'Registration could not be completed. Please try again or contact HR.')
  assert.doesNotMatch(JSON.stringify(payload), /bind|SQL|D:\\|node_modules/i)
})

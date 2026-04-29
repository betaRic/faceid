#!/usr/bin/env node

import { FieldValue } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { loadRepoEnv } from './lib/load-local-env.mjs'
import { getAdminDb } from './lib/firebase-admin-client.mjs'
import {
  OPENVINO_RETAIL_MODEL_VERSION,
  cosineDistance,
  generateOpenVinoRetailEmbedding,
} from '../lib/biometrics/openvino-retail-embedding.js'

loadRepoEnv()

const PERSON_BIOMETRICS_COLLECTION = 'person_biometrics'

function boolEnv(name, fallback = false) {
  const value = process.env[name]
  if (value == null || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase())
}

function positiveIntegerEnv(name, fallback) {
  const numeric = Math.floor(Number(process.env[name]))
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback
}

function numberEnv(name, fallback) {
  const numeric = Number(process.env[name])
  return Number.isFinite(numeric) ? numeric : fallback
}

function getArgValue(name) {
  const prefix = `${name}=`
  const match = process.argv.slice(2).find(arg => arg === name || arg.startsWith(prefix))
  if (!match) return null
  if (match === name) return 'true'
  return match.slice(prefix.length)
}

function getEffectiveApprovalStatus(person = {}) {
  return String(person.approvalStatus || 'approved').trim().toLowerCase() || 'approved'
}

function getPhotoCandidatePaths(personId, person = {}) {
  return Array.from(new Set([
    String(person.photoPath || '').trim(),
    `enrollment-photos/${personId}.jpg`,
    `enrollment-photos/${personId}`,
  ].filter(Boolean)))
}

function sanitizeVector(vector) {
  return Array.isArray(vector)
    ? vector.map(Number).filter(Number.isFinite)
    : []
}

function normalizeOpenVinoProfileSamples(value) {
  return (Array.isArray(value) ? value : [])
    .map(sample => {
      const source = sample && typeof sample === 'object' ? sample : {}
      const vector = sanitizeVector(source.vector || source.descriptor)
      if (vector.length !== 256) return null
      return {
        vector,
        modelVersion: String(source.modelVersion || '').slice(0, 80),
        distanceMetric: String(source.distanceMetric || 'cosine').slice(0, 20),
        source: String(source.source || 'openvino_photo_backfill').slice(0, 80),
        capturedAt: Number.isFinite(source.capturedAt) ? Number(source.capturedAt) : null,
        frameIndex: Number.isFinite(source.frameIndex) ? Number(source.frameIndex) : null,
        faceScore: Number.isFinite(source.faceScore) ? Number(source.faceScore) : null,
        performanceMs: Number.isFinite(source.performanceMs) ? Number(source.performanceMs) : null,
      }
    })
    .filter(Boolean)
}

function sampleTooClose(candidate, existing, minCosineDiversity) {
  return existing.some(sample => cosineDistance(sample.vector, candidate.vector) < minCosineDiversity)
}

async function readEnrollmentPhoto(bucket, personId, person) {
  for (const candidatePath of getPhotoCandidatePaths(personId, person)) {
    const file = bucket.file(candidatePath)
    const [exists] = await file.exists()
    if (!exists) continue
    const [buffer] = await file.download()
    return { buffer, path: candidatePath }
  }
  return null
}

async function writeOpenVinoProfileSamples(db, { personId, person, samples, maxSamples, minCosineDiversity }) {
  const normalizedIncoming = normalizeOpenVinoProfileSamples(samples)
  if (normalizedIncoming.length === 0) return { ok: false, reason: 'no_valid_openvino_samples' }

  const biometricsRef = db.collection(PERSON_BIOMETRICS_COLLECTION).doc(personId)
  const personRef = db.collection('persons').doc(personId)

  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(biometricsRef)
    const data = snapshot.exists ? snapshot.data() : {}
    const existing = normalizeOpenVinoProfileSamples(data?.openvinoEmbeddings)
    const accepted = [...existing]

    for (const sample of normalizedIncoming) {
      if (accepted.length >= maxSamples) break
      if (sampleTooClose(sample, accepted, minCosineDiversity)) continue
      accepted.push(sample)
    }

    if (accepted.length === existing.length) {
      return { ok: false, reason: 'samples_not_diverse_enough', sampleCount: existing.length }
    }

    const trimmed = accepted.slice(0, maxSamples)
    const status = trimmed.length >= maxSamples ? 'ready' : 'collecting'
    const profile = {
      status,
      modelVersion: OPENVINO_RETAIL_MODEL_VERSION,
      distanceMetric: 'cosine',
      source: 'mixed_shadow_and_photo_backfill',
      sampleCount: trimmed.length,
      targetSampleCount: maxSamples,
      updatedAt: FieldValue.serverTimestamp(),
    }

    transaction.set(biometricsRef, {
      personId,
      employeeId: String(person.employeeId || ''),
      name: String(person.name || ''),
      officeId: String(person.officeId || ''),
      officeName: String(person.officeName || ''),
      active: person.active !== false,
      approvalStatus: getEffectiveApprovalStatus(person),
      openvinoProfile: profile,
      openvinoEmbeddings: trimmed,
      openvinoUpdatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })

    transaction.set(personRef, {
      openvinoProfileStatus: status,
      openvinoProfileSampleCount: trimmed.length,
      openvinoProfileModelVersion: OPENVINO_RETAIL_MODEL_VERSION,
      openvinoProfileUpdatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })

    return { ok: true, status, sampleCount: trimmed.length }
  })
}

const bucketName = String(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || '').trim()
if (!bucketName) {
  throw new Error('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET or FIREBASE_STORAGE_BUCKET is required for photo backfill.')
}

const maxSamples = positiveIntegerEnv('OPENVINO_PROFILE_MAX_SAMPLES', 6)
const minCosineDiversity = numberEnv('OPENVINO_SHADOW_MIN_COSINE_DIVERSITY', 0.015)
const limitArg = Number(getArgValue('--limit') || process.env.OPENVINO_PHOTO_BACKFILL_LIMIT || 0)
const limit = Number.isFinite(limitArg) && limitArg > 0 ? Math.floor(limitArg) : Infinity
const dryRun = boolEnv('OPENVINO_PHOTO_BACKFILL_DRY_RUN', false) || getArgValue('--dry-run') === 'true'

const db = getAdminDb()
const bucket = getStorage().bucket(bucketName)
const snapshot = await db.collection('persons')
  .select(
    'employeeId',
    'name',
    'officeId',
    'officeName',
    'active',
    'approvalStatus',
    'photoPath',
    'openvinoProfileSampleCount',
  )
  .get()

const results = []
let scanned = 0
let processed = 0
let updated = 0
let skipped = 0
let failed = 0

for (const record of snapshot.docs) {
  if (processed >= limit) break
  scanned += 1
  const person = record.data() || {}
  const activeApproved = person.active !== false && getEffectiveApprovalStatus(person) === 'approved'
  if (!activeApproved) continue

  processed += 1
  const existingCount = Number(person.openvinoProfileSampleCount)
  if (Number.isFinite(existingCount) && existingCount >= maxSamples) {
    skipped += 1
    results.push({ personId: record.id, employeeId: person.employeeId || '', ok: false, reason: 'profile_already_full' })
    continue
  }

  try {
    const photo = await readEnrollmentPhoto(bucket, record.id, person)
    if (!photo) {
      skipped += 1
      results.push({ personId: record.id, employeeId: person.employeeId || '', ok: false, reason: 'photo_not_found' })
      continue
    }

    const embedding = await generateOpenVinoRetailEmbedding(photo.buffer)
    if (!embedding.ok) {
      skipped += 1
      results.push({
        personId: record.id,
        employeeId: person.employeeId || '',
        ok: false,
        reason: embedding.decisionCode || 'openvino_embedding_failed',
        photoPath: photo.path,
      })
      continue
    }

    if (dryRun) {
      updated += 1
      results.push({
        personId: record.id,
        employeeId: person.employeeId || '',
        ok: true,
        dryRun: true,
        photoPath: photo.path,
        descriptorLength: embedding.descriptorLength,
      })
      continue
    }

    const writeResult = await writeOpenVinoProfileSamples(db, {
      personId: record.id,
      person,
      maxSamples,
      minCosineDiversity,
      samples: [{
        vector: embedding.descriptor,
        modelVersion: embedding.modelVersion || OPENVINO_RETAIL_MODEL_VERSION,
        distanceMetric: embedding.distanceMetric || 'cosine',
        source: 'openvino_photo_backfill',
        capturedAt: Date.now(),
        frameIndex: 0,
        faceScore: Number(embedding.face?.score || 0),
        performanceMs: Number(embedding.performanceMs || 0),
      }],
    })

    if (writeResult.ok) updated += 1
    else skipped += 1
    results.push({
      personId: record.id,
      employeeId: person.employeeId || '',
      ok: Boolean(writeResult.ok),
      reason: writeResult.reason || '',
      status: writeResult.status || '',
      sampleCount: writeResult.sampleCount ?? null,
      photoPath: photo.path,
    })
  } catch (error) {
    failed += 1
    results.push({
      personId: record.id,
      employeeId: person.employeeId || '',
      ok: false,
      reason: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

console.log(JSON.stringify({
  ok: failed === 0,
  dryRun,
  checkedAt: new Date().toISOString(),
  scanned,
  processed,
  updated,
  skipped,
  failed,
  maxSamples,
  minCosineDiversity,
  results,
}, null, 2))

if (failed > 0) {
  process.exit(1)
}

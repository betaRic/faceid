import * as faceapi from '@vladmandic/face-api'
import { STORAGE_KEY, ATTENDANCE_KEY, DISTANCE_THRESHOLD } from './config'

let modelsLoaded = false

export async function loadModels(onProgress) {
  if (modelsLoaded) return
  onProgress?.('Loading detection model…')
  await faceapi.nets.ssdMobilenetv1.loadFromUri('/models')
  onProgress?.('Loading landmark model…')
  await faceapi.nets.faceLandmark68Net.loadFromUri('/models')
  onProgress?.('Loading recognition model…')
  await faceapi.nets.faceRecognitionNet.loadFromUri('/models')
  modelsLoaded = true
  onProgress?.('Ready')
}

export async function detectWithDescriptors(input) {
  return faceapi
    .detectAllFaces(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptors()
}

export async function detectSingleDescriptor(input) {
  const result = await faceapi
    .detectSingleFace(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor()
  return result || null
}

// ── Persons persistence ──────────────────────────────────────────────────────
export function loadRegisteredPersons() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw).map(p => ({
      ...p,
      descriptors: p.descriptors.map(d => new Float32Array(d)),
    }))
  } catch { return [] }
}

export function saveRegisteredPersons(persons) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(
    persons.map(p => ({ ...p, descriptors: p.descriptors.map(d => Array.from(d)) }))
  ))
}

// ── Attendance persistence ───────────────────────────────────────────────────
export function loadAttendance() {
  try { return JSON.parse(localStorage.getItem(ATTENDANCE_KEY) || '[]') } catch { return [] }
}

export function saveAttendance(log) {
  // keep last 500 entries
  localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(log.slice(-500)))
}

// ── Matching ─────────────────────────────────────────────────────────────────
export function buildMatcher(persons) {
  if (!persons.length) return null
  return new faceapi.FaceMatcher(
    persons.map(p => new faceapi.LabeledFaceDescriptors(p.name, p.descriptors)),
    DISTANCE_THRESHOLD
  )
}

export function matchDescriptor(matcher, descriptor) {
  if (!matcher) return { identified: false }
  const best = matcher.findBestMatch(descriptor)
  if (best.label === 'unknown') return { identified: false, distance: best.distance }
  return {
    identified: true,
    name: best.label,
    distance: best.distance,
    confidence: 1 - best.distance,
  }
}

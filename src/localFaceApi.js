/**
 * localFaceApi.js
 * Uses @vladmandic/face-api (face-api.js) for local face recognition.
 * No server approval required — runs entirely in the browser.
 *
 * Models used:
 *  - ssdMobilenetv1      : face detection
 *  - faceLandmark68Net   : landmark detection
 *  - faceRecognitionNet  : 128-d face descriptor
 */

import * as faceapi from '@vladmandic/face-api'
import { STORAGE_KEY } from './config'

let modelsLoaded = false

export async function loadModels(onProgress) {
  if (modelsLoaded) return
  onProgress?.('Loading face detection model…')
  await faceapi.nets.ssdMobilenetv1.loadFromUri('/models')
  onProgress?.('Loading landmark model…')
  await faceapi.nets.faceLandmark68Net.loadFromUri('/models')
  onProgress?.('Loading recognition model…')
  await faceapi.nets.faceRecognitionNet.loadFromUri('/models')
  modelsLoaded = true
  onProgress?.('Models ready')
}

// Detect all faces + descriptors from a canvas/video element
export async function detectWithDescriptors(input) {
  return faceapi
    .detectAllFaces(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptors()
}

// Detect a single face descriptor from a canvas/video element
export async function detectSingleDescriptor(input) {
  const result = await faceapi
    .detectSingleFace(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor()
  return result || null
}

// ─── Persistence (localStorage) ───────────────────────────────────────────────

export function loadRegisteredPersons() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    // Restore Float32Array descriptors from plain arrays
    return parsed.map(p => ({
      ...p,
      descriptors: p.descriptors.map(d => new Float32Array(d)),
    }))
  } catch {
    return []
  }
}

export function saveRegisteredPersons(persons) {
  const serializable = persons.map(p => ({
    ...p,
    descriptors: p.descriptors.map(d => Array.from(d)),
  }))
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable))
}

// ─── Matching ─────────────────────────────────────────────────────────────────

const DISTANCE_THRESHOLD = 0.5  // lower = stricter match

export function buildMatcher(persons) {
  if (persons.length === 0) return null
  const labeled = persons.map(
    p => new faceapi.LabeledFaceDescriptors(p.name, p.descriptors)
  )
  return new faceapi.FaceMatcher(labeled, DISTANCE_THRESHOLD)
}

export function matchDescriptor(matcher, descriptor) {
  if (!matcher) return null
  const best = matcher.findBestMatch(descriptor)
  if (best.label === 'unknown') return { name: 'Unknown', distance: best.distance, identified: false }
  return { name: best.label, distance: best.distance, confidence: 1 - best.distance, identified: true }
}

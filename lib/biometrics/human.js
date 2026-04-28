/**
 * lib/biometrics/human.js
 *
 * Biometric detection using @vladmandic/human v3.x.
 * Outputs 1024-dim unit-normalized FaceNet embeddings (face.embedding).
 * Box format: [x, y, width, height] in pixels.
 * Mesh: 468 points as [x, y, z] arrays (MediaPipe Face Mesh layout).
 *
 * Two detection modes for performance:
 * - LIGHT: Only detector + description (no mesh/iris). Used for idle scanning.
 * - FULL: All models including mesh + iris. Used for verification.
 *
 * This is the ONLY biometric detection module. face-api.js has been removed.
 * All descriptor operations (euclidean distance, normalization) live in descriptor-utils.js.
 */

import Human from '@vladmandic/human'
import { MODEL_URL } from '@/lib/config'

let humanLightInstance = null
let humanFullInstance = null
let lightModelsLoaded = false
let fullModelsLoaded = false
let lightLoadPromise = null
let fullLoadPromise = null

function toFiniteAngle(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

export function extractFaceRotationAngles(face) {
  const angle = face?.rotation?.angle || face?.rotation || {}
  return {
    pitch: toFiniteAngle(angle.pitch),
    yaw: toFiniteAngle(angle.yaw),
    roll: toFiniteAngle(angle.roll),
  }
}

const LIGHT_CONFIG = {
  backend: 'wasm',
  modelBasePath: MODEL_URL,
  filter: { enabled: true, equalization: false, flip: false },
  face: {
    enabled: true,
    detector: { modelPath: 'blazeface.json', rotation: true, minConfidence: 0.5 },
    mesh: { enabled: false },
    iris: { enabled: false },
    description: { enabled: false },
    emotion: { enabled: false },
    age: { enabled: false },
    gender: { enabled: false },
  },
  hand: { enabled: false },
  body: { enabled: false },
  gesture: { enabled: false },
}

const FULL_CONFIG = {
  backend: 'wasm',
  modelBasePath: MODEL_URL,
  filter: { enabled: true, equalization: false, flip: false },
  face: {
    enabled: true,
    detector: { modelPath: 'blazeface.json', rotation: true, minConfidence: 0.5 },
    mesh: { enabled: true },
    iris: { enabled: true },
    description: {
      enabled: true,
      skipFrames: 0,
      skipTime: 0,
      minConfidence: 0.3,
    },
    emotion: { enabled: false },
    age: { enabled: false },
    gender: { enabled: false },
    antispoof: {
      enabled: true,
      skipFrames: 0,
      skipTime: 0,
    },
    liveness: {
      enabled: true,
      skipFrames: 0,
      skipTime: 0,
    },
  },
  hand: { enabled: false },
  body: { enabled: false },
  gesture: { enabled: false },
}


async function getHumanLight() {
  if (!humanLightInstance) {
    humanLightInstance = new Human(LIGHT_CONFIG)
  }
  return humanLightInstance
}

async function getHumanFull() {
  if (!humanFullInstance) {
    humanFullInstance = new Human(FULL_CONFIG)
  }
  return humanFullInstance
}

async function loadLightModels(onProgress) {
  if (lightModelsLoaded) return getHumanLight()
  const human = await getHumanLight()

  if (!lightLoadPromise) {
    onProgress?.('Loading face detector...')
    lightLoadPromise = human.load()
      .then(() => {
        lightModelsLoaded = true
      })
      .finally(() => {
        lightLoadPromise = null
      })
  }

  await lightLoadPromise
  return human
}

async function loadFullModels(onProgress) {
  if (fullModelsLoaded) return getHumanFull()
  const human = await getHumanFull()

  if (!fullLoadPromise) {
    onProgress?.('Loading verification models...')
    fullLoadPromise = human.load()
      .then(() => {
        fullModelsLoaded = true
      })
      .finally(() => {
        fullLoadPromise = null
      })
  }

  await fullLoadPromise
  return human
}

function preloadFullModels(onProgress) {
  if (fullModelsLoaded || fullLoadPromise) return
  loadFullModels(onProgress).catch(error => {
    console.warn('[Human] Verification model preload failed:', error)
  })
}

export async function loadModels(onProgress, options = {}) {
  const requireFull = options.requireFull !== false
  if (requireFull && areModelsReady()) {
    onProgress?.('Ready')
    return
  }

  try {
    await loadLightModels(onProgress)
    if (!requireFull) {
      onProgress?.(fullModelsLoaded ? 'Ready' : 'Face detector ready; verification models loading...')
      preloadFullModels(onProgress)
      return
    }

    await loadFullModels(onProgress)
    onProgress?.('Ready')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load models'
    onProgress?.(`Error: ${message}`)
    throw error
  }
}

export function areModelsReady() {
  return lightModelsLoaded && fullModelsLoaded
}

export function areDetectorModelsReady() {
  return lightModelsLoaded
}

export function getModelLoadStatus() {
  if (fullModelsLoaded) return 'Ready (WASM)'
  if (fullLoadPromise) return 'Face detector ready; verification loading...'
  if (lightModelsLoaded) return 'Face detector ready'
  if (lightLoadPromise) return 'Loading face detector...'
  return 'Loading models...'
}

export async function getHuman() {
  return loadLightModels()
}

export async function getHumanVerification() {
  return loadFullModels()
}

export async function detectWithDescriptors(input) {
  try {
    const human = await getHumanVerification()
    const result = await human.detect(input)
    return result.face.map(face => ({
      detection: {
        box: {
          x: face.box[0],
          y: face.box[1],
          width: face.box[2],
          height: face.box[3],
        },
        score: face.score,
      },
      landmarks: { positions: face.mesh },
      descriptor: face.embedding,
      antispoof: face.real ?? null,
      liveness: face.live ?? null,
      rotation: extractFaceRotationAngles(face),
    }))
  } catch (error) {
    throw error
  }
}

export async function detectSingleDescriptor(input) {
  const faces = await detectWithDescriptors(input)
  return faces.length > 0 ? faces[0] : null
}

export async function detectPoseOnly(input) {
  // Uses humanFull (which has mesh enabled) — humanPose was a redundant third instance.
  const human = await getHumanVerification()
  const result = await human.detect(input)
  if (result.face.length === 0) return null
  const face = result.face[0]
  return {
    landmarks: { positions: face.mesh },
    box: { x: face.box[0], y: face.box[1], width: face.box[2], height: face.box[3] },
    score: face.score,
    rotation: extractFaceRotationAngles(face),
  }
}

export async function detectFaceBoxes(input) {
  try {
    const human = await getHuman()
    const result = await human.detect(input)
    return result.face.map(face => ({
      box: {
        x: face.box[0],
        y: face.box[1],
        width: face.box[2],
        height: face.box[3],
      },
      score: face.score,
    }))
  } catch (error) {
    throw error
  }
}

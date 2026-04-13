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

const LIGHT_CONFIG = {
  modelBasePath: MODEL_URL,
  filter: { enabled: true, equalization: true, flip: false },
  face: {
    enabled: true,
    detector: { modelPath: 'blazeface.json', rotation: false, minConfidence: 0.25 },
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
  modelBasePath: MODEL_URL,
  filter: { enabled: true, equalization: true, flip: false },
  face: {
    enabled: true,
    detector: { modelPath: 'blazeface.json', rotation: false, minConfidence: 0.25 },
    mesh: { enabled: true },
    iris: { enabled: true },
    description: { enabled: true },
    emotion: { enabled: false },
    age: { enabled: false },
    gender: { enabled: false },
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

export async function loadModels(onProgress) {
  onProgress?.('Loading models...')
  try {
    const [light, full] = await Promise.all([getHumanLight(), getHumanFull()])
    await Promise.all([light.load(), full.load()])
    lightModelsLoaded = true
    fullModelsLoaded = true
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

export function getModelLoadStatus() {
  if (fullModelsLoaded) return 'Ready'
  if (lightModelsLoaded) return 'Loading full models...'
  return 'Loading models...'
}

export async function getHuman() {
  return getHumanLight()
}

export async function getHumanVerification() {
  return getHumanFull()
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
    }))
  } catch (error) {
    throw error
  }
}

export async function detectSingleDescriptor(input) {
  const faces = await detectWithDescriptors(input)
  return faces.length > 0 ? faces[0] : null
}

export async function detectFaceBoxes(input) {
  try {
    const human = await getHumanLight()
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

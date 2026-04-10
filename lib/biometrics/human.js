/**
 * lib/biometrics/human.js
 *
 * Biometric detection using @vladmandic/human v3.x.
 * Outputs 1024-dim unit-normalized FaceNet embeddings (face.embedding).
 * Box format: [x, y, width, height] in pixels.
 * Mesh: 468 points as [x, y, z] arrays (MediaPipe Face Mesh layout).
 *
 * This is the ONLY biometric detection module. face-api.js has been removed.
 * All descriptor operations (euclidean distance, normalization) live in descriptor-utils.js.
 */

import Human from '@vladmandic/human'

let humanInstance = null
let modelsLoaded = false
let loadPromise = null

const MODEL_URL = '/models'

async function getHuman() {
  if (!humanInstance) {
    humanInstance = new Human({
      modelBasePath: MODEL_URL,
      // Pre-process: equalization helps with varied lighting conditions in offices
      filter: { enabled: true, equalization: true, flip: false },
      face: {
        enabled: true,
        // blazeface-back: better accuracy at the cost of slightly more compute.
        // Use blazeface-front for faster detection on constrained devices.
        detector: { modelPath: 'blazeface-back.json', rotation: false, minConfidence: 0.4 },
        mesh: { enabled: true },       // 468-point mesh — needed for liveness landmarks
        iris: { enabled: true },       // improves mesh accuracy around eyes
        description: { enabled: true }, // generates the 1024-dim FaceNet embedding
        emotion: { enabled: false },
        age: { enabled: false },
        gender: { enabled: false },
      },
      hand: { enabled: false },
      body: { enabled: false },
      gesture: { enabled: false },
    })
  }
  return humanInstance
}

export async function loadModels(onProgress) {
  if (modelsLoaded) {
    onProgress?.('Ready')
    return
  }

  if (!loadPromise) {
    const human = await getHuman()
    loadPromise = human.load().then(() => {
      modelsLoaded = true
      onProgress?.('Ready')
    }).catch(err => {
      loadPromise = null
      throw err
    })
  }
  return loadPromise
}

export function areModelsReady() {
  return modelsLoaded
}

export function getModelLoadStatus() {
  return modelsLoaded ? 'Ready' : 'Loading models...'
}

/**
 * Detects all faces in the input and returns descriptor + landmark data.
 * descriptor = face.embedding (Float32Array, 1024-dim, unit-normalized)
 * landmarks  = face.mesh (468 [x,y,z] points, MediaPipe layout)
 */
export async function detectWithDescriptors(input) {
  const human = await getHuman()
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
    descriptor: face.embedding,  // Float32Array(1024)
  }))
}

/**
 * Returns the single best face detection or null if none found.
 */
export async function detectSingleDescriptor(input) {
  const faces = await detectWithDescriptors(input)
  return faces.length > 0 ? faces[0] : null
}

/**
 * Fast face detection without descriptors — used for kiosk idle scanning.
 * Runs human.detect() but only maps box/score to keep the response lean.
 */
export async function detectFaceBoxes(input) {
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
}

/**
 * Euclidean distance between two descriptor arrays.
 * For 1024-dim unit-normalized vectors:
 *   same person:       typically 0.30 – 0.50
 *   different person:  typically 0.60 – 0.90
 *
 * Use DISTANCE_THRESHOLD from lib/config.js for match decisions.
 * Do NOT compute distances here — use lib/biometrics/descriptor-utils.js.
 */
export function computeDistance(left, right) {
  let total = 0
  const len = Math.min(left.length, right.length)
  for (let i = 0; i < len; i++) {
    const diff = left[i] - right[i]
    total += diff * diff
  }
  return Math.sqrt(total)
}

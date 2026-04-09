import { AMBIGUOUS_MATCH_MARGIN, DISTANCE_THRESHOLD, MODEL_URL } from '../config'

let modelsLoaded = false
let faceApiModulePromise = null
let modelLoadPromise = null
let lastModelStatus = 'Initializing biometric engine...'

function updateModelStatus(message, onProgress) {
  lastModelStatus = message
  onProgress?.(message)
}

async function getFaceApi() {
  if (!faceApiModulePromise) faceApiModulePromise = import('@vladmandic/face-api')
  return faceApiModulePromise
}

export function areModelsReady() {
  return modelsLoaded
}

export function getModelLoadStatus() {
  return modelsLoaded ? 'Ready' : lastModelStatus
}

export async function loadModels(onProgress) {
  if (modelsLoaded) {
    updateModelStatus('Ready', onProgress)
    return
  }

  onProgress?.(lastModelStatus)

  if (!modelLoadPromise) {
    modelLoadPromise = (async () => {
      const faceapi = await getFaceApi()

      updateModelStatus('Loading detection model...', onProgress)
      await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL)

      updateModelStatus('Loading landmark model...', onProgress)
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)

      updateModelStatus('Loading recognition model...', onProgress)
      await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)

      modelsLoaded = true
      updateModelStatus('Ready', onProgress)
    })()
      .catch(error => {
        modelLoadPromise = null
        throw error
      })
  }

  await modelLoadPromise
  updateModelStatus('Ready', onProgress)
}

export async function detectWithDescriptors(input) {
  const faceapi = await getFaceApi()
  let result = await faceapi
    .detectAllFaces(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptors()

  if (result.length > 0) return result

  const enhanced = enhanceCanvas(input)
  if (!enhanced) return result

  result = await faceapi
    .detectAllFaces(enhanced, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.35 }))
    .withFaceLandmarks()
    .withFaceDescriptors()

  return result
}

export async function detectSingleDescriptor(input) {
  const faceapi = await getFaceApi()
  let result = await faceapi
    .detectSingleFace(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor()

  if (result) return result

  const enhanced = enhanceCanvas(input)
  if (!enhanced) return null

  result = await faceapi
    .detectSingleFace(enhanced, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.35 }))
    .withFaceLandmarks()
    .withFaceDescriptor()

  return result || null
}

export async function detectFaceBoxes(input, options = {}) {
  const faceapi = await getFaceApi()
  const allowEnhancedRetry = options.allowEnhancedRetry !== false
  const minConfidence = Number.isFinite(options.minConfidence)
    ? options.minConfidence
    : 0.5
  const enhancedMinConfidence = Number.isFinite(options.enhancedMinConfidence)
    ? options.enhancedMinConfidence
    : 0.35
  let result = await faceapi
    .detectAllFaces(input, new faceapi.SsdMobilenetv1Options({ minConfidence }))

  if (result.length > 0) return result
  if (!allowEnhancedRetry) return []

  const enhanced = enhanceCanvas(input)
  if (!enhanced) return []

  result = await faceapi
    .detectAllFaces(enhanced, new faceapi.SsdMobilenetv1Options({ minConfidence: enhancedMinConfidence }))

  return result
}

function enhanceCanvas(input) {
  if (!input || typeof document === 'undefined') return null

  const width = input.width || input.videoWidth || 0
  const height = input.height || input.videoHeight || 0
  if (!width || !height) return null

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  ctx.filter = 'brightness(1.32) contrast(1.18) saturate(1.05)'
  ctx.drawImage(input, 0, 0, width, height)
  ctx.filter = 'none'

  const frame = ctx.getImageData(0, 0, width, height)
  const { data } = frame

  for (let index = 0; index < data.length; index += 4) {
    data[index] = clamp((data[index] - 12) * 1.08 + 12)
    data[index + 1] = clamp((data[index + 1] - 12) * 1.08 + 12)
    data[index + 2] = clamp((data[index + 2] - 12) * 1.08 + 12)
  }

  ctx.putImageData(frame, 0, 0)
  return canvas
}

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

export function computeDistance(left, right) {
  let total = 0
  const length = Math.min(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const diff = Number(left[index] || 0) - Number(right[index] || 0)
    total += diff * diff
  }

  return Math.sqrt(total)
}

export function findBestMatches(probeDescriptor, persons = []) {
  const matches = persons
    .map(person => {
      const bestDistance = Math.min(
        ...(person.descriptors || []).map(entry => computeDistance(probeDescriptor, entry.vector || entry)),
      )
      return {
        ...person,
        distance: bestDistance,
        matched: bestDistance <= DISTANCE_THRESHOLD,
      }
    })
    .filter(entry => Number.isFinite(entry.distance))
    .sort((left, right) => left.distance - right.distance)

  if (matches.length === 0) {
    return {
      best: null,
      second: null,
      ambiguous: false,
      reliable: false,
      threshold: DISTANCE_THRESHOLD,
    }
  }

  const [best, second = null] = matches
  const ambiguous = Boolean(best?.matched && second?.matched && ((second.distance - best.distance) < AMBIGUOUS_MATCH_MARGIN))

  return {
    best,
    second,
    ambiguous,
    reliable: Boolean(best?.matched) && !ambiguous,
    threshold: DISTANCE_THRESHOLD,
  }
}

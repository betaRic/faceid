import { AMBIGUOUS_MATCH_MARGIN, DISTANCE_THRESHOLD, MODEL_URL } from './config'

let modelsLoaded = false
let faceApiModulePromise = null

async function getFaceApi() {
  if (!faceApiModulePromise) faceApiModulePromise = import('@vladmandic/face-api')
  return faceApiModulePromise
}

export async function loadModels(onProgress) {
  if (modelsLoaded) return
  const faceapi = await getFaceApi()

  onProgress?.('Loading detection model...')
  await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL)

  onProgress?.('Loading landmark model...')
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)

  onProgress?.('Loading recognition model...')
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)

  modelsLoaded = true
  onProgress?.('Ready')
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

export function buildMatcher(persons) {
  if (!persons.length) return null

  const entries = persons.map(person => ({
    key: person.employeeId || person.id,
    name: person.name,
    descriptors: person.descriptors,
  }))

  return {
    async findBestMatch(descriptor) {
      if (!descriptor) return { identified: false }

      const scored = entries
        .map(entry => ({
          ...entry,
          distance: Math.min(...entry.descriptors.map(sample => euclideanDistance(sample, descriptor))),
        }))
        .sort((left, right) => left.distance - right.distance)

      const best = scored[0]
      const second = scored[1] || null

      if (!best || best.distance > DISTANCE_THRESHOLD) {
        return { identified: false, distance: best?.distance ?? null }
      }

      const margin = second ? second.distance - best.distance : 1
      if (second && margin < AMBIGUOUS_MATCH_MARGIN) {
        return {
          identified: false,
          ambiguous: true,
          distance: best.distance,
          confidence: 1 - best.distance,
          key: best.key,
          name: best.name,
          runnerUpKey: second.key,
          runnerUpName: second.name,
          margin,
        }
      }

      return {
        identified: true,
        key: best.key,
        name: best.name,
        distance: best.distance,
        confidence: 1 - best.distance,
      }
    },
  }
}

export async function matchDescriptor(matcher, descriptor) {
  if (!matcher) return { identified: false }

  const best = await matcher.findBestMatch(descriptor)
  return best
}

function euclideanDistance(left, right) {
  let total = 0

  for (let index = 0; index < left.length; index += 1) {
    const diff = left[index] - right[index]
    total += diff * diff
  }

  return Math.sqrt(total)
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

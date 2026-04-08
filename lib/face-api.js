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
  return faceapi
    .detectAllFaces(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptors()
}

export async function detectSingleDescriptor(input) {
  const faceapi = await getFaceApi()
  const result = await faceapi
    .detectSingleFace(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
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

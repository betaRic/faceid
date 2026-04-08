import { DISTANCE_THRESHOLD, MODEL_URL } from './config'

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
  const faceapiPromise = getFaceApi()
  const matcherPromise = faceapiPromise.then(faceapi => new faceapi.FaceMatcher(
    persons.map(person => new faceapi.LabeledFaceDescriptors(person.name, person.descriptors)),
    DISTANCE_THRESHOLD,
  ))

  return {
    async findBestMatch(descriptor) {
      const matcher = await matcherPromise
      return matcher.findBestMatch(descriptor)
    },
  }
}

export async function matchDescriptor(matcher, descriptor) {
  if (!matcher) return { identified: false }

  const best = await matcher.findBestMatch(descriptor)
  if (best.label === 'unknown') return { identified: false, distance: best.distance }

  return {
    identified: true,
    name: best.label,
    distance: best.distance,
    confidence: 1 - best.distance,
  }
}

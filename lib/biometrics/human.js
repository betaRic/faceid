import Human from '@vladmandic/human'

let humanInstance = null
let modelsLoaded = false
let loadPromise = null

const MODEL_URL = '/models'

async function getHuman() {
  if (!humanInstance) {
    humanInstance = new Human({
      modelBasePath: MODEL_URL,
      filter: { enabled: true, equalization: true, flip: false },
      face: {
        enabled: true,
        detector: { modelPath: 'blazeface-back.json', rotation: false },
        mesh: { enabled: true },
        iris: { enabled: true },
        description: { enabled: true },
        emotion: { enabled: false },
        age: { enabled: false },
        gender: { enabled: false },
      },
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
    descriptor: face.embedding,
  }))
}

export async function detectSingleDescriptor(input) {
  const faces = await detectWithDescriptors(input)
  return faces.length > 0 ? faces[0] : null
}

export async function detectFaceBoxes(input, options = {}) {
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

export function computeDistance(left, right) {
  let total = 0
  const len = Math.min(left.length, right.length)
  for (let i = 0; i < len; i++) {
    const diff = left[i] - right[i]
    total += diff * diff
  }
  return Math.sqrt(total)
}

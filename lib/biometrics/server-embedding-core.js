import { createRequire } from 'module'
import '@tensorflow/tfjs-core'
import '@tensorflow/tfjs-converter'
import '@tensorflow/tfjs-backend-cpu'
import '@tensorflow/tfjs-backend-wasm'
import { readFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { pathToFileURL } from 'url'
import sharp from 'sharp'
import { DESCRIPTOR_LENGTH } from '../config.js'
import { normalizeDescriptor } from './descriptor-utils.js'

const require = createRequire(import.meta.url)
const humanWasmEntry = path.join(process.cwd(), 'node_modules', '@vladmandic', 'human', 'dist', 'human.node-wasm.js')
const loadCommonJsModule = Function('require', 'entry', 'return require(entry)')
const HumanModule = loadCommonJsModule(require, humanWasmEntry)
const Human = HumanModule.default || HumanModule.Human || HumanModule

const MAX_SERVER_FRAME_BYTES = 2 * 1024 * 1024
const SERVER_IMAGE_MAX_DIMENSION = 640
const MODEL_BASE_PATH = pathToFileURL(path.join(process.cwd(), 'public', 'models', 'human') + path.sep).href
const WASM_BASE_PATH = pathToFileURL(path.join(process.cwd(), 'node_modules', '@tensorflow', 'tfjs-backend-wasm', 'dist') + path.sep).href

let humanInstance = null
let humanLoadPromise = null
const humanInstances = new Map()
const humanLoadPromises = new Map()
let fileFetchInstalled = false

const HUMAN_PROFILE_CONFIG = {
  attendance: {
    // Attendance identity is decided from FaceRes descriptors generated from
    // server-submitted still frames. Temporal mesh/iris liveness is collected
    // in the browser burst, so loading server mesh/iris here only adds latency.
    mesh: false,
    iris: false,
    antispoof: true,
    liveness: true,
  },
  enrollment: {
    mesh: true,
    iris: false,
    antispoof: false,
    liveness: false,
  },
}

function toFiniteAngle(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function extractFaceRotationAngles(face) {
  const angle = face?.rotation?.angle || face?.rotation || {}
  return {
    pitch: toFiniteAngle(angle.pitch),
    yaw: toFiniteAngle(angle.yaw),
    roll: toFiniteAngle(angle.roll),
  }
}

function parseImageDataUrl(frameDataUrl) {
  const value = String(frameDataUrl || '')
  const match = value.match(/^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/)
  if (!match) {
    throw Object.assign(new Error('Frame must be a base64-encoded JPEG, PNG, or WebP data URL.'), { status: 400 })
  }

  const buffer = Buffer.from(match[1], 'base64')
  if (buffer.length === 0) {
    throw Object.assign(new Error('Frame is empty.'), { status: 400 })
  }
  if (buffer.length > MAX_SERVER_FRAME_BYTES) {
    throw Object.assign(new Error('Frame exceeds maximum size (2MB).'), { status: 400 })
  }
  return buffer
}

function installLocalFileFetch() {
  if (fileFetchInstalled) return
  const nativeFetch = globalThis.fetch?.bind(globalThis)
  if (!nativeFetch) return

  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string'
      ? input
      : input?.url

    if (typeof url === 'string' && url.startsWith('file://')) {
      const filePath = fileURLToPath(url)
      const body = await readFile(filePath)
      return new Response(body, {
        status: 200,
        headers: {
          'content-type': filePath.endsWith('.json') ? 'application/json' : 'application/octet-stream',
        },
      })
    }

    return nativeFetch(input, init)
  }
  fileFetchInstalled = true
}

function normalizeHumanProfile(profile) {
  return HUMAN_PROFILE_CONFIG[profile] ? profile : 'attendance'
}

async function getServerHuman(profile = 'attendance') {
  const normalizedProfile = normalizeHumanProfile(profile)

  if (normalizedProfile === 'attendance' && humanInstance) return humanInstance
  if (normalizedProfile === 'attendance' && humanLoadPromise) return humanLoadPromise

  if (humanInstances.has(normalizedProfile)) return humanInstances.get(normalizedProfile)
  if (humanLoadPromises.has(normalizedProfile)) return humanLoadPromises.get(normalizedProfile)

  const profileConfig = HUMAN_PROFILE_CONFIG[normalizedProfile]
  const loadPromise = (async () => {
    installLocalFileFetch()
    const human = new Human({
      backend: 'wasm',
      modelBasePath: MODEL_BASE_PATH,
      wasmPath: WASM_BASE_PATH,
      warmup: 'none',
      cacheModels: false,
      filter: { enabled: true, equalization: false, flip: false },
      face: {
        enabled: true,
        detector: { modelPath: 'blazeface.json', rotation: true, minConfidence: 0.5, maxDetected: 1 },
        mesh: { enabled: profileConfig.mesh, modelPath: 'facemesh.json' },
        iris: { enabled: profileConfig.iris, modelPath: 'iris.json' },
        description: {
          enabled: true,
          modelPath: 'faceres.json',
          skipFrames: 0,
          skipTime: 0,
          minConfidence: 0.3,
        },
        emotion: { enabled: false },
        age: { enabled: false },
        gender: { enabled: false },
        antispoof: { enabled: profileConfig.antispoof, modelPath: 'antispoof.json', skipFrames: 0, skipTime: 0 },
        liveness: { enabled: profileConfig.liveness, modelPath: 'liveness.json', skipFrames: 0, skipTime: 0 },
      },
      hand: { enabled: false },
      body: { enabled: false },
      object: { enabled: false },
      gesture: { enabled: false },
    })
    await human.load()
    humanInstances.set(normalizedProfile, human)
    if (normalizedProfile === 'attendance') humanInstance = human
    return human
  })().finally(() => {
    humanLoadPromises.delete(normalizedProfile)
    if (normalizedProfile === 'attendance') humanLoadPromise = null
  })

  humanLoadPromises.set(normalizedProfile, loadPromise)
  if (normalizedProfile === 'attendance') humanLoadPromise = loadPromise
  return loadPromise
}

async function decodeFrameToTensor(human, frameDataUrl) {
  const input = parseImageDataUrl(frameDataUrl)
  const image = sharp(input, { limitInputPixels: 4_000_000 })
    .rotate()
    .resize({
      width: SERVER_IMAGE_MAX_DIMENSION,
      height: SERVER_IMAGE_MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .removeAlpha()
    .raw()

  const { data, info } = await image.toBuffer({ resolveWithObject: true })
  if (!info?.width || !info?.height || info.channels !== 3) {
    throw Object.assign(new Error('Could not decode frame into RGB pixels.'), { status: 400 })
  }

  return human.tf.tensor3d(new Uint8Array(data), [info.height, info.width, info.channels], 'int32')
}

export async function generateServerFaceEmbedding(frameDataUrl, options = {}) {
  const human = await getServerHuman(options.profile)
  const tensor = await decodeFrameToTensor(human, frameDataUrl)
  const startedAt = Date.now()

  try {
    const result = await human.detect(tensor)
    const faces = Array.isArray(result?.face) ? result.face : []
    if (faces.length !== 1) {
      return {
        ok: false,
        decisionCode: faces.length > 1 ? 'blocked_multiple_faces' : 'blocked_no_face',
        message: faces.length > 1 ? 'Multiple faces were detected.' : 'No face was detected.',
        performanceMs: Date.now() - startedAt,
      }
    }

    const face = faces[0]
    const descriptor = normalizeDescriptor(Array.from(face.embedding || []))
    if (descriptor.length !== DESCRIPTOR_LENGTH) {
      return {
        ok: false,
        decisionCode: 'blocked_descriptor_shape',
        message: 'Server-generated face descriptor is invalid.',
        performanceMs: Date.now() - startedAt,
      }
    }

    return {
      ok: true,
      descriptor,
      descriptorLength: descriptor.length,
      face: {
        box: {
          x: Number(face.box?.[0] || 0),
          y: Number(face.box?.[1] || 0),
          width: Number(face.box?.[2] || 0),
          height: Number(face.box?.[3] || 0),
        },
        score: Number(face.score || 0),
        antispoof: face.real ?? null,
        liveness: face.live ?? null,
        rotation: extractFaceRotationAngles(face),
      },
      performanceMs: Date.now() - startedAt,
    }
  } finally {
    human.tf.dispose(tensor)
  }
}

export function generateServerEnrollmentEmbedding(frameDataUrl) {
  return generateServerFaceEmbedding(frameDataUrl, { profile: 'enrollment' })
}

export function generateServerAttendanceEmbedding(frameDataUrl) {
  return generateServerFaceEmbedding(frameDataUrl, { profile: 'attendance' })
}

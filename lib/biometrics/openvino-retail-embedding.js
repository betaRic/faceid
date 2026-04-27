import { existsSync } from 'fs'
import path from 'path'
import sharp from 'sharp'
import { addon as ov } from 'openvino-node'
import { normalizeDescriptor } from './descriptor-utils.js'

export const OPENVINO_RETAIL_MODEL_VERSION = 'openvino-retail-reid-0095-v1'
export const OPENVINO_RETAIL_DESCRIPTOR_LENGTH = 256

const MAX_FRAME_BYTES = 2 * 1024 * 1024
const MAX_INPUT_PIXELS = 4_000_000
const DETECTOR_SIZE = 300
const LANDMARK_SIZE = 48
const REID_SIZE = 128
const FACE_DETECTION_CONFIDENCE = 0.55

const REID_REFERENCE_POINTS = [
  [0.31556875, 0.4615741071428571],
  [0.6826229166666667, 0.4615741071428571],
  [0.5002625, 0.6405053571428571],
  [0.349471875, 0.8246919642857142],
  [0.6534364583333333, 0.8246919642857142],
].map(([x, y]) => ({ x: x * REID_SIZE, y: y * REID_SIZE }))

const MODEL_ROOT = process.env.OPENVINO_MODEL_DIR
  ? path.resolve(process.env.OPENVINO_MODEL_DIR)
  : path.join(process.cwd(), 'public', 'models', 'openvino')

const MODEL_PATHS = {
  detector: path.join(MODEL_ROOT, 'face-detection-retail-0004', 'FP16', 'face-detection-retail-0004.xml'),
  landmarks: path.join(MODEL_ROOT, 'landmarks-regression-retail-0009', 'FP16', 'landmarks-regression-retail-0009.xml'),
  reid: path.join(MODEL_ROOT, 'face-reidentification-retail-0095', 'FP16', 'face-reidentification-retail-0095.xml'),
}

let modelsPromise = null

export function getOpenVinoRetailModelPaths() {
  return { ...MODEL_PATHS }
}

export function getMissingOpenVinoRetailModelFiles() {
  return Object.values(MODEL_PATHS).flatMap(xmlPath => {
    const binPath = xmlPath.replace(/\.xml$/i, '.bin')
    return [xmlPath, binPath].filter(filePath => !existsSync(filePath))
  })
}

export function assertOpenVinoRetailModelsAvailable() {
  const missing = getMissingOpenVinoRetailModelFiles()
  if (missing.length > 0) {
    throw Object.assign(
      new Error(`OpenVINO retail face models are missing. Run "npm run openvino:download-models". Missing: ${missing.join(', ')}`),
      { code: 'OPENVINO_MODELS_MISSING', missing },
    )
  }
}

function parseImageDataUrl(frameDataUrl) {
  const value = String(frameDataUrl || '')
  const match = value.match(/^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/i)
  if (!match) {
    throw Object.assign(new Error('Frame must be a base64-encoded JPEG, PNG, or WebP data URL.'), { status: 400 })
  }

  const buffer = Buffer.from(match[1], 'base64')
  if (buffer.length === 0) {
    throw Object.assign(new Error('Frame is empty.'), { status: 400 })
  }
  if (buffer.length > MAX_FRAME_BYTES) {
    throw Object.assign(new Error('Frame exceeds maximum size (2MB).'), { status: 400 })
  }
  return buffer
}

function toImageBuffer(input) {
  if (Buffer.isBuffer(input) || input instanceof Uint8Array) return Buffer.from(input)
  return parseImageDataUrl(input)
}

async function loadModels() {
  if (modelsPromise) return modelsPromise

  modelsPromise = (async () => {
    assertOpenVinoRetailModelsAvailable()
    const core = new ov.Core()
    const [detector, landmarks, reid] = await Promise.all([
      core.compileModel(MODEL_PATHS.detector, 'CPU'),
      core.compileModel(MODEL_PATHS.landmarks, 'CPU'),
      core.compileModel(MODEL_PATHS.reid, 'CPU'),
    ])
    return {
      detector,
      landmarks,
      reid,
      devices: core.getAvailableDevices(),
    }
  })()

  return modelsPromise
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function finiteOr(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function outputData(outputs) {
  const tensor = Object.values(outputs || {})[0]
  return tensor?.getData ? tensor.getData() : null
}

async function decodeRgbImage(input) {
  const { data, info } = await sharp(toImageBuffer(input), { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  if (!info?.width || !info?.height || info.channels !== 3) {
    throw Object.assign(new Error('Could not decode frame into RGB pixels.'), { status: 400 })
  }

  return {
    data: new Uint8Array(data),
    width: info.width,
    height: info.height,
    channels: info.channels,
  }
}

async function resizeRgb(image, width, height, fit = 'fill') {
  const { data, info } = await sharp(Buffer.from(image.data), {
    raw: { width: image.width, height: image.height, channels: 3 },
  })
    .resize({ width, height, fit })
    .raw()
    .toBuffer({ resolveWithObject: true })

  return {
    data: new Uint8Array(data),
    width: info.width,
    height: info.height,
    channels: 3,
  }
}

function rgbToBgrNchwFloat(image) {
  const pixelCount = image.width * image.height
  const out = new Float32Array(pixelCount * 3)
  for (let index = 0; index < pixelCount; index += 1) {
    const rgbIndex = index * 3
    out[index] = image.data[rgbIndex + 2]
    out[pixelCount + index] = image.data[rgbIndex + 1]
    out[pixelCount * 2 + index] = image.data[rgbIndex]
  }
  return out
}

function tensorFromRgb(image) {
  return new ov.Tensor('f32', [1, 3, image.height, image.width], rgbToBgrNchwFloat(image))
}

function parseDetections(raw, image) {
  const detections = []
  if (!raw) return detections

  for (let offset = 0; offset + 6 < raw.length; offset += 7) {
    const imageId = raw[offset]
    const confidence = raw[offset + 2]
    if (imageId < 0 || confidence < FACE_DETECTION_CONFIDENCE) continue

    const xMin = clamp(finiteOr(raw[offset + 3]), 0, 1)
    const yMin = clamp(finiteOr(raw[offset + 4]), 0, 1)
    const xMax = clamp(finiteOr(raw[offset + 5]), 0, 1)
    const yMax = clamp(finiteOr(raw[offset + 6]), 0, 1)
    const width = Math.max(1, Math.round((xMax - xMin) * image.width))
    const height = Math.max(1, Math.round((yMax - yMin) * image.height))
    if (width < 40 || height < 40) continue

    detections.push({
      confidence,
      box: {
        x: Math.round(xMin * image.width),
        y: Math.round(yMin * image.height),
        width,
        height,
      },
    })
  }

  return detections.sort((left, right) => right.confidence - left.confidence)
}

function expandBox(box, image, ratio = 0.05) {
  const padX = box.width * ratio
  const padY = box.height * ratio
  const left = Math.floor(clamp(box.x - padX, 0, image.width - 1))
  const top = Math.floor(clamp(box.y - padY, 0, image.height - 1))
  const right = Math.ceil(clamp(box.x + box.width + padX, left + 1, image.width))
  const bottom = Math.ceil(clamp(box.y + box.height + padY, top + 1, image.height))

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

async function extractAndResizeRgb(image, box, size) {
  const { data, info } = await sharp(Buffer.from(image.data), {
    raw: { width: image.width, height: image.height, channels: 3 },
  })
    .extract({
      left: box.x,
      top: box.y,
      width: box.width,
      height: box.height,
    })
    .resize({ width: size, height: size, fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })

  return {
    data: new Uint8Array(data),
    width: info.width,
    height: info.height,
    channels: 3,
  }
}

function parseLandmarks(raw, cropBox) {
  if (!raw || raw.length < 10) return []

  const points = []
  for (let index = 0; index < 10; index += 2) {
    points.push({
      x: cropBox.x + clamp(raw[index], 0, 1) * cropBox.width,
      y: cropBox.y + clamp(raw[index + 1], 0, 1) * cropBox.height,
    })
  }
  return points
}

function solveLinearSystem(matrix, values) {
  const n = values.length
  const a = matrix.map((row, index) => [...row, values[index]])

  for (let column = 0; column < n; column += 1) {
    let pivot = column
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) pivot = row
    }

    if (Math.abs(a[pivot][column]) < 1e-12) {
      throw new Error('Could not solve face alignment transform.')
    }

    if (pivot !== column) {
      const temp = a[column]
      a[column] = a[pivot]
      a[pivot] = temp
    }

    const divisor = a[column][column]
    for (let current = column; current <= n; current += 1) {
      a[column][current] /= divisor
    }

    for (let row = 0; row < n; row += 1) {
      if (row === column) continue
      const factor = a[row][column]
      for (let current = column; current <= n; current += 1) {
        a[row][current] -= factor * a[column][current]
      }
    }
  }

  return a.map(row => row[n])
}

function estimateAffineTransform(sourcePoints, targetPoints) {
  const normal = Array.from({ length: 6 }, () => Array(6).fill(0))
  const rhs = Array(6).fill(0)

  for (let index = 0; index < sourcePoints.length; index += 1) {
    const source = sourcePoints[index]
    const target = targetPoints[index]
    const rows = [
      [source.x, source.y, 1, 0, 0, 0],
      [0, 0, 0, source.x, source.y, 1],
    ]
    const values = [target.x, target.y]

    for (let row = 0; row < rows.length; row += 1) {
      for (let i = 0; i < 6; i += 1) {
        rhs[i] += rows[row][i] * values[row]
        for (let j = 0; j < 6; j += 1) {
          normal[i][j] += rows[row][i] * rows[row][j]
        }
      }
    }
  }

  const [a, b, c, d, e, f] = solveLinearSystem(normal, rhs)
  return { a, b, c, d, e, f }
}

function sampleRgb(image, x, y) {
  if (x < 0 || y < 0 || x >= image.width - 1 || y >= image.height - 1) return [0, 0, 0]

  const left = Math.floor(x)
  const top = Math.floor(y)
  const xWeight = x - left
  const yWeight = y - top
  const result = [0, 0, 0]

  for (let dy = 0; dy <= 1; dy += 1) {
    for (let dx = 0; dx <= 1; dx += 1) {
      const weight = (dx === 0 ? 1 - xWeight : xWeight) * (dy === 0 ? 1 - yWeight : yWeight)
      const offset = ((top + dy) * image.width + (left + dx)) * 3
      result[0] += image.data[offset] * weight
      result[1] += image.data[offset + 1] * weight
      result[2] += image.data[offset + 2] * weight
    }
  }

  return result
}

function alignFaceRgb(image, sourcePoints) {
  if (sourcePoints.length < 5) {
    throw new Error('OpenVINO face alignment needs five landmarks.')
  }

  const transform = estimateAffineTransform(sourcePoints, REID_REFERENCE_POINTS)
  const determinant = transform.a * transform.e - transform.b * transform.d
  if (Math.abs(determinant) < 1e-12) {
    throw new Error('OpenVINO face alignment transform is degenerate.')
  }

  const aligned = new Uint8Array(REID_SIZE * REID_SIZE * 3)
  for (let y = 0; y < REID_SIZE; y += 1) {
    for (let x = 0; x < REID_SIZE; x += 1) {
      const sourceX = (transform.e * (x - transform.c) - transform.b * (y - transform.f)) / determinant
      const sourceY = (-transform.d * (x - transform.c) + transform.a * (y - transform.f)) / determinant
      const [r, g, b] = sampleRgb(image, sourceX, sourceY)
      const offset = (y * REID_SIZE + x) * 3
      aligned[offset] = Math.round(clamp(r, 0, 255))
      aligned[offset + 1] = Math.round(clamp(g, 0, 255))
      aligned[offset + 2] = Math.round(clamp(b, 0, 255))
    }
  }

  return {
    data: aligned,
    width: REID_SIZE,
    height: REID_SIZE,
    channels: 3,
  }
}

export function cosineDistance(left, right) {
  const a = normalizeDescriptor(left)
  const b = normalizeDescriptor(right)
  const length = Math.min(a.length, b.length)
  let dot = 0
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index]
  }
  return 1 - dot
}

export async function generateOpenVinoRetailEmbedding(input) {
  const startedAt = Date.now()
  const models = await loadModels()
  const image = await decodeRgbImage(input)

  const detectorInput = await resizeRgb(image, DETECTOR_SIZE, DETECTOR_SIZE)
  const detections = parseDetections(
    outputData(models.detector.createInferRequest().infer([tensorFromRgb(detectorInput)])),
    image,
  )

  if (detections.length !== 1) {
    return {
      ok: false,
      decisionCode: detections.length > 1 ? 'blocked_multiple_faces' : 'blocked_no_face',
      message: detections.length > 1 ? 'Multiple faces were detected.' : 'No face was detected.',
      performanceMs: Date.now() - startedAt,
    }
  }

  const faceBox = expandBox(detections[0].box, image)
  const landmarkInput = await extractAndResizeRgb(image, faceBox, LANDMARK_SIZE)
  const landmarks = parseLandmarks(
    outputData(models.landmarks.createInferRequest().infer([tensorFromRgb(landmarkInput)])),
    faceBox,
  )
  const alignedFace = alignFaceRgb(image, landmarks)
  const embeddingRaw = Array.from(
    outputData(models.reid.createInferRequest().infer([tensorFromRgb(alignedFace)])) || [],
  )
  const descriptor = normalizeDescriptor(embeddingRaw)

  if (descriptor.length !== OPENVINO_RETAIL_DESCRIPTOR_LENGTH) {
    return {
      ok: false,
      decisionCode: 'blocked_descriptor_shape',
      message: 'OpenVINO face descriptor is invalid.',
      performanceMs: Date.now() - startedAt,
    }
  }

  return {
    ok: true,
    descriptor,
    descriptorLength: descriptor.length,
    modelVersion: OPENVINO_RETAIL_MODEL_VERSION,
    distanceMetric: 'cosine',
    face: {
      box: faceBox,
      score: detections[0].confidence,
      landmarks,
    },
    diagnostics: {
      devices: models.devices,
    },
    performanceMs: Date.now() - startedAt,
  }
}

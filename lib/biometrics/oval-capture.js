export const OVAL_CAPTURE_ASPECT_RATIO = 0.68
export const OVAL_HORIZONTAL_PADDING_RATIO = 0.09
export const OVAL_VERTICAL_PADDING_RATIO = 0.055

// Face size thresholds - MIN reduced significantly to allow distance scanning
// MAX allows close-up without rejecting. These values enable kiosk to work at arm's length.
export const OVAL_MIN_FACE_AREA_RATIO = 0.12
export const OVAL_MAX_FACE_AREA_RATIO = 0.88

// Perfect position range - widened to be more forgiving at distance
export const PERFECT_FACE_AREA_RATIO_MIN = 0.22
export const PERFECT_FACE_AREA_RATIO_MAX = 0.78

const OVAL_CENTER_GATE_HORIZONTAL_PADDING_RATIO = 0.18
const OVAL_CENTER_GATE_VERTICAL_PADDING_RATIO = 0.12

export function getOvalCaptureRegion(sourceWidth, sourceHeight, targetAspectRatio = OVAL_CAPTURE_ASPECT_RATIO) {
  const safeWidth = Math.max(1, Number(sourceWidth || 0))
  const safeHeight = Math.max(1, Number(sourceHeight || 0))
  const sourceAspectRatio = safeWidth / safeHeight

  let cropWidth = safeWidth
  let cropHeight = safeHeight

  if (sourceAspectRatio > targetAspectRatio) {
    cropWidth = Math.max(1, Math.round(safeHeight * targetAspectRatio))
  } else {
    cropHeight = Math.max(1, Math.round(safeWidth / targetAspectRatio))
  }

  return {
    x: Math.max(0, Math.floor((safeWidth - cropWidth) / 2)),
    y: Math.max(0, Math.floor((safeHeight - cropHeight) / 2)),
    width: cropWidth,
    height: cropHeight,
  }
}

export function pointInsideCaptureOval(x, y, sourceWidth, sourceHeight, options = {}) {
  const centerX = sourceWidth / 2
  const centerY = sourceHeight / 2
  const horizontalPaddingRatio = options.horizontalPaddingRatio ?? OVAL_HORIZONTAL_PADDING_RATIO
  const verticalPaddingRatio = options.verticalPaddingRatio ?? OVAL_VERTICAL_PADDING_RATIO
  const radiusX = sourceWidth * (0.5 - horizontalPaddingRatio)
  const radiusY = sourceHeight * (0.5 - verticalPaddingRatio)
  const normalizedX = (x - centerX) / Math.max(1, radiusX)
  const normalizedY = (y - centerY) / Math.max(1, radiusY)

  return ((normalizedX * normalizedX) + (normalizedY * normalizedY)) <= 1
}

export function isFaceInsideCaptureOval(box, sourceWidth, sourceHeight) {
  if (!box) return false

  const frameArea = Math.max(1, sourceWidth * sourceHeight)
  const faceAreaRatio = (box.width * box.height) / frameArea
  if (faceAreaRatio < OVAL_MIN_FACE_AREA_RATIO || faceAreaRatio > OVAL_MAX_FACE_AREA_RATIO) {
    return false
  }

  const centerX = box.x + (box.width / 2)
  const centerY = box.y + (box.height / 2)

  if (!pointInsideCaptureOval(centerX, centerY, sourceWidth, sourceHeight, {
    horizontalPaddingRatio: OVAL_CENTER_GATE_HORIZONTAL_PADDING_RATIO,
    verticalPaddingRatio: OVAL_CENTER_GATE_VERTICAL_PADDING_RATIO,
  })) {
    return false
  }

  const checkpoints = [
    [box.x + (box.width / 2), box.y + (box.height * 0.16)],
    [box.x + (box.width / 2), box.y + (box.height * 0.5)],
    [box.x + (box.width / 2), box.y + (box.height * 0.88)],
    [box.x + (box.width * 0.18), box.y + (box.height * 0.52)],
    [box.x + (box.width * 0.82), box.y + (box.height * 0.52)],
    [box.x + (box.width * 0.28), box.y + (box.height * 0.2)],
    [box.x + (box.width * 0.72), box.y + (box.height * 0.2)],
  ]

  return checkpoints.every(([pointX, pointY]) => pointInsideCaptureOval(pointX, pointY, sourceWidth, sourceHeight))
}

/**
 * Crop a canvas to the oval capture region.
 * Must be used before descriptor extraction so enrollment and kiosk
 * feed identical image geometry into the face model.
 */
export function buildOvalCaptureCanvas(sourceCanvas) {
  const region = getOvalCaptureRegion(sourceCanvas?.width, sourceCanvas?.height, OVAL_CAPTURE_ASPECT_RATIO)
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(region.width, region.height)
  canvas.width = region.width
  canvas.height = region.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(sourceCanvas, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height)
  return canvas
}

export function selectOvalReadyFace(detections, sourceWidth, sourceHeight) {
  if (!Array.isArray(detections) || detections.length === 0) return null

  const frameCenterX = sourceWidth / 2
  const frameCenterY = sourceHeight / 2
  const frameArea = sourceWidth * sourceHeight

  return detections
    .map(detection => {
      const box = detection?.box || detection?.detection?.box
      if (!box || !isFaceInsideCaptureOval(box, sourceWidth, sourceHeight)) return null

      const centerX = box.x + (box.width / 2)
      const centerY = box.y + (box.height / 2)
      const area = box.width * box.height
      const distance = Math.hypot(centerX - frameCenterX, centerY - frameCenterY)
      const score = area - (distance * 0.85)
      const faceAreaRatio = area / frameArea

      return { detection, box, score, faceAreaRatio }
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)[0] || null
}


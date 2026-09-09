import { getOvalCaptureRegion } from './oval-capture'

// Crop in native camera coordinates, then bound the retained image.
export function getCaptureGeometry(sourceWidth, sourceHeight, options = {}) {
  const { cropAspectRatio, maxWidth = sourceWidth, maxHeight = sourceHeight } = options
  if (![sourceWidth, sourceHeight].every(value => Number.isSafeInteger(value) && value > 0)) return null
  if (![maxWidth, maxHeight].every(value => Number.isFinite(value) && value >= 1)) return null
  if (!Number.isFinite(cropAspectRatio) || cropAspectRatio <= 0) return null

  const region = getOvalCaptureRegion(sourceWidth, sourceHeight, cropAspectRatio)
  const scale = Math.min(1, Math.floor(maxWidth) / region.width, Math.floor(maxHeight) / region.height)
  return {
    ...region,
    outputWidth: Math.max(1, Math.round(region.width * scale)),
    outputHeight: Math.max(1, Math.round(region.height * scale)),
  }
}

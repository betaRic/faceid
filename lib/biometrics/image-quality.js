// Numerical image checks for experimental collection only, not identity approval.
export function measureFaceImageQuality(rgb, width, height, box) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 3 || height < 3
    || rgb?.length !== width * height * 3
    || !box || ![box.x, box.y, box.width, box.height].every(Number.isFinite)
    || box.width <= 0 || box.height <= 0) return null
  const left = Math.max(1, Math.ceil(box.x))
  const top = Math.max(1, Math.ceil(box.y))
  const right = Math.min(width - 1, Math.floor(box.x + box.width))
  const bottom = Math.min(height - 1, Math.floor(box.y + box.height))
  if (right <= left || bottom <= top) return null
  const gray = (x, y) => {
    const i = (y * width + x) * 3
    return .299 * rgb[i] + .587 * rgb[i + 1] + .114 * rgb[i + 2]
  }
  let count = 0, sum = 0, clipped = 0, lapSum = 0, lapSquared = 0
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const value = gray(x, y)
      const lap = gray(x - 1, y) + gray(x + 1, y) + gray(x, y - 1) + gray(x, y + 1) - 4 * value
      count++; sum += value; clipped += value <= 10 || value >= 245 ? 1 : 0
      lapSum += lap; lapSquared += lap * lap
    }
  }
  return {
    meanBrightness: sum / count,
    clippedFraction: clipped / count,
    sharpness: Math.max(0, lapSquared / count - (lapSum / count) ** 2),
  }
}

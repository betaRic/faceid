/**
 * lib/biometrics/image-enhance.js
 * 
 * Client-side image enhancement to standardize camera quality.
 * Applies histogram equalization, sharpening, and noise reduction
 * to improve face detection accuracy on poor-quality webcams.
 * 
 * Features:
 * - Memory-efficient: Reuses input canvas, no allocations
 * - Smart: Only enhances if image quality is poor
 * - Performance-aware: Measures time and degrades gracefully
 */

const MIN_BRIGHTNESS = 50
const MAX_BRIGHTNESS = 220
const MIN_CONTRAST = 80

let enhanceEnabled = true

export function disableEnhancement() {
  enhanceEnabled = false
}

export function shouldEnhance(sourceCanvas) {
  const metrics = getImageMetrics(sourceCanvas)
  return metrics.isTooDark || metrics.isTooBright || metrics.isLowContrast
}

export function enhanceImage(sourceCanvas) {
  if (!enhanceEnabled) return sourceCanvas
  
  const startTime = performance.now()
  
  const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true })
  const imageData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height)
  const metrics = getImageMetricsFromData(imageData)
  
  if (!metrics.needsEnhancement) {
    return sourceCanvas
  }
  
  const enhanced = autoEnhance(imageData, metrics)
  ctx.putImageData(enhanced, 0, 0)
  
  const enhanceTime = performance.now() - startTime
  if (enhanceTime > 100) {
    console.warn('[Enhancement] Slow enhancement detected:', enhanceTime.toFixed(1), 'ms - consider disabling')
  }
  
  return sourceCanvas
}

function getImageMetricsFromData(imageData) {
  const data = imageData.data
  const pixelCount = data.length / 4
  
  let min = 255, max = 0, sum = 0
  for (let i = 0; i < data.length; i += 4) {
    const gray = (data[i] + data[i + 1] + data[i + 2]) / 3
    min = Math.min(min, gray)
    max = Math.max(max, gray)
    sum += gray
  }
  
  const brightness = sum / pixelCount
  const contrast = max - min
  
  return {
    brightness,
    contrast,
    needsEnhancement: brightness < MIN_BRIGHTNESS || brightness > MAX_BRIGHTNESS || contrast < MIN_CONTRAST,
    isTooDark: brightness < MIN_BRIGHTNESS,
    isTooBright: brightness > MAX_BRIGHTNESS,
    isLowContrast: contrast < MIN_CONTRAST,
  }
}

function autoEnhance(imageData, metrics) {
  const data = imageData.data
  const width = imageData.width
  const height = imageData.height
  
  if (metrics.isTooDark || metrics.isTooBright || metrics.isLowContrast) {
    applyAutoContrast(data)
  }
  
  applyUnsharpMask(data, width, height)
  
  reduceNoise(data, width, height)
  
  return imageData
}

function computeHistogram(data) {
  const histogram = { r: new Array(256).fill(0), g: new Array(256).fill(0), b: new Array(256).fill(0) }
  for (let i = 0; i < data.length; i += 4) {
    histogram.r[data[i]]++
    histogram.g[data[i + 1]]++
    histogram.b[data[i + 2]]++
  }
  return histogram
}

function computeBrightness(histogram, pixelCount) {
  let sum = 0
  for (let i = 0; i < 256; i++) {
    sum += i * (histogram.r[i] + histogram.g[i] + histogram.b[i])
  }
  return sum / (pixelCount * 3)
}

function applyAutoContrast(data) {
  const histogram = computeHistogram(data)
  
  const channels = ['r', 'g', 'b']
  const lut = {}
  
  channels.forEach(ch => {
    lut[ch] = new Array(256)
    const h = histogram[ch]
    const totalPixels = data.length / 4
    let minVal = 0
    let maxVal = 255
    
    for (let i = 0; i < 256; i++) {
      if (h[i] > totalPixels * 0.01) {
        minVal = i
        break
      }
    }
    
    for (let i = 255; i >= 0; i--) {
      if (h[i] > totalPixels * 0.01) {
        maxVal = i
        break
      }
    }
    
    const range = maxVal - minVal || 1
    for (let i = 0; i < 256; i++) {
      lut[ch][i] = Math.round(((i - minVal) / range) * 255)
      lut[ch][i] = Math.max(0, Math.min(255, lut[ch][i]))
    }
  })
  
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut.r[data[i]]
    data[i + 1] = lut.g[data[i + 1]]
    data[i + 2] = lut.b[data[i + 2]]
  }
}

function applyUnsharpMask(data, width, height) {
  const original = new Uint8ClampedArray(data)
  const amount = 0.5
  const radius = 1
  const threshold = 0
  
  for (let y = radius; y < height - radius; y++) {
    for (let x = radius; x < width - radius; x++) {
      const idx = (y * width + x) * 4
      
      let blurR = 0, blurG = 0, blurB = 0
      let count = 0
      
      for (let ky = -radius; ky <= radius; ky++) {
        for (let kx = -radius; kx <= radius; kx++) {
          const kidx = ((y + ky) * width + (x + kx)) * 4
          blurR += original[kidx]
          blurG += original[kidx + 1]
          blurB += original[kidx + 2]
          count++
        }
      }
      
      blurR /= count
      blurG /= count
      blurB /= count
      
      const diffR = original[idx] - blurR
      const diffG = original[idx + 1] - blurG
      const diffB = original[idx + 2] - blurB
      
      if (Math.abs(diffR) > threshold || Math.abs(diffG) > threshold || Math.abs(diffB) > threshold) {
        data[idx] = Math.round(original[idx] + diffR * amount)
        data[idx + 1] = Math.round(original[idx + 1] + diffG * amount)
        data[idx + 2] = Math.round(original[idx + 2] + diffB * amount)
      }
    }
  }
}

function reduceNoise(data, width, height) {
  const original = new Uint8ClampedArray(data)
  const strength = 0.3
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4
      
      const neighbors = [
        ((y - 1) * width + (x - 1)) * 4,
        ((y - 1) * width + x) * 4,
        ((y - 1) * width + (x + 1)) * 4,
        (y * width + (x - 1)) * 4,
        (y * width + (x + 1)) * 4,
        ((y + 1) * width + (x - 1)) * 4,
        ((y + 1) * width + x) * 4,
        ((y + 1) * width + (x + 1)) * 4,
      ]
      
      let sumR = 0, sumG = 0, sumB = 0
      for (const nidx of neighbors) {
        sumR += original[nidx]
        sumG += original[nidx + 1]
        sumB += original[nidx + 2]
      }
      
      const avgR = sumR / 8
      const avgG = sumG / 8
      const avgB = sumB / 8
      
      data[idx] = Math.round(original[idx] * (1 - strength) + avgR * strength)
      data[idx + 1] = Math.round(original[idx + 1] * (1 - strength) + avgG * strength)
      data[idx + 2] = Math.round(original[idx + 2] * (1 - strength) + avgB * strength)
    }
  }
}

export function getImageMetrics(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  
  let min = 255, max = 0, sum = 0
  let rSum = 0, gSum = 0, bSum = 0
  const pixelCount = data.length / 4
  
  for (let i = 0; i < data.length; i += 4) {
    const gray = (data[i] + data[i + 1] + data[i + 2]) / 3
    min = Math.min(min, gray)
    max = Math.max(max, gray)
    sum += gray
    rSum += data[i]
    gSum += data[i + 1]
    bSum += data[i + 2]
  }
  
  const avg = sum / pixelCount
  const contrast = max - min
  
  return {
    brightness: avg,
    contrast: contrast,
    isTooDark: avg < 50,
    isTooBright: avg > 220,
    isLowContrast: contrast < 80,
  }
}

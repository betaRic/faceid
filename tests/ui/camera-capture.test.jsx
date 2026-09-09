import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useCamera } from '@/hooks/useCamera'

function setupCapture(width, height) {
  const { result } = renderHook(() => useCamera())
  const drawImage = vi.fn()
  const video = { videoWidth: width, videoHeight: height, readyState: 2, pause() {}, load() {} }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({ drawImage }))
  const canvas = document.createElement('canvas')
  result.current.videoRef.current = video
  result.current.canvasRef.current = canvas
  return { camera: result.current, video, canvas, drawImage }
}

describe('camera capture geometry', () => {
  it.each([
    ['landscape', 1280, 720, 395, 0, 490, 720, 436, 640],
    ['portrait', 480, 640, 22, 0, 435, 640, 435, 640],
    ['square', 800, 800, 128, 0, 544, 800, 435, 640],
  ])('crops %s video before applying the output limit', (_, width, height, x, y, cropWidth, cropHeight, outputWidth, outputHeight) => {
    const { camera, video, drawImage } = setupCapture(width, height)
    const canvas = camera.captureImageData({ maxWidth: 640, maxHeight: 640, cropAspectRatio: 0.68 })
    expect([canvas.width, canvas.height]).toEqual([outputWidth, outputHeight])
    expect(drawImage).toHaveBeenCalledWith(video, x, y, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight)
  })

  it('does not enlarge a small cropped source', () => {
    const { camera } = setupCapture(320, 240)
    const canvas = camera.captureImageData({ maxWidth: 640, maxHeight: 640, cropAspectRatio: 0.68 })
    expect([canvas.width, canvas.height]).toEqual([163, 240])
  })

  it('preserves full-frame capture when no crop is requested', () => {
    const { camera, canvas } = setupCapture(1280, 720)
    camera.captureImageData({ maxWidth: 640, maxHeight: 640 })
    expect([canvas.width, canvas.height]).toEqual([640, 360])
  })

  it.each([0, -1, NaN, Infinity, undefined])('rejects invalid native source dimensions: %s', value => {
    for (const dimensions of [[value, 720], [1280, value]]) {
      const { camera, drawImage } = setupCapture(...dimensions)
      expect(camera.captureImageData({ cropAspectRatio: 0.68 })).toBeNull()
      expect(drawImage).not.toHaveBeenCalled()
    }
  })

  it.each([0, -1, NaN, Infinity])('rejects invalid capture bounds: %s', value => {
    const { camera, drawImage } = setupCapture(1280, 720)
    for (const options of [{ maxWidth: value }, { maxHeight: value }, { cropAspectRatio: value }]) {
      expect(camera.captureImageData({ cropAspectRatio: 0.68, ...options })).toBeNull()
    }
    expect(drawImage).not.toHaveBeenCalled()
  })

  it('honors both output bounds for a landscape crop', () => {
    const { camera, drawImage, video } = setupCapture(480, 640)
    const canvas = camera.captureImageData({ maxWidth: 300, maxHeight: 100, cropAspectRatio: 2 })
    expect([canvas.width, canvas.height]).toEqual([200, 100])
    expect(drawImage).toHaveBeenCalledWith(video, 0, 200, 480, 240, 0, 0, 200, 100)
  })

  it('keeps captured frames independent for burst selection', () => {
    const { camera } = setupCapture(1280, 720)
    const first = camera.captureImageData({ maxWidth: 640, maxHeight: 640, cropAspectRatio: 0.68 })
    const second = camera.captureImageData({ maxWidth: 320, maxHeight: 320, cropAspectRatio: 0.68 })
    expect(first).not.toBe(second)
    expect([first.width, first.height]).toEqual([436, 640])
  })
})

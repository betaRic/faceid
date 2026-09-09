import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useCamera } from '@/hooks/useCamera'
import { useVerificationBurst } from '@/hooks/useVerificationBurst'
import { getHumanVerification } from '@/lib/biometrics/human'

vi.mock('@/lib/biometrics/human', () => ({
  getHumanVerification: vi.fn(),
  extractFaceRotationAngles: () => ({ yaw: 0, pitch: 0, roll: 0 }),
}))

describe('verification burst capture integration', () => {
  it('reports missing face evidence without a photo and keeps the null result', async () => {
    const detect = vi.fn(async () => ({ face: [] }))
    getHumanVerification.mockResolvedValue({ detect })
    const canvas = { width: 436, height: 640, toDataURL: vi.fn() }
    const onFailure = vi.fn()
    const { result } = renderHook(() => useVerificationBurst({ camOn: true, captureImageData: () => canvas }))
    expect(await result.current.captureVerificationBurst({ onFailure })).toBeNull()
    expect(onFailure).toHaveBeenCalledOnce()
    expect(onFailure.mock.calls[0][0]).toMatchObject({ reason: 'no_usable_face', metrics: { capturedFrames: 0, strictFrames: 0, width: 436, height: 640 } })
    expect(canvas.toDataURL).not.toHaveBeenCalled()
  })

  it('optional failure callback cannot turn an ordinary rejection into an exception', async () => {
    getHumanVerification.mockResolvedValue({ detect: async () => ({ face: [] }) })
    const { result } = renderHook(() => useVerificationBurst({ camOn: true, captureImageData: () => ({ width: 400, height: 600 }) }))
    await expect(result.current.captureVerificationBurst({ onFailure: () => { throw Error('report failed') } })).resolves.toBeNull()
  })

  it('detects and uploads independently retained native crops in the same coordinates', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({ drawImage: vi.fn() }))
    const encodedCanvases = []
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (type, quality) {
      encodedCanvases.push({ canvas: this, type, quality })
      return `data:image/jpeg;base64,frame${encodedCanvases.length}`
    })
    const detect = vi.fn(async canvas => ({ face: [{
      box: [canvas.width * 0.1, canvas.height * 0.15, canvas.width * 0.8, canvas.height * 0.7],
      score: 0.99,
      embedding: [1, 0, 0],
      mesh: [],
      real: 0.99,
    }] }))
    getHumanVerification.mockResolvedValue({ detect })
    const { result } = renderHook(() => {
      const camera = useCamera()
      camera.videoRef.current = { videoWidth: 1280, videoHeight: 720, readyState: 2, pause() {}, load() {} }
      camera.canvasRef.current = document.createElement('canvas')
      return useVerificationBurst({ ...camera, camOn: true })
    })

    const burst = await result.current.captureVerificationBurst()
    expect(burst).not.toBeNull()
    const detectedCanvases = detect.mock.calls.map(([canvas]) => canvas)
    expect(new Set(detectedCanvases).size).toBe(detectedCanvases.length)
    for (const canvas of detectedCanvases) {
      expect([canvas.width, canvas.height]).toEqual([436, 640])
    }
    expect(encodedCanvases).toHaveLength(2)
    for (const encoded of encodedCanvases) {
      expect(detectedCanvases).toContain(encoded.canvas)
      expect([encoded.type, encoded.quality]).toEqual(['image/jpeg', 0.82])
    }
    expect(burst.metrics.faceAreaRatio).toBeCloseTo(0.56)
    expect(burst.scanFrames).toHaveLength(2)
  })
})

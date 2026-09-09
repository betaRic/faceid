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

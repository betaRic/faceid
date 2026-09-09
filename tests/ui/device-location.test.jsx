import { afterEach, expect, it, vi } from 'vitest'
import { requestBestDeviceLocation } from '@/lib/device-location'

afterEach(() => vi.useRealTimers())
function device() {
  let receive, fail
  const geo = {
    watchPosition: vi.fn((success, error) => { receive = success; fail = error; return 7 }),
    clearWatch: vi.fn(),
    getCurrentPosition: vi.fn(),
  }
  return { geo, receive: p => receive(p), fail: e => fail(e) }
}
const position = accuracy => ({ timestamp: Date.now(), coords: { latitude: 6.1, longitude: 125.1, accuracy } })

it('waits for a better reading instead of settling on the first coarse desktop fix', async () => {
  vi.useFakeTimers()
  const d = device(), onProgress = vi.fn()
  const pending = requestBestDeviceLocation({ geolocation: d.geo, timeout: 30000, targetAccuracyMeters: 50, onProgress })
  d.receive(position(323))
  await vi.advanceTimersByTimeAsync(500)
  expect(d.geo.clearWatch).not.toHaveBeenCalled()
  d.receive(position(35))
  expect((await pending).coords.accuracy).toBe(35)
  expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ accuracyMeters: 323 }))
  expect(d.geo.clearWatch).toHaveBeenCalledWith(7)
})

it('returns the best genuine reading at the deadline without improving its claimed accuracy', async () => {
  vi.useFakeTimers()
  const d = device()
  const pending = requestBestDeviceLocation({ geolocation: d.geo, timeout: 8000, targetAccuracyMeters: 50 })
  d.receive(position(323)); d.receive(position(500))
  await vi.advanceTimersByTimeAsync(8000)
  expect((await pending).coords.accuracy).toBe(323)
  expect(d.geo.clearWatch).toHaveBeenCalledWith(7)
})

it('stops promptly on denied permission without a network fallback', async () => {
  const d = device()
  const pending = requestBestDeviceLocation({ geolocation: d.geo })
  const rejected = expect(pending).rejects.toMatchObject({ code: 1 })
  d.fail({ code: 1 }); await rejected
  expect(d.geo.getCurrentPosition).not.toHaveBeenCalled()
  expect(d.geo.clearWatch).toHaveBeenCalledWith(7)
})

it('ignores invalid coordinates and non-finite accuracy', async () => {
  vi.useFakeTimers()
  const d = device()
  const pending = requestBestDeviceLocation({ geolocation: d.geo, timeout: 8000 })
  const rejected = expect(pending).rejects.toMatchObject({ code: 3 })
  d.receive(position(NaN)); d.receive({ ...position(1), coords: { latitude: 999, longitude: 0, accuracy: 1 } })
  await vi.advanceTimersByTimeAsync(8000); await rejected
})

it('cancels tracking when leaving the page', async () => {
  const d = device(), controller = new AbortController()
  const pending = requestBestDeviceLocation({ geolocation: d.geo, signal: controller.signal })
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  controller.abort(); await rejected
  expect(d.geo.clearWatch).toHaveBeenCalledWith(7)
})

it('network fallback stays fresh and within the original deadline', async () => {
  vi.useFakeTimers()
  const d = device()
  d.geo.getCurrentPosition.mockImplementation(success => success(position(200)))
  const pending = requestBestDeviceLocation({ geolocation: d.geo, timeout: 8000 })
  d.fail({ code: 2 })
  expect(d.geo.getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), expect.objectContaining({ maximumAge: 0, enableHighAccuracy: false }))
  await vi.advanceTimersByTimeAsync(8000)
  expect((await pending).coords.accuracy).toBe(200)
})

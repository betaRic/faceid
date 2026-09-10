import { afterEach, expect, it, vi } from 'vitest'
import { requestBestDeviceLocation, getLocationStartupOptions } from '@/lib/device-location'

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
it('reports first and best accuracy once without exposing coordinates', async () => {
  const d = device(), onComplete = vi.fn()
  const pending = requestBestDeviceLocation({ geolocation: d.geo, onComplete })
  d.receive(position(323)); d.receive(position(35))
  await pending
  expect(onComplete).toHaveBeenCalledTimes(1)
  const report = onComplete.mock.calls[0][0]
  expect(report.reason).toBe('ready')
  expect(report.metrics).toMatchObject({ firstAccuracy: 323, bestAccuracy: 35, readingCount: 2 })
  expect(JSON.stringify(report)).not.toContain('latitude')
})

it('report callback errors cannot fail an otherwise successful location request', async () => {
  const d = device()
  const pending = requestBestDeviceLocation({ geolocation: d.geo, onComplete: () => { throw new Error('report failed') } })
  d.receive(position(35))
  expect((await pending).coords.accuracy).toBe(35)
})

it('reports permission refusal and unsupported devices without a fake zero reading', async () => {
  const onComplete = vi.fn(), d = device()
  const pending = requestBestDeviceLocation({ geolocation: d.geo, onComplete })
  d.fail({ code: 1 })
  await expect(pending).rejects.toMatchObject({ code: 1 })
  expect(onComplete.mock.calls[0][0].reason).toBe('permission_denied')
  expect(onComplete.mock.calls[0][0].metrics.firstAccuracy).toBeUndefined()
  await expect(requestBestDeviceLocation({ geolocation: null, onComplete })).rejects.toThrow()
  expect(onComplete.mock.calls[1][0].reason).toBe('unsupported')
})
const policy = { bootTimeoutMs: 30000, targetAccuracyMeters: 50, maxAccuracyMeters: 250 }
const desktop = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 0 }

it('opens desktop scanning immediately for an acceptable 83 metre reading', async () => {
  const d = device()
  const pending = requestBestDeviceLocation({ ...getLocationStartupOptions(policy, desktop), geolocation: d.geo })
  d.receive(position(83))
  expect(d.geo.clearWatch).toHaveBeenCalledWith(7)
  expect((await pending).coords.accuracy).toBe(83)
})

it('permits a recent browser reading on desktop refresh without rewriting its timestamp', async () => {
  const d = device(), cached = { ...position(83), timestamp: Date.now() - 20000 }
  const pending = requestBestDeviceLocation({ ...getLocationStartupOptions(policy, desktop), geolocation: d.geo })
  expect(d.geo.watchPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), expect.objectContaining({ maximumAge: 30000 }))
  d.receive(cached)
  expect(await pending).toBe(cached)
})

it('rejects expired desktop cache and keeps waiting for an acceptable fresh reading', async () => {
  const d = device()
  const pending = requestBestDeviceLocation({ ...getLocationStartupOptions(policy, desktop), geolocation: d.geo })
  d.receive({ ...position(83), timestamp: Date.now() - 31000 })
  d.receive(position(323))
  expect(d.geo.clearWatch).not.toHaveBeenCalled()
  d.receive(position(83))
  expect((await pending).coords.accuracy).toBe(83)
})

it.each([
  { userAgent: 'iPhone' }, { userAgent: 'Android', userAgentData: { mobile: false } },
  { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', maxTouchPoints: 5 },
  { userAgent: 'Windows NT Tablet', maxTouchPoints: 10 }, {},
])('preserves fresh precise startup for phones tablets and unknown devices: %j', nav => {
  expect(getLocationStartupOptions(policy, nav)).toMatchObject({ maximumAge: 0, targetAccuracyMeters: 50 })
})

it('honors a stricter desktop accuracy policy', () => {
  expect(getLocationStartupOptions({ ...policy, maxAccuracyMeters: 60 }, desktop).targetAccuracyMeters).toBe(60)
})

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
  const d = device(), onComplete = vi.fn()
  const pending = requestBestDeviceLocation({ geolocation: d.geo, timeout: 8000, targetAccuracyMeters: 50, onComplete })
  d.receive(position(323)); d.receive(position(500))
  await vi.advanceTimersByTimeAsync(8000)
  expect((await pending).coords.accuracy).toBe(323)
  expect(onComplete.mock.calls[0][0].reason).toBe('imprecise')
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
  const d = device(), onComplete = vi.fn()
  const pending = requestBestDeviceLocation({ geolocation: d.geo, timeout: 8000, onComplete })
  const rejected = expect(pending).rejects.toMatchObject({ code: 3 })
  d.receive(position(NaN)); d.receive({ ...position(1), coords: { latitude: 999, longitude: 0, accuracy: 1 } })
  await vi.advanceTimersByTimeAsync(8000); await rejected
  expect(onComplete.mock.calls[0][0].reason).toBe('timeout')
})

it('cancels tracking when leaving the page', async () => {
  const d = device(), controller = new AbortController(), onComplete = vi.fn()
  const pending = requestBestDeviceLocation({ geolocation: d.geo, signal: controller.signal, onComplete })
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  controller.abort(); await rejected
  expect(d.geo.clearWatch).toHaveBeenCalledWith(7)
  expect(onComplete.mock.calls[0][0].reason).toBe('cancelled')
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

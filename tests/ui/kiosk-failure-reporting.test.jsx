import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useKioskLoop } from '@/hooks/useKioskLoop'
import { reportScanFailure } from '@/lib/scan-failure-reporter'

vi.mock('@/lib/data-store', () => ({ requestAttendanceChallenge: async () => ({ challenge: { token: 'test' } }) }))
vi.mock('@/lib/scan-failure-reporter', () => ({ reportScanFailure: vi.fn() }))
vi.mock('@/lib/biometrics/human', () => ({ detectFaceBoxes: async () => [] }))
vi.mock('@/lib/biometrics/oval-capture', () => ({ buildOvalCaptureCanvas: canvas => canvas,
  selectOvalReadyFace: () => ({ box: { x: 20, y: 20, width: 60, height: 60 } }) }))
vi.mock('@/lib/biometrics/face-size-guidance', () => ({ getFaceAreaRatioFromBox: () => .4,
  getFaceSizeGuidance: () => ({}), isFaceSizeCaptureReady: () => true }))

function setup() {
  const options = { camera: { camOn: true, captureImageData: () => ({ width: 100, height: 100 }),
    clearOverlay: vi.fn(), getTrackSettings: () => ({ width: 1280, height: 720 }) },
    modelsReady: true, claimedEmployeeId: 'private-code', locationState: {},
    onLogAttendance: vi.fn(), confirmRef: { current: 999 }, confirmedTimer: { current: null },
    unknownTimer: { current: null }, attemptCooldownUntilRef: { current: 0 },
    faceLossTimerRef: { current: null }, pausedRef: { current: false } }
  for (const key of ['setKioskState', 'setCurrentMatch', 'setCapturedFrameUrl', 'setFlashKey', 'setAlertState', 'setFaceDistanceInfo', 'showAlertAndResume']) options[key] = vi.fn()
  return { options, ...renderHook(() => useKioskLoop(options)) }
}

describe('kiosk missing-capture reporting', () => {
  it('sends one report, excludes code, and never submits unusable capture', async () => {
    const { result, options } = setup()
    await result.current.runScan(async ({ onFailure }) => {
      onFailure({ reason: 'insufficient_ready_frames', metrics: { strictFrames: 1 } })
      return null
    })
    expect(reportScanFailure).toHaveBeenCalledOnce()
    expect(reportScanFailure.mock.calls[0][0]).toMatchObject({ reason: 'insufficient_ready_frames', stage: 'capture', metrics: { strictFrames: 1, trackWidth: 1280 } })
    expect(JSON.stringify(reportScanFailure.mock.calls)).not.toContain('private-code')
    expect(options.onLogAttendance).not.toHaveBeenCalled()
    expect(options.showAlertAndResume).toHaveBeenCalledWith('No reliable face match was found.')
  })
  it('reporter exception preserves the same rejection and next scan controls', async () => {
    reportScanFailure.mockImplementation(() => { throw Error('optional report unavailable') })
    const { result, options } = setup()
    await expect(result.current.runScan(async () => null)).resolves.toBeUndefined()
    expect(options.showAlertAndResume).toHaveBeenCalledWith('No reliable face match was found.')
    expect(options.confirmRef.current).toBe(0)
    expect(options.onLogAttendance).not.toHaveBeenCalled()
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import KioskView from '@/components/KioskView'
import KioskScanningOverlay from '@/components/kiosk/KioskScanningOverlay'
import KioskSuccessScreen from '@/components/kiosk/KioskSuccessScreen'
import KioskAlert from '@/components/kiosk/KioskAlert'
import EmployeeReenrollPage from '@/app/admin/employee/[personId]/reenroll/EmployeeReenrollPage'

const kioskState = {
  kioskState: 'idle', setKioskState: vi.fn(), currentMatch: null, setCurrentMatch: vi.fn(),
  capturedFrameUrl: null, setCapturedFrameUrl: vi.fn(), flashKey: 0, setFlashKey: vi.fn(),
  alertState: null, setAlertState: vi.fn(), resumeKey: 0, faceDistanceInfo: null, setFaceDistanceInfo: vi.fn(),
  confirmRef: { current: null }, confirmedTimer: { current: null }, unknownTimer: { current: null },
  attemptCooldownUntilRef: { current: 0 }, faceLossTimerRef: { current: null }, pausedRef: { current: false },
  scheduleResume: vi.fn(), showAlertAndResume: vi.fn(), pauseScanning: vi.fn(),
}

vi.mock('@/hooks/useAudioCue', () => ({ useAudioCue: () => vi.fn() }))
vi.mock('@/hooks/useKioskState', () => ({ useKioskState: () => kioskState }))
vi.mock('@/hooks/useVerificationBurst', () => ({ useVerificationBurst: () => ({ captureVerificationBurst: vi.fn() }) }))
vi.mock('@/hooks/useKioskLoop', () => ({ useKioskLoop: () => ({ runScan: vi.fn(), startLoop: vi.fn(), stopLoop: vi.fn() }) }))
vi.mock('@/hooks/useKioskMetrics', () => ({ useKioskMetrics: () => ({ recordScan: vi.fn(), recordVerification: vi.fn(), recordNetwork: vi.fn() }) }))
vi.mock('@/hooks/useKioskClock', () => ({ useKioskClock: () => ({ clock: '8:15 AM', dateStr: 'August 24, 2026' }) }))
vi.mock('next/dynamic', () => ({ default: (_loader, options) => function DynamicStub() { return options.loading() } }))

const camera = {
  camOn: true, camError: '', setVideoRef: vi.fn(), canvasRef: { current: null }, overlayRef: { current: null },
  clearOverlay: vi.fn(), start: vi.fn(), stop: vi.fn(),
}

afterEach(() => window.sessionStorage.clear())

describe('kiosk presentation', () => {
  it('rejects an incomplete access code before scanning', async () => {
    render(<KioskView camera={camera} modelsReady workspaceReady locationState={{ ready: true }} onLogAttendance={vi.fn()} />)
    await userEvent.type(screen.getByLabelText(/four-digit access code/i), '12')
    await userEvent.click(screen.getByRole('button', { name: /continue to scan/i }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter exactly four digits.')
    expect(camera.start).not.toHaveBeenCalled()
  })

  it('keeps one functional face guide and removes decorative scanner effects', () => {
    const { container } = render(
      <div className="relative h-screen">
        <KioskScanningOverlay
          camera={camera} clock="8:15 AM" dateStr="August 24, 2026"
          faceDistanceInfo={{ label: 'Move closer', isCaptureReady: false }}
          kioskState="scanning" locationState={{ ready: true }}
        />
      </div>,
    )
    expect(container.querySelector('video')).toBeTruthy()
    expect(container.querySelector('.scan-visual__grid')).toBeNull()
    expect(container.querySelector('.scan-visual__sweep')).toBeNull()
    expect(container.querySelector('.scan-visual__corner')).toBeNull()
    expect(screen.getByText(/move closer/i)).toBeVisible()
  })

  it('shows a named recorded result and one recovery action', () => {
    render(<KioskSuccessScreen currentMatch={{ name: 'Maria Santos', time: '8:15 AM' }} onBack={vi.fn()} />)
    expect(screen.getByText('Maria Santos')).toBeVisible()
    expect(screen.getByText('8:15 AM')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Scan next' })).toBeVisible()
  })

  it('distinguishes an already-recorded result without losing identity or recovery', () => {
    const { container } = render(<KioskSuccessScreen currentMatch={{ name: 'Maria Santos', time: '8:15 AM', resultState: 'already-recorded' }} onBack={vi.fn()} />)
    expect(screen.getByText('Already recorded')).toBeVisible()
    const resultIcon = container.querySelector('[data-tone="warning"]')
    expect(resultIcon).toBeTruthy()
    expect(resultIcon.querySelector('.lucide-clock-3')).toBeTruthy()
    expect(screen.getByText('Maria Santos')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Scan next' })).toBeVisible()
  })

  it('uses a labeled field-duty dialog and preserves the GPS review notice', async () => {
    render(<KioskView camera={camera} modelsReady workspaceReady locationState={{ ready: true }} onLogAttendance={vi.fn()} />)
    await userEvent.type(screen.getByLabelText(/four-digit access code/i), '1234')
    await userEvent.click(screen.getByRole('button', { name: /continue to scan/i }))
    await userEvent.click(screen.getByRole('button', { name: /offsite.*field duty/i }))
    expect(screen.getByRole('dialog', { name: 'Offsite / field duty' })).toBeVisible()
    expect(screen.getByLabelText(/^Reason/)).toBeVisible()
    expect(screen.getByLabelText(/^Remarks/)).toHaveAttribute('maxlength', '500')
    expect(screen.getByText(/actual GPS position/i)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Use for scan' })).toBeDisabled()
  })

  it('announces blocked and unknown scan feedback', () => {
    render(<KioskAlert alertState="Face not recognized" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Face not recognized')
  })

  it('keeps profile refresh authorized, named, and non-destructive', () => {
    render(<EmployeeReenrollPage person={{ id: 'person-1', name: 'Maria Santos', employeeId: '', officeName: 'Regional Office XII' }} />)
    expect(screen.getByRole('heading', { name: 'Maria Santos' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Back to admin' })).toBeVisible()
    expect(screen.getByText(/existing attendance and identity records remain intact/i)).toBeVisible()
    expect(screen.queryByRole('button', { name: /reset biometric/i })).not.toBeInTheDocument()
  })
})

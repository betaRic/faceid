import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import RegisterView from '@/components/RegisterView'
import CompleteStep from '@/components/register/CompleteStep'
import ThemeProvider from '@/components/ThemeProvider'

vi.mock('@/components/usePortalDestination', () => ({
  usePortalDestination: () => ({ href: '/login', label: 'Login', role: null }),
}))

vi.mock('@/hooks/useAudioCue', () => ({ useAudioCue: () => vi.fn() }))
vi.mock('@/hooks/useEnrollmentCapture', () => ({
  useEnrollmentCapture: () => ({
    capturePhase: -1,
    faceFound: false,
    statusMsg: 'Ready',
    currentYaw: 0,
    poseOk: false,
    faceSizeGuidance: null,
    startDetect: vi.fn(),
    stopDetect: vi.fn(),
    resetCapture: vi.fn(),
  }),
}))
vi.mock('@/lib/data-store', () => ({ checkEnrollmentDuplicate: vi.fn() }))

const offices = [{
  id: 'regional',
  name: 'Regional Office',
  officeType: 'Regional Office',
  divisions: [{ id: 'admin', name: 'Administrative Division', shortName: 'AD' }],
}]

const camera = {
  camOn: false,
  clearOverlay: vi.fn(),
  stop: vi.fn(),
  setVideoRef: vi.fn(),
  canvasRef: { current: null },
}

describe('employee registration presentation contracts', () => {
  function renderRegistration() {
    return render(
      <ThemeProvider>
        <RegisterView camera={camera} modelsReady offices={offices} onBack={vi.fn()} onEnrollPerson={vi.fn()} workspaceReady />
      </ThemeProvider>,
    )
  }

  it('keeps four stages and guides existing employees away from re-enrollment', () => {
    renderRegistration()

    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    expect(document.querySelector('[aria-current="step"]')).toHaveTextContent('Employee details')
    expect(screen.getByText(/Already registered\? Do not enroll again/i)).toBeVisible()
  })

  it('keeps Employee ID optional and digits-only', async () => {
    renderRegistration()
    const employeeId = screen.getByLabelText('Employee ID (optional)')

    await userEvent.type(employeeId, 'A12B')
    expect(employeeId).toHaveValue('12')
    expect(screen.getByText('Employee ID accepts digits only.')).toBeVisible()
  })

  it('requires privacy consent and Regional Office division', async () => {
    renderRegistration()
    const continueButton = screen.getByRole('button', { name: 'Continue to face capture' })

    await userEvent.type(screen.getByLabelText(/^Last name/), 'Santos')
    await userEvent.type(screen.getByLabelText(/^First name/), 'Maria')
    await userEvent.type(screen.getByLabelText(/^Position/), 'Officer')
    await userEvent.click(screen.getByRole('checkbox', { name: /consent to the processing/i }))
    expect(continueButton).toBeDisabled()

    await userEvent.selectOptions(screen.getByLabelText('Division / Unit'), 'admin')
    expect(continueButton).toBeEnabled()
  })

  it('shows the access code before employee identity on completion', () => {
    const { container } = render(
      <CompleteStep
        lastSavedSummary={{ accessCode: '2841', name: 'Maria Santos', officeName: 'Regional Office', lifecycleStatus: 'pending', sampleCount: 4, savedSampleCount: 4 }}
        onAddAnotherSample={vi.fn()}
        onEnrollNewPerson={vi.fn()}
      />,
    )
    const text = container.textContent
    expect(text.indexOf('2841')).toBeGreaterThanOrEqual(0)
    expect(text.indexOf('2841')).toBeLessThan(text.indexOf('Maria Santos'))
    expect(screen.getAllByText(/pending/i).length).toBeGreaterThan(0)
  })
})

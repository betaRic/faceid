import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PlatformNavigator from '@/components/PlatformNavigator'
import AdminLogin from '@/components/AdminLogin'
import BiometricWorkspaceGate from '@/components/BiometricWorkspaceGate'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import DilgLoadingIndicator from '@/components/shared/DilgLoadingIndicator'

afterEach(() => vi.restoreAllMocks())

describe('public entry experience', () => {
  it('keeps only essential public entry actions', () => {
    render(<PlatformNavigator />)

    expect(screen.getByRole('link', { name: /scan attendance/i })).toBeVisible()
    expect(screen.getByRole('link', { name: /register employee/i })).toBeVisible()
    expect(screen.queryByRole('link', { name: /(?:staff|admin|hr).*portal/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/staff workspace/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/live system/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/server-enforced identity verification/i)).not.toBeInTheDocument()
  })

  it('keeps PIN authentication and accessible error feedback', async () => {
    render(<AdminLogin />)

    expect(screen.getByLabelText('PIN')).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your PIN.')
    expect(screen.getByRole('link', { name: 'Back to home' })).toBeVisible()
  })

  it('uses semantic loading and biometric error states', () => {
    const { rerender } = render(<DilgLoadingIndicator label="Loading workspace…" />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading workspace…')

    rerender(
      <BiometricWorkspaceGate
        bootStage="error"
        errorMessage="Camera unavailable"
        modelStatus="Stopped"
        onRetry={vi.fn()}
        page="scan"
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Camera unavailable')
    expect(screen.getByRole('heading', { level: 1, name: 'Preparing scan workspace' })).toBeVisible()
  })

  it('offers a semantic retry when a public screen crashes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    function Broken() { throw new Error('Reference 42') }
    render(<ErrorBoundary><Broken /></ErrorBoundary>)

    expect(screen.getByRole('alert')).toHaveTextContent('Reference 42')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()
  })
})

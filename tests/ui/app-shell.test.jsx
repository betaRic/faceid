import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { usePathname } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppShell from '@/components/AppShell'
import ThemeProvider from '@/components/ThemeProvider'

vi.mock('@/components/usePortalDestination', () => ({
  usePortalDestination: () => ({ href: '/admin', label: 'Admin', role: 'admin' }),
}))

describe('public application shell', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue('/')
    localStorage.clear()
  })

  function renderShell(props = {}) {
    return render(<ThemeProvider><AppShell {...props}><p>Content</p></AppShell></ThemeProvider>)
  }

  it('shows core destinations without exposing staff access on home', () => {
    renderShell()

    expect(screen.getByRole('link', { name: 'VeriFace home' })).toHaveClass('min-h-11')
    expect(screen.getAllByRole('link', { name: 'Home' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: 'Scan' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: 'Register' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: 'Admin staff access' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Attendance' })).not.toBeInTheDocument()
  })

  it('preserves role-specific staff access away from home', () => {
    vi.mocked(usePathname).mockReturnValue('/scan')
    renderShell()

    expect(screen.getByRole('link', { name: 'Admin staff access' })).toHaveAttribute('href', '/admin')
  })

  it('marks the active destination', () => {
    vi.mocked(usePathname).mockReturnValue('/scan')
    renderShell()

    expect(screen.getByRole('link', { name: 'Scan' })).toHaveAttribute('aria-current', 'page')
  })

  it('opens and closes labeled mobile navigation', async () => {
    renderShell()
    const trigger = screen.getByRole('button', { name: 'Open navigation' })

    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('navigation', { name: 'Primary navigation' })).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: 'Close navigation' }))
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes mobile navigation with Escape and restores trigger focus', async () => {
    renderShell()
    const trigger = screen.getByRole('button', { name: 'Open navigation' })

    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('preserves custom navigation and mobile menu notifications', async () => {
    const onMobileMenuChange = vi.fn()
    renderShell({
      navItems: [{ href: '/help', label: 'Help', icon: 'security' }],
      onMobileMenuChange,
    })

    await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    expect(screen.getAllByRole('link', { name: 'Help' }).length).toBeGreaterThan(0)
    expect(onMobileMenuChange).toHaveBeenLastCalledWith(true)
  })
})

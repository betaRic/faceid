import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { usePathname } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppShell from '@/components/AppShell'

vi.mock('@/components/usePortalDestination', () => ({
  usePortalDestination: () => ({ href: '/admin', label: 'Admin', role: 'admin' }),
}))

describe('public application shell', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue('/')
  })

  it('shows core destinations and role-specific staff access', () => {
    render(<AppShell><p>Content</p></AppShell>)

    expect(screen.getByRole('link', { name: 'VeriFace home' })).toHaveClass('min-h-11')
    expect(screen.getAllByRole('link', { name: 'Home' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: 'Scan' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: 'Register' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Admin staff access' })).toHaveAttribute('href', '/admin')
    expect(screen.queryByRole('link', { name: 'Attendance' })).not.toBeInTheDocument()
  })

  it('marks the active destination', () => {
    vi.mocked(usePathname).mockReturnValue('/scan')
    render(<AppShell><p>Content</p></AppShell>)

    expect(screen.getByRole('link', { name: 'Scan' })).toHaveAttribute('aria-current', 'page')
  })

  it('opens and closes labeled mobile navigation', async () => {
    render(<AppShell><p>Content</p></AppShell>)
    const trigger = screen.getByRole('button', { name: 'Open navigation' })

    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('navigation', { name: 'Primary navigation' })).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: 'Close navigation' }))
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes mobile navigation with Escape and restores trigger focus', async () => {
    render(<AppShell><p>Content</p></AppShell>)
    const trigger = screen.getByRole('button', { name: 'Open navigation' })

    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('preserves custom navigation and mobile menu notifications', async () => {
    const onMobileMenuChange = vi.fn()
    render(
      <AppShell
        navItems={[{ href: '/help', label: 'Help', icon: 'security' }]}
        onMobileMenuChange={onMobileMenuChange}
      >
        <p>Content</p>
      </AppShell>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    expect(screen.getAllByRole('link', { name: 'Help' }).length).toBeGreaterThan(0)
    expect(onMobileMenuChange).toHaveBeenLastCalledWith(true)
  })
})

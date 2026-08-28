import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminShell from '@/components/admin/AdminShell'

const navItems = [
  { id: 'employees', label: 'Employees', badge: 3 },
  { id: 'summary', label: 'Summary' },
  { id: 'roles', label: 'Roles', disabled: true },
]

describe('Admin and HR shell', () => {
  beforeEach(() => window.localStorage.clear())

  it('shows the current role, selected operation, and pending work', () => {
    render(
      <AdminShell activePanel="employees" navItems={navItems} roleScope="office">
        <p>Employee table</p>
      </AdminShell>,
    )

    expect(screen.getByText('Office HR workspace')).toBeVisible()
    expect(screen.getAllByRole('button', { name: /Employees/ })[0]).toHaveAttribute('aria-current', 'page')
    expect(screen.getAllByLabelText('3 pending approvals').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /Roles/ })[0]).toBeDisabled()
  })

  it('persists desktop navigation collapse', async () => {
    render(<AdminShell activePanel="employees" navItems={navItems}><p>Content</p></AdminShell>)

    await userEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }))
    expect(window.localStorage.getItem('faceattend:admin-sidebar-collapsed:v2')).toBe('true')
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toBeVisible()
  })

  it('opens and closes the mobile workspace drawer', async () => {
    render(<AdminShell activePanel="employees" navItems={navItems}><p>Content</p></AdminShell>)
    const open = screen.getByRole('button', { name: 'Open workspace navigation' })

    await userEvent.click(open)
    expect(screen.getByRole('dialog', { name: 'Workspace navigation' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Close workspace navigation' }))
    expect(screen.queryByRole('dialog', { name: 'Workspace navigation' })).not.toBeInTheDocument()
  })

  it('renders operational actions with visible names', () => {
    render(
      <AdminShell
        actions={<><button type="button">Scan</button><button type="button">Logout</button></>}
        activePanel="employees"
        navItems={navItems}
      >
        <p>Content</p>
      </AdminShell>,
    )

    expect(screen.getByRole('button', { name: 'Scan' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Logout' })).toBeVisible()
  })
})

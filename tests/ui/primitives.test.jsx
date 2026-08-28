import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  Button,
  Dialog,
  EmptyState,
  Field,
  FilterBar,
  OrganizationFilterFields,
  ResponsiveRecordList,
  Status,
  TableFrame,
  Toast,
} from '@/components/ui'
import { expectNoCriticalAxeViolations } from './test-axe'

describe('Civic UI primitives', () => {
  it('renders labeled controls and semantic status', async () => {
    const onClick = vi.fn()
    const { container } = render(
      <div>
        <Field label="Employee name" htmlFor="employee-name">
          <input id="employee-name" />
        </Field>
        <Status tone="pending">Pending review</Status>
        <Button onClick={onClick}>Review employee</Button>
      </div>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Review employee' }))
    expect(onClick).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Employee name')).toBeVisible()
    expect(screen.getByText('Pending review')).toHaveAttribute('data-tone', 'pending')
    await expectNoCriticalAxeViolations(container)
  })

  it('connects errors and disables unavailable actions', async () => {
    const onClick = vi.fn()
    render(
      <>
        <Field label="PIN" htmlFor="pin" error="PIN is required">
          <input id="pin" />
        </Field>
        <Button disabled onClick={onClick}>Continue</Button>
      </>,
    )

    expect(screen.getByLabelText('PIN')).toHaveAccessibleDescription('PIN is required')
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('uses sentence-case touch controls', () => {
    render(<Button>Save changes</Button>)
    const button = screen.getByRole('button', { name: 'Save changes' })
    expect(button.className).toContain('min-h-11')
    expect(button.className).not.toContain('uppercase')
  })

  it('gives notification dismissal an accessible name', () => {
    render(<Toast onDismiss={vi.fn()}>Saved</Toast>)
    expect(screen.getByRole('button', { name: 'Dismiss notification' })).toBeVisible()
  })

  it('allows a page-level empty state heading', () => {
    render(<EmptyState headingLevel={1} title="Attendance access required" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Attendance access required' })).toBeVisible()
  })

  it('renders an accessible dialog and restores focus', async () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <>
        <button type="button">Open review</button>
        <Dialog open={false} title="Review employee" onClose={onClose}>
          <p>Review details</p>
        </Dialog>
      </>,
    )
    const trigger = screen.getByRole('button', { name: 'Open review' })
    trigger.focus()
    rerender(
      <>
        <button type="button">Open review</button>
        <Dialog open title="Review employee" onClose={onClose}>
          <p>Review details</p>
        </Dialog>
      </>,
    )
    expect(screen.getByRole('dialog', { name: 'Review employee' })).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(onClose).toHaveBeenCalledOnce()
    rerender(
      <>
        <button type="button">Open review</button>
        <Dialog open={false} title="Review employee" onClose={onClose}>
          <p>Review details</p>
        </Dialog>
      </>,
    )
    expect(screen.getByRole('button', { name: 'Open review' })).toHaveFocus()
  })

  it('keeps search first and exposes mobile record labels', () => {
    render(
      <>
        <FilterBar search={<input aria-label="Search employees" />}>
          <select aria-label="Office"><option>All offices</option></select>
        </FilterBar>
        <TableFrame>
          <table><tbody><tr><th>Name</th><td>Ada Santos</td></tr></tbody></table>
        </TableFrame>
        <ResponsiveRecordList records={[{ id: 'ada', fields: [{ label: 'Name', value: 'Ada Santos' }] }]} />
      </>,
    )

    const filters = screen.getByTestId('filter-bar')
    expect(filters.firstElementChild).toContainElement(screen.getByLabelText('Search employees'))
    expect(screen.getAllByText('Name')).toHaveLength(2)
    expect(screen.getAllByText('Ada Santos')).toHaveLength(2)
  })

  it('reports organization filter changes without inventing empty levels', async () => {
    const onChange = vi.fn()
    render(
      <OrganizationFilterFields
        levels={[
          { id: 'region', label: 'Region', value: '12', options: [{ value: '12', label: 'Region XII' }] },
          { id: 'office', label: 'Office', value: '', options: [{ value: 'ro', label: 'Regional Office' }] },
          { id: 'department', label: 'Department', value: '', options: [] },
        ]}
        onChange={onChange}
      />,
    )

    await userEvent.selectOptions(screen.getByLabelText('Office'), 'ro')
    expect(onChange).toHaveBeenCalledWith('office', 'ro')
    expect(screen.queryByLabelText('Department')).not.toBeInTheDocument()
  })
})

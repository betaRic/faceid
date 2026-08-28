import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AdminOfficePanel from '@/components/AdminOfficePanel'

vi.mock('@/components/OfficeLocationPicker', () => ({
  default: () => <div>Office map</div>,
}))

describe('regional office configuration', () => {
  it('uses named location controls and exposes selected work days', () => {
    render(
      <AdminOfficePanel
        activeOffice={{
          id: 'regional',
          name: 'Regional Office XII',
          officeType: 'Regional Office',
          divisions: [],
          gps: { latitude: 6.5, longitude: 124.8, radiusMeters: 100 },
          workPolicy: { workingDays: [1], wfhDays: [] },
        }}
        handleUseMyLocation={vi.fn()}
        toggleDay={vi.fn()}
        updateDraft={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Use my location' })).toBeVisible()
    expect(screen.getAllByRole('button', { name: 'Mon' })[0]).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(/📍/)).not.toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import LocationEvidencePanel from '@/components/admin/LocationEvidencePanel'

const group = { device: 'desktop', os: 'Windows', browser: 'Edge', browserVersion: '140', connection: 'unknown',
  buildId: 'build-a', completed: 4, ready: 3, readyRate: .75, outcomes: { timeout: 1 }, sessions: 2, days: 1,
  cancelled: 0, missingAccuracy: 1, maxAccuracy: 250, medianWaitMs: 1000, slowWaitMs: 30000,
  medianAccuracy: 83, evidenceStatus: 'Not enough data' }
it('shows automatic comparisons and filters without employee test controls', async () => {
  render(<LocationEvidencePanel evidence={{ available: true, examined: 8, total: 8, groups: [group, { ...group, browser: 'Chrome' }] }} />)
  expect(screen.queryByRole('button', { name: /test this device/i })).not.toBeInTheDocument()
  expect(screen.getAllByText('Not exposed by browser')).toHaveLength(2)
  await userEvent.selectOptions(screen.getByLabelText('Location browser'), 'Edge')
  expect(screen.queryByText('Chrome 140')).not.toBeInTheDocument()
  expect(screen.getByText('Edge 140')).toBeInTheDocument()
  expect(screen.getByText('±83 m')).toBeInTheDocument()
})
it('distinguishes unavailable reporting from no observations', () => {
  const { rerender } = render(<LocationEvidencePanel evidence={{ available: false }} />)
  expect(screen.getByText(/Location reports are unavailable/)).toBeInTheDocument()
  rerender(<LocationEvidencePanel evidence={{ available: true, examined: 0, total: 0, groups: [] }} />)
  expect(screen.getByText(/No location checks match/)).toBeInTheDocument()
})

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { expectNoCriticalAxeViolations } from './test-axe'

describe('UI test harness', () => {
  it('renders React and runs accessibility checks', async () => {
    const { container } = render(<main><h1>VeriFace UI tests</h1></main>)
    expect(screen.getByRole('heading', { name: 'VeriFace UI tests' })).toBeVisible()
    await expectNoCriticalAxeViolations(container)
  })
})

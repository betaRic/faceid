import axe from 'axe-core'
import { expect } from 'vitest'

export async function expectNoCriticalAxeViolations(container) {
  const result = await axe.run(container, {
    rules: {
      'color-contrast': { enabled: false },
    },
  })
  const critical = result.violations.filter(item => item.impact === 'critical')
  expect(critical).toEqual([])
}

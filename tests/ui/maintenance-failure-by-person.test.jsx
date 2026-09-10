import { describe, expect, test } from 'vitest'
import { buildMaintenanceEvidenceReport } from '../../lib/maintenance/event-evidence'

describe('maintenance failure ownership', () => {
  test('counts failed outcomes by canonical person and keeps unknown failures separate', () => {
    const report = buildMaintenanceEvidenceReport([
      { status: 'blocked', decisionCode: 'blocked_claimed_employee_mismatch', personId: 'person-a', matchDebug: { resolvedPersonId: 'person-a' } },
      { status: 'blocked', decisionCode: 'blocked_rate_limited', personId: 'person-a' },
      { status: 'blocked', decisionCode: 'blocked_antispoof', employeeId: '5165' },
    ], {
      currentEmployees: [{ personId: 'person-a', employeeId: '12170', name: 'Michael Dedase' }],
    })

    expect(report.failuresByPerson).toEqual([{
      personId: 'person-a',
      employeeId: '12170',
      name: 'Michael Dedase',
      attempts: 2,
      decisions: [
        { key: 'blocked_claimed_employee_mismatch', count: 1 },
        { key: 'blocked_rate_limited', count: 1 },
      ],
    }])
    expect(report.unattributedFailureCount).toBe(1)
  })
})

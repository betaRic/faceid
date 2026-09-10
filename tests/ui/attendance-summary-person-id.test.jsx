import { describe, expect, test } from 'vitest'
import { buildAttendanceSummary } from '../../lib/attendance-summary'

describe('attendance summary identity', () => {
  test('keeps two people with the same employee number in separate summaries', () => {
    const persons = [
      { id: 'person-a', employeeId: '12170', name: 'Michael Dedase', officeId: 'office-1' },
      { id: 'person-b', employeeId: '12170', name: 'Kristine Elipan', officeId: 'office-1' },
    ]
    const attendance = [
      { personId: 'person-a', employeeId: '12170', name: 'Michael Dedase', officeId: 'office-1', dateKey: '2026-09-10', timestamp: 1, action: 'checkin' },
      { personId: 'person-b', employeeId: '12170', name: 'Kristine Elipan', officeId: 'office-1', dateKey: '2026-09-10', timestamp: 2, action: 'checkin' },
    ]

    const result = buildAttendanceSummary({ attendance, persons, offices: [], targetDate: '2026-09-10' })

    expect(result.map(row => row.personId).sort()).toEqual(['person-a', 'person-b'])
  })
})

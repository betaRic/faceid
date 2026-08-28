import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AttendanceTableView from '@/components/kiosk/AttendanceTableView'

const currentMatch = { personId: 'person-1', employeeId: '2841', name: 'Maria Santos', employeeViewSession: 'session' }

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

afterEach(() => vi.unstubAllGlobals())

describe('public attendance records', () => {
  it('announces loading', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<AttendanceTableView currentMatch={currentMatch} onBack={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent(/loading attendance/i)
  })

  it('renders canonical attendance rows without duplicate metric tiles', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      ok: true,
      days: [{ dateKey: '2026-08-24', date: '2026-08-24', amIn: '08:00', amOut: '12:00', pmIn: '13:00', pmOut: '17:00', status: 'complete', attendanceMode: 'On-site', undertime: 0, undertimeDisplay: '--' }],
    })))
    render(<AttendanceTableView currentMatch={currentMatch} onBack={vi.fn()} />)

    const table = await screen.findByRole('table', { name: 'Attendance records' })
    expect(within(table).getByText('2026-08-24')).toBeVisible()
    expect(within(table).getAllByText('08:00')).toHaveLength(1)
    expect(screen.queryByText(/check-ins today/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate DTR' })).toBeEnabled()
  })

  it('shows empty attendance and expired-access states', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ ok: true, days: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const { rerender } = render(<AttendanceTableView currentMatch={currentMatch} onBack={vi.fn()} />)
    expect(await screen.findByText('No attendance records')).toBeVisible()

    fetchMock.mockResolvedValueOnce(response({ ok: false, message: 'Denied' }, 401))
    rerender(<AttendanceTableView currentMatch={{ ...currentMatch, employeeViewSession: 'new-session' }} onBack={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/session expired/i)
  })
})

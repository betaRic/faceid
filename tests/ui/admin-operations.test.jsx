import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmployeesPanel } from '@/components/admin/EmployeesPanel'
import { HrEmployeesPanel } from '@/components/admin/HrEmployeesPanel'
import EmployeeDeleteModal from '@/components/admin/EmployeeDeleteModal'
import HrOfficeSettingsPanel from '@/components/admin/HrOfficeSettingsPanel'
import OfficePanel from '@/components/admin/OfficePanel'
import OfficeEditorModal from '@/components/admin/OfficeEditorModal'
import EmployeeEditorModal from '@/components/admin/EmployeeEditorModal'
import AttendanceOverrideModal from '@/components/admin/AttendanceOverrideModal'
import DtrSelectionView from '@/components/admin/summary/DtrSelectionView'
import SummaryFilters from '@/components/admin/summary/SummaryFilters'
import WorkforcePanel from '@/components/admin/WorkforcePanel'
import WorkforceRecordModal from '@/components/admin/WorkforceRecordModal'
import { ThresholdSettings } from '@/components/admin/ThresholdSettings'
import { AddRoleModal } from '@/components/admin/AddRoleModal'
import { AdminsPanel } from '@/components/admin/AdminsPanel'
import { MaintenanceEvidencePanel } from '@/components/admin/MaintenanceEvidencePanel'
import { DashboardPanel } from '@/components/admin/DashboardPanel'
import { ToastContainer } from '@/components/shared/ui'

vi.mock('@/components/AdminOfficePanel', () => ({
  default: () => <div>Office configuration fields</div>,
}))

const nextPage = vi.fn()
const previousPage = vi.fn()
const roleHooks = vi.hoisted(() => ({
  createHrUser: vi.fn(),
  updateHrUser: vi.fn(async () => ({ ok: true })),
  deleteHrUser: vi.fn(),
  isHrPending: vi.fn(() => false),
}))

const employees = [
  { id: 'pending', name: 'Pending Person', employeeId: '', officeName: 'Regional Office', divisionName: 'Administrative Division', lifecycleStatus: 'pending', sampleCount: 4 },
  { id: 'active', name: 'Active Person', employeeId: '1002', officeName: 'Regional Office', divisionName: 'Administrative Division', lifecycleStatus: 'active', sampleCount: 5 },
]

vi.mock('@/lib/admin/hooks', () => ({
  useEmployees: () => ({
    employees,
    employeesLoaded: true,
    employeeTotal: 50,
    employeeHasMore: true,
    employeeHistoryLength: 1,
    employeeQuery: '', setEmployeeQuery: vi.fn(),
    employeeOfficeFilter: 'regional', setEmployeeOfficeFilter: vi.fn(),
    employeeDivisionFilter: 'all', setEmployeeDivisionFilter: vi.fn(),
    employeeStatusFilter: 'all', setEmployeeStatusFilter: vi.fn(),
    handlePreviousPage: previousPage, handleNextPage: nextPage, refreshEmployees: vi.fn(),
    handleBulkEmployeeUpdate: vi.fn(), setEditingEmployee: vi.fn(), setDeletingEmployee: vi.fn(),
  }),
  useOffices: () => ({ offices: [{ id: 'regional', name: 'Regional Office', employees: 2 }], visibleOffices: [{ id: 'regional', name: 'Regional Office', divisions: [{ id: 'admin', name: 'Administrative Division' }] }] }),
  useAttendance: () => ({ attendanceLoaded: true, todaysLogs: [{ id: 'log-1' }] }),
  useAdmins: () => ({
    admins: [{ id: 'admin-1', displayName: 'Regional Admin', email: '', role: 'admin', scope: 'regional', active: true }],
    adminsLoaded: true, handleCreateAdmin: vi.fn(), handleUpdateAdmin: vi.fn(), handleDeleteAdmin: vi.fn(), isPending: vi.fn(() => false),
  }),
  useHrUsers: () => ({
    hrUsers: [
      { id: 'hr-regional', displayName: 'Regional HR', scope: 'regional', officeId: 'regional', active: true },
      { id: 'hr-unassigned', displayName: 'Unassigned Office HR', scope: 'office', officeId: '', active: true },
      { id: 'hr-regional-unassigned', displayName: 'Unassigned Regional HR', scope: 'regional', officeId: '', active: false },
    ],
    hrUsersLoaded: true,
    createHrUser: roleHooks.createHrUser,
    updateHrUser: roleHooks.updateHrUser,
    deleteHrUser: roleHooks.deleteHrUser,
    isPending: roleHooks.isHrPending,
  }),
}))

vi.mock('@/lib/hr/hooks', () => ({
  useHrEmployees: () => ({
    employees,
    employeesLoaded: true,
    employeeTotal: 2,
    employeeQuery: '', setEmployeeQuery: vi.fn(),
    employeeStatusFilter: '', setEmployeeStatusFilter: vi.fn(),
    employeePage: 1, employeeHasMore: false,
    handlePreviousPage: vi.fn(), handleNextPage: vi.fn(), fetchEmployees: vi.fn(), loading: false,
  }),
}))

vi.mock('@/lib/admin/hooks/useOffices', () => ({
  useOffices: () => ({
    officesLoaded: true,
    visibleOffices: [{
      id: 'regional',
      code: 'RO12',
      name: 'Regional Office XII',
      shortName: 'RO XII',
      officeType: 'Regional Office',
      provinceOrCity: 'Koronadal City',
      employees: 12,
      status: 'active',
      gps: { radiusMeters: 100 },
      workPolicy: { schedule: 'Monday to Friday', wfhDays: [5] },
    }],
    selectedOfficeId: 'regional', setSelectedOfficeId: vi.fn(),
    activeOffice: null, draftOffice: null,
    officeDraftWarning: '', officeDraftDirty: false,
    locationLoading: false, locationNotice: '', highlightLocationPin: false,
    savePending: false, deletePending: false,
    updateDraft: vi.fn(), toggleDay: vi.fn(), addDivision: vi.fn(),
    updateDivision: vi.fn(), removeDivision: vi.fn(), handleSaveOffice: vi.fn(),
    handleStartCreateOffice: vi.fn(), handleStartEditOffice: vi.fn(),
    handleCancelOfficeEditor: vi.fn(), handleDeleteOffice: vi.fn(), handleUseMyLocation: vi.fn(),
  }),
}))

vi.mock('@/lib/admin/hooks/useThresholds', () => ({
  useThresholds: () => ({
    loading: false, saving: false, error: '', saveThresholds: vi.fn(), resetThresholds: vi.fn(),
    sections: {
      biometric: {
        label: 'Biometric matching', description: 'Matching controls',
        fields: {
          kioskMatchDistance: { label: 'Match distance', current: 0.75, default: 0.75, min: 0.5, max: 1, step: 0.01 },
          ambiguousMargin: { label: 'Ambiguity margin', current: 0.06, default: 0.06, min: 0.04, max: 0.2, step: 0.01 },
        },
      },
    },
  }),
}))

const storeState = {
  roleScope: 'regional',
  admins: [{ id: 'admin-1' }], adminsLoaded: true, setActivePanel: vi.fn(),
  offices: [
    { id: 'regional', name: 'Regional Office XII', officeType: 'Regional Office', divisions: [{ id: 'admin', name: 'Administrative Division' }] },
    { id: 'field-office', name: 'General Santos Field Office', officeType: 'Field Office', divisions: [] },
  ],
  employeeRefreshKey: 0,
  setEditingEmployee: vi.fn(),
  setDeletingEmployee: vi.fn(),
  addToast: vi.fn(),
  toasts: [],
  removeToast: vi.fn(),
  refreshEmployees: vi.fn(),
  setPending: vi.fn(),
  isPending: vi.fn(() => false),
}
vi.mock('@/lib/admin/store', () => ({ useAdminStore: (selector) => typeof selector === 'function' ? selector(storeState) : storeState }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  roleHooks.isHrPending.mockReturnValue(false)
  storeState.addToast.mockReset()
  storeState.toasts = []
})

describe('admin employee operations', () => {
  it('keeps search first, authoritative office/division filters, pending text, and cursors', async () => {
    render(<EmployeesPanel />)
    const filterBar = screen.getByTestId('filter-bar')

    expect(filterBar.firstElementChild).toContainElement(screen.getByLabelText('Search employees'))
    expect(screen.getByLabelText('Office')).toBeVisible()
    expect(screen.getByLabelText('Division')).toBeVisible()
    expect(screen.getAllByText('Pending review').length).toBeGreaterThan(0)
    expect(screen.getByText('Page 2 of 3')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(nextPage).toHaveBeenCalled()
  })

  it('keeps Office HR inside personnel and work-policy scope', async () => {
    render(<HrEmployeesPanel />)
    expect(screen.getByText('Office HR employees')).toBeVisible()
    expect(screen.queryByText(/latitude|longitude|radius|map|gps|geofence|office location/i)).not.toBeInTheDocument()

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          office: {
            id: 'office-12',
            name: 'Office 12',
            location: 'Hidden office location',
            gps: { latitude: 6.1, longitude: 125.1, radiusMeters: 500 },
            wifiSsid: ['HIDDEN-WIFI'],
            workPolicy: { schedule: 'Current schedule', workingDays: [], wfhDays: [] },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          office: {
            id: 'office-12',
            name: 'Office 12',
            workPolicy: { schedule: 'Updated schedule', workingDays: [], wfhDays: [] },
          },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)
    render(<HrOfficeSettingsPanel />)
    expect(await screen.findByText('Office settings')).toBeVisible()
    expect(screen.queryByText(/latitude|longitude|radius|map|gps|geofence|location|wifi/i)).not.toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Schedule label'))
    await userEvent.type(screen.getByLabelText('Schedule label'), 'Updated schedule')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const requestBody = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(requestBody).toEqual({
      workPolicy: expect.objectContaining({ schedule: 'Updated schedule' }),
    })
    expect(JSON.stringify(requestBody)).not.toMatch(/latitude|longitude|radius|map|gps|geofence|location|wifi/i)
  })

  it('names the employee and destructive action in deactivation confirmation', () => {
    render(<EmployeeDeleteModal onCancel={vi.fn()} person={employees[1]} />)
    expect(screen.getByRole('dialog', { name: 'Deactivate employee' })).toHaveTextContent('Active Person')
    expect(screen.getByRole('button', { name: 'Deactivate employee' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible()
  })

  it('presents regional offices as a responsive operational directory', () => {
    render(<OfficePanel />)
    expect(screen.getByRole('heading', { name: 'Offices' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Add office' })).toBeVisible()
    expect(screen.getAllByText('Regional Office XII').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Regional Office').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0)
  })

  it('gives the regional office editor a clear heading and save state', () => {
    render(
      <OfficeEditorModal
        activeOffice={{ id: 'regional', name: 'Regional Office XII' }}
        handleCancel={vi.fn()}
        handleSaveOffice={vi.fn()}
        officeDraftDirty
        savePending={false}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Edit office' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Close' })).toBeVisible()
  })

  it('keeps employee editing compact, named, and safe for authorized re-enrollment', () => {
    render(
      <EmployeeEditorModal
        onCancel={vi.fn()}
        onSave={vi.fn()}
        person={{
          id: 'active', name: 'Active Person', firstName: 'Active', lastName: 'Person',
          employeeId: '', officeId: 'regional', divisionId: 'admin', position: 'Officer',
          lifecycleStatus: 'active', sampleCount: 5,
        }}
      />,
    )
    expect(screen.getByLabelText('Employee ID (optional)')).toBeVisible()
    expect(screen.getByLabelText('Division / Unit')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Re-enroll live capture' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Close employee record' }).querySelector('svg')).toBeTruthy()
  })

  it('shows original and proposed attendance evidence before saving a correction', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, logs: [] }) }))
    render(
      <AttendanceOverrideModal
        onClose={vi.fn()}
        onSaved={vi.fn()}
        row={{
          personId: 'person-1', employeeId: '1001', name: 'Active Person',
          officeId: 'regional', officeName: 'Regional Office XII', dateKey: '2026-08-24',
          amIn: '08:15', amOut: '12:00', pmIn: '13:00', pmOut: '17:00',
        }}
      />,
    )
    expect(screen.getByRole('dialog', { name: 'Attendance correction' })).toBeVisible()
    expect(screen.getByText('Original')).toBeVisible()
    expect(screen.getByText('Proposed')).toBeVisible()
    expect(screen.getByDisplayValue('08:15')).toBeVisible()
    expect(screen.getByLabelText(/Reason/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save correction' })).toBeVisible()
  })

  it('loads and saves blank EmployeeID corrections using only canonical person ID and correction fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, logs: [] }) })
    const onSaved = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<AttendanceOverrideModal onClose={vi.fn()} onSaved={onSaved} row={{
      personId: 'person-blank-id', employeeId: '', name: 'Blank ID Person', officeId: 'regional',
      officeName: 'Regional Office XII', dateKey: '2026-08-24', amIn: '08:15',
    }} />)
    expect(screen.getByText(/No employee ID/)).toBeVisible()
    await screen.findByText('No entries recorded')
    expect(fetchMock.mock.calls[0]).toEqual(['/api/admin/attendance?personId=person-blank-id&date=2026-08-24'])
    await userEvent.type(screen.getByLabelText(/Reason/), '  Scanner failure  ')
    await userEvent.click(screen.getByRole('button', { name: 'Save correction' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    const [url, request] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/admin/attendance')
    expect(request.method).toBe('POST')
    expect(JSON.parse(request.body)).toEqual({
      personId: 'person-blank-id', action: 'checkin', manualSlot: 'am_in',
      timestamp: Date.parse('2026-08-24T08:15:00+08:00'), dateKey: '2026-08-24', reason: 'Scanner failure',
    })
    expect(fetchMock.mock.calls[2]).toEqual(['/api/admin/attendance?personId=person-blank-id&date=2026-08-24'])
    expect(storeState.addToast).toHaveBeenCalledWith('Manual AM In added.', 'success')
    expect(screen.getByLabelText(/Reason/)).toHaveValue('')
  })

  it('keeps DTR employee, period, scope, and output actions in one flow', () => {
    render(
      <DtrSelectionView
        allVisibleSelected={false}
        customEndDay={31} customStartDay={1} daysInMonth={31}
        divisionId="all" divisions={[]}
        dtrLoading={false} employeesLoading={false}
        dtrMonth={8} dtrProgress={{ current: 0, total: 0 }} dtrRange="full" dtrYear={2026}
        filteredEmployees={[{ id: 'active', name: 'Active Person', employeeId: '1001', officeName: 'Regional Office XII' }]}
        onCancel={vi.fn()} onClose={vi.fn()} onGenerate={vi.fn()} onSearchChange={vi.fn()}
        onSelectAll={vi.fn()} onSetCustomEndDay={vi.fn()} onSetCustomStartDay={vi.fn()}
        onSetDivisionId={vi.fn()} onSetDtrMonth={vi.fn()} onSetDtrRange={vi.fn()} onSetDtrYear={vi.fn()}
        onToggleEmployee={vi.fn()} search="" selectedIds={new Set(['active'])}
        uniqueEmployees={[{ id: 'active', name: 'Active Person' }]}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Generate DTR' })).toBeVisible()
    expect(screen.getByLabelText('Month')).toBeVisible()
    expect(screen.getByLabelText('Year')).toBeVisible()
    expect(screen.getByLabelText('Division')).toBeVisible()
    expect(screen.getByLabelText('Search employees')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Download Excel (1)' })).toBeVisible()
  })

  it('keeps attendance search first with date and authoritative organization filters', () => {
    render(
      <SummaryFilters
        onOpenDtr={vi.fn()} onSetSummaryDate={vi.fn()} onSetSummaryDivisionFilter={vi.fn()}
        onSetSummaryEmployeeFilter={vi.fn()} onSetSummaryOfficeFilter={vi.fn()} onSetSummaryQuery={vi.fn()}
        showDivisionFilter summaryDate="2026-08-24" summaryDivisionFilter="all"
        summaryDivisionOptions={[{ id: 'admin', name: 'Administrative Division' }]}
        summaryEmployeeFilter="all" summaryEmployeeOptions={[]} summaryLoading={false}
        summaryOfficeFilter="all" summaryQuery="" visibleOffices={[{ id: 'regional', name: 'Regional Office XII' }]}
      />,
    )
    const filters = screen.getByTestId('filter-bar')
    expect(filters.firstElementChild).toContainElement(screen.getByLabelText('Search attendance'))
    expect(screen.getByLabelText('Date')).toBeVisible()
    expect(screen.getByLabelText('Office')).toBeVisible()
    expect(screen.getByLabelText('Division')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Generate DTR' })).toBeVisible()
  })

  it('keeps national holiday actions Regional-only', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => ({
      ok: true, status: 200,
      text: async () => JSON.stringify(String(url).includes('/dtr/employees') ? { ok: true, employees: [] } : { ok: true, records: [] }),
    })))
    render(<WorkforcePanel allowNationalHolidays={false} />)
    expect(screen.getByRole('heading', { name: 'Workforce records' })).toBeVisible()
    expect(await screen.findByRole('button', { name: 'Add Holiday' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /Seed 2026/ })).not.toBeInTheDocument()
  })

  it('uses an accessible workforce record dialog', () => {
    render(
      <WorkforceRecordModal
        editing="new" employees={[]} form={{ leaveType: 'VL' }}
        onClose={vi.fn()} onSubmit={vi.fn()} saving={false} tab="leave" update={vi.fn()}
      />,
    )
    expect(screen.getByRole('dialog', { name: 'New Leave' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeVisible()
    expect(screen.getByLabelText('Search employees')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save Leave' })).toBeVisible()
  })

  it('keeps biometric thresholds and Regional PIN controls labeled without exposing a PIN value', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, configured: true, enabled: true }),
    }))
    render(<ThresholdSettings />)
    expect(screen.getByRole('heading', { name: 'System settings' })).toBeVisible()
    expect(screen.getByLabelText('Match distance')).toBeVisible()
    expect(screen.getByLabelText('Ambiguity margin')).toBeVisible()
    expect(await screen.findByText('Regional Bootstrap PIN')).toBeVisible()
    expect(screen.queryByRole('textbox', { name: /PIN/i })).not.toBeInTheDocument()
  })

  it('creates Regional HR through an accessible scoped dialog without exposing entered PIN text', async () => {
    const submit = vi.fn()
    render(<AddRoleModal isOpen onClose={vi.fn()} onSubmit={submit} />)
    expect(screen.getByRole('dialog', { name: 'Add role' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Administrator' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText(/^Office/)).toBeVisible()
    expect(screen.getByLabelText(/^PIN/)).toHaveAttribute('type', 'password')

    await userEvent.click(screen.getByRole('button', { name: 'HR' }))
    const scopeSelect = screen.getByRole('combobox', { name: 'HR scope' })
    const officeSelect = screen.getByRole('combobox', { name: 'HR office' })
    expect(within(officeSelect).queryByRole('option', { name: 'Regional Office XII' })).not.toBeInTheDocument()
    expect(within(officeSelect).getByRole('option', { name: 'General Santos Field Office' })).toBeVisible()
    await userEvent.selectOptions(officeSelect, 'field-office')

    await userEvent.selectOptions(scopeSelect, 'regional')
    const regionalOfficeSelect = screen.getByRole('combobox', { name: 'HR office' })
    expect(regionalOfficeSelect).toHaveValue('')
    expect(within(regionalOfficeSelect).getByRole('option', { name: 'Regional Office XII' })).toBeVisible()
    expect(within(regionalOfficeSelect).queryByRole('option', { name: 'General Santos Field Office' })).not.toBeInTheDocument()
    await userEvent.selectOptions(regionalOfficeSelect, 'regional')
    await userEvent.type(screen.getByRole('textbox', { name: 'Display name' }), 'New Regional HR')
    await userEvent.type(screen.getByLabelText(/^PIN/), '4826')
    expect(screen.getByRole('textbox', { name: 'Display name' })).toHaveValue('New Regional HR')
    expect(screen.getByLabelText(/^PIN/)).toHaveValue('4826')
    await userEvent.click(screen.getByRole('button', { name: 'Create role' }))

    expect(submit).toHaveBeenCalledWith({
      type: 'hr',
      displayName: 'New Regional HR',
      scope: 'regional',
      officeId: 'regional',
      pin: '4826',
    })
  })

  it('keeps HR account management assigned-office scoped and repairable', async () => {
    render(<AdminsPanel />)
    expect(screen.getByRole('heading', { name: 'Roles and access' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Add role' })).toBeVisible()
    expect(screen.getAllByText('Regional Admin').length).toBeGreaterThan(0)
    const regionalRow = screen.getByRole('row', { name: /^Regional HR/ })
    expect(regionalRow).toHaveTextContent('Regional HR')
    expect(regionalRow).toHaveTextContent('Regional Office XII')
    expect(regionalRow).not.toHaveTextContent('All offices')
    const regionalSelect = within(regionalRow).getByRole('combobox', { name: 'Office for Regional HR' })
    expect(within(regionalSelect).queryByRole('option', { name: 'General Santos Field Office' })).not.toBeInTheDocument()

    const unassignedRow = screen.getByRole('row', { name: /Unassigned Office HR/ })
    expect(unassignedRow).toHaveTextContent('Office assignment required')
    const repairSelect = within(unassignedRow).getByRole('combobox', { name: 'Office for Unassigned Office HR' })
    expect(within(repairSelect).queryByRole('option', { name: 'Regional Office XII' })).not.toBeInTheDocument()
    await userEvent.selectOptions(repairSelect, 'field-office')
    expect(roleHooks.updateHrUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'hr-unassigned', scope: 'office' }),
      { scope: 'office', officeId: 'field-office' },
    )

    const unassignedRegionalRow = screen.getByRole('row', { name: /^Unassigned Regional HR/ })
    expect(unassignedRegionalRow).toHaveTextContent('Office assignment required')
    await userEvent.selectOptions(within(unassignedRegionalRow).getByRole('combobox', { name: 'Office for Unassigned Regional HR' }), 'regional')
    expect(roleHooks.updateHrUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'hr-regional-unassigned', scope: 'regional', active: false }),
      { scope: 'regional', officeId: 'regional' },
    )
  })

  it('passes the selected Regional HR scope through account creation', async () => {
    render(<AdminsPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Add role' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Add role' })).getByRole('button', { name: 'HR' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'HR scope' }), 'regional')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'HR office' }), 'regional')
    await userEvent.type(screen.getByRole('textbox', { name: 'Display name' }), 'Created Regional HR')
    await userEvent.type(screen.getByLabelText(/^PIN/), '5937')
    await userEvent.click(screen.getByRole('button', { name: 'Create role' }))

    await waitFor(() => expect(roleHooks.createHrUser).toHaveBeenCalledWith({
      displayName: 'Created Regional HR',
      officeId: 'regional',
      pin: '5937',
      scope: 'regional',
    }))
  })

  it.each([
    ['mobile', 0, 'An office assignment is required.'],
    ['desktop', 1, 'Network request failed.'],
  ])('shows HR office repair failures in the existing toast on %s', async (_view, index, message) => {
    roleHooks.updateHrUser.mockResolvedValueOnce({ ok: false, message })
    storeState.addToast.mockImplementationOnce((text, type) => {
      storeState.toasts = [{ id: 'repair-error', message: text, type }]
    })
    const { rerender } = render(<><AdminsPanel /><ToastContainer /></>)
    const repairSelect = screen.getAllByRole('combobox', { name: 'Office for Unassigned Office HR' })[index]

    await userEvent.selectOptions(repairSelect, 'field-office')

    await waitFor(() => expect(storeState.addToast).toHaveBeenCalledWith(message, 'error'))
    expect(roleHooks.updateHrUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'hr-unassigned', scope: 'office' }),
      { scope: 'office', officeId: 'field-office' },
    )
    rerender(<><AdminsPanel /><ToastContainer /></>)
    expect(screen.getByText(message)).toBeVisible()
    expect(screen.getByText(message).closest('[aria-live="polite"]')).not.toBeNull()
    expect(repairSelect).toBeEnabled()
    expect(repairSelect).toHaveValue('')
  })

  it('disables only the pending HR account office selectors in both layouts', () => {
    roleHooks.isHrPending.mockImplementation(key => key === 'hr-user-update-hr-unassigned')
    render(<AdminsPanel />)

    const pendingSelectors = screen.getAllByRole('combobox', { name: 'Office for Unassigned Office HR' })
    expect(pendingSelectors).toHaveLength(2)
    pendingSelectors.forEach(selector => expect(selector).toBeDisabled())
    for (const name of ['Office for Regional HR', 'Office for Unassigned Regional HR']) {
      const otherSelectors = screen.getAllByRole('combobox', { name })
      expect(otherSelectors).toHaveLength(2)
      otherSelectors.forEach(selector => expect(selector).toBeEnabled())
    }
  })

  function maintenancePayload(overrides = {}) {
    return {
      ok: true,
      version: 2,
      generatedAt: '2026-08-28T06:00:00.000Z',
      window: { label: 'Today' },
      evidence: {
        totalWindowEvents: 40,
        loadedEvents: 40,
        coverageRate: 1,
        truncated: false,
        identityAttributionCoverageRate: 0.95,
        serverAuthoritativeCoverageRate: 0.9,
        matchDistanceCoverageRate: 0.9,
        timingCoverageRate: 0.85,
        captureDiagnosticsCoverageRate: 0.8,
        unknownOutcomeCount: 0,
      },
      statuses: {
        telemetry: { status: 'sufficient', detail: 'Evidence is complete.' },
        verification1to1: { status: 'warning', detail: '4 mismatches among 30 comparisons.' },
        capture: { status: 'stable', detail: 'Capture failures remain low.' },
        performance: { status: 'stable', detail: 'Server p95 is 620 ms.' },
        populationCoverage: { status: 'partial', detail: '18 of 31 employees represented.' },
      },
      actions: [
        { id: 'verification1to1', severity: 'warning', title: 'Investigate 1:1 verification failures', detail: 'Review repeated mismatch evidence.' },
        { id: 'calibration', severity: 'information', title: 'Threshold calibration unavailable', detail: 'Labeled genuine and impostor evidence is not available.' },
      ],
      verification1to1: {
        denominator: 30,
        verifiedIdentityCount: 26,
        verifiedIdentityRate: 0.8667,
        claimedMismatchCount: 4,
        claimedMismatchRate: 0.1333,
        otherBiometricFailureCount: 0,
        otherBiometricFailureRate: 0,
        verifiedDistance: { count: 26, p50: 0.44, p95: 0.61 },
        mismatchDistance: { count: 4, p05: 0.76, p50: 0.81 },
        threshold: { count: 30, min: 0.75, median: 0.75, max: 0.75 },
        acceptedHeadroom: { count: 26, p05: 0.08, p50: 0.31 },
        repeatedMismatchCandidates: [],
      },
      capture: { failureCount: 1, failureRate: 0.025, byDevice: [], byBrowser: [], byFacingMode: [], byOrientation: [] },
      performance: { totalServerMs: { count: 34, p50: 420, p95: 620 } },
      population: { currentApprovedActiveEmployees: 31, representedCurrentEmployees: 18, coverageRate: 0.58, repeatedMismatchCandidates: [], unattributedVerificationFailures: 0 },
      breakdowns: { categories: [{ key: 'attendance_written', count: 40, rate: 1 }], decisions: [], matchModes: [] },
      calibration: { status: 'unavailable', reason: 'Labeled genuine and impostor evidence is not available.', thresholdRecommendation: null },
      system: {
        status: 'healthy',
        database: { status: 'healthy', connected: true, latencyMs: 8, serverVersion: '18.1', counts: { persons: 31 } },
        migrations: { status: 'healthy', expectedCount: 15, appliedCount: 15, pending: [], unexpected: [] },
        storage: { status: 'healthy', configured: true, directoryExists: true, readable: true, writable: true },
        models: { human: { status: 'healthy', ready: true }, openvino: { status: 'unconfigured', configured: false, inferenceVerified: false } },
        runtime: { status: 'healthy', nodeVersion: 'v22.18.0', environment: 'production', uptimeSeconds: 500, buildId: 'build-1', buildIdentified: true },
        dailySummary: { status: 'fresh', dateKey: '2026-08-27', rawPersonCount: 20, summaryPersonCount: 20, missingSummaryCount: 0 },
      },
      scope: { scope: 'regional', officeId: '', currentApprovedActiveEmployees: 31 },
      ...overrides,
    }
  }

  it('shows compact Maintenance Evidence v2 without obsolete pilot claims', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => maintenancePayload(),
    }))
    render(<MaintenanceEvidencePanel />)
    expect(await screen.findByRole('heading', { name: 'System maintenance' })).toBeVisible()
    expect(screen.getAllByText('1:1 verification').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Action required' })).toBeVisible()
    expect(screen.getByText(/threshold calibration unavailable/i)).toBeVisible()
    expect(screen.queryByText('WFH accepted')).not.toBeInTheDocument()
    expect(screen.queryByText('Operational gate passed')).not.toBeInTheDocument()
    expect(screen.queryByText('2-frame fallback')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export JSON' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeVisible()
  })

  it('keeps last successful maintenance evidence when refresh fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => maintenancePayload() })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ ok: false, message: 'Unavailable' }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<MaintenanceEvidencePanel />)
    expect(await screen.findByText('40 loaded events')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByText(/showing the last successful report/i)).toBeVisible()
    expect(screen.getByText('40 loaded events')).toBeVisible()
  })

  it('does not render regional runtime evidence for office scope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => maintenancePayload({ system: null, scope: { scope: 'office', officeId: 'office-1' } }),
    }))
    render(<MaintenanceEvidencePanel />)
    expect(await screen.findByRole('heading', { name: 'System maintenance' })).toBeVisible()
    expect(screen.queryByText('Regional runtime')).not.toBeInTheDocument()
  })

  it('puts regional runtime failures in the primary action queue', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => maintenancePayload({
        system: {
          ...maintenancePayload().system,
          status: 'failing',
          database: { status: 'failing', connected: false },
          actions: [{
            id: 'database',
            severity: 'critical',
            title: 'Restore database readiness',
            detail: 'The maintenance database check failed.',
          }],
        },
      }),
    }))
    render(<MaintenanceEvidencePanel />)
    expect(await screen.findByText('Restore database readiness')).toBeVisible()
  })

  it('keeps the dashboard focused on operational status, not forced re-enrollment', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => ({
      ok: true,
      json: async () => String(url).includes('reenrollment-candidates')
        ? {
            pendingApproval: [{ personId: 'pending-1', name: 'Pending Approval Person' }],
            biometricFollowUp: [{
              personId: 'follow-up-1',
              name: 'Mismatch Person',
              employeeId: '680003',
              officeName: 'Regional Office',
              descriptorCount: 8,
              claimedMismatchCount: 3,
              followUpReason: 'repeated_claimed_mismatch',
            }],
          }
        : { summary: { active: 1, idle: 0, stale: 0 }, devices: [] },
    })))
    render(<DashboardPanel />)
    expect(screen.getByRole('heading', { name: 'Operations overview' })).toBeVisible()
    expect(await screen.findByText('Mismatch Person')).toBeVisible()
    expect(screen.getByText('3 identity mismatches')).toBeVisible()
    expect(screen.getByText(/Repeated claimed identity mismatch/)).toBeVisible()
    expect(screen.queryByText('Pending Approval Person')).not.toBeInTheDocument()
    expect(screen.queryByText(/re-enroll|reenrollment/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Reenrollment queue' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open diagnostics' })).toBeVisible()
  })
})

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminDashboard from '@/components/AdminDashboard'

const storeState = {
  roleScope: 'regional',
  setRoleScope: vi.fn(),
  activePanel: 'employees',
  setActivePanel: vi.fn(),
  editingEmployee: null,
  setEditingEmployee: vi.fn(),
  deletingEmployee: null,
  setDeletingEmployee: vi.fn(),
  officesLoaded: true,
  setSelectedOfficeId: vi.fn(),
  toasts: [],
  removeToast: vi.fn(),
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/lib/admin/store', () => ({
  useAdminStore: (selector) => selector(storeState),
}))

vi.mock('@/lib/admin/hooks/useOffices', () => ({ useOffices: vi.fn() }))
vi.mock('@/lib/admin/hooks/usePendingApprovals', () => ({
  usePendingApprovals: () => ({ pendingCount: 0 }),
}))

vi.mock('@/components/admin/AdminShell', () => ({
  default: ({ children }) => <main>{children}</main>,
}))
vi.mock('@/components/admin/EmployeesPanel', () => ({ EmployeesPanel: () => <div>Admin employees panel</div> }))
vi.mock('@/components/admin/HrEmployeesPanel', () => ({ HrEmployeesPanel: () => <div>HR employees panel</div> }))
vi.mock('@/components/admin/DashboardPanel', () => ({ DashboardPanel: () => null }))
vi.mock('@/components/admin/SummaryPanel', () => ({ SummaryPanel: () => null }))
vi.mock('@/components/admin/AdminsPanel', () => ({ AdminsPanel: () => null }))
vi.mock('@/components/admin/OfficePanel', () => ({ default: () => null }))
vi.mock('@/components/admin/EmployeeEditorModal', () => ({ default: () => null }))
vi.mock('@/components/admin/EmployeeDeleteModal', () => ({ default: () => null }))
vi.mock('@/components/admin/HrOfficeSettingsPanel', () => ({ default: () => null }))
vi.mock('@/components/admin/ThresholdSettings', () => ({ ThresholdSettings: () => null }))
vi.mock('@/components/admin/WorkforcePanel', () => ({ default: () => null }))

describe('admin dashboard role routing', () => {
  beforeEach(() => {
    storeState.activePanel = 'employees'
    storeState.roleScope = 'regional'
    vi.clearAllMocks()
  })

  it('keeps a permission-limited Regional Admin on the admin employee workflow', () => {
    render(
      <AdminDashboard
        initialRole="admin"
        initialRoleScope="regional"
        permissions={['employees']}
      />,
    )

    expect(screen.getByText('Admin employees panel')).toBeVisible()
    expect(screen.queryByText('HR employees panel')).not.toBeInTheDocument()
  })

  it('routes an Office HR session to the HR employee workflow explicitly', () => {
    render(
      <AdminDashboard
        initialRole="hr"
        initialRoleScope="office"
        permissions={['employees', 'summary']}
      />,
    )

    expect(screen.getByText('HR employees panel')).toBeVisible()
    expect(screen.queryByText('Admin employees panel')).not.toBeInTheDocument()
  })
})

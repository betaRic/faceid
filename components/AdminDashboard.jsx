'use client'

import { useCallback, useEffect, useMemo } from 'react'
import { startTransition } from 'react'
import { useRouter } from 'next/navigation'
import AdminShell from './admin/AdminShell'
import { useAdminStore } from '@/lib/admin/store'
import { useOffices } from '@/lib/admin/hooks/useOffices'
import { usePendingApprovals } from '@/lib/admin/hooks/usePendingApprovals'
import { ToastContainer } from '@/components/shared/ui'
import { DashboardPanel } from './admin/DashboardPanel'
import { EmployeesPanel } from './admin/EmployeesPanel'
import { SummaryPanel } from './admin/SummaryPanel'
import { AdminsPanel } from './admin/AdminsPanel'
import { HrUsersPanel } from './admin/HrUsersPanel'
import OfficePanel from './admin/OfficePanel'
import EmployeeEditorModal from './admin/EmployeeEditorModal'
import EmployeeDeleteModal from '@/components/admin/EmployeeDeleteModal'
import { HrEmployeesPanel } from './admin/HrEmployeesPanel'
import { ThresholdSettings } from './admin/ThresholdSettings'

export default function AdminDashboard({ initialRoleScope = 'regional', initialOfficeId = '', permissions = [] }) {
  const router = useRouter()
  const {
    roleScope, setRoleScope,
    activePanel, setActivePanel,
    editingEmployee, setEditingEmployee,
    deletingEmployee, setDeletingEmployee,
    officesLoaded, setSelectedOfficeId,
  } = useAdminStore()

  const isHr = !permissions.includes('dashboard') && !permissions.includes('office')

  const navItems = useMemo(() => {
    const allItems = [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'office', label: 'Office' },
      { id: 'employees', label: 'Employees' },
      { id: 'summary', label: 'Summary' },
      { id: 'settings', label: 'Settings' },
      { id: 'roles', label: 'Roles' },
    ]
    return allItems
      .filter(item => permissions.includes(item.id))
      .map(item => ({
        ...item,
        disabled: item.id === 'roles' && roleScope !== 'regional',
        badge: item.id === 'employees' && pendingCount > 0 ? pendingCount : null,
      }))
  }, [pendingCount, permissions, roleScope])

  // Boot office subscription here so it isn't gated behind officesLoaded
  useOffices()

  // Live pending approval count — polled every 60s
  const { pendingCount } = usePendingApprovals(60_000)

  useEffect(() => {
    setRoleScope(initialRoleScope)
    if (initialOfficeId) setSelectedOfficeId(initialOfficeId)
    // Set default panel based on role
    if (isHr && activePanel === 'dashboard') {
      setActivePanel('employees')
    }
  }, [initialRoleScope, initialOfficeId, setRoleScope, setSelectedOfficeId, isHr, activePanel, setActivePanel])

  const handleLogout = useCallback(async () => {
    await fetch('/api/admin/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }, [router])

  if (!officesLoaded) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[linear-gradient(180deg,#f6f8fc_0%,#edf2f8_100%)] px-4">
        <div className="flex h-64 items-center justify-center rounded-[1.6rem] border border-black/5 bg-white px-8 shadow-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-navy border-t-transparent" />
            <span className="text-sm text-muted">Loading workspace...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <AdminShell
      activePanel={activePanel}
      actions={
        <div className="flex items-center gap-3">
          <button
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-stone-50"
            onClick={handleLogout}
            type="button"
          >
            Logout
          </button>
        </div>
      }
      navItems={navItems}
      onPanelChange={(panel) => startTransition(() => setActivePanel(panel))}
      roleScope={roleScope}
    >
      <div className="min-h-full p-4 sm:p-5">
        {isHr ? (
          <>
            {activePanel === 'employees' && <HrEmployeesPanel />}
            {activePanel === 'summary' && <SummaryPanel />}
          </>
        ) : (
          <>
            {activePanel === 'dashboard' && <DashboardPanel />}
            {activePanel === 'office' && <OfficePanel />}
            {activePanel === 'employees' && <EmployeesPanel />}
            {activePanel === 'summary' && <SummaryPanel />}
            {activePanel === 'settings' && <ThresholdSettings />}
            {activePanel === 'roles' && <AdminsPanel />}
          </>
        )}
      </div>

      <ToastContainer />

      {editingEmployee && (
        <EmployeeEditorModal
          person={editingEmployee}
          onSave={() => {
            useAdminStore.getState().addToast(`${editingEmployee.name} updated`, 'success')
            setEditingEmployee(null)
          }}
          onCancel={() => setEditingEmployee(null)}
        />
      )}

      {deletingEmployee && (
        <EmployeeDeleteModal
          person={deletingEmployee}
          onCancel={() => setDeletingEmployee(null)}
        />
      )}
    </AdminShell>
  )
}

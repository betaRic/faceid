'use client'

import { useCallback, useEffect, useMemo } from 'react'
import { startTransition } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from './AppShell'
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

  const isRegional = roleScope === 'regional'
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
    return allItems.filter(item => permissions.includes(item.id))
  }, [permissions])

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
      <AppShell contentClassName="px-4 py-5">
        <div className="flex h-64 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-navy border-t-transparent" />
            <span className="text-sm text-muted">Loading workspace...</span>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell
      fitViewport
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
      contentClassName="px-4 py-5 pb-20 sm:px-6 lg:px-8 lg:pb-8"
    >
      <div className="grid h-full min-h-0 gap-4 xl:gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
        {/* Sidebar nav */}
        <aside className="hidden xl:sticky xl:top-20 xl:block xl:h-fit">
          <div className="flex flex-col gap-3 rounded-2xl border border-black/5 bg-white/90 p-3 shadow-glow backdrop-blur xl:p-4">
            <nav className="flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:gap-1 xl:overflow-visible">
              {navItems.map(item => {
                const disabled = item.id === 'roles' && roleScope !== 'regional'
                const badge = item.id === 'employees' && pendingCount > 0 ? pendingCount : null
                return (
                  <button
                    key={item.id}
                    className={`flex shrink-0 items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition xl:px-4 xl:py-3 xl:text-sm ${
                      activePanel === item.id
                        ? 'bg-navy text-white'
                        : disabled
                          ? 'cursor-not-allowed text-muted opacity-40'
                          : 'text-ink hover:bg-stone-100'
                    }`}
                    disabled={disabled}
                    onClick={() => startTransition(() => setActivePanel(item.id))}
                    type="button"
                  >
                    {item.label}
                    {badge && (
                      <span
                        className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold leading-none ${
                          activePanel === item.id ? 'bg-amber text-white' : 'bg-amber-500 text-white'
                        }`}
                      >
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </button>
                )
              })}
            </nav>
            <div className="hidden rounded-xl border border-black/5 bg-stone-50 px-3 py-3 xl:block">
              <div className="text-xs font-semibold uppercase tracking-widest text-navy-dark">
                {roleScope === 'regional' ? 'Regional' : 'Office'}
              </div>
              <div className="text-[10px] text-muted capitalize">{isHr ? 'HR' : 'Admin'}</div>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="min-h-0 overflow-y-auto">
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
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-40 rounded-2xl border border-black/5 bg-white/95 p-2 shadow-xl backdrop-blur xl:hidden">
        <div className="grid grid-cols-3 gap-1">
          {navItems.slice(0, 6).map(item => {
            const disabled = item.id === 'roles' && roleScope !== 'regional'
            return (
              <button
                key={`mobile-${item.id}`}
                className={`rounded-xl px-2 py-2 text-[11px] font-semibold transition ${
                  activePanel === item.id
                    ? 'bg-navy text-white'
                    : disabled
                      ? 'cursor-not-allowed text-muted opacity-40'
                      : 'text-ink hover:bg-stone-100'
                }`}
                disabled={disabled}
                onClick={() => startTransition(() => setActivePanel(item.id))}
                type="button"
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </nav>

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
    </AppShell>
  )
}

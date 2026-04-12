'use client'

import { useCallback, useEffect } from 'react'
import { startTransition } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from './AppShell'
import { useAdminStore } from '@/lib/admin/store'
import { useOffices } from '@/lib/admin/hooks/useOffices'   // ← pull in here
import { ToastContainer } from '@/components/shared/ui'
import { DashboardPanel } from './admin/DashboardPanel'
import { EmployeesPanel } from './admin/EmployeesPanel'
import { SummaryPanel } from './admin/SummaryPanel'
import { AdminsPanel } from './admin/AdminsPanel'
import OfficePanel from './admin/OfficePanel'
import EmployeeEditorModal from './admin/EmployeeEditorModal'

const navItems = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'office', label: 'Office' },
  { id: 'employees', label: 'Employees' },
  { id: 'summary', label: 'Summary' },
  { id: 'admins', label: 'Admins' },
]

export default function AdminDashboard({ initialRoleScope = 'regional', initialOfficeId = '' }) {
  const router = useRouter()
  const {
    roleScope, setRoleScope,
    activePanel, setActivePanel,
    editingEmployee, setEditingEmployee,
    officesLoaded, setSelectedOfficeId,
  } = useAdminStore()

  // ── Boot the office subscription here so it isn't gated behind officesLoaded ──
  useOffices()

  useEffect(() => {
    setRoleScope(initialRoleScope)
    if (initialOfficeId) setSelectedOfficeId(initialOfficeId)
  }, [initialRoleScope, initialOfficeId, setRoleScope, setSelectedOfficeId])

  const handleLogout = useCallback(async () => {
    await fetch('/api/admin/logout', { method: 'POST' })
    router.push('/admin/login')
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
      contentClassName="px-4 py-5 sm:px-6 lg:px-8"
    >
      <div className="grid min-h-[calc(100dvh-8rem)] gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="xl:sticky xl:top-20 xl:h-fit">
          <div className="flex flex-col gap-3 rounded-2xl border border-black/5 bg-white/90 p-4 shadow-glow backdrop-blur">
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => {
                const disabled = item.id === 'admins' && roleScope !== 'regional'
                return (
                  <button
                    key={item.id}
                    className={`rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${
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
            </nav>
            <div className="mt-auto rounded-xl border border-black/5 bg-stone-50 px-3 py-3">
              <div className="text-xs font-semibold uppercase tracking-widest text-navy-dark">
                {roleScope === 'regional' ? 'Regional Admin' : 'Office Admin'}
              </div>
            </div>
          </div>
        </aside>

        <div className="min-h-0">
          {activePanel === 'dashboard' && <DashboardPanel />}
          {activePanel === 'office' && <OfficePanel />}
          {activePanel === 'employees' && <EmployeesPanel />}
          {activePanel === 'summary' && <SummaryPanel />}
          {activePanel === 'admins' && <AdminsPanel />}
        </div>
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
    </AppShell>
  )
}

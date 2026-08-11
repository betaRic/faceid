'use client'

import { useCallback, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useShallow } from 'zustand/react/shallow'
import AdminShell from './admin/AdminShell'
import { useAdminStore } from '@/lib/admin/store'
import { useOffices } from '@/lib/admin/hooks/useOffices'
import { usePendingApprovals } from '@/lib/admin/hooks/usePendingApprovals'
import { ToastContainer } from '@/components/shared/ui'
import DilgLoadingIndicator from '@/components/shared/DilgLoadingIndicator'
import { DashboardPanel } from './admin/DashboardPanel'
import { EmployeesPanel } from './admin/EmployeesPanel'
import { SummaryPanel } from './admin/SummaryPanel'
import { AdminsPanel } from './admin/AdminsPanel'
import { HrUsersPanel } from './admin/HrUsersPanel'
import OfficePanel from './admin/OfficePanel'
import EmployeeEditorModal from './admin/EmployeeEditorModal'
import EmployeeDeleteModal from '@/components/admin/EmployeeDeleteModal'
import { HrEmployeesPanel } from './admin/HrEmployeesPanel'
import HrOfficeSettingsPanel from './admin/HrOfficeSettingsPanel'
import { ThresholdSettings } from './admin/ThresholdSettings'
import WorkforcePanel from './admin/WorkforcePanel'

function HeaderActionIcon({ name }) {
  const props = { className: 'h-4 w-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', 'aria-hidden': true }
  if (name === 'scan') return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" d="M4 8V5a1 1 0 0 1 1-1h3m8 0h3a1 1 0 0 1 1 1v3M4 16v3a1 1 0 0 0 1 1h3m8 0h3a1 1 0 0 0 1-1v-3M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z" /></svg>
  return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" d="M10 7V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-2m4-5H3m0 0 3-3m-3 3 3 3" /></svg>
}

export default function AdminDashboard({ initialRoleScope = 'regional', initialOfficeId = '', permissions = [] }) {
  const router = useRouter()
  const {
    roleScope,
    setRoleScope,
    activePanel,
    setActivePanel,
    editingEmployee,
    setEditingEmployee,
    deletingEmployee,
    setDeletingEmployee,
    officesLoaded,
    setSelectedOfficeId,
  } = useAdminStore(useShallow((state) => ({
    roleScope: state.roleScope,
    setRoleScope: state.setRoleScope,
    activePanel: state.activePanel,
    setActivePanel: state.setActivePanel,
    editingEmployee: state.editingEmployee,
    setEditingEmployee: state.setEditingEmployee,
    deletingEmployee: state.deletingEmployee,
    setDeletingEmployee: state.setDeletingEmployee,
    officesLoaded: state.officesLoaded,
    setSelectedOfficeId: state.setSelectedOfficeId,
  })))

  const isHr = !permissions.includes('dashboard') && !permissions.includes('office')

  // Live pending approval count — polled every 60s
  const { pendingCount } = usePendingApprovals(60_000)

  const navItems = useMemo(() => {
    const allItems = [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'office', label: 'Office' },
      { id: 'employees', label: 'Employees' },
      { id: 'summary', label: 'Summary' },
      { id: 'workforce', label: 'Workforce' },
      { id: 'settings', label: 'Settings' },
      { id: 'roles', label: 'Roles' },
    ]
    const permittedItems = allItems
      .filter(item => permissions.includes(item.id))
      .map(item => ({
        ...item,
        disabled: item.id === 'roles' && roleScope !== 'regional',
        badge: item.id === 'employees' && pendingCount > 0 ? pendingCount : null,
      }))
    if (!isHr && roleScope === 'regional' && !permittedItems.some(item => item.id === 'workforce')) {
      permittedItems.splice(Math.max(0, permittedItems.findIndex(item => item.id === 'settings')), 0, { id: 'workforce', label: 'Workforce' })
    }
    if (isHr && roleScope === 'office') {
      permittedItems.push({ id: 'office-settings', label: 'Office Settings' })
      permittedItems.push({ id: 'workforce', label: 'Workforce' })
    }
    return permittedItems
  }, [isHr, pendingCount, permissions, roleScope])

  // Boot office subscription here so it isn't gated behind officesLoaded
  useOffices(true)

  useEffect(() => {
    setRoleScope(initialRoleScope)
    if (initialOfficeId) setSelectedOfficeId(initialOfficeId)
    // Set default panel based on role
    if (isHr && activePanel === 'dashboard') {
      setActivePanel('employees')
    }
  }, [initialRoleScope, initialOfficeId, setRoleScope, setSelectedOfficeId, isHr, activePanel, setActivePanel])

  useEffect(() => {
    if (navItems.length === 0) return
    if (!navItems.some((item) => item.id === activePanel && !item.disabled)) {
      setActivePanel(navItems[0].id)
    }
  }, [activePanel, navItems, setActivePanel])

  const handleLogout = useCallback(async () => {
    await fetch('/api/admin/logout', { method: 'POST' })
    router.push('/admin/login')
    router.refresh()
  }, [router])

  if (!officesLoaded) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[linear-gradient(180deg,#f6f8fc_0%,#edf2f8_100%)] px-4">
        <div className="flex h-64 items-center justify-center rounded-[1.6rem] border border-black/5 bg-white px-8 shadow-sm"><DilgLoadingIndicator label="Loading workspace…" /></div>
      </div>
    )
  }

  return (
    <AdminShell
      activePanel={activePanel}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-ink transition hover:bg-stone-50"
            href="/scan"
          >
            <HeaderActionIcon name="scan" />
            Scan
          </Link>
          <button
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-ink transition hover:bg-stone-50"
            onClick={handleLogout}
            type="button"
          >
            <HeaderActionIcon name="logout" />
            Logout
          </button>
        </div>
      }
      navItems={navItems}
      onPanelChange={setActivePanel}
      roleScope={roleScope}
    >
      {editingEmployee ? (
        <EmployeeEditorModal
          person={editingEmployee}
          onSave={() => {
            setEditingEmployee(null)
          }}
          onCancel={() => setEditingEmployee(null)}
        />
      ) : <div className="flex min-h-0 flex-col p-2 pb-3 sm:p-5 md:h-full md:pb-5">
        {isHr ? (
          <>
            {activePanel === 'employees' && <HrEmployeesPanel />}
            {activePanel === 'summary' && <SummaryPanel />}
            {activePanel === 'office-settings' && <HrOfficeSettingsPanel />}
            {activePanel === 'workforce' && <WorkforcePanel allowNationalHolidays={roleScope === 'regional'} />}
          </>
        ) : (
          <>
            {activePanel === 'dashboard' && <DashboardPanel />}
            {activePanel === 'office' && <OfficePanel />}
            {activePanel === 'employees' && <EmployeesPanel />}
            {activePanel === 'summary' && <SummaryPanel />}
            {activePanel === 'workforce' && <WorkforcePanel allowNationalHolidays={roleScope === 'regional'} />}
            {activePanel === 'settings' && <ThresholdSettings />}
            {activePanel === 'roles' && <AdminsPanel />}
          </>
        )}
      </div>}

      <ToastContainer />

      {deletingEmployee && (
        <EmployeeDeleteModal
          person={deletingEmployee}
          onCancel={() => setDeletingEmployee(null)}
        />
      )}
    </AdminShell>
  )
}

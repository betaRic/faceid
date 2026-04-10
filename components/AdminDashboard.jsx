'use client'

import { motion } from 'framer-motion'
import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { updatePersonRecord } from '../lib/data-store'
import { firebaseEnabled } from '../lib/firebase/client'
import { saveOfficeConfig, subscribeToOfficeConfigs } from '../lib/office-admin-store'
import { formatAttendanceDateKey, formatAttendanceDateLabel } from '../lib/attendance-time'
import {
  getEffectivePersonApprovalStatus,
  PERSON_APPROVAL_APPROVED,
  PERSON_APPROVAL_PENDING,
  PERSON_APPROVAL_REJECTED,
} from '../lib/person-approval'
import AppShell from './AppShell'
import LoadingPanel from './admin/LoadingPanel'
import DashboardPanel from './admin/DashboardPanel'
import OfficePanel from './admin/OfficePanel'
import EmployeesPanel from './admin/EmployeesPanel'
import SummaryPanel from './admin/SummaryPanel'
import AdminsPanel from './admin/AdminsPanel'
import ActionButton from './admin/ActionButton'
import Field from './admin/Field'

const EMPLOYEE_PAGE_SIZE = 24

const navItems = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'office', label: 'Office' },
  { id: 'employees', label: 'Employees' },
  { id: 'summary', label: 'Summary' },
  { id: 'admins', label: 'Admins' },
]

export default function AdminDashboard({ initialRoleScope = 'regional', initialOfficeId = '' }) {
  const router = useRouter()
  const todayIso = formatAttendanceDateKey(Date.now())

  // Core state
  const [roleScope] = useState(initialRoleScope)
  const [selectedOfficeId, setSelectedOfficeId] = useState(initialOfficeId)
  const [offices, setOffices] = useState([])
  const [persons, setPersons] = useState([])
  const [attendance, setAttendance] = useState([])
  const [admins, setAdmins] = useState([])
  const [summaryRows, setSummaryRows] = useState([])

  // Loading state
  const [officesLoaded, setOfficesLoaded] = useState(false)
  const [personsLoaded, setPersonsLoaded] = useState(false)
  const [attendanceLoaded, setAttendanceLoaded] = useState(false)
  const [adminsLoaded, setAdminsLoaded] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)

  // Office draft editing
  const [draftOffice, setDraftOffice] = useState(null)
  const [officeDraftWarning, setOfficeDraftWarning] = useState('')
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationNotice, setLocationNotice] = useState('')
  const [highlightLocationPin, setHighlightLocationPin] = useState(false)
  const locationNoticeTimerRef = useRef(null)
  const locationPulseTimerRef = useRef(null)

  // Employee directory
  const [employeeQuery, setEmployeeQuery] = useState('')
  const [employeeOfficeFilter, setEmployeeOfficeFilter] = useState('all')
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState('all')
  const [employeeApprovalFilter, setEmployeeApprovalFilter] = useState('all')
  const [employeeDirectoryCursor, setEmployeeDirectoryCursor] = useState('')
  const [employeeDirectoryHistory, setEmployeeDirectoryHistory] = useState([])
  const [employeeDirectoryNextCursor, setEmployeeDirectoryNextCursor] = useState('')
  const [employeeDirectoryHasMore, setEmployeeDirectoryHasMore] = useState(false)
  const [employeeDirectoryTotal, setEmployeeDirectoryTotal] = useState(0)
  const [employeeDirectoryApprovedCount, setEmployeeDirectoryApprovedCount] = useState(0)
  const [employeeDirectoryPendingCount, setEmployeeDirectoryPendingCount] = useState(0)
  const [employeeDirectoryRejectedCount, setEmployeeDirectoryRejectedCount] = useState(0)
  const [employeeDirectoryRefreshKey, setEmployeeDirectoryRefreshKey] = useState(0)
  const deferredEmployeeQuery = useDeferredValue(employeeQuery)

  // Summary filters
  const [summaryDate, setSummaryDate] = useState(todayIso)
  const [summaryOfficeFilter, setSummaryOfficeFilter] = useState('all')
  const [summaryEmployeeFilter, setSummaryEmployeeFilter] = useState('all')

  // UI state
  const [activePanel, setActivePanel] = useState('dashboard')
  const [pendingAction, setPendingAction] = useState('')
  const [status, setStatus] = useState(firebaseEnabled ? 'Connected' : 'Local mode')
  const [employeeEditor, setEmployeeEditor] = useState(null)
  const [firestoreIndexSummary, setFirestoreIndexSummary] = useState(null)

  const shouldLoadPersons = activePanel === 'employees'
  const shouldLoadAttendance = activePanel === 'dashboard' || activePanel === 'summary'
  const shouldLoadAdmins = roleScope === 'regional' && (activePanel === 'dashboard' || activePanel === 'admins')

  // ── Offices ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeToOfficeConfigs(
      (nextOffices) => {
        setOffices(nextOffices)
        setOfficesLoaded(true)
      },
      (err) => setStatus(err?.message || 'Failed to load offices'),
    )
    return unsub
  }, [])

  // Reset draft when selected office changes
  useEffect(() => {
    setDraftOffice(null)
    setOfficeDraftWarning('')
  }, [selectedOfficeId])

  // ── Persons (directory mode) ───────────────────────────────────────────────
  useEffect(() => {
    if (!shouldLoadPersons) return

    setPersonsLoaded(false)
    const params = new URLSearchParams({ mode: 'directory', limit: String(EMPLOYEE_PAGE_SIZE) })
    if (deferredEmployeeQuery) params.set('q', deferredEmployeeQuery)
    if (employeeOfficeFilter !== 'all') params.set('officeId', employeeOfficeFilter)
    if (employeeStatusFilter !== 'all') params.set('status', employeeStatusFilter)
    if (employeeApprovalFilter !== 'all') params.set('approval', employeeApprovalFilter)
    if (employeeDirectoryCursor) params.set('cursor', employeeDirectoryCursor)

    fetch(`/api/persons?${params.toString()}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setPersons(data.persons || [])
          setEmployeeDirectoryHasMore(data.page?.hasMore || false)
          setEmployeeDirectoryNextCursor(data.page?.nextCursor || '')
          setEmployeeDirectoryTotal(data.page?.total || 0)
          setEmployeeDirectoryApprovedCount(data.page?.approved || 0)
          setEmployeeDirectoryPendingCount(data.page?.pending || 0)
          setEmployeeDirectoryRejectedCount(data.page?.rejected || 0)
        } else {
          setStatus(data.message || 'Failed to load employees')
        }
        setPersonsLoaded(true)
      })
      .catch(err => {
        setStatus(err?.message || 'Failed to load employees')
        setPersonsLoaded(true)
      })
  }, [
    shouldLoadPersons,
    deferredEmployeeQuery,
    employeeOfficeFilter,
    employeeStatusFilter,
    employeeApprovalFilter,
    employeeDirectoryCursor,
    employeeDirectoryRefreshKey,
  ])

  // Reset cursor on filter change
  useEffect(() => {
    setEmployeeDirectoryCursor('')
    setEmployeeDirectoryHistory([])
  }, [deferredEmployeeQuery, employeeOfficeFilter, employeeStatusFilter, employeeApprovalFilter])

  // ── Attendance ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!shouldLoadAttendance) return

    fetch('/api/attendance/recent')
      .then(r => r.json())
      .then(data => {
        if (data.ok) setAttendance(data.attendance || [])
        setAttendanceLoaded(true)
      })
      .catch(() => setAttendanceLoaded(true))
  }, [shouldLoadAttendance])

  // ── Admins ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!shouldLoadAdmins) return

    fetch('/api/admins')
      .then(r => r.json())
      .then(data => {
        if (data.ok) setAdmins(data.admins || [])
        setAdminsLoaded(true)
      })
      .catch(() => setAdminsLoaded(true))
  }, [shouldLoadAdmins])

  // ── Summary ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (activePanel !== 'summary') return

    setSummaryLoading(true)
    const params = new URLSearchParams({ date: summaryDate })
    if (summaryOfficeFilter !== 'all') params.set('officeId', summaryOfficeFilter)

    fetch(`/api/attendance/daily?${params.toString()}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          let rows = data.records || []
          if (summaryEmployeeFilter !== 'all') {
            rows = rows.filter(r => r.employeeId === summaryEmployeeFilter)
          }
          setSummaryRows(rows)
        }
        setSummaryLoading(false)
      })
      .catch(() => setSummaryLoading(false))
  }, [activePanel, summaryDate, summaryOfficeFilter, summaryEmployeeFilter])

  // ── Derived state ──────────────────────────────────────────────────────────
  const visibleOffices = useMemo(() => {
    if (roleScope === 'regional') return offices
    return offices.filter(o => o.id === selectedOfficeId)
  }, [offices, roleScope, selectedOfficeId])

  const activeOffice = useMemo(
    () => draftOffice || offices.find(o => o.id === selectedOfficeId) || null,
    [draftOffice, offices, selectedOfficeId],
  )

  const baseOffice = useMemo(
    () => offices.find(o => o.id === selectedOfficeId) || null,
    [offices, selectedOfficeId],
  )

  const visibleAttendance = useMemo(() => (
    attendance.filter(e => roleScope === 'regional' || e.officeId === selectedOfficeId)
  ), [attendance, roleScope, selectedOfficeId])

  const todaysLogs = useMemo(() => {
    const todayKey = formatAttendanceDateKey(Date.now())
    const todayLabel = formatAttendanceDateLabel(Date.now())
    return visibleAttendance.filter(e => e.dateKey === todayKey || e.date === todayLabel).length
  }, [visibleAttendance])

  const scopedOfficeCount = visibleOffices.length

  const employeeMetricValue = useMemo(() => {
    if (activePanel === 'employees' && personsLoaded) return String(employeeDirectoryTotal).padStart(2, '0')
    if (roleScope === 'regional') return String(offices.reduce((t, o) => t + Number(o.employees || 0), 0)).padStart(2, '0')
    return String(Number(baseOffice?.employees || 0)).padStart(2, '0')
  }, [activePanel, personsLoaded, employeeDirectoryTotal, roleScope, offices, baseOffice])

  const summaryEmployeeOptions = useMemo(() => {
    const seen = new Set()
    return summaryRows.filter(r => !seen.has(r.employeeId) && seen.add(r.employeeId))
      .map(r => ({ employeeId: r.employeeId, name: r.name }))
  }, [summaryRows])

  // ── Action helpers ─────────────────────────────────────────────────────────
  const isPending = useCallback((key) => pendingAction === key, [pendingAction])

  const handleLogout = async () => {
    setPendingAction('logout')
    try {
      await fetch('/api/admin/logout', { method: 'POST' })
      router.push('/admin/login')
      router.refresh()
    } catch {
      setPendingAction('')
    }
  }

  const handleApplyFirestoreIndexes = async () => {
    setPendingAction('firestore-index-sync')
    try {
      const res = await fetch('/api/admin/maintenance/firestore-indexes', { method: 'POST' })
      const data = await res.json()
      setFirestoreIndexSummary(data.summary || null)
      setStatus(data.message || 'Index sync completed')
    } catch {
      setStatus('Index sync failed')
    }
    setPendingAction('')
  }

  const updateDraft = useCallback((path, value) => {
    setDraftOffice(prev => {
      const base = prev || offices.find(o => o.id === selectedOfficeId)
      if (!base) return prev
      const parts = path.split('.')
      if (parts.length === 1) return { ...base, [parts[0]]: value }
      if (parts.length === 2) return { ...base, [parts[0]]: { ...base[parts[0]], [parts[1]]: value } }
      if (parts.length === 3) {
        return {
          ...base,
          [parts[0]]: {
            ...base[parts[0]],
            [parts[1]]: { ...(base[parts[0]]?.[parts[1]] || {}), [parts[2]]: value },
          },
        }
      }
      return base
    })
    setOfficeDraftWarning('You have unsaved changes.')
  }, [offices, selectedOfficeId])

  const toggleDay = useCallback((field, day) => {
    setDraftOffice(prev => {
      const base = prev || offices.find(o => o.id === selectedOfficeId)
      if (!base) return prev
      const current = base.workPolicy[field] || []
      const next = current.includes(day) ? current.filter(d => d !== day) : [...current, day]
      return { ...base, workPolicy: { ...base.workPolicy, [field]: next } }
    })
    setOfficeDraftWarning('You have unsaved changes.')
  }, [offices, selectedOfficeId])

  const handleSaveOffice = async () => {
    if (!draftOffice) return
    setPendingAction('office-save')
    try {
      const result = await saveOfficeConfig(draftOffice)
      setOffices(prev => prev.map(o => o.id === result.office.id ? result.office : o))
      setDraftOffice(null)
      setOfficeDraftWarning('')
      setStatus('Office saved')
      setHighlightLocationPin(true)
      if (locationPulseTimerRef.current) clearTimeout(locationPulseTimerRef.current)
      locationPulseTimerRef.current = setTimeout(() => setHighlightLocationPin(false), 2500)
    } catch (err) {
      setOfficeDraftWarning(err?.message || 'Failed to save office')
    }
    setPendingAction('')
  }

  const handleUseMyLocation = () => {
    setLocationLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateDraft('gps.latitude', Number(pos.coords.latitude.toFixed(6)))
        updateDraft('gps.longitude', Number(pos.coords.longitude.toFixed(6)))
        setLocationNotice(`Set to ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`)
        setHighlightLocationPin(true)
        setLocationLoading(false)
        if (locationNoticeTimerRef.current) clearTimeout(locationNoticeTimerRef.current)
        locationNoticeTimerRef.current = setTimeout(() => setLocationNotice(''), 4000)
        if (locationPulseTimerRef.current) clearTimeout(locationPulseTimerRef.current)
        locationPulseTimerRef.current = setTimeout(() => setHighlightLocationPin(false), 2500)
      },
      (err) => {
        setLocationNotice('Could not get location: ' + (err?.message || 'Unknown error'))
        setLocationLoading(false)
        if (locationNoticeTimerRef.current) clearTimeout(locationNoticeTimerRef.current)
        locationNoticeTimerRef.current = setTimeout(() => setLocationNotice(''), 4000)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  // ── Employee directory handlers ────────────────────────────────────────────
  const refreshEmployeeDirectory = useCallback(() => {
    setEmployeeDirectoryCursor('')
    setEmployeeDirectoryHistory([])
    setEmployeeDirectoryRefreshKey(k => k + 1)
  }, [])

  const handlePreviousEmployeePage = useCallback(() => {
    setEmployeeDirectoryHistory(prev => {
      const next = [...prev]
      const previousCursor = next.pop() || ''
      setEmployeeDirectoryCursor(previousCursor)
      return next
    })
  }, [])

  const handleNextEmployeePage = useCallback(() => {
    setEmployeeDirectoryHistory(prev => [...prev, employeeDirectoryCursor])
    setEmployeeDirectoryCursor(employeeDirectoryNextCursor)
  }, [employeeDirectoryCursor, employeeDirectoryNextCursor])

  const handleEmployeeUpdate = useCallback(async (person, updates, successMsg = '') => {
    setPendingAction(`employee-update-${person.id}`)
    try {
      await updatePersonRecord(person, updates)
      refreshEmployeeDirectory()
      if (successMsg) setStatus(successMsg)
    } catch (err) {
      setStatus(err?.message || 'Update failed')
    }
    setPendingAction('')
  }, [refreshEmployeeDirectory])

  const handleEmployeeDelete = useCallback(async (person) => {
    if (!window.confirm(`Delete ${person.name}? This cannot be undone.`)) return
    setPendingAction(`employee-delete-${person.id}`)
    try {
      const res = await fetch(`/api/persons/${person.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.ok) {
        refreshEmployeeDirectory()
        setStatus(`${person.name} deleted`)
      } else {
        setStatus(data.message || 'Delete failed')
      }
    } catch {
      setStatus('Delete failed')
    }
    setPendingAction('')
  }, [refreshEmployeeDirectory])

  const openEmployeeEditor = useCallback((person) => setEmployeeEditor(person), [])

  // ── Admin handlers ─────────────────────────────────────────────────────────
  const reloadAdmins = useCallback(async () => {
    const res = await fetch('/api/admins')
    const data = await res.json()
    if (data.ok) setAdmins(data.admins || [])
  }, [])

  const handleCreateAdmin = useCallback(async (adminData) => {
    setPendingAction('admin-create')
    try {
      const res = await fetch('/api/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminData),
      })
      const data = await res.json()
      if (data.ok) {
        await reloadAdmins()
        setStatus('Admin created')
      } else {
        setStatus(data.message || 'Failed to create admin')
      }
    } catch {
      setStatus('Failed to create admin')
    }
    setPendingAction('')
  }, [reloadAdmins])

  const handleUpdateAdmin = useCallback(async (admin, updates) => {
    setPendingAction(`admin-update-${admin.id}`)
    try {
      const res = await fetch(`/api/admins/${admin.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...admin, ...updates }),
      })
      const data = await res.json()
      if (data.ok) {
        setAdmins(prev => prev.map(a => a.id === admin.id ? { ...a, ...updates } : a))
        setStatus('Admin updated')
      } else {
        setStatus(data.message || 'Failed to update admin')
      }
    } catch {
      setStatus('Failed to update admin')
    }
    setPendingAction('')
  }, [])

  const handleDeleteAdmin = useCallback(async (admin) => {
    if (!window.confirm(`Delete admin ${admin.email}?`)) return
    setPendingAction(`admin-delete-${admin.id}`)
    try {
      const res = await fetch(`/api/admins/${admin.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.ok) {
        setAdmins(prev => prev.filter(a => a.id !== admin.id))
        setStatus('Admin deleted')
      } else {
        setStatus(data.message || 'Failed to delete admin')
      }
    } catch {
      setStatus('Failed to delete admin')
    }
    setPendingAction('')
  }, [])

  // ── Summary export ─────────────────────────────────────────────────────────
  const handleExportSummary = useCallback(async () => {
    setPendingAction('summary-export')
    try {
      const params = new URLSearchParams({ date: summaryDate })
      if (summaryOfficeFilter !== 'all') params.set('officeId', summaryOfficeFilter)
      const res = await fetch(`/api/attendance/daily?${params.toString()}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.message)

      let rows = data.records || []
      if (summaryEmployeeFilter !== 'all') rows = rows.filter(r => r.employeeId === summaryEmployeeFilter)

      const headers = ['Employee', 'Employee ID', 'Office', 'Date', 'AM In', 'AM Out', 'PM In', 'PM Out', 'Late (min)', 'Undertime (min)', 'Working Hours', 'Status']
      const csv = [
        headers.join(','),
        ...rows.map(row => [
          `"${row.name || ''}"`,
          `"${row.employeeId || ''}"`,
          `"${row.officeName || ''}"`,
          `"${row.dateKey || ''}"`,
          `"${row.amIn || ''}"`,
          `"${row.amOut || ''}"`,
          `"${row.pmIn || ''}"`,
          `"${row.pmOut || ''}"`,
          row.lateMinutes || 0,
          row.undertimeMinutes || 0,
          `"${row.workingHours || ''}"`,
          `"${row.status || ''}"`,
        ].join(',')),
      ].join('\n')

      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `attendance-${summaryDate}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setStatus(err?.message || 'Export failed')
    }
    setPendingAction('')
  }, [summaryDate, summaryOfficeFilter, summaryEmployeeFilter])

  // ── Guard ──────────────────────────────────────────────────────────────────
  if (!officesLoaded) {
    return (
      <AppShell contentClassName="px-4 py-5 sm:px-6 lg:px-8">
        <div className="page-frame">
          <LoadingPanel
            body="Loading office configuration and admin workspace."
            title="Preparing admin workspace"
          />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell
      actions={(
        <div className="flex items-center gap-3">
          <span className="hidden max-w-[200px] truncate text-xs text-slate-light sm:block">{status}</span>
          <ActionButton
            className="border border-black/10 bg-white text-ink hover:bg-stone-50"
            label="Logout"
            onClick={handleLogout}
          />
        </div>
      )}
      contentClassName="px-4 py-5 sm:px-6 lg:px-8"
    >
      <div className="page-frame xl:h-[calc(100dvh-10.5rem)]">
        <div className="grid min-h-0 gap-5 xl:h-full xl:grid-cols-[260px_minmax(0,1fr)]">

          {/* Sidebar */}
          <aside className="xl:sticky xl:top-24 xl:h-[calc(100dvh-8rem)]">
            <div className="flex h-full flex-col gap-3 rounded-[2rem] border border-black/5 bg-white/90 p-4 shadow-glow backdrop-blur">
              <nav className="grid gap-1">
                {navItems.map(item => {
                  const active = activePanel === item.id
                  const disabled = item.id === 'admins' && roleScope !== 'regional'
                  return (
                    <button
                      key={item.id}
                      disabled={disabled}
                      onClick={() => startTransition(() => setActivePanel(item.id))}
                      type="button"
                      className={`flex items-center rounded-[1.1rem] px-4 py-3 text-left text-sm font-semibold transition ${active
                          ? 'bg-navy text-white shadow-sm'
                          : disabled
                            ? 'cursor-not-allowed text-muted opacity-40'
                            : 'text-ink hover:bg-stone-100'
                        }`}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </nav>

              <div className="mt-auto rounded-[1.1rem] border border-black/5 bg-stone-50 px-3 py-3">
                <div className="text-xs font-semibold uppercase tracking-widest text-navy-dark">
                  {roleScope === 'regional' ? 'Regional Admin' : 'Office Admin'}
                </div>
                {baseOffice ? <div className="mt-1 text-xs text-muted">{baseOffice.name}</div> : null}
              </div>
            </div>
          </aside>

          {/* Main content */}
          <div className="min-h-0">
            {activePanel === 'dashboard' && (
              <DashboardPanel
                roleScope={roleScope}
                selectedOfficeId={selectedOfficeId}
                offices={offices}
                persons={persons}
                attendance={attendance}
                attendanceLoaded={attendanceLoaded}
                admins={admins}
                adminsLoaded={adminsLoaded}
                baseOffice={baseOffice}
                visibleOffices={visibleOffices}
                scopedOfficeCount={scopedOfficeCount}
                employeeMetricValue={employeeMetricValue}
                todaysLogs={todaysLogs}
                firestoreIndexSummary={firestoreIndexSummary}
                isPending={isPending}
                handleApplyFirestoreIndexes={handleApplyFirestoreIndexes}
                setActivePanel={setActivePanel}
                setSelectedOfficeId={setSelectedOfficeId}
              />
            )}

            {activePanel === 'office' && (
              <OfficePanel
                visibleOffices={visibleOffices}
                selectedOfficeId={selectedOfficeId}
                setSelectedOfficeId={setSelectedOfficeId}
                persons={persons}
                activeOffice={activeOffice}
                handleSaveOffice={handleSaveOffice}
                handleUseMyLocation={handleUseMyLocation}
                highlightLocationPin={highlightLocationPin}
                locationLoading={locationLoading}
                locationNotice={locationNotice}
                officeDraftWarning={officeDraftWarning}
                isPending={isPending}
                toggleDay={toggleDay}
                updateDraft={updateDraft}
              />
            )}

            {activePanel === 'employees' && (
              <EmployeesPanel
                persons={persons}
                personsLoaded={personsLoaded}
                employeeDirectoryTotal={employeeDirectoryTotal}
                employeeDirectoryApprovedCount={employeeDirectoryApprovedCount}
                employeeDirectoryPendingCount={employeeDirectoryPendingCount}
                employeeDirectoryRejectedCount={employeeDirectoryRejectedCount}
                employeeQuery={employeeQuery}
                setEmployeeQuery={setEmployeeQuery}
                employeeOfficeFilter={employeeOfficeFilter}
                setEmployeeOfficeFilter={setEmployeeOfficeFilter}
                employeeStatusFilter={employeeStatusFilter}
                setEmployeeStatusFilter={setEmployeeStatusFilter}
                employeeApprovalFilter={employeeApprovalFilter}
                setEmployeeApprovalFilter={setEmployeeApprovalFilter}
                visibleOffices={visibleOffices}
                employeeDirectoryHistory={employeeDirectoryHistory}
                employeeDirectoryHasMore={employeeDirectoryHasMore}
                isPending={isPending}
                handlePreviousEmployeePage={handlePreviousEmployeePage}
                handleNextEmployeePage={handleNextEmployeePage}
                refreshEmployeeDirectory={refreshEmployeeDirectory}
                setStatus={setStatus}
                handleEmployeeUpdate={handleEmployeeUpdate}
                handleEmployeeDelete={handleEmployeeDelete}
                openEmployeeEditor={openEmployeeEditor}
                offices={offices}
              />
            )}

            {activePanel === 'summary' && (
              <SummaryPanel
                summaryDate={summaryDate}
                setSummaryDate={setSummaryDate}
                summaryOfficeFilter={summaryOfficeFilter}
                setSummaryOfficeFilter={setSummaryOfficeFilter}
                summaryEmployeeFilter={summaryEmployeeFilter}
                setSummaryEmployeeFilter={setSummaryEmployeeFilter}
                visibleOffices={visibleOffices}
                summaryEmployeeOptions={summaryEmployeeOptions}
                summaryRows={summaryRows}
                summaryLoading={summaryLoading}
                isPending={isPending}
                handleExportSummary={handleExportSummary}
              />
            )}

            {activePanel === 'admins' && (
              <AdminsPanel
                roleScope={roleScope}
                offices={offices}
                admins={admins}
                adminsLoaded={adminsLoaded}
                isPending={isPending}
                handleCreateAdmin={handleCreateAdmin}
                handleUpdateAdmin={handleUpdateAdmin}
                handleDeleteAdmin={handleDeleteAdmin}
              />
            )}
          </div>
        </div>
      </div>

      {/* Employee editor modal */}
      {employeeEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            initial={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-lg rounded-[2rem] border border-black/5 bg-white p-6 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-start gap-4">
              {employeeEditor.photoUrl ? (
                <img
                  alt={employeeEditor.name}
                  className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-2 ring-black/5"
                  src={employeeEditor.photoUrl}
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-navy/10 text-xl font-bold text-navy-dark">
                  {String(employeeEditor.name || '?')[0]}
                </div>
              )}
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-ink">{employeeEditor.name}</h2>
                <p className="mt-0.5 text-sm text-muted">{employeeEditor.employeeId}</p>
                {employeeEditor.submittedAt ? (
                  <p className="mt-1 text-xs text-amber-600">
                    Submitted {(() => {
                      try {
                        const d = employeeEditor.submittedAt?.toDate
                          ? employeeEditor.submittedAt.toDate()
                          : new Date(employeeEditor.submittedAt)
                        const days = Math.floor((Date.now() - d.getTime()) / 86400000)
                        if (days === 0) return 'today'
                        if (days === 1) return 'yesterday'
                        return `${days} days ago`
                      } catch { return '' }
                    })()}
                  </p>
                ) : null}
              </div>
            </div>

            {/* Fields */}
            <div className="mt-5 grid gap-4">
              <Field label="Transfer to office">
                <select
                  id="editor-officeId"
                  defaultValue={employeeEditor.officeId}
                  className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy"
                >
                  {visibleOffices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </Field>

              <Field label="Approval status">
                <select
                  id="editor-approval"
                  defaultValue={getEffectivePersonApprovalStatus(employeeEditor)}
                  className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy"
                >
                  <option value={PERSON_APPROVAL_PENDING}>Pending review</option>
                  <option value={PERSON_APPROVAL_APPROVED}>Approved</option>
                  <option value={PERSON_APPROVAL_REJECTED}>Rejected</option>
                </select>
              </Field>

              <Field label="Account status">
                <select
                  id="editor-active"
                  defaultValue={employeeEditor.active !== false ? 'true' : 'false'}
                  className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy"
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </Field>

              {employeeEditor.sampleCount > 0 && (
                <div className="rounded-2xl border border-black/5 bg-stone-50 px-4 py-3 text-sm text-muted">
                  {employeeEditor.sampleCount} biometric sample(s) enrolled.
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEmployeeEditor(null)}
                className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending(`employee-update-${employeeEditor.id}`)}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-navy-dark disabled:opacity-60"
                onClick={() => {
                  const officeId = document.getElementById('editor-officeId').value
                  const active = document.getElementById('editor-active').value === 'true'
                  const approvalStatus = document.getElementById('editor-approval').value
                  const office = offices.find(o => o.id === officeId)
                  handleEmployeeUpdate(
                    employeeEditor,
                    { officeId, officeName: office?.name || employeeEditor.officeName, active, approvalStatus },
                    `${employeeEditor.name} updated`,
                  )
                  setEmployeeEditor(null)
                }}
              >
                {isPending(`employee-update-${employeeEditor.id}`) ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : 'Save changes'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AppShell>
  )
}
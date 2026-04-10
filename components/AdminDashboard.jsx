'use client'

import { motion } from 'framer-motion'
import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { deletePersonRecord, subscribeToAttendance, updatePersonRecord } from '../lib/data-store'
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
import InfoRow from './admin/InfoRow'

const EMPLOYEE_PAGE_SIZE = 24

const navItems = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'office', label: 'Office' },
  { id: 'employees', label: 'Employees' },
  { id: 'summary', label: 'Summary' },
  { id: 'admins', label: 'Admins' },
]

export default function AdminDashboard({ initialRoleScope = 'regional', initialOfficeId = '' }) {
  const todayIso = formatAttendanceDateKey(Date.now())
  const [roleScope, setRoleScope] = useState(initialRoleScope)
  const [selectedOfficeId, setSelectedOfficeId] = useState(initialOfficeId)
  const [offices, setOffices] = useState([])
  const [persons, setPersons] = useState([])
  const [attendance, setAttendance] = useState([])
  const [dailySummaryRecords, setDailySummaryRecords] = useState([])
  const [officesLoaded, setOfficesLoaded] = useState(false)
  const [personsLoaded, setPersonsLoaded] = useState(false)
  const [attendanceLoaded, setAttendanceLoaded] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(firebaseEnabled)
  const [adminsLoaded, setAdminsLoaded] = useState(false)
  const [draftOffice, setDraftOffice] = useState(null)
  const [status, setStatus] = useState(firebaseEnabled ? 'Connected to Firebase' : 'Using local storage fallback')
  const [summaryDate, setSummaryDate] = useState(todayIso)
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
  const [summaryOfficeFilter, setSummaryOfficeFilter] = useState('all')
  const [summaryEmployeeFilter, setSummaryEmployeeFilter] = useState('all')
  const [activePanel, setActivePanel] = useState('dashboard')
  const [admins, setAdmins] = useState([])
  const [officeDraftWarning, setOfficeDraftWarning] = useState('')
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationNotice, setLocationNotice] = useState('')
  const [highlightLocationPin, setHighlightLocationPin] = useState(false)
  const [pendingAction, setPendingAction] = useState('')
  const [employeeEditor, setEmployeeEditor] = useState(null)
  const [firestoreIndexSummary, setFirestoreIndexSummary] = useState(null)
  const draftOfficeRef = useRef(draftOffice)
  const locationNoticeTimerRef = useRef(null)
  const locationPulseTimerRef = useRef(null)
  const deferredEmployeeQuery = useDeferredValue(employeeQuery)
  const shouldLoadPersons = activePanel === 'employees'
  const shouldLoadAttendance = activePanel === 'dashboard' || activePanel === 'summary'
  const shouldLoadAdmins = roleScope === 'regional' && (activePanel === 'dashboard' || activePanel === 'admins')

  // Placeholder for missing hook implementations – you must fill these in with your actual logic
  useEffect(() => {
    // Subscribe to offices
    const unsub = subscribeToOfficeConfigs(setOffices, (err) => setStatus(err.message))
    setOfficesLoaded(true)
    return unsub
  }, [])

  useEffect(() => {
    if (shouldLoadPersons) {
      // Load persons logic
    }
  }, [shouldLoadPersons])

  useEffect(() => {
    if (shouldLoadAttendance) {
      const unsub = subscribeToAttendance(setAttendance, () => {})
      setAttendanceLoaded(true)
      return unsub
    }
  }, [shouldLoadAttendance])

  // Other hooks omitted for brevity – add your actual implementations

  const visibleOffices = useMemo(() => {
    if (roleScope === 'regional') return offices
    return offices.filter(office => office.id === selectedOfficeId)
  }, [offices, roleScope, selectedOfficeId])

  const activeOffice = useMemo(() => {
    if (draftOffice) return draftOffice
    return offices.find(office => office.id === selectedOfficeId) || null
  }, [draftOffice, offices, selectedOfficeId])

  const baseOffice = useMemo(
    () => offices.find(office => office.id === selectedOfficeId) || null,
    [offices, selectedOfficeId],
  )

  const visibleAttendance = useMemo(() => (
    attendance.filter(entry => (roleScope === 'regional' ? true : entry.officeId === selectedOfficeId))
  ), [attendance, roleScope, selectedOfficeId])

  const todaysLogs = useMemo(() => {
    const now = Date.now()
    const todayKey = formatAttendanceDateKey(now)
    const todayLabel = formatAttendanceDateLabel(now)
    return visibleAttendance.filter(entry => (
      (entry.dateKey && entry.dateKey === todayKey)
      || (!entry.dateKey && entry.date === todayLabel)
    )).length
  }, [visibleAttendance])

  const scopedOfficeCount = visibleOffices.length
  const employeeMetricValue = activePanel === 'employees' && personsLoaded
    ? String(employeeDirectoryTotal).padStart(2, '0')
    : roleScope === 'regional'
      ? String(offices.reduce((total, office) => total + Number(office.employees || 0), 0)).padStart(2, '0')
      : String(Number(baseOffice?.employees || 0)).padStart(2, '0')

  function isPending(actionKey) {
    return pendingAction === actionKey
  }

  // Placeholder functions – replace with actual implementations
  const handleLogout = () => {}
  const handleApplyFirestoreIndexes = () => {}
  const handleSaveOffice = () => {}
  const handleUseMyLocation = () => {}
  const toggleDay = () => {}
  const updateDraft = () => {}
  const handlePreviousEmployeePage = () => {}
  const handleNextEmployeePage = () => {}
  const refreshEmployeeDirectory = () => {}
  const handleEmployeeUpdate = () => {}
  const handleEmployeeDelete = () => {}
  const openEmployeeEditor = (person) => setEmployeeEditor(person)
  const summaryEmployeeOptions = []
  const summaryRows = []
  const handleExportSummary = () => {}
  const handleCreateAdmin = () => {}
  const handleUpdateAdmin = () => {}
  const handleDeleteAdmin = () => {}

  if (!officesLoaded) {
    return (
      <AppShell contentClassName="px-4 py-5 sm:px-6 lg:px-8">
        <div className="page-frame-fluid">
          <LoadingPanel
            body="Loading office configuration, scope, and admin workspace data."
            title="Preparing admin workspace"
          />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell
      actions={(
        <ActionButton
          className="border border-black/10 bg-white text-ink hover:bg-stone-50"
          label="Logout"
          onClick={handleLogout}
        />
      )}
      contentClassName="px-4 py-5 sm:px-6 lg:px-8"
    >
      <div className="page-frame-fluid xl:h-[calc(100dvh-10.5rem)]">
        <div className="grid min-h-0 gap-5 xl:h-full xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="xl:sticky xl:top-24 xl:h-[calc(100dvh-8rem)]">
            <div className="flex h-full flex-col gap-4 rounded-[2rem] border border-black/5 bg-[linear-gradient(180deg,rgba(12,108,88,0.08),rgba(255,255,255,0.96))] p-5 shadow-glow backdrop-blur">
              <nav className="grid gap-2">
                {navItems.map(item => {
                  const active = activePanel === item.id
                  const disabled = item.id === 'admins' && roleScope !== 'regional'
                  return (
                    <button
                      key={item.id}
                      className={`flex items-center justify-between rounded-[1.25rem] border px-4 py-3 text-left text-sm font-semibold transition ${
                        active ? 'bg-blue-100 text-blue-700' : 'hover:bg-stone-100'
                      }`}
                      disabled={disabled}
                      onClick={() => {
                        startTransition(() => setActivePanel(item.id))
                      }}
                      type="button"
                    >
                      <span>{item.label}</span>
                      <span className="text-xs uppercase tracking-[0.18em]">
                        {item.id === 'office' ? scopedOfficeCount : ''}
                      </span>
                    </button>
                  )
                })}
              </nav>
            </div>
          </aside>

          <div className="grid min-h-0 gap-5">
            {activePanel === 'dashboard' ? (
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
            ) : activePanel === 'office' ? (
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
            ) : activePanel === 'employees' ? (
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
            ) : activePanel === 'summary' ? (
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
            ) : activePanel === 'admins' ? (
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
            ) : null}

            {/* Employee Editor Modal */}
            {employeeEditor && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[2rem] border border-black/5 bg-white p-6 shadow-2xl"
                >
                  <div className="mb-6">
                    <h2 className="font-display text-2xl text-ink">Edit Employee</h2>
                    <p className="text-sm text-muted">Update employee details and status.</p>
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      const formData = new FormData(e.currentTarget)
                      const updates = {
                        name: formData.get('name')?.toString().toUpperCase() || employeeEditor.name,
                        employeeId: formData.get('employeeId')?.toString().trim() || employeeEditor.employeeId,
                        officeId: formData.get('officeId')?.toString() || employeeEditor.officeId,
                        officeName: offices.find(o => o.id === formData.get('officeId'))?.name || employeeEditor.officeName,
                        active: formData.get('active') === 'true',
                        approvalStatus: formData.get('approvalStatus') || getEffectivePersonApprovalStatus(employeeEditor),
                      }
                      handleEmployeeUpdate(employeeEditor, updates, `${updates.name} updated`)
                      setEmployeeEditor(null)
                    }}
                  >
                    <div className="space-y-4">
                      <Field label="Full Name">
                        <input
                          name="name"
                          defaultValue={employeeEditor.name}
                          className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm uppercase text-ink outline-none transition focus:border-brand"
                          required
                        />
                      </Field>

                      <Field label="Employee ID">
                        <input
                          name="employeeId"
                          defaultValue={employeeEditor.employeeId}
                          className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                          required
                        />
                      </Field>

                      <Field label="Assigned Office">
                        <select
                          name="officeId"
                          defaultValue={employeeEditor.officeId}
                          className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                          required
                        >
                          {visibleOffices.map(office => (
                            <option key={office.id} value={office.id}>{office.name}</option>
                          ))}
                        </select>
                      </Field>

                      <Field label="Account Status">
                        <select
                          name="active"
                          defaultValue={employeeEditor.active !== false ? 'true' : 'false'}
                          className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                        >
                          <option value="true">Active</option>
                          <option value="false">Inactive</option>
                        </select>
                      </Field>

                      <Field label="Approval Status">
                        <select
                          name="approvalStatus"
                          defaultValue={getEffectivePersonApprovalStatus(employeeEditor)}
                          className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                        >
                          <option value={PERSON_APPROVAL_PENDING}>Pending Review</option>
                          <option value={PERSON_APPROVAL_APPROVED}>Approved</option>
                          <option value={PERSON_APPROVAL_REJECTED}>Rejected</option>
                        </select>
                      </Field>

                      {employeeEditor.sampleCount > 0 && (
                        <div className="rounded-2xl border border-black/5 bg-stone-50 p-4">
                          <div className="text-sm font-medium text-ink">Biometric Samples</div>
                          <div className="mt-1 text-sm text-muted">
                            This employee has {employeeEditor.sampleCount} enrolled sample(s).
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-6 flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setEmployeeEditor(null)}
                        className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-stone-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isPending(`employee-update-${employeeEditor.id}`)}
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isPending(`employee-update-${employeeEditor.id}`) ? (
                          <>
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            Saving...
                          </>
                        ) : (
                          'Save Changes'
                        )}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
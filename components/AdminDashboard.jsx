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
import AdminOfficePanel from './AdminOfficePanel'

const EMPLOYEE_PAGE_SIZE = 24

const navItems = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'office', label: 'Office' },
  { id: 'employees', label: 'Employees' },
  { id: 'summary', label: 'Summary' },
  { id: 'admins', label: 'Admins' },
]

const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short' })

function getScopeLabel(roleScope) {
  return roleScope === 'office' ? 'Office admin' : 'Regional admin'
}

function formatDecisionLabel(code) {
  const normalized = String(code || '').trim()
  if (!normalized) return 'Unknown'

  return normalized
    .replaceAll('_', ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function getDecisionTone(code) {
  if (String(code || '').startsWith('accepted_')) return 'ok'
  if (code === 'blocked_recent_duplicate') return 'warn'
  return 'bad'
}

function formatApprovalLabel(status) {
  return String(status || '')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function getApprovalBadgeClass(status) {
  if (status === PERSON_APPROVAL_APPROVED) return 'bg-emerald-100 text-emerald-800'
  if (status === PERSON_APPROVAL_PENDING) return 'bg-amber-100 text-amber-800'
  return 'bg-rose-100 text-rose-700'
}

function areOfficeDraftsEqual(left, right) {
  return JSON.stringify(left || null) === JSON.stringify(right || null)
}

function formatDays(dayValues = []) {
  if (!dayValues.length) return 'None'

  return dayValues
    .map(dayValue => {
      const date = new Date(Date.UTC(2024, 0, 7 + Number(dayValue)))
      return weekdayFormatter.format(date)
    })
    .join(', ')
}

function formatTime(value) {
  if (!value) return '--'

  const [hours, minutes] = String(value).split(':')
  const numericHours = Number(hours)
  const suffix = numericHours >= 12 ? 'PM' : 'AM'
  const displayHours = ((numericHours + 11) % 12) + 1
  return `${displayHours}:${minutes} ${suffix}`
}

function formatFirestoreIndexSummary(summary) {
  if (!summary) return 'Regional admins can submit the required Firestore composite indexes and field overrides from here.'

  const failureCount = Number(summary?.composite?.failed || 0) + Number(summary?.fieldOverrides?.failed || 0)
  const compositeSummary = `${Number(summary?.composite?.submitted || 0)} submitted / ${Number(summary?.composite?.existing || 0)} existing`
  const fieldSummary = `${Number(summary?.fieldOverrides?.submitted || 0)} field updates`

  return failureCount > 0
    ? `Last sync finished with ${failureCount} failures. Composite: ${compositeSummary}. Field overrides: ${fieldSummary}.`
    : `Last sync submitted successfully. Composite: ${compositeSummary}. Field overrides: ${fieldSummary}.`
}

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
  const [adminEmail, setAdminEmail] = useState('')
  const [adminDisplayName, setAdminDisplayName] = useState('')
  const [adminScope, setAdminScope] = useState('office')
  const [adminOfficeId, setAdminOfficeId] = useState('')
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

  useEffect(() => {
    const unsubscribe = subscribeToOfficeConfigs(
      nextOffices => {
        setOffices(nextOffices)
        setOfficesLoaded(true)
        if (!selectedOfficeId && nextOffices[0]) {
          setSelectedOfficeId(initialOfficeId || nextOffices[0].id)
        }
      },
      error => {
        setOfficesLoaded(true)
        setStatus(error.message || 'Failed to load office configuration')
      },
    )

    return unsubscribe
  }, [initialOfficeId, selectedOfficeId])

  useEffect(() => {
    setRoleScope(initialRoleScope)
  }, [initialRoleScope])

  useEffect(() => {
    draftOfficeRef.current = draftOffice
  }, [draftOffice])

  useEffect(() => () => {
    if (locationNoticeTimerRef.current) window.clearTimeout(locationNoticeTimerRef.current)
    if (locationPulseTimerRef.current) window.clearTimeout(locationPulseTimerRef.current)
  }, [])

  useEffect(() => {
    setEmployeeDirectoryCursor('')
    setEmployeeDirectoryHistory([])
  }, [deferredEmployeeQuery, employeeOfficeFilter, employeeStatusFilter, employeeApprovalFilter, roleScope, selectedOfficeId])

  useEffect(() => {
    if (!shouldLoadPersons) return () => {}

    let active = true
    setPersonsLoaded(false)

    const load = async () => {
      try {
        const params = new URLSearchParams({
          mode: 'directory',
          limit: String(EMPLOYEE_PAGE_SIZE),
        })

        const normalizedQuery = deferredEmployeeQuery.trim()
        if (normalizedQuery) params.set('q', normalizedQuery)
        if (employeeOfficeFilter !== 'all') params.set('officeId', employeeOfficeFilter)
        if (employeeStatusFilter !== 'all') params.set('status', employeeStatusFilter)
        if (employeeApprovalFilter !== 'all') params.set('approval', employeeApprovalFilter)
        if (employeeDirectoryCursor) params.set('cursor', employeeDirectoryCursor)

        const response = await fetch(`/api/persons?${params.toString()}`, { cache: 'no-store' })
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.message || 'Failed to load employees')

        if (!active) return

        setPersons(payload?.persons || [])
        setEmployeeDirectoryNextCursor(payload?.page?.nextCursor || '')
        setEmployeeDirectoryHasMore(Boolean(payload?.page?.hasMore))
        setEmployeeDirectoryTotal(Number(payload?.page?.total || 0))
        setEmployeeDirectoryApprovedCount(Number(payload?.page?.approved || 0))
        setEmployeeDirectoryPendingCount(Number(payload?.page?.pending || 0))
        setEmployeeDirectoryRejectedCount(Number(payload?.page?.rejected || 0))
        setPersonsLoaded(true)
      } catch (error) {
        if (!active) return
        setPersonsLoaded(true)
        setStatus(error instanceof Error ? error.message : 'Failed to load employees')
      }
    }

    load()
    return () => {
      active = false
    }
  }, [
    deferredEmployeeQuery,
    employeeDirectoryCursor,
    employeeDirectoryRefreshKey,
    employeeApprovalFilter,
    employeeOfficeFilter,
    employeeStatusFilter,
    shouldLoadPersons,
  ])

  useEffect(() => {
    if (!shouldLoadAttendance) return () => {}

    setAttendanceLoaded(false)

    return subscribeToAttendance(
      nextAttendance => {
        setAttendance(nextAttendance)
        setAttendanceLoaded(true)
      },
      error => {
        setAttendanceLoaded(true)
        setStatus(error instanceof Error ? error.message : 'Failed to load attendance')
      },
    )
  }, [shouldLoadAttendance])

  useEffect(() => {
    if (!shouldLoadAdmins) {
      setAdmins([])
      setAdminsLoaded(roleScope !== 'regional')
      return
    }

    setAdminsLoaded(false)

    let active = true

    const load = async () => {
      try {
        const response = await fetch('/api/admins', { cache: 'no-store' })
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.message || 'Failed to load admin records')
        if (active) {
          setAdmins(payload?.admins || [])
          setAdminsLoaded(true)
        }
      } catch (error) {
        if (active) {
          setAdminsLoaded(true)
          setStatus(error instanceof Error ? error.message : 'Failed to load admin records')
        }
      }
    }

    load()
    return () => {
      active = false
    }
  }, [roleScope, shouldLoadAdmins])

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

  const decisionStats = useMemo(() => {
    const counters = new Map()

    visibleAttendance.forEach(entry => {
      const code = String(entry.decisionCode || '').trim()
      if (!code) return
      counters.set(code, (counters.get(code) || 0) + 1)
    })

    return Array.from(counters.entries())
      .map(([code, count]) => ({ code, count, tone: getDecisionTone(code) }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 6)
  }, [visibleAttendance])

  useEffect(() => {
    if (!firebaseEnabled) {
      setDailySummaryRecords([])
      setSummaryLoading(false)
      return
    }

    if (activePanel !== 'summary') return

    let active = true
    setSummaryLoading(true)

    const load = async () => {
      try {
        const params = new URLSearchParams({ date: summaryDate })
        const response = await fetch(`/api/attendance/daily?${params.toString()}`, { cache: 'no-store' })
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.message || 'Failed to load daily attendance summary')
        if (active) {
          setDailySummaryRecords(payload?.records || [])
          setSummaryLoading(false)
        }
      } catch (error) {
        if (active) {
          setSummaryLoading(false)
          setStatus(error instanceof Error ? error.message : 'Failed to load daily attendance summary')
        }
      }
    }

    load()
    return () => {
      active = false
    }
  }, [activePanel, summaryDate])

  const baseSummaryRows = useMemo(() => {
    const baseRows = firebaseEnabled ? dailySummaryRecords : []

    return baseRows.filter(row => {
      if (roleScope !== 'regional' && row.officeName !== activeOffice?.name) return false
      if (summaryOfficeFilter !== 'all') {
        const office = offices.find(item => item.id === summaryOfficeFilter)
        if (row.officeName !== office?.name) return false
      }
      return true
    })
  }, [activeOffice?.name, dailySummaryRecords, offices, roleScope, summaryOfficeFilter])

  const summaryEmployeeOptions = useMemo(() => {
    const uniqueEmployees = new Map()

    baseSummaryRows.forEach(row => {
      if (!row.employeeId) return
      if (!uniqueEmployees.has(row.employeeId)) {
        uniqueEmployees.set(row.employeeId, {
          employeeId: row.employeeId,
          name: row.name || row.employeeId,
        })
      }
    })

    return Array.from(uniqueEmployees.values()).sort((left, right) => (
      left.name.localeCompare(right.name) || left.employeeId.localeCompare(right.employeeId)
    ))
  }, [baseSummaryRows])

  const summaryRows = useMemo(() => (
    baseSummaryRows.filter(row => (
      summaryEmployeeFilter === 'all' || row.employeeId === summaryEmployeeFilter
    ))
  ), [baseSummaryRows, summaryEmployeeFilter])

  useEffect(() => {
    if (summaryEmployeeFilter === 'all') return
    if (summaryEmployeeOptions.some(option => option.employeeId === summaryEmployeeFilter)) return
    setSummaryEmployeeFilter('all')
  }, [summaryEmployeeFilter, summaryEmployeeOptions])

  useEffect(() => {
    const office = offices.find(item => item.id === selectedOfficeId) || null
    const nextDraft = office ? structuredClone(office) : null
    const currentDraft = draftOfficeRef.current

    if (!currentDraft || currentDraft.id !== office?.id) {
      setDraftOffice(nextDraft)
      setOfficeDraftWarning('')
      return
    }

    if (areOfficeDraftsEqual(currentDraft, office)) {
      setDraftOffice(nextDraft)
      setOfficeDraftWarning('')
      return
    }

    setOfficeDraftWarning('Background updates were detected. Your unsaved office edits were kept.')
  }, [offices, selectedOfficeId])

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
  const employeeEditorSource = employeeEditor
    ? persons.find(person => person.id === employeeEditor.id) || null
    : null
  const employeeMetricValue = activePanel === 'employees' && personsLoaded
    ? String(employeeDirectoryTotal).padStart(2, '0')
    : roleScope === 'regional'
      ? String(offices.reduce((total, office) => total + Number(office.employees || 0), 0)).padStart(2, '0')
      : String(Number(baseOffice?.employees || 0)).padStart(2, '0')

  function isPending(actionKey) {
    return pendingAction === actionKey
  }

  async function runPendingAction(actionKey, startMessage, work, successMessage) {
    setPendingAction(actionKey)
    setStatus(startMessage)

    try {
      const result = await work()
      if (successMessage) {
        const nextStatus = typeof successMessage === 'function' ? successMessage(result) : successMessage
        if (nextStatus) setStatus(nextStatus)
      }
      return result
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Action failed')
      return null
    } finally {
      setPendingAction('')
    }
  }

  function refreshEmployeeDirectory() {
    setEmployeeDirectoryRefreshKey(current => current + 1)
  }

  function handlePreviousEmployeePage() {
    if (employeeDirectoryHistory.length === 0 || pendingAction) return

    const previousCursor = employeeDirectoryHistory[employeeDirectoryHistory.length - 1]
    setEmployeeDirectoryHistory(current => current.slice(0, -1))
    setEmployeeDirectoryCursor(previousCursor)
  }

  function handleNextEmployeePage() {
    if (!employeeDirectoryHasMore || !employeeDirectoryNextCursor || pendingAction) return

    setEmployeeDirectoryHistory(current => [...current, employeeDirectoryCursor])
    setEmployeeDirectoryCursor(employeeDirectoryNextCursor)
  }

  function updateDraft(path, value) {
    setDraftOffice(current => {
      if (!current) return current

      const next = structuredClone(current)
      const keys = path.split('.')
      let target = next

      for (let index = 0; index < keys.length - 1; index += 1) {
        target = target[keys[index]]
      }

      target[keys[keys.length - 1]] = value
      return next
    })
  }

  function toggleDay(path, dayValue) {
    setDraftOffice(current => {
      if (!current) return current

      const next = structuredClone(current)
      const values = next.workPolicy[path]

      next.workPolicy[path] = values.includes(dayValue)
        ? values.filter(value => value !== dayValue)
        : [...values, dayValue].sort((left, right) => left - right)

      return next
    })
  }

  async function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setStatus('Location services are not available on this device')
      return
    }

    setLocationLoading(true)
    setLocationNotice('')
    setStatus('Getting current location...')

    navigator.geolocation.getCurrentPosition(
      position => {
        updateDraft('gps.latitude', Number(position.coords.latitude.toFixed(6)))
        updateDraft('gps.longitude', Number(position.coords.longitude.toFixed(6)))
        setLocationLoading(false)
        setLocationNotice('Current location applied to the office pin. Save office settings to keep it.')
        setHighlightLocationPin(true)
        setStatus('Office location updated from current device location')
        if (locationNoticeTimerRef.current) window.clearTimeout(locationNoticeTimerRef.current)
        if (locationPulseTimerRef.current) window.clearTimeout(locationPulseTimerRef.current)
        locationNoticeTimerRef.current = window.setTimeout(() => {
          setLocationNotice('')
          locationNoticeTimerRef.current = null
        }, 3200)
        locationPulseTimerRef.current = window.setTimeout(() => {
          setHighlightLocationPin(false)
          locationPulseTimerRef.current = null
        }, 2200)
      },
      error => {
        setLocationLoading(false)
        setLocationNotice('')
        setStatus(error.message || 'Unable to get current location')
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    )
  }

  async function handleSaveOffice() {
    if (!draftOffice) return

    const result = await runPendingAction(
      'office-save',
      'Saving office configuration...',
      () => saveOfficeConfig(draftOffice),
      value => value?.mode === 'firebase' ? 'Saved through protected server route' : 'Saved locally',
    )

    if (result) {
      setOfficeDraftWarning('')
    }
  }

  async function handleLogout() {
    await fetch('/api/admin/logout', { method: 'POST' })
    window.location.href = '/admin/login'
  }

  async function handleEmployeeUpdate(person, updates, successMessage) {
    const startMessage = typeof updates.approvalStatus === 'string'
      ? 'Updating approval status...'
      : successMessage.includes('inactive')
        ? 'Updating employee status...'
        : 'Updating employee record...'

    const result = await runPendingAction(
      `employee-update-${person.id}`,
      startMessage,
      () => updatePersonRecord(person, updates),
      successMessage,
    )

    if (!result) return

    setPersons(current => current.map(item => (
      item.id === person.id
        ? {
            ...item,
            ...updates,
            officeName: updates.officeName ?? item.officeName,
            active: typeof updates.active === 'boolean' ? updates.active : item.active,
            name: typeof updates.name === 'string' ? updates.name.trim().toUpperCase() : item.name,
            approvalStatus: typeof updates.approvalStatus === 'string'
              ? updates.approvalStatus
              : getEffectivePersonApprovalStatus(item),
          }
        : item
    )))

    refreshEmployeeDirectory()

    return result
  }

  async function handleEmployeeDelete(person) {
    const confirmed = window.confirm(`Delete ${person.name}? This removes the employee record and biometric samples.`)
    if (!confirmed) return

    const result = await runPendingAction(
      `employee-delete-${person.id}`,
      'Deleting employee record...',
      () => deletePersonRecord(persons, person.id),
      `${person.name} deleted`,
    )

    if (!result) return

    if (result.mode === 'local') {
      setPersons(result.persons)
    } else {
      setPersons(current => current.filter(item => item.id !== person.id))
    }

    if (employeeEditor?.id === person.id) {
      setEmployeeEditor(null)
    }

    if (persons.length === 1 && employeeDirectoryHistory.length > 0) {
      const previousCursor = employeeDirectoryHistory[employeeDirectoryHistory.length - 1]
      setEmployeeDirectoryHistory(current => current.slice(0, -1))
      setEmployeeDirectoryCursor(previousCursor)
      return
    }

    refreshEmployeeDirectory()
  }

  async function refreshAdmins() {
    if (roleScope !== 'regional') return
    const response = await fetch('/api/admins', { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(payload?.message || 'Failed to load admin records')
    setAdmins(payload?.admins || [])
  }

  async function handleCreateAdmin() {
    const result = await runPendingAction(
      'admin-create',
      'Creating admin record...',
      async () => {
        const response = await fetch('/api/admins', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: adminEmail,
            displayName: adminDisplayName,
            scope: adminScope,
            officeId: adminScope === 'office' ? adminOfficeId : '',
            active: true,
          }),
        })

        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.message || 'Failed to create admin record')
        return payload
      },
      'Admin record created',
    )

    if (result) {
      setAdminEmail('')
      setAdminDisplayName('')
      setAdminScope('office')
      setAdminOfficeId('')
      await refreshAdmins()
    }
  }

  async function handleUpdateAdmin(admin, updates) {
    const result = await runPendingAction(
      `admin-update-${admin.id}`,
      'Updating admin record...',
      async () => {
        const response = await fetch(`/api/admins/${admin.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: updates.email ?? admin.email,
            displayName: updates.displayName ?? admin.displayName,
            scope: updates.scope ?? admin.scope,
            officeId: (updates.scope ?? admin.scope) === 'office' ? (updates.officeId ?? admin.officeId) : '',
            active: updates.active ?? admin.active,
          }),
        })

        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.message || 'Failed to update admin record')
        return payload
      },
      'Admin record updated',
    )

    if (result) {
      await refreshAdmins()
    }
  }

  async function handleDeleteAdmin(admin) {
    const result = await runPendingAction(
      `admin-delete-${admin.id}`,
      'Deleting admin record...',
      async () => {
        const response = await fetch(`/api/admins/${admin.id}`, { method: 'DELETE' })
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.message || 'Failed to delete admin record')
        return payload
      },
      'Admin record deleted',
    )

    if (result) {
      await refreshAdmins()
    }
  }

  async function handleApplyFirestoreIndexes() {
    const result = await runPendingAction(
      'firestore-index-sync',
      'Submitting Firestore index operations...',
      async () => {
        const response = await fetch('/api/admin/maintenance/firestore-indexes', {
          method: 'POST',
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.message || 'Failed to sync Firestore indexes')
        return payload
      },
      payload => payload?.message || 'Firestore index sync submitted',
    )

    if (result?.summary) {
      setFirestoreIndexSummary(result.summary)
    }
  }

  function openEmployeeEditor(person) {
    setEmployeeEditor({
      id: person.id,
      name: person.name,
      employeeId: person.employeeId,
      officeId: person.officeId,
      active: person.active !== false,
      approvalStatus: getEffectivePersonApprovalStatus(person),
      sampleCount: person.sampleCount ?? 0,
      officeName: person.officeName,
    })
  }

  async function handleSaveEmployeeEditor() {
    if (!employeeEditorSource || !employeeEditor) return

    if (!employeeEditor.name.trim()) {
      setStatus('Employee name is required')
      return
    }

    const office = offices.find(item => item.id === employeeEditor.officeId)
    if (!office) {
      setStatus('Select a valid office before saving')
      return
    }

    const result = await handleEmployeeUpdate(
      employeeEditorSource,
      {
        name: employeeEditor.name,
        officeId: office.id,
        officeName: office.name,
        active: employeeEditor.active,
        approvalStatus: employeeEditor.approvalStatus,
      },
      `${employeeEditor.name.trim().toUpperCase()} updated`,
    )

    if (result) {
      setEmployeeEditor(null)
    }
  }

  function exportSummaryCsv() {
    if (summaryRows.length === 0) {
      setStatus('No summary rows to export')
      return false
    }

    const headers = [
      'Employee ID',
      'Employee Name',
      'Office',
      'AM In',
      'AM Out',
      'PM In',
      'PM Out',
      'Late Minutes',
      'Undertime Minutes',
      'Working Hours',
      'Status',
    ]

    const rows = summaryRows.map(row => ([
      row.employeeId,
      row.name,
      row.officeName,
      row.amIn,
      row.amOut,
      row.pmIn,
      row.pmOut,
      row.lateMinutes,
      row.undertimeMinutes,
      row.workingHours,
      row.status,
    ]))

    const csv = [headers, ...rows]
      .map(columns => columns.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `attendance-summary-${summaryDate}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    return true
  }

  async function handleExportSummary() {
    const result = await runPendingAction(
      'summary-export',
      'Exporting attendance summary...',
      async () => exportSummaryCsv(),
      value => value ? 'Attendance summary exported' : null,
    )

    return result
  }

  if (!officesLoaded) {
    return (
      <AppShell contentClassName="px-4 py-5 sm:px-6 lg:px-8">
        <div className="page-frame">
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
      <div className="page-frame xl:h-[calc(100dvh-10.5rem)]">
        <div className="grid min-h-0 gap-5 xl:h-full xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="xl:sticky xl:top-24 xl:h-[calc(100dvh-8rem)]">
            <div className="flex h-full flex-col gap-4 rounded-[2rem] border border-black/5 bg-[linear-gradient(180deg,rgba(12,108,88,0.08),rgba(255,255,255,0.96))] p-5 shadow-glow backdrop-blur">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-dark">Admin panel</div>
                <h1 className="mt-3 font-display text-3xl leading-tight text-ink">Workspace</h1>
                <p className="mt-3 text-sm leading-7 text-muted">
                  Centralized admin navigation for dashboard, office records, employees, summary, and admin accounts.
                </p>
              </div>

              <div className="rounded-[1.5rem] border border-black/5 bg-white/85 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">Access scope</div>
                <div className="mt-2 text-lg font-semibold text-ink">{getScopeLabel(roleScope)}</div>
                <div className="mt-2 text-sm leading-6 text-muted">{status}</div>
              </div>

              <nav className="grid gap-2">
                {navItems.map(item => {
                  const active = activePanel === item.id
                  const disabled = item.id === 'admins' && roleScope !== 'regional'

                  return (
                    <button
                      key={item.id}
                      className={`flex items-center justify-between rounded-[1.25rem] border px-4 py-3 text-left text-sm font-semibold transition ${
                        active
                          ? 'border-brand/30 bg-brand text-white shadow-sm'
                          : 'border-black/8 bg-white/80 text-ink hover:bg-white'
                      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                      disabled={disabled}
                      onClick={() => {
                        startTransition(() => setActivePanel(item.id))
                      }}
                      type="button"
                    >
                      <span>{item.label}</span>
                      <span className={`text-xs uppercase tracking-[0.18em] ${active ? 'text-white/80' : 'text-muted'}`}>
                        {item.id === 'office' ? scopedOfficeCount : ''}
                      </span>
                    </button>
                  )
                })}
              </nav>

              <div className="mt-auto rounded-[1.5rem] border border-black/5 bg-[#1f3c36] p-4 text-white">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/65">
                  {roleScope === 'regional' ? 'Regional access' : 'Office access'}
                </div>
                <div className="mt-2 text-lg font-semibold">
                  {roleScope === 'regional' ? 'All Region XII offices' : (baseOffice?.name || 'Assigned office')}
                </div>
                <div className="mt-1 text-sm text-white/70">
                  {roleScope === 'regional'
                    ? 'Regional admin can manage all provincial, HUC, and regional office records.'
                    : (baseOffice?.location || 'Waiting for office data')}
                </div>
              </div>
            </div>
          </aside>

          <div className="grid min-h-0 gap-5">
            {activePanel === 'dashboard' ? (
              <motion.section
                animate={{ opacity: 1, y: 0 }}
                className="rounded-[2rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur sm:p-6 xl:flex xl:h-full xl:min-h-0 xl:flex-col"
                initial={{ opacity: 0, y: 18 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-dark">Dashboard</div>
                    <h2 className="mt-2 font-display text-3xl text-ink sm:text-4xl">Regional super admin overview</h2>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
                      This layout replaces the old stacked admin page with a clearer workspace. Use the sidebar to move between sections without scrolling through the entire admin tool.
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard label="Region offices" value={String(scopedOfficeCount).padStart(2, '0')} />
                  <MetricCard label="Employees" value={employeeMetricValue} />
                  <MetricCard label="Today logs" value={attendanceLoaded ? String(todaysLogs).padStart(2, '0') : '--'} />
                  <MetricCard label="Admins" value={roleScope === 'regional' ? (adminsLoaded ? String(admins.length).padStart(2, '0') : '--') : '--'} />
                </div>

                <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_360px] xl:min-h-0 xl:flex-1">
                  <section className="overflow-hidden rounded-[1.5rem] border border-black/5 bg-stone-50 xl:flex xl:min-h-0 xl:flex-col">
                    <div className="border-b border-black/5 px-5 py-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">Office snapshot</div>
                      <h3 className="mt-2 text-xl font-semibold text-ink">Region XII offices</h3>
                    </div>
                    <div className="overflow-x-auto xl:min-h-0 xl:flex-1 xl:overflow-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-white/90 text-xs uppercase tracking-[0.16em] text-muted">
                          <tr>
                            <th className="px-5 py-4">Code</th>
                            <th className="px-5 py-4">Office</th>
                            <th className="px-5 py-4">Province / City</th>
                            <th className="px-5 py-4">Type</th>
                            <th className="px-5 py-4">Employees</th>
                            <th className="px-5 py-4">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                          {visibleOffices.map(office => (
                            <tr
                              key={office.id}
                              className="cursor-pointer bg-transparent transition hover:bg-white"
                              onClick={() => {
                                setSelectedOfficeId(office.id)
                                setActivePanel('office')
                              }}
                            >
                              <td className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-dark">{office.code || office.shortName}</td>
                              <td className="px-5 py-4 font-semibold text-ink">{office.name}</td>
                              <td className="px-5 py-4 text-muted">{office.provinceOrCity || office.location}</td>
                              <td className="px-5 py-4 text-muted">{office.officeType}</td>
                              <td className="px-5 py-4 text-muted">{office.employees ?? persons.filter(person => person.officeId === office.id).length}</td>
                              <td className="px-5 py-4">
                                <button
                                  className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-stone-100"
                                  onClick={event => {
                                    event.stopPropagation()
                                    setSelectedOfficeId(office.id)
                                    setActivePanel('office')
                                  }}
                                  type="button"
                                >
                                  Edit
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <div className="grid gap-5 xl:min-h-0 xl:grid-rows-[minmax(0,1fr)_auto]">
                    <section className="rounded-[1.5rem] border border-black/5 bg-stone-50 p-5 xl:min-h-0 xl:overflow-auto">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">Live summary</div>
                      <h3 className="mt-2 text-xl font-semibold text-ink">{baseOffice?.name || 'Office record'}</h3>
                      <div className="mt-4 grid gap-3">
                        <InfoRow label="Schedule" value={baseOffice?.workPolicy.schedule || '--'} />
                        <InfoRow label="Work days" value={formatDays(baseOffice?.workPolicy.workingDays)} />
                        <InfoRow label="WFH days" value={formatDays(baseOffice?.workPolicy.wfhDays)} />
                        <InfoRow
                          label="Duty hours"
                          value={baseOffice ? `${formatTime(baseOffice.workPolicy.morningIn)} to ${formatTime(baseOffice.workPolicy.afternoonOut)}` : '--'}
                        />
                        <InfoRow label="Geofence" value={baseOffice ? `${baseOffice.gps.radiusMeters} m radius` : '--'} />
                      </div>
                    </section>

                    {roleScope === 'regional' ? (
                      <section className="rounded-[1.5rem] border border-black/5 bg-white p-5">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">System maintenance</div>
                        <h3 className="mt-2 text-xl font-semibold text-ink">Firestore indexes</h3>
                        <p className="mt-2 text-sm leading-7 text-muted">
                          This stays in the admin workspace on purpose. Public pages should not be able to mutate Firestore infrastructure.
                        </p>
                        <div className="mt-4 rounded-[1.25rem] border border-black/5 bg-stone-50 px-4 py-3 text-sm leading-7 text-muted">
                          {formatFirestoreIndexSummary(firestoreIndexSummary)}
                        </div>
                        <div className="mt-4">
                          <ActionButton
                            busy={isPending('firestore-index-sync')}
                            busyLabel="Submitting..."
                            className="bg-brand text-white hover:bg-brand-dark"
                            label="Apply required indexes"
                            onClick={handleApplyFirestoreIndexes}
                          />
                        </div>
                      </section>
                    ) : null}
                  </div>
                </div>
              </motion.section>
            ) : null}

            {activePanel === 'office' ? (
              <motion.section
                animate={{ opacity: 1, y: 0 }}
                className="grid gap-5 xl:h-full xl:min-h-0"
                initial={{ opacity: 0, y: 18 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              >
                <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white/80 shadow-glow backdrop-blur xl:flex xl:min-h-0 xl:flex-col">
                  <div className="flex flex-col gap-3 border-b border-black/5 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-dark">Office</div>
                      <h2 className="mt-2 font-display text-3xl text-ink">Office list</h2>
                      <p className="mt-2 text-sm leading-7 text-muted">
                        Regional admins can switch across the regional, provincial, and HUC offices and update each office record from the same workspace.
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto xl:min-h-0 xl:flex-1 xl:overflow-auto">
                    <table className="min-w-[980px] text-left text-sm">
                      <thead className="bg-stone-50 text-xs uppercase tracking-[0.16em] text-muted">
                        <tr>
                          <th className="px-5 py-4">Code</th>
                          <th className="px-5 py-4">Office</th>
                          <th className="px-5 py-4">Type</th>
                          <th className="px-5 py-4">Province / City</th>
                          <th className="px-5 py-4">Employees</th>
                          <th className="px-5 py-4">Status</th>
                          <th className="px-5 py-4">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5">
                        {visibleOffices.map(office => {
                          const selected = office.id === selectedOfficeId
                          return (
                            <tr
                              key={office.id}
                              className={`cursor-pointer transition ${selected ? 'bg-brand/8' : 'bg-white hover:bg-stone-50'}`}
                              onClick={() => setSelectedOfficeId(office.id)}
                            >
                              <td className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-dark">
                                {office.code || office.shortName || office.id}
                              </td>
                              <td className="px-5 py-4">
                                <div className="font-semibold text-ink">{office.name}</div>
                                <div className="text-xs text-muted">{office.location}</div>
                              </td>
                              <td className="px-5 py-4 text-muted">{office.officeType}</td>
                              <td className="px-5 py-4 text-muted">{office.provinceOrCity || office.location}</td>
                              <td className="px-5 py-4 text-muted">{office.employees ?? persons.filter(person => person.officeId === office.id).length}</td>
                              <td className="px-5 py-4">
                                <span className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${
                                  (office.status || 'active') === 'active'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-stone-200 text-stone-700'
                                }`}>
                                  {(office.status || 'active') === 'active' ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td className="px-5 py-4">
                                <button
                                  className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-stone-100"
                                  onClick={event => {
                                    event.stopPropagation()
                                    setSelectedOfficeId(office.id)
                                  }}
                                  type="button"
                                >
                                  Edit
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="rounded-[2rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur sm:p-6 xl:min-h-0 xl:overflow-auto">
                  <AdminOfficePanel
                    activeOffice={activeOffice}
                    handleSaveOffice={handleSaveOffice}
                    handleUseMyLocation={handleUseMyLocation}
                    highlightLocationPin={highlightLocationPin}
                    locationLoading={locationLoading}
                    locationNotice={locationNotice}
                    officeDraftWarning={officeDraftWarning}
                    savePending={isPending('office-save')}
                    toggleDay={toggleDay}
                    updateDraft={updateDraft}
                  />
                </section>
              </motion.section>
            ) : null}

            {activePanel === 'employees' ? (
              <motion.section
                animate={{ opacity: 1, y: 0 }}
                className="rounded-[2rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur sm:p-6 xl:flex xl:h-full xl:min-h-0 xl:flex-col"
                initial={{ opacity: 0, y: 18 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-dark">Employees</div>
                    <h2 className="mt-2 font-display text-3xl text-ink">Employee directory</h2>
                    <p className="mt-2 text-sm leading-7 text-muted">
                      Review public enrollment submissions, approve or reject intake records, and maintain employee assignments from one table.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Field label="Search">
                      <input
                        className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                        onChange={event => {
                          const value = event.target.value
                          startTransition(() => setEmployeeQuery(value))
                        }}
                        placeholder="Name or employee ID"
                        value={employeeQuery}
                      />
                    </Field>
                    <Field label="Office">
                      <select
                        className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                        onChange={event => setEmployeeOfficeFilter(event.target.value)}
                        value={employeeOfficeFilter}
                      >
                        <option value="all">All offices</option>
                        {visibleOffices.map(office => (
                          <option key={`employee-office-filter-${office.id}`} value={office.id}>{office.name}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Status">
                      <select
                        className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                        onChange={event => setEmployeeStatusFilter(event.target.value)}
                        value={employeeStatusFilter}
                      >
                        <option value="all">All status</option>
                        <option value="active">Active only</option>
                        <option value="inactive">Inactive only</option>
                      </select>
                    </Field>
                    <Field label="Approval">
                      <select
                        className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                        onChange={event => setEmployeeApprovalFilter(event.target.value)}
                        value={employeeApprovalFilter}
                      >
                        <option value="all">All approvals</option>
                        <option value={PERSON_APPROVAL_PENDING}>Pending review</option>
                        <option value={PERSON_APPROVAL_APPROVED}>Approved</option>
                        <option value={PERSON_APPROVAL_REJECTED}>Rejected</option>
                      </select>
                    </Field>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-4">
                  <MetricCard label="Results" value={personsLoaded ? String(employeeDirectoryTotal).padStart(2, '0') : '--'} subtle />
                  <MetricCard label="Approved" value={personsLoaded ? String(employeeDirectoryApprovedCount).padStart(2, '0') : '--'} subtle />
                  <MetricCard label="Pending" value={personsLoaded ? String(employeeDirectoryPendingCount).padStart(2, '0') : '--'} subtle />
                  <MetricCard label="Rejected" value={personsLoaded ? String(employeeDirectoryRejectedCount).padStart(2, '0') : '--'} subtle />
                </div>

                <div className="mt-4 flex flex-col gap-3 rounded-[1.5rem] border border-black/5 bg-stone-50 px-4 py-3 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    {personsLoaded
                      ? `Showing ${persons.length} employee records from a server-filtered directory query.`
                      : 'Preparing employee directory query.'}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <ActionButton
                      className="border border-black/10 bg-white text-ink hover:bg-stone-100"
                      label="Refresh"
                      onClick={() => {
                        setStatus('Refreshing employee directory...')
                        refreshEmployeeDirectory()
                      }}
                    />
                    <ActionButton
                      className="border border-black/10 bg-white text-ink hover:bg-stone-100"
                      disabled={employeeDirectoryHistory.length === 0 || !personsLoaded}
                      label="Previous"
                      onClick={handlePreviousEmployeePage}
                    />
                    <ActionButton
                      className="border border-black/10 bg-white text-ink hover:bg-stone-100"
                      disabled={!employeeDirectoryHasMore || !personsLoaded}
                      label="Next"
                      onClick={handleNextEmployeePage}
                    />
                  </div>
                </div>

                <div className="mt-6 overflow-x-auto xl:min-h-0 xl:flex-1 xl:overflow-auto">
                  {!personsLoaded ? (
                    <LoadingPanel
                      body="Fetching paginated employee records for the current workspace."
                      title="Loading employees"
                    />
                  ) : (
                    <table className="min-w-[1180px] text-left text-sm">
                      <thead className="bg-stone-50 text-xs uppercase tracking-[0.16em] text-muted">
                        <tr>
                          <th className="px-5 py-4">Employee</th>
                          <th className="px-5 py-4">Office</th>
                          <th className="px-5 py-4">Samples</th>
                          <th className="px-5 py-4">Approval</th>
                          <th className="px-5 py-4">Status</th>
                          <th className="px-5 py-4">Transfer</th>
                          <th className="px-5 py-4">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5">
                        {persons.length === 0 ? (
                          <tr>
                            <td className="px-5 py-10 text-center text-sm text-muted" colSpan={7}>
                              No employees match the current filters.
                            </td>
                          </tr>
                        ) : (
                          persons.map(person => (
                            <tr key={person.id} className="bg-white">
                              <td className="px-5 py-4">
                                <div className="font-semibold text-ink">{person.name}</div>
                                <div className="text-xs uppercase tracking-[0.12em] text-muted">{person.employeeId}</div>
                              </td>
                              <td className="px-5 py-4 text-muted">{person.officeName}</td>
                              <td className="px-5 py-4 text-muted">{person.sampleCount ?? 0}</td>
                              <td className="px-5 py-4">
                                <div className="grid gap-2">
                                  <span className={`inline-flex w-fit rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${getApprovalBadgeClass(person.approvalStatus)}`}>
                                    {formatApprovalLabel(person.approvalStatus)}
                                  </span>
                                  <select
                                    className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                                    disabled={Boolean(pendingAction)}
                                    onChange={event => {
                                      const nextApprovalStatus = event.target.value
                                      if (nextApprovalStatus === getEffectivePersonApprovalStatus(person)) return
                                      handleEmployeeUpdate(
                                        person,
                                        { approvalStatus: nextApprovalStatus },
                                        `${person.name} marked ${nextApprovalStatus}`,
                                      )
                                    }}
                                    value={getEffectivePersonApprovalStatus(person)}
                                  >
                                    <option value={PERSON_APPROVAL_PENDING}>Pending review</option>
                                    <option value={PERSON_APPROVAL_APPROVED}>Approved</option>
                                    <option value={PERSON_APPROVAL_REJECTED}>Rejected</option>
                                  </select>
                                </div>
                              </td>
                              <td className="px-5 py-4">
                                <span className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${person.active === false ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'}`}>
                                  {person.active === false ? 'Inactive' : 'Active'}
                                </span>
                              </td>
                              <td className="px-5 py-4">
                                <select
                                  className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                                  disabled={Boolean(pendingAction)}
                                  onChange={event => {
                                    const office = offices.find(item => item.id === event.target.value)
                                    if (!office || office.id === person.officeId) return
                                    handleEmployeeUpdate(
                                      person,
                                      {
                                        officeId: office.id,
                                        officeName: office.name,
                                      },
                                      `${person.name} transferred to ${office.name}`,
                                    )
                                  }}
                                  value={person.officeId}
                                >
                                  {visibleOffices.map(office => (
                                    <option key={`employee-office-${person.id}-${office.id}`} value={office.id}>{office.name}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-5 py-4">
                                <div className="flex flex-wrap gap-2">
                                  <ActionButton
                                    busy={isPending(`employee-update-${person.id}`)}
                                    busyLabel="Updating..."
                                    className="border border-black/10 bg-white text-ink hover:bg-stone-100"
                                    label={person.approvalStatus === PERSON_APPROVAL_PENDING ? 'Review' : 'Edit'}
                                    onClick={() => openEmployeeEditor(person)}
                                  />
                                  <ActionButton
                                    busy={isPending(`employee-update-${person.id}`)}
                                    busyLabel={person.active === false ? 'Reactivating...' : 'Updating...'}
                                    className={person.active === false ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'}
                                    label={person.active === false ? 'Reactivate' : 'Set inactive'}
                                    onClick={() => {
                                      handleEmployeeUpdate(
                                        person,
                                        { active: person.active === false },
                                        person.active === false ? `${person.name} reactivated` : `${person.name} set to inactive`,
                                      )
                                    }}
                                  />
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              </motion.section>
            ) : null}

            {activePanel === 'summary' ? (
              <motion.section
                animate={{ opacity: 1, y: 0 }}
                className="rounded-[2rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur sm:p-6 xl:flex xl:h-full xl:min-h-0 xl:flex-col"
                initial={{ opacity: 0, y: 18 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-dark">Summary</div>
                    <h2 className="mt-2 font-display text-3xl text-ink">Daily attendance report</h2>
                  </div>
                  <div className="grid w-full gap-3 sm:max-w-4xl sm:grid-cols-4">
                    <Field label="Summary date">
                      <input
                        className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                        onChange={event => setSummaryDate(event.target.value)}
                        type="date"
                        value={summaryDate}
                      />
                    </Field>
                    <Field label="Office filter">
                      <select
                        className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                        onChange={event => setSummaryOfficeFilter(event.target.value)}
                        value={summaryOfficeFilter}
                      >
                        <option value="all">All offices</option>
                        {visibleOffices.map(office => (
                          <option key={`summary-office-${office.id}`} value={office.id}>{office.name}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Employee filter">
                      <select
                        className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                        disabled={summaryLoading}
                        onChange={event => setSummaryEmployeeFilter(event.target.value)}
                        value={summaryEmployeeFilter}
                      >
                        <option value="all">All employees</option>
                        {summaryEmployeeOptions.map(person => (
                          <option key={`summary-person-${person.employeeId}`} value={person.employeeId}>
                            {person.name} ({person.employeeId})
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="flex items-end">
                      <ActionButton
                        busy={isPending('summary-export')}
                        busyLabel="Exporting..."
                        className="w-full bg-brand text-white hover:bg-brand-dark"
                        label="Export CSV"
                        onClick={handleExportSummary}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:min-h-0 xl:flex-1">
                  <div className="overflow-x-auto xl:min-h-0 xl:overflow-auto">
                    {!firebaseEnabled ? (
                      <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        Attendance summary requires Firebase-backed server records. Client-derived summary fallback has been disabled.
                      </div>
                    ) : null}

                    {summaryLoading ? (
                      <LoadingPanel
                        body="Loading daily attendance records and summary metrics."
                        title="Loading summary"
                      />
                    ) : (
                      <table className="min-w-[980px] text-left text-sm">
                        <thead className="bg-stone-50 text-xs uppercase tracking-[0.16em] text-muted">
                          <tr>
                            <th className="px-5 py-4">Employee</th>
                            <th className="px-5 py-4">Office</th>
                            <th className="px-5 py-4">AM In</th>
                            <th className="px-5 py-4">AM Out</th>
                            <th className="px-5 py-4">PM In</th>
                            <th className="px-5 py-4">PM Out</th>
                            <th className="px-5 py-4">Late</th>
                            <th className="px-5 py-4">Undertime</th>
                            <th className="px-5 py-4">Working Hours</th>
                            <th className="px-5 py-4">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                          {summaryRows.length === 0 ? (
                            <tr>
                              <td className="px-5 py-10 text-center text-sm text-muted" colSpan={10}>
                                {firebaseEnabled
                                  ? 'No attendance summary rows for the selected date yet.'
                                  : 'Attendance summary is unavailable without Firebase.'}
                              </td>
                            </tr>
                          ) : (
                            summaryRows.map(row => (
                              <tr key={`${row.employeeId}-${row.name}`} className="bg-white">
                                <td className="px-5 py-4">
                                  <div className="font-semibold text-ink">{row.name}</div>
                                  <div className="text-xs uppercase tracking-[0.12em] text-muted">{row.employeeId}</div>
                                </td>
                                <td className="px-5 py-4 text-muted">{row.officeName}</td>
                                <td className="px-5 py-4">{row.amIn}</td>
                                <td className="px-5 py-4">{row.amOut}</td>
                                <td className="px-5 py-4">{row.pmIn}</td>
                                <td className="px-5 py-4">{row.pmOut}</td>
                                <td className="px-5 py-4">{row.lateMinutes} min</td>
                                <td className="px-5 py-4">{row.undertimeMinutes} min</td>
                                <td className="px-5 py-4">{row.workingHours}</td>
                                <td className="px-5 py-4">
                                  <span className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${row.status === 'Complete' ? 'bg-emerald-100 text-emerald-800' : row.status === 'Late' ? 'bg-amber-100 text-amber-800' : row.status === 'Undertime' ? 'bg-red-100 text-red-700' : 'bg-stone-200 text-stone-700'}`}>
                                    {row.status}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <aside className="rounded-[1.5rem] border border-black/5 bg-stone-50 p-5 xl:min-h-0 xl:overflow-auto">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">Decision codes</div>
                    <h3 className="mt-2 text-xl font-semibold text-ink">Recent failure pattern</h3>

                    <div className="mt-4 grid gap-3">
                      {decisionStats.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-black/10 bg-white px-4 py-8 text-center text-sm text-muted">
                          No recent decision codes available yet.
                        </div>
                      ) : (
                        decisionStats.map(item => (
                          <div key={item.code} className="flex items-center justify-between gap-3 rounded-2xl border border-black/5 bg-white px-4 py-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-ink">{formatDecisionLabel(item.code)}</div>
                              <div className="text-xs uppercase tracking-[0.12em] text-muted">{item.code}</div>
                            </div>
                            <span className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${
                              item.tone === 'ok'
                                ? 'bg-emerald-100 text-emerald-800'
                                : item.tone === 'warn'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-red-100 text-red-700'
                            }`}>
                              {item.count}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </aside>
                </div>
              </motion.section>
            ) : null}

            {activePanel === 'admins' ? (
              <motion.section
                animate={{ opacity: 1, y: 0 }}
                className="rounded-[2rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur sm:p-6 xl:flex xl:h-full xl:min-h-0 xl:flex-col"
                initial={{ opacity: 0, y: 18 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              >
                {roleScope !== 'regional' ? (
                  <div className="rounded-2xl border border-dashed border-black/10 bg-stone-50 px-4 py-8 text-center text-sm text-muted">
                    Only regional admins can manage other admin accounts.
                  </div>
                ) : (
                  <>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-dark">Admins</div>
                      <h2 className="mt-2 font-display text-3xl text-ink">Regional and office admins</h2>
                    </div>

                    <div className="mt-6 grid gap-4 rounded-[1.5rem] border border-black/5 bg-stone-50 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px_220px]">
                      <input
                        className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                        onChange={event => setAdminEmail(event.target.value)}
                        placeholder="Admin email"
                        type="email"
                        value={adminEmail}
                      />
                      <input
                        className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                        onChange={event => setAdminDisplayName(event.target.value)}
                        placeholder="Display name"
                        type="text"
                        value={adminDisplayName}
                      />
                      <select
                        className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                        onChange={event => setAdminScope(event.target.value)}
                        value={adminScope}
                      >
                        <option value="office">Office admin</option>
                        <option value="regional">Regional admin</option>
                      </select>
                      <select
                        className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                        disabled={adminScope !== 'office'}
                        onChange={event => setAdminOfficeId(event.target.value)}
                        value={adminOfficeId}
                      >
                        <option value="">Select office</option>
                        {offices.map(office => (
                          <option key={`admin-office-create-${office.id}`} value={office.id}>{office.name}</option>
                        ))}
                      </select>
                      <div className="lg:col-span-4">
                        <ActionButton
                          busy={isPending('admin-create')}
                          busyLabel="Creating..."
                          className="bg-brand text-white hover:bg-brand-dark"
                          label="Add admin"
                          onClick={handleCreateAdmin}
                        />
                      </div>
                    </div>

                    <div className="mt-6 overflow-x-auto xl:min-h-0 xl:flex-1 xl:overflow-auto">
                      {!adminsLoaded ? (
                        <LoadingPanel
                          body="Loading current admin accounts and scopes."
                          title="Loading admins"
                        />
                      ) : (
                        <table className="min-w-[1080px] text-left text-sm">
                        <thead className="bg-stone-50 text-xs uppercase tracking-[0.16em] text-muted">
                          <tr>
                            <th className="px-5 py-4">Admin</th>
                            <th className="px-5 py-4">Scope</th>
                            <th className="px-5 py-4">Office</th>
                            <th className="px-5 py-4">Status</th>
                            <th className="px-5 py-4">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                          {admins.length === 0 ? (
                            <tr>
                              <td className="px-5 py-10 text-center text-sm text-muted" colSpan={5}>
                                No admin records yet.
                              </td>
                            </tr>
                          ) : (
                            admins.map(admin => (
                              <tr key={admin.id} className="bg-white">
                                <td className="px-5 py-4">
                                  <div className="font-semibold text-ink">{admin.displayName || admin.email}</div>
                                  <div className="text-sm text-muted">{admin.email}</div>
                                </td>
                                <td className="px-5 py-4">
                                  <select
                                    className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                                    onChange={event => {
                                      const nextScope = event.target.value
                                      handleUpdateAdmin(admin, {
                                        scope: nextScope,
                                        officeId: nextScope === 'office' ? (admin.officeId || offices[0]?.id || '') : '',
                                      })
                                    }}
                                    value={admin.scope}
                                  >
                                    <option value="office">Office admin</option>
                                    <option value="regional">Regional admin</option>
                                  </select>
                                </td>
                                <td className="px-5 py-4">
                                  <select
                                    className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                                    disabled={admin.scope !== 'office'}
                                    onChange={event => handleUpdateAdmin(admin, { officeId: event.target.value })}
                                    value={admin.scope === 'office' ? admin.officeId : ''}
                                  >
                                    <option value="">Select office</option>
                                    {offices.map(office => (
                                      <option key={`admin-office-${admin.id}-${office.id}`} value={office.id}>{office.name}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-5 py-4">
                                  <span className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${admin.active ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-700'}`}>
                                    {admin.active ? 'Active' : 'Disabled'}
                                  </span>
                                </td>
                                <td className="px-5 py-4">
                                  <div className="flex flex-wrap gap-2">
                                    <ActionButton
                                      busy={isPending(`admin-update-${admin.id}`)}
                                      busyLabel="Updating..."
                                      className={`${
                                        admin.active
                                          ? 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                                          : 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                      }`}
                                      label={admin.active ? 'Disable' : 'Enable'}
                                      onClick={() => handleUpdateAdmin(admin, { active: !admin.active })}
                                    />
                                    <ActionButton
                                      busy={isPending(`admin-delete-${admin.id}`)}
                                      busyLabel="Deleting..."
                                      className="border border-black/10 bg-white text-ink hover:bg-stone-100"
                                      label="Delete"
                                      onClick={() => handleDeleteAdmin(admin)}
                                    />
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        </table>
                      )}
                    </div>
                  </>
                )}
              </motion.section>
            ) : null}

            {employeeEditor ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
                <div className="w-full max-w-2xl rounded-[2rem] border border-black/5 bg-white p-5 shadow-2xl sm:p-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">Employee editor</div>
                      <h3 className="mt-2 font-display text-3xl text-ink">{employeeEditor.name}</h3>
                      <p className="mt-2 text-sm leading-7 text-muted">
                        Employee ID is intentionally read-only. Changing identifiers after attendance history exists is a bad data model unless you also migrate historical records.
                      </p>
                    </div>
                    <ActionButton
                      className="border border-black/10 bg-white text-ink hover:bg-stone-50"
                      label="Close"
                      onClick={() => setEmployeeEditor(null)}
                    />
                  </div>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <Field label="Full name">
                      <input
                        className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                        onChange={event => setEmployeeEditor(current => (
                          current
                            ? { ...current, name: event.target.value.toUpperCase() }
                            : current
                        ))}
                        value={employeeEditor.name}
                      />
                    </Field>
                    <Field label="Employee ID">
                      <input
                        className="w-full rounded-2xl border border-black/10 bg-stone-100 px-4 py-3 text-sm text-muted outline-none"
                        readOnly
                        value={employeeEditor.employeeId}
                      />
                    </Field>
                    <Field label="Assigned office">
                      <select
                        className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                        onChange={event => setEmployeeEditor(current => (
                          current
                            ? { ...current, officeId: event.target.value }
                            : current
                        ))}
                        value={employeeEditor.officeId}
                      >
                        {visibleOffices.map(office => (
                          <option key={`employee-editor-office-${office.id}`} value={office.id}>{office.name}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Status">
                      <select
                        className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                        onChange={event => setEmployeeEditor(current => (
                          current
                            ? { ...current, active: event.target.value === 'active' }
                            : current
                        ))}
                        value={employeeEditor.active ? 'active' : 'inactive'}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </Field>
                    <Field label="Approval status">
                      <select
                        className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                        onChange={event => setEmployeeEditor(current => (
                          current
                            ? { ...current, approvalStatus: event.target.value }
                            : current
                        ))}
                        value={employeeEditor.approvalStatus}
                      >
                        <option value={PERSON_APPROVAL_PENDING}>Pending review</option>
                        <option value={PERSON_APPROVAL_APPROVED}>Approved</option>
                        <option value={PERSON_APPROVAL_REJECTED}>Rejected</option>
                      </select>
                    </Field>
                  </div>

                  <div className="mt-6 grid gap-3 rounded-[1.5rem] border border-black/5 bg-stone-50 p-4 sm:grid-cols-4">
                    <InfoRow label="Samples" value={String(employeeEditor.sampleCount ?? 0)} />
                    <InfoRow label="Current office" value={employeeEditorSource?.officeName || employeeEditor.officeName} />
                    <InfoRow label="Current state" value={employeeEditorSource?.active === false ? 'Inactive' : 'Active'} />
                    <InfoRow label="Approval" value={formatApprovalLabel(getEffectivePersonApprovalStatus(employeeEditorSource || employeeEditor))} />
                  </div>

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-between">
                    <ActionButton
                      busy={isPending(`employee-delete-${employeeEditor.id}`)}
                      busyLabel="Deleting..."
                      className="border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                      label="Delete employee"
                      onClick={() => employeeEditorSource && handleEmployeeDelete(employeeEditorSource)}
                    />
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <ActionButton
                        className="border border-black/10 bg-white text-ink hover:bg-stone-50"
                        label="Cancel"
                        onClick={() => setEmployeeEditor(null)}
                      />
                      <ActionButton
                        busy={isPending(`employee-update-${employeeEditor.id}`)}
                        busyLabel="Saving..."
                        className="bg-brand text-white hover:bg-brand-dark"
                        label="Save changes"
                        onClick={handleSaveEmployeeEditor}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </AppShell>
  )
}

function MetricCard({ label, value, subtle = false }) {
  return (
    <div className={`rounded-[1.5rem] border p-5 ${subtle ? 'border-black/5 bg-stone-50' : 'border-black/5 bg-stone-50/90'}`}>
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-ink">{value}</div>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="rounded-[1.25rem] border border-black/5 bg-white px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{label}</div>
      <div className="mt-1 text-sm font-medium text-ink">{value}</div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</span>
      {children}
    </label>
  )
}

function ActionButton({
  label,
  onClick,
  className = '',
  busy = false,
  busyLabel = 'Working...',
  disabled = false,
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      disabled={busy || disabled}
      onClick={onClick}
      type="button"
    >
      {busy ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span>{busyLabel}</span>
        </>
      ) : (
        <span>{label}</span>
      )}
    </button>
  )
}

function LoadingPanel({ title, body }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center rounded-[1.5rem] border border-dashed border-black/10 bg-stone-50 p-6 text-center">
      <div className="max-w-md">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand-dark">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        </div>
        <div className="mt-4 text-lg font-semibold text-ink">{title}</div>
        <div className="mt-2 text-sm leading-7 text-muted">{body}</div>
      </div>
    </div>
  )
}

'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { buildAttendanceSummary } from '../lib/attendance-summary'
import { subscribeToAttendance, subscribeToPersons, updatePersonRecord } from '../lib/data-store'
import { firebaseEnabled } from '../lib/firebase'
import { saveOfficeConfig, subscribeToOfficeConfigs } from '../lib/office-admin-store'
import AppShell from './AppShell'
import BrandMark from './BrandMark'

const OfficeLocationPicker = dynamic(() => import('./OfficeLocationPicker'), {
  ssr: false,
})

const dayOptions = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
]

const panelTabs = [
  { id: 'office', label: 'Office Setup' },
  { id: 'employees', label: 'Employees' },
  { id: 'summary', label: 'Summary' },
  { id: 'admins', label: 'Admins' },
]

function getOfficeSetupItems(office) {
  if (!office) return []

  return [
    {
      label: 'GPS pin',
      ok: Number.isFinite(office.gps?.latitude) && Number.isFinite(office.gps?.longitude),
    },
    {
      label: 'Radius',
      ok: Number.isFinite(office.gps?.radiusMeters) && office.gps.radiusMeters > 0,
    },
    {
      label: 'Schedule',
      ok: Boolean(office.workPolicy?.schedule && office.workPolicy?.morningIn && office.workPolicy?.afternoonOut),
    },
    {
      label: 'Working days',
      ok: Array.isArray(office.workPolicy?.workingDays) && office.workPolicy.workingDays.length > 0,
    },
    {
      label: 'WFH rule',
      ok: Array.isArray(office.workPolicy?.wfhDays),
    },
  ]
}

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

export default function AdminDashboard({ initialRoleScope = 'regional', initialOfficeId = '' }) {
  const todayIso = new Date().toISOString().slice(0, 10)
  const [roleScope, setRoleScope] = useState(initialRoleScope)
  const [selectedOfficeId, setSelectedOfficeId] = useState(initialOfficeId)
  const [offices, setOffices] = useState([])
  const [persons, setPersons] = useState([])
  const [attendance, setAttendance] = useState([])
  const [dailySummaryRecords, setDailySummaryRecords] = useState([])
  const [draftOffice, setDraftOffice] = useState(null)
  const [status, setStatus] = useState(firebaseEnabled ? 'Connected to Firebase' : 'Using local storage fallback')
  const [summaryDate, setSummaryDate] = useState(new Date().toLocaleDateString('en-PH'))
  const [employeeQuery, setEmployeeQuery] = useState('')
  const [employeeOfficeFilter, setEmployeeOfficeFilter] = useState('all')
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState('all')
  const [summaryOfficeFilter, setSummaryOfficeFilter] = useState('all')
  const [summaryEmployeeFilter, setSummaryEmployeeFilter] = useState('all')
  const [activePanel, setActivePanel] = useState('office')
  const [admins, setAdmins] = useState([])
  const [adminEmail, setAdminEmail] = useState('')
  const [adminDisplayName, setAdminDisplayName] = useState('')
  const [adminScope, setAdminScope] = useState('office')
  const [adminOfficeId, setAdminOfficeId] = useState('')

  useEffect(() => {
    const unsubscribe = subscribeToOfficeConfigs(
      nextOffices => {
        setOffices(nextOffices)
        if (!selectedOfficeId && nextOffices[0]) {
          setSelectedOfficeId(initialOfficeId || nextOffices[0].id)
        }
      },
      error => {
        setStatus(error.message || 'Failed to load office configuration')
      },
    )

    return unsubscribe
  }, [initialOfficeId, selectedOfficeId])

  useEffect(() => {
    setRoleScope(initialRoleScope)
  }, [initialRoleScope])

  useEffect(() => {
    const unsubscribePersons = subscribeToPersons(setPersons, () => {})
    const unsubscribeAttendance = subscribeToAttendance(setAttendance, () => {})

    return () => {
      unsubscribePersons()
      unsubscribeAttendance()
    }
  }, [])

  useEffect(() => {
    if (roleScope !== 'regional') {
      setAdmins([])
      return
    }

    let active = true

    const load = async () => {
      try {
        const response = await fetch('/api/admins', { cache: 'no-store' })
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.message || 'Failed to load admin records')
        if (active) setAdmins(payload?.admins || [])
      } catch (error) {
        if (active) setStatus(error instanceof Error ? error.message : 'Failed to load admin records')
      }
    }

    load()
    return () => {
      active = false
    }
  }, [roleScope, status])

  const visibleOffices = useMemo(() => {
    if (roleScope === 'regional') return offices
    return offices.filter(office => office.id === selectedOfficeId)
  }, [offices, roleScope, selectedOfficeId])

  const activeOffice = useMemo(() => {
    if (draftOffice) return draftOffice
    return offices.find(office => office.id === selectedOfficeId) || null
  }, [draftOffice, offices, selectedOfficeId])

  const officeSetupItems = useMemo(() => getOfficeSetupItems(activeOffice), [activeOffice])
  const officeSetupScore = useMemo(
    () => officeSetupItems.filter(item => item.ok).length,
    [officeSetupItems],
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

  const acceptedCount = useMemo(
    () => visibleAttendance.filter(entry => String(entry.decisionCode || '').startsWith('accepted_')).length,
    [visibleAttendance],
  )

  const blockedCount = useMemo(
    () => visibleAttendance.filter(entry => String(entry.decisionCode || '').startsWith('blocked_')).length,
    [visibleAttendance],
  )

  useEffect(() => {
    if (!firebaseEnabled) {
      setDailySummaryRecords([])
      return
    }

    let active = true

    const load = async () => {
      try {
        const params = new URLSearchParams({ date: summaryDate })
        const response = await fetch(`/api/attendance/daily?${params.toString()}`, { cache: 'no-store' })
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.message || 'Failed to load daily attendance summary')
        if (active) setDailySummaryRecords(payload?.records || [])
      } catch (error) {
        if (active) setStatus(error instanceof Error ? error.message : 'Failed to load daily attendance summary')
      }
    }

    load()
    return () => {
      active = false
    }
  }, [summaryDate])

  const summaryRows = useMemo(() => {
    const baseRows = firebaseEnabled
      ? dailySummaryRecords
      : buildAttendanceSummary({
          attendance,
          persons,
          offices,
          targetDate: summaryDate,
        })

    return baseRows.filter(row => {
      if (roleScope !== 'regional' && row.officeName !== activeOffice?.name) return false
      if (summaryOfficeFilter !== 'all') {
        const office = offices.find(item => item.id === summaryOfficeFilter)
        if (row.officeName !== office?.name) return false
      }
      if (summaryEmployeeFilter !== 'all' && row.employeeId !== summaryEmployeeFilter) return false
      return true
    })
  }, [activeOffice?.name, attendance, dailySummaryRecords, firebaseEnabled, offices, persons, roleScope, summaryDate, summaryEmployeeFilter, summaryOfficeFilter])

  const filteredPersons = useMemo(() => {
    const query = employeeQuery.trim().toLowerCase()

    return persons
      .filter(person => {
        if (roleScope !== 'regional' && person.officeId !== selectedOfficeId) return false
        if (employeeOfficeFilter !== 'all' && person.officeId !== employeeOfficeFilter) return false
        if (employeeStatusFilter === 'active' && person.active === false) return false
        if (employeeStatusFilter === 'inactive' && person.active !== false) return false
        if (!query) return true

        return (
          person.name.toLowerCase().includes(query) ||
          person.employeeId.toLowerCase().includes(query) ||
          person.officeName.toLowerCase().includes(query)
        )
      })
      .sort((left, right) => left.name.localeCompare(right.name))
  }, [employeeOfficeFilter, employeeQuery, employeeStatusFilter, persons, roleScope, selectedOfficeId])

  useEffect(() => {
    const office = offices.find(item => item.id === selectedOfficeId) || null
    setDraftOffice(office ? structuredClone(office) : null)
  }, [offices, selectedOfficeId])

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

    setStatus('Getting current location...')

    navigator.geolocation.getCurrentPosition(
      position => {
        updateDraft('gps.latitude', Number(position.coords.latitude.toFixed(6)))
        updateDraft('gps.longitude', Number(position.coords.longitude.toFixed(6)))
        setStatus('Office location updated from current device location')
      },
      error => {
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

    setStatus('Saving office configuration...')

    try {
      const result = await saveOfficeConfig(draftOffice)
      setStatus(result.mode === 'firebase' ? 'Saved through protected server route' : 'Saved locally')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save office configuration')
    }
  }

  async function handleLogout() {
    await fetch('/api/admin/logout', { method: 'POST' })
    window.location.href = '/admin/login'
  }

  async function handleEmployeeUpdate(person, updates, successMessage) {
    setStatus(successMessage.includes('inactive') ? 'Updating employee status...' : 'Updating employee record...')

    try {
      const result = await updatePersonRecord(person, updates)
      if (result.mode === 'local') {
        setPersons(result.persons)
      }
      setStatus(successMessage)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to update employee')
    }
  }

  async function refreshAdmins() {
    if (roleScope !== 'regional') return
    const response = await fetch('/api/admins', { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(payload?.message || 'Failed to load admin records')
    setAdmins(payload?.admins || [])
  }

  async function handleCreateAdmin() {
    setStatus('Creating admin record...')

    try {
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

      setAdminEmail('')
      setAdminDisplayName('')
      setAdminScope('office')
      setAdminOfficeId('')
      await refreshAdmins()
      setStatus('Admin record created')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to create admin record')
    }
  }

  async function handleUpdateAdmin(admin, updates) {
    setStatus('Updating admin record...')

    try {
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

      await refreshAdmins()
      setStatus('Admin record updated')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to update admin record')
    }
  }

  async function handleDeleteAdmin(admin) {
    setStatus('Deleting admin record...')

    try {
      const response = await fetch(`/api/admins/${admin.id}`, { method: 'DELETE' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.message || 'Failed to delete admin record')
      await refreshAdmins()
      setStatus('Admin record deleted')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to delete admin record')
    }
  }

  function exportSummaryCsv() {
    if (summaryRows.length === 0) {
      setStatus('No summary rows to export')
      return
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
    link.download = `attendance-summary-${summaryDate.replaceAll('/', '-')}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setStatus('Attendance summary exported')
  }

  return (
    <AppShell
      actions={(
        <button
          className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-stone-50"
          onClick={handleLogout}
          type="button"
        >
          Logout
        </button>
      )}
      contentClassName="px-4 py-5 sm:px-6 lg:px-8"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:h-[calc(100vh-9.2rem)]">
        <section className="grid gap-4 rounded-[1.6rem] border border-black/5 bg-white/70 p-5 shadow-glow backdrop-blur xl:grid-cols-[1.2fr_.8fr]">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <BrandMark />
            <h1 className="mt-3 font-display text-3xl leading-tight text-ink sm:text-4xl">
              Admin workspace for offices, employees, and attendance reports.
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted sm:text-base">
              Compact by design. Office setup, employee control, and summary reporting are separated so admins can work
              without long vertical scrolling.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white/80 px-5 py-3 text-sm font-semibold text-ink transition hover:bg-white"
                href="/"
              >
                Back to navigation
              </Link>
              <Link
                className="inline-flex items-center justify-center rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark"
                href="/kiosk"
              >
                Open kiosk
              </Link>
            </div>
          </motion.div>

          <motion.aside
            animate={{ opacity: 1, x: 0 }}
            className="grid gap-3 rounded-[1.5rem] border border-black/5 bg-gradient-to-br from-brand/10 via-white/80 to-accent/10 p-5 sm:grid-cols-3 xl:grid-cols-1"
            initial={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.45, ease: 'easeOut', delay: 0.08 }}
          >
            <div className="rounded-2xl border border-black/5 bg-white/75 p-4">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">Storage</span>
              <p className="mt-2 text-lg font-semibold text-ink">{firebaseEnabled ? 'Firebase enabled' : 'Local fallback'}</p>
              <p className="mt-1 text-sm leading-7 text-muted">{status}</p>
            </div>

            <div className="rounded-2xl border border-black/5 bg-white/75 p-4">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">Office setup</span>
              <p className="mt-2 text-lg font-semibold text-ink">
                {activeOffice ? `${officeSetupScore}/${officeSetupItems.length} ready` : 'Select an office'}
              </p>
              {activeOffice ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {officeSetupItems.map(item => (
                    <span
                      key={item.label}
                      className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${
                        item.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {item.label}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-black/5 bg-white/75 p-4">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">Admin scope</span>
              <p className="mt-2 text-lg font-semibold text-ink">{getScopeLabel(roleScope)}</p>
              <p className="mt-1 text-sm leading-7 text-muted">
                {roleScope === 'office' ? 'Server-locked to one office.' : 'Can manage every office and admin record.'}
              </p>
            </div>

            <div className="rounded-2xl border border-black/5 bg-white/75 p-4">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">Attendance health</span>
              <p className="mt-2 text-lg font-semibold text-ink">{acceptedCount} accepted / {blockedCount} blocked</p>
              <p className="mt-1 text-sm leading-7 text-muted">Recent server decisions for the current admin scope.</p>
            </div>
          </motion.aside>
        </section>

        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <motion.aside
            animate={{ opacity: 1, y: 0 }}
            className="flex min-h-0 flex-col rounded-[1.5rem] border border-black/5 bg-white/80 p-4 shadow-glow backdrop-blur"
            initial={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            <header className="mb-5">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">Admin scope</span>
              <h2 className="mt-2 font-display text-2xl text-ink">Office access</h2>
            </header>

            <div className="space-y-4">
              <div className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-ink">
                {getScopeLabel(roleScope)}
              </div>

              <select
                className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                onChange={event => setSelectedOfficeId(event.target.value)}
                disabled={roleScope === 'office'}
                value={selectedOfficeId}
              >
                {offices.map(office => (
                  <option key={office.id} value={office.id}>{office.name}</option>
                ))}
              </select>

              <div className="grid gap-2">
                {panelTabs.map(panel => (
                  <button
                    key={`side-panel-${panel.id}`}
                    className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                      activePanel === panel.id
                        ? 'border-brand/30 bg-brand/10 text-brand-dark'
                        : 'border-black/5 bg-stone-50 text-ink hover:bg-white'
                    }`}
                    onClick={() => setActivePanel(panel.id)}
                    type="button"
                  >
                    {panel.label}
                  </button>
                ))}
              </div>

              <div className="grid min-h-0 gap-3 overflow-auto pr-1">
                {visibleOffices.map(office => (
                  <button
                    key={office.id}
                    className={`rounded-2xl border px-4 py-4 text-left transition ${office.id === selectedOfficeId ? 'border-brand/40 bg-brand/10' : 'border-black/5 bg-white hover:bg-stone-50'}`}
                    onClick={() => setSelectedOfficeId(office.id)}
                    type="button"
                  >
                    <strong className="block text-sm text-ink">{office.name}</strong>
                    <span className="mt-1 block text-xs uppercase tracking-[0.14em] text-brand-dark">{office.officeType}</span>
                    <span className="mt-2 block text-sm text-muted">{office.location}</span>
                  </button>
                ))}
              </div>
            </div>
          </motion.aside>

          <motion.section
            animate={{ opacity: 1, y: 0 }}
            className="min-h-0 rounded-[1.5rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur"
            initial={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.4, ease: 'easeOut', delay: 0.06 }}
          >
            <header className="mb-6 border-b border-black/5 pb-5">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">Workspace</span>
              <h2 className="mt-2 font-display text-3xl text-ink">{activeOffice?.name || 'Select an office'}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">
                Regional admins can manage all offices. Office admins stay limited by the server, not by interface theater.
              </p>
            </header>

            {activePanel === 'office' && activeOffice ? (
              <div className="grid max-h-[62vh] gap-5 overflow-auto pr-1 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Field label="Office map location">
                    <OfficeLocationPicker
                      latitude={activeOffice.gps.latitude}
                      longitude={activeOffice.gps.longitude}
                      onChange={({ latitude, longitude }) => {
                        updateDraft('gps.latitude', latitude)
                        updateDraft('gps.longitude', longitude)
                      }}
                      radiusMeters={activeOffice.gps.radiusMeters}
                    />
                  </Field>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                    <button
                      className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-stone-50"
                      onClick={handleUseMyLocation}
                      type="button"
                    >
                      Use my location
                    </button>
                    <div className="rounded-full bg-brand/8 px-4 py-3 text-sm text-brand-dark">
                      Click on the map to place the office pin and adjust the geofence.
                    </div>
                  </div>
                </div>

                <Field label="Office name">
                  <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" onChange={event => updateDraft('name', event.target.value)} value={activeOffice.name} />
                </Field>

                <Field label="Location label">
                  <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" onChange={event => updateDraft('location', event.target.value)} value={activeOffice.location} />
                </Field>

                <Field label="Latitude">
                  <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" onChange={event => updateDraft('gps.latitude', Number(event.target.value))} step="0.0001" type="number" value={activeOffice.gps.latitude} />
                </Field>

                <Field label="Longitude">
                  <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" onChange={event => updateDraft('gps.longitude', Number(event.target.value))} step="0.0001" type="number" value={activeOffice.gps.longitude} />
                </Field>

                <Field label="Radius meters">
                  <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" onChange={event => updateDraft('gps.radiusMeters', Number(event.target.value))} type="number" value={activeOffice.gps.radiusMeters} />
                </Field>

                <Field label="Schedule label">
                  <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" onChange={event => updateDraft('workPolicy.schedule', event.target.value)} value={activeOffice.workPolicy.schedule} />
                </Field>

                <Field label="AM in">
                  <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" onChange={event => updateDraft('workPolicy.morningIn', event.target.value)} type="time" value={activeOffice.workPolicy.morningIn} />
                </Field>

                <Field label="AM out">
                  <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" onChange={event => updateDraft('workPolicy.morningOut', event.target.value)} type="time" value={activeOffice.workPolicy.morningOut} />
                </Field>

                <Field label="PM in">
                  <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" onChange={event => updateDraft('workPolicy.afternoonIn', event.target.value)} type="time" value={activeOffice.workPolicy.afternoonIn} />
                </Field>

                <Field label="PM out">
                  <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" onChange={event => updateDraft('workPolicy.afternoonOut', event.target.value)} type="time" value={activeOffice.workPolicy.afternoonOut} />
                </Field>

                <Field label="Grace period (minutes)">
                  <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" onChange={event => updateDraft('workPolicy.gracePeriodMinutes', Number(event.target.value))} type="number" value={activeOffice.workPolicy.gracePeriodMinutes} />
                </Field>

                <div className="md:col-span-2">
                  <Field label="Working days">
                    <div className="flex flex-wrap gap-2">
                      {dayOptions.map(day => (
                        <button
                          key={`working-${day.value}`}
                          className={`rounded-full border px-4 py-2 text-sm transition ${activeOffice.workPolicy.workingDays.includes(day.value) ? 'border-brand/40 bg-brand/10 text-brand-dark' : 'border-black/10 bg-white text-muted'}`}
                          onClick={() => toggleDay('workingDays', day.value)}
                          type="button"
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                  </Field>
                </div>

                <div className="md:col-span-2">
                  <Field label="WFH days">
                    <div className="flex flex-wrap gap-2">
                      {dayOptions.map(day => (
                        <button
                          key={`wfh-${day.value}`}
                          className={`rounded-full border px-4 py-2 text-sm transition ${activeOffice.workPolicy.wfhDays.includes(day.value) ? 'border-accent/40 bg-accent/10 text-ink' : 'border-black/10 bg-white text-muted'}`}
                          onClick={() => toggleDay('wfhDays', day.value)}
                          type="button"
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                  </Field>
                </div>

                <div className="md:col-span-2">
                  <button className="inline-flex w-full items-center justify-center rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark" onClick={handleSaveOffice} type="button">
                    Save office settings
                  </button>
                </div>
              </div>
            ) : activePanel === 'office' ? (
              <div className="rounded-2xl border border-dashed border-black/10 bg-stone-50 px-4 py-10 text-center text-sm text-muted">
                No office selected.
              </div>
            ) : null}
          </motion.section>
        </div>

        <motion.section
          animate={{ opacity: 1, y: 0 }}
          className={`${activePanel === 'employees' ? 'block' : 'hidden'} rounded-[1.5rem] border border-black/5 bg-white/80 p-6 shadow-glow backdrop-blur`}
          initial={{ opacity: 0, y: 18 }}
          transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 }}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">Employees</span>
              <h2 className="mt-2 font-display text-3xl text-ink">Transfer and account control</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
                Registration captures the face. This screen controls office assignment and account status.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                onChange={event => setEmployeeQuery(event.target.value)}
                placeholder="Search name or ID"
                type="text"
                value={employeeQuery}
              />
              <select
                className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                onChange={event => setEmployeeOfficeFilter(event.target.value)}
                value={employeeOfficeFilter}
              >
                <option value="all">All offices</option>
                {visibleOffices.map(office => (
                  <option key={`employee-filter-${office.id}`} value={office.id}>{office.name}</option>
                ))}
              </select>
              <select
                className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                onChange={event => setEmployeeStatusFilter(event.target.value)}
                value={employeeStatusFilter}
              >
                <option value="all">All status</option>
                <option value="active">Active only</option>
                <option value="inactive">Inactive only</option>
              </select>
            </div>
          </div>

          <div className="mt-6 grid max-h-[62vh] gap-4 overflow-auto pr-1">
            {filteredPersons.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-black/10 bg-stone-50 px-4 py-8 text-center text-sm text-muted">
                No employees match the current filters.
              </div>
            ) : (
              filteredPersons.map(person => (
                <div key={person.id} className="grid gap-4 rounded-[1.5rem] border border-black/5 bg-stone-50 p-4 lg:grid-cols-[minmax(0,1fr)_220px_180px] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="truncate text-base font-semibold text-ink">{person.name}</h3>
                      <span className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${person.active === false ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'}`}>
                        {person.active === false ? 'Inactive' : 'Active'}
                      </span>
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-[0.12em] text-muted">{person.employeeId}</div>
                    <div className="mt-2 text-sm text-muted">
                      {person.officeName} • {person.sampleCount ?? 0} sample{(person.sampleCount ?? 0) !== 1 ? 's' : ''}
                    </div>
                  </div>

                  <select
                    className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
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

                  <button
                    className={`inline-flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition ${person.active === false ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'}`}
                    onClick={() => {
                      handleEmployeeUpdate(
                        person,
                        { active: person.active === false },
                        person.active === false ? `${person.name} reactivated` : `${person.name} set to inactive`,
                      )
                    }}
                    type="button"
                  >
                    {person.active === false ? 'Reactivate' : 'Set inactive'}
                  </button>
                </div>
              ))
            )}
          </div>
        </motion.section>

        <motion.section
          animate={{ opacity: 1, y: 0 }}
          className={`${activePanel === 'summary' ? 'block' : 'hidden'} rounded-[1.5rem] border border-black/5 bg-white/80 p-6 shadow-glow backdrop-blur`}
          initial={{ opacity: 0, y: 18 }}
          transition={{ duration: 0.4, ease: 'easeOut', delay: 0.12 }}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">Attendance summary</span>
              <h2 className="mt-2 font-display text-3xl text-ink">Daily AM/PM reporting</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
                Daily record output for the selected date, with AM/PM segments and totals already derived on the server.
              </p>
            </div>
            <div className="grid w-full gap-3 sm:max-w-4xl sm:grid-cols-4">
              <Field label="Summary date">
                <input
                  className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                  defaultValue={todayIso}
                  onChange={event => {
                    const value = event.target.value
                    setSummaryDate(new Date(`${value}T00:00:00`).toLocaleDateString('en-PH'))
                  }}
                  type="date"
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
                  onChange={event => setSummaryEmployeeFilter(event.target.value)}
                  value={summaryEmployeeFilter}
                >
                  <option value="all">All employees</option>
                  {filteredPersons.map(person => (
                    <option key={`summary-person-${person.id}`} value={person.employeeId}>
                      {person.name} ({person.employeeId})
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex items-end">
                <button
                  className="inline-flex w-full items-center justify-center rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark"
                  onClick={exportSummaryCsv}
                  type="button"
                >
                  Export CSV
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-h-0 overflow-auto">
              <table className="min-w-full border-separate border-spacing-y-3 text-left">
                <thead className="sticky top-0 bg-white/95 backdrop-blur">
                  <tr className="text-xs uppercase tracking-[0.16em] text-muted">
                    <th className="px-3 py-2">Employee</th>
                    <th className="px-3 py-2">Office</th>
                    <th className="px-3 py-2">AM In</th>
                    <th className="px-3 py-2">AM Out</th>
                    <th className="px-3 py-2">PM In</th>
                    <th className="px-3 py-2">PM Out</th>
                    <th className="px-3 py-2">Late</th>
                    <th className="px-3 py-2">Undertime</th>
                    <th className="px-3 py-2">Working Hours</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.length === 0 ? (
                    <tr>
                      <td className="rounded-2xl border border-dashed border-black/10 bg-stone-50 px-4 py-8 text-center text-sm text-muted" colSpan={10}>
                        No attendance summary rows for the selected date yet.
                      </td>
                    </tr>
                  ) : (
                    summaryRows.map(row => (
                      <tr key={`${row.employeeId}-${row.name}`} className="rounded-2xl bg-stone-50 text-sm text-ink">
                        <td className="rounded-l-2xl px-3 py-4">
                          <div className="font-semibold">{row.name}</div>
                          <div className="text-xs uppercase tracking-[0.12em] text-muted">{row.employeeId}</div>
                        </td>
                        <td className="px-3 py-4 text-muted">{row.officeName}</td>
                        <td className="px-3 py-4">{row.amIn}</td>
                        <td className="px-3 py-4">{row.amOut}</td>
                        <td className="px-3 py-4">{row.pmIn}</td>
                        <td className="px-3 py-4">{row.pmOut}</td>
                        <td className="px-3 py-4">{row.lateMinutes} min</td>
                        <td className="px-3 py-4">{row.undertimeMinutes} min</td>
                        <td className="px-3 py-4">{row.workingHours}</td>
                        <td className="rounded-r-2xl px-3 py-4">
                          <span className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${row.status === 'Complete' ? 'bg-emerald-100 text-emerald-800' : row.status === 'Late' ? 'bg-amber-100 text-amber-800' : row.status === 'Undertime' ? 'bg-red-100 text-red-700' : 'bg-stone-200 text-stone-700'}`}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <aside className="rounded-[1.5rem] border border-black/5 bg-stone-50 p-4">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">Decision codes</span>
              <h3 className="mt-2 font-display text-2xl text-ink">Recent failure pattern</h3>
              <p className="mt-2 text-sm leading-7 text-muted">
                This is the quickest way to see what the dry run is struggling with.
              </p>

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

        <motion.section
          animate={{ opacity: 1, y: 0 }}
          className={`${activePanel === 'admins' ? 'block' : 'hidden'} rounded-[1.5rem] border border-black/5 bg-white/80 p-6 shadow-glow backdrop-blur`}
          initial={{ opacity: 0, y: 18 }}
          transition={{ duration: 0.4, ease: 'easeOut', delay: 0.14 }}
        >
          {roleScope !== 'regional' ? (
            <div className="rounded-2xl border border-dashed border-black/10 bg-stone-50 px-4 py-8 text-center text-sm text-muted">
              Only regional admins can manage other admin accounts.
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">Admin management</span>
                  <h2 className="mt-2 font-display text-3xl text-ink">Regional and office admins</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
                    Regional admins assign office scope, promote, demote, disable, or remove admin access.
                  </p>
                </div>
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
                  <button
                    className="inline-flex items-center justify-center rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark"
                    onClick={handleCreateAdmin}
                    type="button"
                  >
                    Add admin
                  </button>
                </div>
              </div>

              <div className="mt-6 grid max-h-[56vh] gap-4 overflow-auto pr-1">
                {admins.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-black/10 bg-stone-50 px-4 py-8 text-center text-sm text-muted">
                    No admin records yet.
                  </div>
                ) : (
                  admins.map(admin => (
                    <div key={admin.id} className="grid gap-4 rounded-[1.5rem] border border-black/5 bg-stone-50 p-4 lg:grid-cols-[minmax(0,1fr)_220px_220px_140px] lg:items-center">
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-ink">{admin.displayName || admin.email}</div>
                        <div className="truncate text-sm text-muted">{admin.email}</div>
                      </div>
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
                      <div className="flex flex-wrap gap-2">
                        <button
                          className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                            admin.active
                              ? 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                              : 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                          }`}
                          onClick={() => handleUpdateAdmin(admin, { active: !admin.active })}
                          type="button"
                        >
                          {admin.active ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink transition hover:bg-stone-100"
                          onClick={() => handleDeleteAdmin(admin)}
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

            </>
          )}
        </motion.section>
      </div>
    </AppShell>
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

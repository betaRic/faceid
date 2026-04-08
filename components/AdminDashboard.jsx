'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { buildAttendanceSummary } from '../lib/attendance-summary'
import { subscribeToAttendance, subscribeToPersons, updatePersonRecord } from '../lib/data-store'
import { firebaseEnabled } from '../lib/firebase'
import { saveOfficeConfig, subscribeToOfficeConfigs } from '../lib/office-admin-store'
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

const moduleCards = [
  'Offices and GPS',
  'Schedules and WFH',
  'Employees',
  'Attendance Summary',
]

export default function AdminDashboard() {
  const todayIso = new Date().toISOString().slice(0, 10)
  const [roleScope, setRoleScope] = useState('regional')
  const [selectedOfficeId, setSelectedOfficeId] = useState('')
  const [offices, setOffices] = useState([])
  const [persons, setPersons] = useState([])
  const [attendance, setAttendance] = useState([])
  const [draftOffice, setDraftOffice] = useState(null)
  const [status, setStatus] = useState(firebaseEnabled ? 'Connected to Firebase' : 'Using local storage fallback')
  const [summaryDate, setSummaryDate] = useState(new Date().toLocaleDateString('en-PH'))
  const [employeeQuery, setEmployeeQuery] = useState('')
  const [employeeOfficeFilter, setEmployeeOfficeFilter] = useState('all')
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState('all')
  const [summaryOfficeFilter, setSummaryOfficeFilter] = useState('all')
  const [summaryEmployeeFilter, setSummaryEmployeeFilter] = useState('all')

  useEffect(() => {
    const unsubscribe = subscribeToOfficeConfigs(
      nextOffices => {
        setOffices(nextOffices)
        if (!selectedOfficeId && nextOffices[0]) setSelectedOfficeId(nextOffices[0].id)
      },
      error => {
        setStatus(error.message || 'Failed to load office configuration')
      },
    )

    return unsubscribe
  }, [selectedOfficeId])

  useEffect(() => {
    const unsubscribePersons = subscribeToPersons(setPersons, () => {})
    const unsubscribeAttendance = subscribeToAttendance(setAttendance, () => {})

    return () => {
      unsubscribePersons()
      unsubscribeAttendance()
    }
  }, [])

  const visibleOffices = useMemo(() => {
    if (roleScope === 'regional') return offices
    return offices.filter(office => office.id === selectedOfficeId)
  }, [offices, roleScope, selectedOfficeId])

  const activeOffice = useMemo(() => {
    if (draftOffice) return draftOffice
    return offices.find(office => office.id === selectedOfficeId) || null
  }, [draftOffice, offices, selectedOfficeId])

  const summaryRows = useMemo(() => {
    const baseRows = buildAttendanceSummary({
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
  }, [activeOffice?.name, attendance, offices, persons, roleScope, summaryDate, summaryEmployeeFilter, summaryOfficeFilter])

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
    <main className="min-h-screen bg-hero-wash px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="grid gap-5 rounded-[2rem] border border-black/5 bg-white/70 p-6 shadow-glow backdrop-blur xl:grid-cols-[1.2fr_.8fr] xl:p-8">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <BrandMark />
            <h1 className="mt-4 font-display text-4xl leading-none text-ink sm:text-5xl">
              Office setup should be centralized, simple, and hard to misuse.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-muted">
              Firebase is appropriate for this configuration layer because multiple clients need a shared source of
              truth. Proper Firestore rules and real admin authentication still need to be added before this is trusted
              in production.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
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
              <button
                className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-stone-50"
                onClick={handleLogout}
                type="button"
              >
                Logout
              </button>
            </div>
          </motion.div>

          <motion.aside
            animate={{ opacity: 1, x: 0 }}
            className="grid gap-4 rounded-[1.75rem] border border-black/5 bg-gradient-to-br from-brand/10 via-white/80 to-accent/10 p-6"
            initial={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.45, ease: 'easeOut', delay: 0.08 }}
          >
            <div className="rounded-2xl border border-black/5 bg-white/75 p-4">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">Storage</span>
              <p className="mt-2 text-lg font-semibold text-ink">{firebaseEnabled ? 'Firebase enabled' : 'Local fallback'}</p>
              <p className="mt-1 text-sm leading-7 text-muted">{status}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {moduleCards.map(module => (
                <div key={module} className="rounded-2xl border border-black/5 bg-white/75 p-4 text-sm text-muted">
                  {module}
                </div>
              ))}
            </div>
          </motion.aside>
        </section>

        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <motion.aside
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[1.75rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur"
            initial={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            <header className="mb-5">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">Admin scope</span>
              <h2 className="mt-2 font-display text-2xl text-ink">Office access</h2>
            </header>

            <div className="space-y-4">
              <select
                className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                onChange={event => setRoleScope(event.target.value)}
                value={roleScope}
              >
                <option value="regional">Regional admin</option>
                <option value="office">Office admin</option>
              </select>

              <select
                className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                onChange={event => setSelectedOfficeId(event.target.value)}
                value={selectedOfficeId}
              >
                {offices.map(office => (
                  <option key={office.id} value={office.id}>{office.name}</option>
                ))}
              </select>

              <div className="grid gap-3">
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
            className="rounded-[1.75rem] border border-black/5 bg-white/80 p-6 shadow-glow backdrop-blur"
            initial={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.4, ease: 'easeOut', delay: 0.06 }}
          >
            <header className="mb-6">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">Editor</span>
              <h2 className="mt-2 font-display text-3xl text-ink">{activeOffice?.name || 'Select an office'}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">
                Regional admins should be able to edit all offices. Office admins should only edit their own office.
                This UI is already aligned with that model.
              </p>
            </header>

            {activeOffice ? (
              <div className="grid gap-5 md:grid-cols-2">
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
            ) : (
              <div className="rounded-2xl border border-dashed border-black/10 bg-stone-50 px-4 py-10 text-center text-sm text-muted">
                No office selected.
              </div>
            )}
          </motion.section>
        </div>

        <motion.section
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[1.75rem] border border-black/5 bg-white/80 p-6 shadow-glow backdrop-blur"
          initial={{ opacity: 0, y: 18 }}
          transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 }}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">Employees</span>
              <h2 className="mt-2 font-display text-3xl text-ink">Transfer and account control</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
                This is where employee assignment should be managed. Registration captures the face. Admin manages the employee record.
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

          <div className="mt-6 grid gap-4">
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
                      {person.officeName} • {person.descriptors.length} sample{person.descriptors.length !== 1 ? 's' : ''}
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
          className="rounded-[1.75rem] border border-black/5 bg-white/80 p-6 shadow-glow backdrop-blur"
          initial={{ opacity: 0, y: 18 }}
          transition={{ duration: 0.4, ease: 'easeOut', delay: 0.12 }}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">Attendance summary</span>
              <h2 className="mt-2 font-display text-3xl text-ink">Daily AM/PM reporting</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
                This report derives AM IN, AM OUT, PM IN, PM OUT, late, undertime, and working hours from the raw attendance logs for the selected date.
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

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-3 text-left">
              <thead>
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
        </motion.section>
      </div>
    </main>
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

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

const OfficeLocationPicker = dynamic(() => import('./OfficeLocationPicker'), { ssr: false })

const DAY_OPTIONS = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' }, { value: 0, label: 'Sun' },
]

const TABS = [
  { id: 'office', label: 'Office Setup' },
  { id: 'employees', label: 'Employees' },
  { id: 'summary', label: 'Attendance' },
  { id: 'admins', label: 'Admins' },
]

function getSetupItems(office) {
  if (!office) return []
  return [
    { label: 'GPS pin', ok: Number.isFinite(office.gps?.latitude) && Number.isFinite(office.gps?.longitude) },
    { label: 'Radius', ok: Number.isFinite(office.gps?.radiusMeters) && office.gps.radiusMeters > 0 },
    { label: 'Schedule', ok: Boolean(office.workPolicy?.schedule && office.workPolicy?.morningIn) },
    { label: 'Working days', ok: Array.isArray(office.workPolicy?.workingDays) && office.workPolicy.workingDays.length > 0 },
  ]
}

function decisionTone(code) {
  if (String(code).startsWith('accepted_')) return 'emerald'
  if (code === 'blocked_recent_duplicate') return 'amber'
  return 'red'
}

export default function AdminDashboard({ initialRoleScope = 'regional', initialOfficeId = '' }) {
  const todayIso = new Date().toISOString().slice(0, 10)
  const [roleScope, setRoleScope] = useState(initialRoleScope)
  const [selectedOfficeId, setSelectedOfficeId] = useState(initialOfficeId)
  const [offices, setOffices] = useState([])
  const [persons, setPersons] = useState([])
  const [attendance, setAttendance] = useState([])
  const [dailyRecords, setDailyRecords] = useState([])
  const [draftOffice, setDraftOffice] = useState(null)
  const [status, setStatus] = useState(firebaseEnabled ? 'Connected' : 'Local storage')
  const [summaryDate, setSummaryDate] = useState(todayIso)
  const [employeeQuery, setEmployeeQuery] = useState('')
  const [employeeOfficeFilter, setEmployeeOfficeFilter] = useState('all')
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState('all')
  const [summaryOfficeFilter, setSummaryOfficeFilter] = useState('all')
  const [activeTab, setActiveTab] = useState('office')
  const [admins, setAdmins] = useState([])
  const [adminEmail, setAdminEmail] = useState('')
  const [adminDisplayName, setAdminDisplayName] = useState('')
  const [adminScope, setAdminScope] = useState('office')
  const [adminOfficeId, setAdminOfficeId] = useState('')

  useEffect(() => {
    return subscribeToOfficeConfigs(nextOffices => {
      setOffices(nextOffices)
      if (!selectedOfficeId && nextOffices[0]) setSelectedOfficeId(initialOfficeId || nextOffices[0].id)
    }, err => setStatus(err.message || 'Failed to load offices'))
  }, [initialOfficeId, selectedOfficeId])

  useEffect(() => { setRoleScope(initialRoleScope) }, [initialRoleScope])

  useEffect(() => {
    const u1 = subscribeToPersons(setPersons, () => {})
    const u2 = subscribeToAttendance(setAttendance, () => {})
    return () => { u1(); u2() }
  }, [])

  useEffect(() => {
    if (roleScope !== 'regional') { setAdmins([]); return }
    let active = true
    fetch('/api/admins', { cache: 'no-store' }).then(r => r.json()).then(d => {
      if (active) setAdmins(d?.admins || [])
    }).catch(() => {})
    return () => { active = false }
  }, [roleScope, status])

  const visibleOffices = useMemo(() =>
    roleScope === 'regional' ? offices : offices.filter(o => o.id === selectedOfficeId)
  , [offices, roleScope, selectedOfficeId])

  const activeOffice = useMemo(() =>
    draftOffice || offices.find(o => o.id === selectedOfficeId) || null
  , [draftOffice, offices, selectedOfficeId])

  const setupItems = useMemo(() => getSetupItems(activeOffice), [activeOffice])

  const visibleAttendance = useMemo(() =>
    attendance.filter(e => roleScope === 'regional' ? true : e.officeId === selectedOfficeId)
  , [attendance, roleScope, selectedOfficeId])

  const decisionStats = useMemo(() => {
    const m = new Map()
    visibleAttendance.forEach(e => { const c = String(e.decisionCode || ''); if (c) m.set(c, (m.get(c) || 0) + 1) })
    return Array.from(m.entries()).map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count).slice(0, 5)
  }, [visibleAttendance])

  useEffect(() => {
    if (!firebaseEnabled) { setDailyRecords([]); return }
    let active = true
    fetch(`/api/attendance/daily?date=${summaryDate}`, { cache: 'no-store' }).then(r => r.json()).then(d => {
      if (active) setDailyRecords(d?.records || [])
    }).catch(() => {})
    return () => { active = false }
  }, [summaryDate])

  const summaryRows = useMemo(() => {
    const base = firebaseEnabled ? dailyRecords : buildAttendanceSummary({ attendance, persons, offices, targetDate: summaryDate })
    return base.filter(r => {
      if (roleScope !== 'regional' && r.officeName !== activeOffice?.name) return false
      if (summaryOfficeFilter !== 'all') {
        const o = offices.find(x => x.id === summaryOfficeFilter)
        if (r.officeName !== o?.name) return false
      }
      return true
    })
  }, [activeOffice?.name, attendance, dailyRecords, offices, persons, roleScope, summaryDate, summaryOfficeFilter])

  const filteredPersons = useMemo(() => {
    const q = employeeQuery.trim().toLowerCase()
    return persons.filter(p => {
      if (roleScope !== 'regional' && p.officeId !== selectedOfficeId) return false
      if (employeeOfficeFilter !== 'all' && p.officeId !== employeeOfficeFilter) return false
      if (employeeStatusFilter === 'active' && p.active === false) return false
      if (employeeStatusFilter === 'inactive' && p.active !== false) return false
      if (!q) return true
      return p.name.toLowerCase().includes(q) || p.employeeId.toLowerCase().includes(q)
    }).sort((a, b) => a.name.localeCompare(b.name))
  }, [employeeOfficeFilter, employeeQuery, employeeStatusFilter, persons, roleScope, selectedOfficeId])

  useEffect(() => {
    const o = offices.find(x => x.id === selectedOfficeId) || null
    setDraftOffice(o ? structuredClone(o) : null)
  }, [offices, selectedOfficeId])

  function updateDraft(path, value) {
    setDraftOffice(cur => {
      if (!cur) return cur
      const next = structuredClone(cur)
      const keys = path.split('.')
      let t = next
      for (let i = 0; i < keys.length - 1; i++) t = t[keys[i]]
      t[keys[keys.length - 1]] = value
      return next
    })
  }

  function toggleDay(path, dayValue) {
    setDraftOffice(cur => {
      if (!cur) return cur
      const next = structuredClone(cur)
      const vals = next.workPolicy[path]
      next.workPolicy[path] = vals.includes(dayValue) ? vals.filter(v => v !== dayValue) : [...vals, dayValue].sort((a, b) => a - b)
      return next
    })
  }

  async function handleSaveOffice() {
    if (!draftOffice) return
    setStatus('Saving…')
    try {
      const r = await saveOfficeConfig(draftOffice)
      setStatus(r.mode === 'firebase' ? 'Saved to Firebase' : 'Saved locally')
    } catch (err) { setStatus(err instanceof Error ? err.message : 'Save failed') }
  }

  async function handleUseMyLocation() {
    if (!navigator.geolocation) { setStatus('Location unavailable'); return }
    navigator.geolocation.getCurrentPosition(pos => {
      updateDraft('gps.latitude', Number(pos.coords.latitude.toFixed(6)))
      updateDraft('gps.longitude', Number(pos.coords.longitude.toFixed(6)))
      setStatus('Location updated')
    }, err => setStatus(err.message))
  }

  async function handleLogout() {
    await fetch('/api/admin/logout', { method: 'POST' })
    window.location.href = '/admin/login'
  }

  async function handleEmployeeUpdate(person, updates, msg) {
    try { const r = await updatePersonRecord(person, updates); if (r.mode === 'local') setPersons(r.persons); setStatus(msg) }
    catch (err) { setStatus(err instanceof Error ? err.message : 'Update failed') }
  }

  async function refreshAdmins() {
    const r = await fetch('/api/admins', { cache: 'no-store' })
    const d = await r.json().catch(() => null)
    if (r.ok) setAdmins(d?.admins || [])
  }

  async function handleCreateAdmin() {
    const r = await fetch('/api/admins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: adminEmail, displayName: adminDisplayName, scope: adminScope, officeId: adminScope === 'office' ? adminOfficeId : '', active: true }) })
    const d = await r.json().catch(() => null)
    if (!r.ok) { setStatus(d?.message || 'Failed'); return }
    setAdminEmail(''); setAdminDisplayName(''); setAdminScope('office'); setAdminOfficeId('')
    await refreshAdmins(); setStatus('Admin created')
  }

  async function handleUpdateAdmin(admin, updates) {
    const r = await fetch(`/api/admins/${admin.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: updates.email ?? admin.email, displayName: updates.displayName ?? admin.displayName, scope: updates.scope ?? admin.scope, officeId: (updates.scope ?? admin.scope) === 'office' ? (updates.officeId ?? admin.officeId) : '', active: updates.active ?? admin.active }) })
    const d = await r.json().catch(() => null)
    if (!r.ok) { setStatus(d?.message || 'Update failed'); return }
    await refreshAdmins(); setStatus('Admin updated')
  }

  async function handleDeleteAdmin(admin) {
    const r = await fetch(`/api/admins/${admin.id}`, { method: 'DELETE' })
    const d = await r.json().catch(() => null)
    if (!r.ok) { setStatus(d?.message || 'Delete failed'); return }
    await refreshAdmins(); setStatus('Admin deleted')
  }

  function exportCsv() {
    if (!summaryRows.length) { setStatus('No data to export'); return }
    const headers = ['Employee ID','Name','Office','AM In','AM Out','PM In','PM Out','Late','Undertime','Working Hours','Status']
    const rows = summaryRows.map(r => [r.employeeId, r.name, r.officeName, r.amIn, r.amOut, r.pmIn, r.pmOut, r.lateMinutes, r.undertimeMinutes, r.workingHours, r.status])
    const csv = [headers, ...rows].map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `attendance-${summaryDate}.csv` })
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    setStatus('Exported')
  }

  return (
    <AppShell
      actions={(
        <button onClick={handleLogout} type="button"
          className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-muted transition-colors hover:text-ink">
          Logout
        </button>
      )}
      contentClassName="px-4 py-6 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <BrandMark />
          <h1 className="mt-3 font-display text-3xl text-ink">Admin Workspace</h1>
          <p className="mt-1 text-sm text-muted">Office setup, employee control, and attendance reporting.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link href="/kiosk" className="rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark">
              Open Kiosk
            </Link>
            <span className="flex items-center gap-2 rounded-full border border-black/[0.06] bg-white/70 px-4 py-2 text-xs text-muted">
              <span className={`h-1.5 w-1.5 rounded-full ${firebaseEnabled ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {status}
            </span>
          </div>
        </motion.div>

        {/* Layout: sidebar + main */}
        <div className="grid gap-5 lg:grid-cols-[220px_1fr]">

          {/* Sidebar */}
          <motion.aside
            initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, delay: 0.05 }}
            className="flex flex-col gap-3"
          >
            {/* Scope + office select */}
            <div className="rounded-2xl border border-black/[0.06] bg-white/80 p-4 space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">Scope</p>
                <p className="mt-1 text-sm font-semibold text-ink">{roleScope === 'office' ? 'Office Admin' : 'Regional Admin'}</p>
              </div>
              <select
                value={selectedOfficeId}
                onChange={e => setSelectedOfficeId(e.target.value)}
                disabled={roleScope === 'office'}
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-xs text-ink outline-none focus:border-brand/50 disabled:opacity-50"
              >
                {offices.map(o => <option key={o.id} value={o.id}>{o.shortName || o.name}</option>)}
              </select>
            </div>

            {/* Tab nav */}
            <div className="rounded-2xl border border-black/[0.06] bg-white/80 p-2 space-y-1">
              {TABS.map(tab => (
                <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                  className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                    activeTab === tab.id ? 'bg-brand/10 text-brand-dark' : 'text-muted hover:bg-black/[0.03] hover:text-ink'}`}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Setup status */}
            {activeOffice && (
              <div className="rounded-2xl border border-black/[0.06] bg-white/80 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">Setup</p>
                <div className="space-y-2">
                  {setupItems.map(item => (
                    <div key={item.label} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted">{item.label}</span>
                      <span className={`h-4 w-4 rounded-full text-center leading-4 ${item.ok ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                        {item.ok ? '✓' : '·'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.aside>

          {/* Main content */}
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.08 }}
          >

            {/* OFFICE TAB */}
            {activeTab === 'office' && (
              <div className="rounded-2xl border border-black/[0.06] bg-white/80 p-5">
                <h2 className="font-display text-xl text-ink mb-4">{activeOffice?.name || 'Select an office'}</h2>
                {activeOffice ? (
                  <div className="space-y-5">
                    <OfficeLocationPicker
                      latitude={activeOffice.gps.latitude} longitude={activeOffice.gps.longitude}
                      radiusMeters={activeOffice.gps.radiusMeters}
                      onChange={({ latitude, longitude }) => { updateDraft('gps.latitude', latitude); updateDraft('gps.longitude', longitude) }}
                    />
                    <button onClick={handleUseMyLocation} type="button"
                      className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-muted transition-colors hover:text-ink">
                      Use my location
                    </button>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Office name"><Input value={activeOffice.name} onChange={e => updateDraft('name', e.target.value)} /></Field>
                      <Field label="Location"><Input value={activeOffice.location} onChange={e => updateDraft('location', e.target.value)} /></Field>
                      <Field label="Latitude"><Input type="number" value={activeOffice.gps.latitude} onChange={e => updateDraft('gps.latitude', Number(e.target.value))} /></Field>
                      <Field label="Longitude"><Input type="number" value={activeOffice.gps.longitude} onChange={e => updateDraft('gps.longitude', Number(e.target.value))} /></Field>
                      <Field label="Radius (m)"><Input type="number" value={activeOffice.gps.radiusMeters} onChange={e => updateDraft('gps.radiusMeters', Number(e.target.value))} /></Field>
                      <Field label="Schedule label"><Input value={activeOffice.workPolicy.schedule} onChange={e => updateDraft('workPolicy.schedule', e.target.value)} /></Field>
                      <Field label="AM in"><Input type="time" value={activeOffice.workPolicy.morningIn} onChange={e => updateDraft('workPolicy.morningIn', e.target.value)} /></Field>
                      <Field label="AM out"><Input type="time" value={activeOffice.workPolicy.morningOut} onChange={e => updateDraft('workPolicy.morningOut', e.target.value)} /></Field>
                      <Field label="PM in"><Input type="time" value={activeOffice.workPolicy.afternoonIn} onChange={e => updateDraft('workPolicy.afternoonIn', e.target.value)} /></Field>
                      <Field label="PM out"><Input type="time" value={activeOffice.workPolicy.afternoonOut} onChange={e => updateDraft('workPolicy.afternoonOut', e.target.value)} /></Field>
                      <Field label="Grace period (min)"><Input type="number" value={activeOffice.workPolicy.gracePeriodMinutes} onChange={e => updateDraft('workPolicy.gracePeriodMinutes', Number(e.target.value))} /></Field>
                    </div>

                    <Field label="Working days">
                      <div className="flex flex-wrap gap-2">
                        {DAY_OPTIONS.map(d => (
                          <button key={`wd-${d.value}`} type="button" onClick={() => toggleDay('workingDays', d.value)}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${activeOffice.workPolicy.workingDays.includes(d.value) ? 'bg-brand text-white' : 'border border-black/10 bg-white text-muted hover:text-ink'}`}>
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </Field>

                    <Field label="WFH days">
                      <div className="flex flex-wrap gap-2">
                        {DAY_OPTIONS.map(d => (
                          <button key={`wfh-${d.value}`} type="button" onClick={() => toggleDay('wfhDays', d.value)}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${activeOffice.workPolicy.wfhDays.includes(d.value) ? 'bg-accent/20 text-accent' : 'border border-black/10 bg-white text-muted hover:text-ink'}`}>
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </Field>

                    <button onClick={handleSaveOffice} type="button"
                      className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark">
                      Save Office Settings
                    </button>
                  </div>
                ) : (
                  <EmptyState text="Select an office from the sidebar." />
                )}
              </div>
            )}

            {/* EMPLOYEES TAB */}
            {activeTab === 'employees' && (
              <div className="rounded-2xl border border-black/[0.06] bg-white/80 p-5 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="font-display text-xl text-ink">Employees</h2>
                  <div className="flex flex-wrap gap-2">
                    <Input placeholder="Search name or ID" value={employeeQuery} onChange={e => setEmployeeQuery(e.target.value)} className="w-full sm:w-44" />
                    <select value={employeeOfficeFilter} onChange={e => setEmployeeOfficeFilter(e.target.value)}
                      className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs text-ink outline-none focus:border-brand/50">
                      <option value="all">All offices</option>
                      {visibleOffices.map(o => <option key={o.id} value={o.id}>{o.shortName || o.name}</option>)}
                    </select>
                    <select value={employeeStatusFilter} onChange={e => setEmployeeStatusFilter(e.target.value)}
                      className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs text-ink outline-none focus:border-brand/50">
                      <option value="all">All</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2 max-h-[60vh] overflow-auto">
                  {filteredPersons.length === 0 ? (
                    <EmptyState text="No employees match the current filters." />
                  ) : filteredPersons.map(person => (
                    <div key={person.id} className="flex flex-col gap-3 rounded-xl border border-black/[0.05] bg-stone-50 p-3 sm:flex-row sm:items-center">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-ink">{person.name}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${person.active === false ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'}`}>
                            {person.active === false ? 'Inactive' : 'Active'}
                          </span>
                        </div>
                        <p className="text-xs text-muted mt-0.5">{person.employeeId} · {person.officeName} · {person.sampleCount ?? 0} samples</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <select value={person.officeId} onChange={e => {
                          const o = offices.find(x => x.id === e.target.value)
                          if (o && o.id !== person.officeId) handleEmployeeUpdate(person, { officeId: o.id, officeName: o.name }, `${person.name} transferred`)
                        }} className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs text-ink outline-none focus:border-brand/50">
                          {visibleOffices.map(o => <option key={o.id} value={o.id}>{o.shortName || o.name}</option>)}
                        </select>
                        <button type="button" onClick={() => handleEmployeeUpdate(person, { active: person.active === false }, person.active === false ? `${person.name} reactivated` : `${person.name} deactivated`)}
                          className={`rounded-full px-3 py-2 text-xs font-semibold transition-colors ${person.active === false ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border border-red-200 bg-red-50 text-red-600 hover:bg-red-100'}`}>
                          {person.active === false ? 'Activate' : 'Deactivate'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SUMMARY TAB */}
            {activeTab === 'summary' && (
              <div className="rounded-2xl border border-black/[0.06] bg-white/80 p-5 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="font-display text-xl text-ink">Attendance Summary</h2>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">Date</span>
                      <Input type="date" defaultValue={todayIso} onChange={e => setSummaryDate(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">Office</span>
                      <select value={summaryOfficeFilter} onChange={e => setSummaryOfficeFilter(e.target.value)}
                        className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs text-ink outline-none">
                        <option value="all">All</option>
                        {visibleOffices.map(o => <option key={o.id} value={o.id}>{o.shortName || o.name}</option>)}
                      </select>
                    </div>
                    <button onClick={exportCsv} type="button"
                      className="rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark">
                      Export CSV
                    </button>
                  </div>
                </div>

                {/* Decision stats */}
                {decisionStats.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {decisionStats.map(({ code, count }) => {
                      const tone = decisionTone(code)
                      return (
                        <span key={code} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                          tone === 'emerald' ? 'bg-emerald-100 text-emerald-700' :
                          tone === 'amber' ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-600'}`}>
                          {code.replace(/_/g, ' ')} × {count}
                        </span>
                      )
                    })}
                  </div>
                )}

                {/* Table */}
                <div className="overflow-auto max-h-[55vh]">
                  <table className="min-w-full text-xs">
                    <thead className="sticky top-0 bg-white/95 backdrop-blur-sm">
                      <tr className="border-b border-black/[0.06]">
                        {['Employee','Office','AM In','AM Out','PM In','PM Out','Late','Undertime','Hours','Status'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left font-semibold uppercase tracking-widest text-muted">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.04]">
                      {summaryRows.length === 0 ? (
                        <tr><td colSpan={10} className="px-3 py-8 text-center text-muted">No records for this date.</td></tr>
                      ) : summaryRows.map(row => (
                        <tr key={`${row.employeeId}-${row.name}`} className="hover:bg-stone-50/60 transition-colors">
                          <td className="px-3 py-3">
                            <p className="font-semibold text-ink">{row.name}</p>
                            <p className="text-muted">{row.employeeId}</p>
                          </td>
                          <td className="px-3 py-3 text-muted">{row.officeName}</td>
                          <td className="px-3 py-3 tabular-nums">{row.amIn}</td>
                          <td className="px-3 py-3 tabular-nums">{row.amOut}</td>
                          <td className="px-3 py-3 tabular-nums">{row.pmIn}</td>
                          <td className="px-3 py-3 tabular-nums">{row.pmOut}</td>
                          <td className="px-3 py-3 tabular-nums">{row.lateMinutes}m</td>
                          <td className="px-3 py-3 tabular-nums">{row.undertimeMinutes}m</td>
                          <td className="px-3 py-3 tabular-nums font-semibold">{row.workingHours}</td>
                          <td className="px-3 py-3">
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${
                              row.status === 'Complete' ? 'bg-emerald-100 text-emerald-700' :
                              row.status === 'Late' ? 'bg-amber-100 text-amber-700' :
                              row.status === 'Undertime' ? 'bg-red-100 text-red-600' :
                              'bg-stone-100 text-stone-600'}`}>
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ADMINS TAB */}
            {activeTab === 'admins' && (
              <div className="rounded-2xl border border-black/[0.06] bg-white/80 p-5 space-y-4">
                <h2 className="font-display text-xl text-ink">Admin Records</h2>

                {roleScope !== 'regional' ? (
                  <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Only regional admins can manage admin accounts.
                  </div>
                ) : (
                  <>
                    {/* Add admin form */}
                    <div className="rounded-xl border border-black/[0.06] bg-stone-50 p-4 space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted">Add Admin</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input placeholder="Email address" type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} />
                        <Input placeholder="Display name" value={adminDisplayName} onChange={e => setAdminDisplayName(e.target.value)} />
                        <select value={adminScope} onChange={e => setAdminScope(e.target.value)}
                          className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-ink outline-none">
                          <option value="office">Office Admin</option>
                          <option value="regional">Regional Admin</option>
                        </select>
                        <select value={adminOfficeId} onChange={e => setAdminOfficeId(e.target.value)} disabled={adminScope !== 'office'}
                          className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-ink outline-none disabled:opacity-50">
                          <option value="">Select office</option>
                          {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      </div>
                      <button onClick={handleCreateAdmin} type="button"
                        className="rounded-full bg-brand px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark">
                        Add Admin
                      </button>
                    </div>

                    {/* Admin list */}
                    <div className="space-y-2 max-h-[50vh] overflow-auto">
                      {admins.length === 0 ? (
                        <EmptyState text="No admin records yet." />
                      ) : admins.map(admin => (
                        <div key={admin.id} className="flex flex-col gap-3 rounded-xl border border-black/[0.05] bg-stone-50 p-3 sm:flex-row sm:items-center">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-ink">{admin.displayName || admin.email}</p>
                            <p className="text-xs text-muted">{admin.email} · {admin.scope === 'office' ? `Office: ${admin.officeId}` : 'Regional'}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <select value={admin.scope} onChange={e => handleUpdateAdmin(admin, { scope: e.target.value })}
                              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs text-ink outline-none">
                              <option value="office">Office</option>
                              <option value="regional">Regional</option>
                            </select>
                            <button type="button" onClick={() => handleUpdateAdmin(admin, { active: !admin.active })}
                              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${admin.active ? 'border border-red-200 bg-red-50 text-red-600 hover:bg-red-100' : 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
                              {admin.active ? 'Disable' : 'Enable'}
                            </button>
                            <button type="button" onClick={() => handleDeleteAdmin(admin)}
                              className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-ink">
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

          </motion.div>
        </div>
      </div>
    </AppShell>
  )
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">{label}</span>
      {children}
    </label>
  )
}

function Input({ className = '', ...props }) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-ink outline-none transition-all focus:border-brand/50 focus:ring-2 focus:ring-brand/10 ${className}`}
    />
  )
}

function EmptyState({ text }) {
  return (
    <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-black/10 text-sm text-muted">
      {text}
    </div>
  )
}

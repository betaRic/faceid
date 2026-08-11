'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAdminStore } from '@/lib/admin/store'
import { normalizeOfficeRecord } from '@/lib/offices'
import DilgLoadingIndicator from '@/components/shared/DilgLoadingIndicator'

const DAYS = [
  { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' }, { value: 0, label: 'Sun' },
]

function updateNested(office, section, field, value) {
  return { ...office, [section]: { ...office[section], [field]: value } }
}

function DayToggle({ label, values, onChange, accent = false }) {
  const toggle = (day) => onChange(values.includes(day) ? values.filter(value => value !== day) : [...values, day].sort((a, b) => a - b))
  return (
    <div className="rounded-2xl border border-black/5 bg-stone-50 p-3">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-navy-dark">{label}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {DAYS.map(day => (
          <button
            key={day.value}
            className={`rounded-full border px-3 py-1 text-sm font-semibold transition ${values.includes(day.value)
              ? accent ? 'border-amber/40 bg-amber/15 text-amber-dark' : 'border-navy/30 bg-navy/10 text-navy-dark'
              : 'border-black/10 bg-white text-muted hover:bg-stone-100'}`}
            onClick={() => toggle(day.value)}
            type="button"
          >
            {day.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Field({ label, children, note }) {
  return <label className="grid gap-1.5"><span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{label}</span>{note ? <span className="text-xs text-muted">{note}</span> : null}{children}</label>
}

export default function HrOfficeSettingsPanel() {
  const addToast = useAdminStore(state => state.addToast)
  const [office, setOffice] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/hr/office-settings', { credentials: 'same-origin' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.ok) throw new Error(data.message || 'Unable to load office settings.')
      setOffice(normalizeOfficeRecord(data.office))
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Unable to load office settings.', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { loadSettings() }, [loadSettings])

  const save = useCallback(async () => {
    if (!office) return
    setSaving(true)
    try {
      const response = await fetch('/api/hr/office-settings', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workPolicy: office.workPolicy,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.ok) throw new Error(data.message || 'Unable to save office settings.')
      setOffice(normalizeOfficeRecord(data.office))
      addToast('Office settings saved.', 'success')
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Unable to save office settings.', 'error')
    } finally {
      setSaving(false)
    }
  }, [addToast, office])

  if (loading) return <section className="flex h-full items-center justify-center"><DilgLoadingIndicator compact label="Loading office settings…" /></section>
  if (!office) return <section className="p-6 text-sm text-muted">Office settings could not be loaded.</section>

  const policy = office.workPolicy || {}
  const inputClass = 'w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-navy'
  return (
    <section className="h-full overflow-auto bg-white p-3 sm:p-6">
      <div className="flex flex-col gap-3 border-b border-black/5 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-navy-dark">Office HR</div>
          <h2 className="mt-1 font-display text-2xl font-bold text-ink sm:text-3xl">Office Settings</h2>
          <p className="mt-1 text-sm text-muted">Update the work schedule for {office.name}. Office location and geofence settings are managed by Admin.</p>
        </div>
        <button className="rounded-full bg-navy px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-dark disabled:opacity-50" disabled={saving} onClick={save} type="button">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <div className="mx-auto mt-5 grid max-w-4xl gap-4">
        <div className="grid content-start gap-4">
          <div className="rounded-2xl border border-black/5 bg-stone-50 p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-navy-dark">Work schedule</div>
            <Field label="Schedule label"><input className={inputClass} onChange={event => setOffice(current => updateNested(current, 'workPolicy', 'schedule', event.target.value))} value={policy.schedule || ''} /></Field>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[['AM check-in', 'morningIn'], ['AM check-out', 'morningOut'], ['PM check-in', 'afternoonIn'], ['PM check-out', 'afternoonOut']].map(([label, field]) => <Field key={field} label={label}><input className={inputClass} onChange={event => setOffice(current => updateNested(current, 'workPolicy', field, event.target.value))} type="time" value={policy[field] || ''} /></Field>)}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <DayToggle label="Working days" onChange={values => setOffice(current => updateNested(current, 'workPolicy', 'workingDays', values))} values={policy.workingDays || []} />
            <DayToggle accent label="WFH days" onChange={values => setOffice(current => updateNested(current, 'workPolicy', 'wfhDays', values))} values={policy.wfhDays || []} />
          </div>
          <div className="grid gap-3 rounded-2xl border border-black/5 bg-stone-50 p-4 sm:grid-cols-3">
            <Field label="Grace period" note="Minutes"><input className={inputClass} min="0" onChange={event => setOffice(current => updateNested(current, 'workPolicy', 'gracePeriodMinutes', Number(event.target.value)))} type="number" value={policy.gracePeriodMinutes ?? 0} /></Field>
            <Field label="Check-in cooldown" note="Minutes"><input className={inputClass} min="0" onChange={event => setOffice(current => updateNested(current, 'workPolicy', 'checkInCooldownMinutes', Number(event.target.value)))} type="number" value={policy.checkInCooldownMinutes ?? 30} /></Field>
            <Field label="Check-out cooldown" note="Minutes"><input className={inputClass} min="0" onChange={event => setOffice(current => updateNested(current, 'workPolicy', 'checkOutCooldownMinutes', Number(event.target.value)))} type="number" value={policy.checkOutCooldownMinutes ?? 5} /></Field>
          </div>
        </div>
      </div>
    </section>
  )
}

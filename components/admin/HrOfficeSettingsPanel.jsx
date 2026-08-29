'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAdminStore } from '@/lib/admin/store'
import { normalizeOfficeRecord } from '@/lib/offices'
import { Button, ErrorState, Field, Input, LoadingState, PageHeader, Surface } from '@/components/ui'

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
    <fieldset className="rounded-surface border border-line p-3">
      <legend className="px-1 text-sm font-medium text-foreground">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {DAYS.map(day => (
          <Button
            aria-pressed={values.includes(day.value)}
            key={day.value}
            className={accent && values.includes(day.value) ? 'border-accent bg-accent text-accent-contrast' : ''}
            onClick={() => toggle(day.value)}
            variant={values.includes(day.value) ? 'primary' : 'secondary'}
          >
            {day.label}
          </Button>
        ))}
      </div>
    </fieldset>
  )
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

  if (loading) return <LoadingState className="min-h-64 justify-center">Loading office settings…</LoadingState>
  if (!office) return <ErrorState description="The assigned office and work policy could not be loaded." onRetry={loadSettings} title="Office settings unavailable" />

  const policy = office.workPolicy || {}
  return (
    <section className="h-full overflow-auto">
      <PageHeader
        title="Office settings"
        description={`Update the work schedule for ${office.name}.`}
        actions={<Button disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>}
      />

      <div className="mx-auto mt-5 grid max-w-4xl gap-4">
        <div className="grid content-start gap-4">
          <Surface className="p-4">
            <h2 className="mb-4 text-lg font-semibold text-foreground">Work schedule</h2>
            <Field label="Schedule label"><Input onChange={event => setOffice(current => updateNested(current, 'workPolicy', 'schedule', event.target.value))} value={policy.schedule || ''} /></Field>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[['AM check-in', 'morningIn'], ['AM check-out', 'morningOut'], ['PM check-in', 'afternoonIn'], ['PM check-out', 'afternoonOut']].map(([label, field]) => <Field key={field} label={label}><Input onChange={event => setOffice(current => updateNested(current, 'workPolicy', field, event.target.value))} type="time" value={policy[field] || ''} /></Field>)}
            </div>
          </Surface>
          <div className="grid gap-3 sm:grid-cols-2">
            <DayToggle label="Working days" onChange={values => setOffice(current => updateNested(current, 'workPolicy', 'workingDays', values))} values={policy.workingDays || []} />
            <DayToggle accent label="WFH days" onChange={values => setOffice(current => updateNested(current, 'workPolicy', 'wfhDays', values))} values={policy.wfhDays || []} />
          </div>
          <Surface className="grid gap-3 p-4 sm:grid-cols-3">
            <Field label="Grace period" hint="Minutes"><Input min="0" onChange={event => setOffice(current => updateNested(current, 'workPolicy', 'gracePeriodMinutes', Number(event.target.value)))} type="number" value={policy.gracePeriodMinutes ?? 0} /></Field>
            <Field label="Check-in cooldown" hint="Minutes"><Input min="0" onChange={event => setOffice(current => updateNested(current, 'workPolicy', 'checkInCooldownMinutes', Number(event.target.value)))} type="number" value={policy.checkInCooldownMinutes ?? 30} /></Field>
            <Field label="Check-out cooldown" hint="Minutes"><Input min="0" onChange={event => setOffice(current => updateNested(current, 'workPolicy', 'checkOutCooldownMinutes', Number(event.target.value)))} type="number" value={policy.checkOutCooldownMinutes ?? 5} /></Field>
          </Surface>
        </div>
      </div>
    </section>
  )
}

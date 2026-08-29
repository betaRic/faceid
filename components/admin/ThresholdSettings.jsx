'use client'

import { memo, useCallback, useEffect, useId, useState } from 'react'
import { useThresholds } from '@/lib/admin/hooks/useThresholds'
import { Button, ErrorState, LoadingState, PageHeader, Status, Surface } from '@/components/ui'

function SliderField({ fieldKey, meta, value, onChange }) {
  const inputId = useId()
  const isChanged = value !== meta.default
  const numVal = Number(value)
  const pct = ((numVal - meta.min) / (meta.max - meta.min)) * 100
  const display = meta.format ? meta.format(numVal) : numVal

  return (
    <div className="group">
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={inputId} className={`text-sm font-medium ${isChanged ? 'text-warning' : 'text-foreground'}`}>
          {meta.label}
          {isChanged && (
            <span className="ml-2 inline-block rounded bg-warning-surface px-1.5 py-0.5 text-xs font-semibold text-warning">
              changed
            </span>
          )}
        </label>
        <span className="text-sm font-mono font-semibold text-primary">{display}</span>
      </div>
      <div className="relative flex items-center gap-3">
        <span className="w-10 text-right text-[11px] tabular-nums text-muted">{meta.format ? meta.format(meta.min) : meta.min}</span>
        <div className="relative flex-1">
          <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-subdued" />
          <div
            className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
          <input
            id={inputId}
            type="range"
            aria-valuetext={String(display)}
            className="relative z-10 h-1.5 w-full cursor-pointer appearance-none bg-transparent"
            min={meta.min}
            max={meta.max}
            step={meta.step}
            value={numVal}
            onChange={e => onChange(fieldKey, Number(e.target.value))}
          />
        </div>
        <span className="w-10 text-[11px] tabular-nums text-muted">{meta.format ? meta.format(meta.max) : meta.max}</span>
      </div>
      {meta.zeroNote && numVal === 0 && (
        <p className="mt-1 text-xs text-warning">{meta.zeroNote}</p>
      )}
    </div>
  )
}

function RegionalPinAccess() {
  const [state, setState] = useState({ loading: true, configured: false, enabled: false, saving: false, error: '' })

  useEffect(() => {
    fetch('/api/admin/regional-pin').then(response => response.json()).then(data => {
      setState(current => ({ ...current, loading: false, configured: Boolean(data.configured), enabled: Boolean(data.enabled), error: data.ok ? '' : data.message || 'Unable to load regional PIN status.' }))
    }).catch(() => setState(current => ({ ...current, loading: false, error: 'Unable to load regional PIN status.' })))
  }, [])

  const setEnabled = async (enabled) => {
    setState(current => ({ ...current, saving: true, error: '' }))
    try {
      const response = await fetch('/api/admin/regional-pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.message || 'Unable to update regional PIN access.')
      setState(current => ({ ...current, enabled: Boolean(data.enabled), saving: false }))
    } catch (error) {
      setState(current => ({ ...current, saving: false, error: error.message }))
    }
  }

  if (state.loading) return null
  return (
    <Surface className="p-5">
      <h3 className="font-semibold text-ink">Regional Bootstrap PIN</h3>
      <p className="mt-1 text-sm text-muted">Controls whether the <code>ADMIN_REGIONAL_PIN</code> environment PIN can sign in. Managed admin PINs continue to work.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Status tone={state.enabled ? 'success' : 'neutral'}>{state.enabled ? 'Enabled' : 'Disabled'}</Status>
        {!state.configured ? <Status tone="warning">Not configured</Status> : null}
      </div>
      {state.error ? <ErrorState className="mt-3" description={state.error} title="Regional PIN status unavailable" /> : null}
      <Button type="button" disabled={!state.configured || state.saving} onClick={() => setEnabled(!state.enabled)} className="mt-4">
        {state.saving ? 'Saving…' : state.enabled ? 'Disable Regional PIN' : 'Enable Regional PIN'}
      </Button>
    </Surface>
  )
}

function SectionCard({ sectionKey, section, onFieldChange, onSave, onReset, saving }) {
  const hasChanged = Object.values(section.fields).some(f => f.changed)
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(Object.entries(section.fields).map(([k, f]) => [k, f.current]))
  )

  const handleField = useCallback((key, value) => {
    setDraft(prev => ({ ...prev, [key]: value }))
    onFieldChange(key, value)
  }, [onFieldChange])

  const pending = Object.entries(draft).filter(([k, v]) => v !== section.fields[k]?.current)
  const canSave = pending.length > 0

  const handleSave = async () => {
    const values = Object.fromEntries(pending)
    await onSave(values)
    setDraft(Object.fromEntries(Object.entries(section.fields).map(([k, f]) => [k, f.current])))
  }

  const handleReset = async () => {
    await onReset(sectionKey)
    setDraft(Object.fromEntries(Object.entries(section.fields).map(([k, f]) => [k, f.default])))
  }

  return (
    <Surface className="p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold text-ink">{section.label}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{section.description}</p>
        </div>
        {hasChanged && (
          <Button
            variant="quiet"
            onClick={handleReset}
            disabled={saving}
            className="shrink-0"
          >
            Reset section
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-5">
        {Object.entries(section.fields).map(([fieldKey, meta]) => (
          <SliderField
            key={fieldKey}
            fieldKey={fieldKey}
            meta={meta}
            value={draft[fieldKey] ?? meta.current}
            onChange={handleField}
          />
        ))}
      </div>

      {canSave && (
        <div className="mt-4 flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-contrast border-t-transparent" />
                Saving...
              </>
            ) : (
              <>Save changes</>
            )}
          </Button>
        </div>
      )}
    </Surface>
  )
}

function BiometricSection({ section, onFieldChange, onSave, onReset, saving }) {
  const { kioskMatchDistance, ambiguousMargin } = section.fields

  const [draft, setDraft] = useState(() =>
    Object.fromEntries(Object.entries(section.fields).map(([k, f]) => [k, f.current]))
  )

  const handleField = useCallback((key, value) => {
    setDraft(prev => ({ ...prev, [key]: value }))
    onFieldChange(key, value)
  }, [onFieldChange])

  const pending = Object.entries(draft).filter(([k, v]) => v !== section.fields[k]?.current)
  const hasChanges = pending.length > 0

  const effectiveDist = draft.kioskMatchDistance ?? kioskMatchDistance?.default
  const effectiveMargin = draft.ambiguousMargin ?? ambiguousMargin?.default
  const distNote = effectiveDist <= 0.75
    ? 'Strict — few false positives'
    : effectiveDist <= 0.85
    ? 'Balanced — good for most lighting'
    : 'Lenient — more false positives possible'
  const marginNote = effectiveMargin < 0.04
    ? 'Unsafe value - server clamps to 0.04'
    : effectiveMargin < 0.06
      ? 'Minimal blocking - monitor close matches'
      : 'Safer blocking - similar faces may be rejected'

  const handleSave = async () => {
    const values = Object.fromEntries(pending)
    await onSave(values)
    setDraft(Object.fromEntries(Object.entries(section.fields).map(([k, f]) => [k, f.current])))
  }

  return (
    <Surface className="p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold text-ink">{section.label}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{section.description}</p>
        </div>
      </div>

      <div className="mb-5 grid gap-2 text-sm text-secondary sm:grid-cols-2">
        <p><strong className="text-foreground">Match {effectiveDist?.toFixed(2)}:</strong> {distNote}</p>
        <p><strong className="text-foreground">Margin {effectiveMargin?.toFixed(2)}:</strong> {marginNote}</p>
      </div>

      <div className="flex flex-col gap-5">
        {Object.entries(section.fields).map(([fieldKey, meta]) => (
          <SliderField
            key={fieldKey}
            fieldKey={fieldKey}
            meta={meta}
            value={draft[fieldKey] ?? meta.current}
            onChange={handleField}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {hasChanges && (
          <Button
            variant="secondary"
            onClick={() => {
              setDraft(Object.fromEntries(Object.entries(section.fields).map(([k, f]) => [k, f.default])))
              onReset('biometric')
            }}
            disabled={saving}
          >
            Reset
          </Button>
        )}
        {hasChanges && (
          <Button
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        )}
      </div>
    </Surface>
  )
}

export const ThresholdSettings = memo(function ThresholdSettings() {
  const { sections, loading, saving, error, saveThresholds, resetThresholds } = useThresholds()
  const [pending, setPending] = useState({})

  const handleFieldChange = useCallback((key, value) => {
    setPending(prev => ({ ...prev, [key]: value }))
  }, [])

  const handleSave = async (values) => {
    const ok = await saveThresholds(values)
    if (ok) setPending({})
    return ok
  }

  const handleReset = async (sectionKey) => {
    await resetThresholds()
    setPending({})
  }

  if (loading) {
    return (
      <LoadingState className="min-h-64 justify-center">Loading settings…</LoadingState>
    )
  }

  if (error || !sections) {
    return (
      <ErrorState className="my-6" description={error || 'Failed to load settings.'} title="Settings unavailable" />
    )
  }

  const hasAnyPending = Object.keys(pending).length > 0

  return (
    <section className="flex min-h-0 flex-col gap-4 bg-surface p-3 sm:gap-5 sm:p-6 md:h-full md:overflow-hidden">
      <PageHeader
        title="System settings"
        description="Manage biometric thresholds and controlled administrator access."
        actions={hasAnyPending ? <Status tone="warning">Unsaved changes</Status> : null}
      />

      <div className="md:min-h-0 md:flex-1 md:overflow-y-auto md:pr-1">
        <div className="grid gap-5">
          {sections.biometric && (
            <BiometricSection
              section={sections.biometric}
              onFieldChange={handleFieldChange}
              onSave={handleSave}
              onReset={handleReset}
              saving={saving}
            />
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            {sections.kiosk && (
              <SectionCard
                sectionKey="kiosk"
                section={sections.kiosk}
                onFieldChange={handleFieldChange}
                onSave={handleSave}
                onReset={handleReset}
                saving={saving}
              />
            )}
            {sections.enrollment && (
              <SectionCard
                sectionKey="enrollment"
                section={sections.enrollment}
                onFieldChange={handleFieldChange}
                onSave={handleSave}
                onReset={handleReset}
                saving={saving}
              />
            )}
            {sections.location && (
              <SectionCard sectionKey="location" section={sections.location} onFieldChange={handleFieldChange} onSave={handleSave} onReset={handleReset} saving={saving} />
            )}
          </div>

          <RegionalPinAccess />
        </div>
      </div>
    </section>
  )
})

'use client'

import { memo, useCallback, useState } from 'react'
import { useThresholds } from '@/lib/admin/hooks/useThresholds'
import { MaintenancePanel } from './MaintenancePanel'

function SliderField({ fieldKey, meta, value, onChange }) {
  const isChanged = value !== meta.default
  const numVal = Number(value)
  const pct = ((numVal - meta.min) / (meta.max - meta.min)) * 100
  const display = meta.format ? meta.format(numVal) : numVal

  return (
    <div className="group">
      <div className="mb-1.5 flex items-center justify-between">
        <span className={`text-sm font-medium ${isChanged ? 'text-amber-700' : 'text-ink'}`}>
          {meta.label}
          {isChanged && (
            <span className="ml-2 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
              changed
            </span>
          )}
        </span>
        <span className="text-sm font-mono font-semibold text-navy">{display}</span>
      </div>
      <div className="relative flex items-center gap-3">
        <span className="w-10 text-right text-[11px] tabular-nums text-muted">{meta.format ? meta.format(meta.min) : meta.min}</span>
        <div className="relative flex-1">
          <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-stone-100" />
          <div
            className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-navy transition-all"
            style={{ width: `${pct}%` }}
          />
          <input
            type="range"
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
        <p className="mt-1 text-xs text-amber-600">{meta.zeroNote}</p>
      )}
    </div>
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
    <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold text-ink">{section.label}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{section.description}</p>
        </div>
        {hasChanged && (
          <button
            onClick={handleReset}
            disabled={saving}
            className="shrink-0 rounded-full border border-stone-200 px-3 py-1 text-[11px] font-semibold text-muted transition hover:border-stone-300 hover:text-stone-600 disabled:cursor-not-allowed"
          >
            Reset section
          </button>
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
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-navy px-5 py-2 text-sm font-semibold text-white transition hover:bg-navy-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Saving...
              </>
            ) : (
              <>Save changes</>
            )}
          </button>
        </div>
      )}
    </div>
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
  const marginNote = effectiveMargin === 0
    ? 'Ambiguity blocking DISABLED'
    : effectiveMargin <= 0.02
    ? 'Minimal blocking — strong matches never blocked'
    : 'Aggressive blocking — similar faces may be rejected'

  const handleSave = async () => {
    const values = Object.fromEntries(pending)
    await onSave(values)
    setDraft(Object.fromEntries(Object.entries(section.fields).map(([k, f]) => [k, f.current])))
  }

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold text-ink">{section.label}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{section.description}</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className={`rounded-xl px-4 py-3 text-center ${effectiveDist <= 0.75 ? 'bg-emerald-50' : effectiveDist <= 0.85 ? 'bg-blue-50' : 'bg-amber-50'}`}>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Match distance</div>
          <div className="mt-1 font-display text-xl font-bold text-ink">{effectiveDist?.toFixed(2)}</div>
          <div className="mt-0.5 text-[10px] text-muted">{distNote}</div>
        </div>
        <div className={`rounded-xl px-4 py-3 text-center ${effectiveMargin === 0 ? 'bg-red-50' : effectiveMargin <= 0.02 ? 'bg-emerald-50' : 'bg-amber-50'}`}>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Ambiguity margin</div>
          <div className="mt-1 font-display text-xl font-bold text-ink">{effectiveMargin?.toFixed(2)}</div>
          <div className="mt-0.5 text-[10px] text-muted">{marginNote}</div>
        </div>
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
          <button
            onClick={() => {
              setDraft(Object.fromEntries(Object.entries(section.fields).map(([k, f]) => [k, f.default])))
              onReset('biometric')
            }}
            disabled={saving}
            className="rounded-full border border-stone-200 px-4 py-2 text-sm font-semibold text-muted transition hover:border-stone-300 hover:text-stone-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset
          </button>
        )}
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-full bg-navy px-5 py-2 text-sm font-semibold text-white transition hover:bg-navy-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        )}
      </div>
    </div>
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
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-navy border-t-transparent" />
          <span className="text-sm text-muted">Loading settings...</span>
        </div>
      </div>
    )
  }

  if (error || !sections) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-red-500">{error || 'Failed to load settings.'}</p>
      </div>
    )
  }

  const hasAnyPending = Object.keys(pending).length > 0

  return (
    <section className="flex h-full min-h-0 flex-col gap-5 overflow-hidden rounded-[2rem] border border-black/5 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-ink">System Settings</h2>
          <p className="mt-0.5 text-sm text-muted">Tune biometric matching, scan behavior, and enrollment without redeploying.</p>
        </div>
        {hasAnyPending ? (
          <div className="flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
            Unsaved changes pending
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
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
          </div>

          <MaintenancePanel />
        </div>
      </div>
    </section>
  )
})

'use client'

import { useState } from 'react'
import OfficeLocationPicker from './OfficeLocationPicker'

const DAY_OPTIONS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
]

const OFFICE_TYPE_OPTIONS = [
  'Regional Office',
  'Provincial Office',
  'HUC Office',
]

function formatTime(value) {
  if (!value) return '--'
  const [h, m] = String(value).split(':')
  const hour = Number(h)
  return `${((hour + 11) % 12) + 1}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}

function Field({ label, children }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</span>
      {children}
    </label>
  )
}

function TimeInput({ label, value, onChange }) {
  return (
    <Field label={label}>
      <input
        className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-ink outline-none transition focus:border-navy"
        onChange={e => onChange(e.target.value)}
        type="time"
        value={value || ''}
      />
    </Field>
  )
}

function NumberInput({ label, value, onChange, description }) {
  return (
    <div className="grid gap-1">
      <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</label>
      {description && <p className="text-xs text-muted/70">{description}</p>}
      <input
        className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-ink outline-none transition focus:border-navy"
        onChange={e => onChange(Number(e.target.value))}
        type="number"
        value={value ?? ''}
      />
    </div>
  )
}

function DayToggle({ label, activeValues = [], onToggle, accent = false }) {
  return (
    <div className="rounded-[1.25rem] border border-black/5 bg-stone-50 p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-navy-dark">{label}</div>
      <div className="flex flex-wrap gap-2">
        {DAY_OPTIONS.map(day => {
          const active = activeValues.includes(day.value)
          return (
            <button
              key={day.value}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
                active
                  ? accent
                    ? 'border-amber/40 bg-amber/15 text-amber-dark'
                    : 'border-navy/30 bg-navy/10 text-navy-dark'
                  : 'border-black/10 bg-white text-muted hover:bg-stone-100'
              }`}
              onClick={() => onToggle(day.value)}
              type="button"
            >
              {day.label}
            </button>
          )
        })}
      </div>
      <p className="mt-2.5 text-xs text-muted">
        {activeValues.length === 0
          ? 'None selected'
          : DAY_OPTIONS.filter(d => activeValues.includes(d.value)).map(d => d.label).join(', ')}
      </p>
    </div>
  )
}

export default function AdminOfficePanel({
  activeOffice,
  officeDraftWarning,
  updateDraft = () => {},
  toggleDay = () => {},
  handleUseMyLocation,
  handleSaveOffice = () => {},
  savePending = false,
  locationLoading = false,
  locationNotice = '',
  highlightLocationPin = false,
}) {
  const [activeTab, setActiveTab] = useState('location')

  if (!activeOffice) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-black/10 bg-stone-50 text-sm text-muted">
        Select an office from the list above to edit its settings.
      </div>
    )
  }

  const wp = activeOffice.workPolicy || {}

  return (
    <div className="grid gap-4">
      {/* Unsaved changes warning */}
      {officeDraftWarning && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {officeDraftWarning}
        </div>
      )}

      {/* Header row — basic info + tab switcher + save */}
      <div className="grid gap-4 rounded-[1.5rem] border border-black/5 bg-stone-50 p-4 lg:grid-cols-2 xl:grid-cols-[1fr_auto]">
        {/* Basic fields */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Office name">
            <input
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-ink outline-none transition focus:border-navy"
              onChange={e => updateDraft('name', e.target.value)}
              value={activeOffice.name || ''}
            />
          </Field>
          <Field label="Short name">
            <input
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-ink outline-none transition focus:border-navy"
              onChange={e => updateDraft('shortName', e.target.value)}
              value={activeOffice.shortName || ''}
            />
          </Field>
          <Field label="Office type">
            <select
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-ink outline-none transition focus:border-navy"
              onChange={e => updateDraft('officeType', e.target.value)}
              value={activeOffice.officeType || ''}
            >
              {OFFICE_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Location">
            <input
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-ink outline-none transition focus:border-navy"
              onChange={e => updateDraft('location', e.target.value)}
              value={activeOffice.location || ''}
            />
          </Field>
        </div>

        {/* Tab + Save */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end xl:flex-col xl:items-end">
          <div className="flex gap-2">
            {['location', 'schedule', 'attendance'].map(tab => (
              <button
                key={tab}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition capitalize ${
                  activeTab === tab
                    ? 'border-navy/30 bg-navy/10 text-navy-dark'
                    : 'border-black/10 bg-white text-ink hover:bg-stone-100'
                }`}
                onClick={() => setActiveTab(tab)}
                type="button"
              >
                {tab}
              </button>
            ))}
          </div>
          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-navy px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-dark disabled:opacity-60"
            disabled={savePending}
            onClick={handleSaveOffice}
            type="button"
          >
            {savePending ? (
              <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />Saving…</>
            ) : 'Save settings'}
          </button>
        </div>
      </div>

      {/* ── LOCATION TAB ── */}
      {activeTab === 'location' && (
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          {/* Map */}
          <div className="grid gap-3">
            <OfficeLocationPicker
              latitude={activeOffice.gps?.latitude}
              longitude={activeOffice.gps?.longitude}
              radiusMeters={activeOffice.gps?.radiusMeters}
              officeId={activeOffice.id}
              onChange={({ latitude, longitude }) => {
                updateDraft('gps.latitude', latitude)
                updateDraft('gps.longitude', longitude)
              }}
            />
            <div className="flex flex-wrap gap-3">
              <button
                className="rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-stone-50 disabled:opacity-50"
                disabled={locationLoading}
                onClick={handleUseMyLocation}
                type="button"
              >
                {locationLoading ? 'Getting location…' : '📍 Use my location'}
              </button>
              {locationNotice && (
                <span className="self-center rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-900">
                  {locationNotice}
                </span>
              )}
            </div>
          </div>

          {/* GPS + WiFi inputs */}
          <div className="grid content-start gap-3">
            <div className="rounded-[1.25rem] border border-black/5 bg-stone-50 p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-navy-dark">GPS coordinates</div>
              <div className="grid gap-3">
                <NumberInput
                  label="Latitude"
                  value={activeOffice.gps?.latitude}
                  onChange={v => updateDraft('gps.latitude', v)}
                />
                <NumberInput
                  label="Longitude"
                  value={activeOffice.gps?.longitude}
                  onChange={v => updateDraft('gps.longitude', v)}
                />
                <NumberInput
                  label="Radius (meters)"
                  description="Employees must be within this distance to clock in on-site."
                  value={activeOffice.gps?.radiusMeters}
                  onChange={v => updateDraft('gps.radiusMeters', v)}
                />
              </div>
            </div>
            <div className="rounded-[1.25rem] border border-black/5 bg-stone-50 p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-navy-dark">WiFi SSIDs (optional)</div>
              <p className="mb-2 text-xs text-muted">Comma-separated. Leave blank to skip WiFi validation.</p>
              <input
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-ink outline-none transition focus:border-navy"
                onChange={e => updateDraft('wifiSsid', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                placeholder="DILG-Main, DILG-Guest"
                value={Array.isArray(activeOffice.wifiSsid) ? activeOffice.wifiSsid.join(', ') : (activeOffice.wifiSsid || '')}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── SCHEDULE TAB ── */}
      {activeTab === 'schedule' && (
        <div className="grid gap-4 xl:grid-cols-2">
          {/* Left — time inputs */}
          <div className="grid gap-3">
            {/* Summary strip */}
            <div className="grid grid-cols-2 gap-3 rounded-[1.25rem] border border-black/5 bg-navy/5 p-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-muted">Morning</div>
                <div className="mt-1 text-sm font-semibold text-ink">
                  {formatTime(wp.morningIn)} → {formatTime(wp.morningOut)}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-muted">Afternoon</div>
                <div className="mt-1 text-sm font-semibold text-ink">
                  {formatTime(wp.afternoonIn)} → {formatTime(wp.afternoonOut)}
                </div>
              </div>
            </div>

            {/* Time fields — 2×2 grid */}
            <div className="rounded-[1.25rem] border border-black/5 bg-stone-50 p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-navy-dark">Session times</div>
              <div className="grid grid-cols-2 gap-3">
                <TimeInput label="AM Check-in" value={wp.morningIn}    onChange={v => updateDraft('workPolicy.morningIn', v)} />
                <TimeInput label="AM Check-out" value={wp.morningOut}   onChange={v => updateDraft('workPolicy.morningOut', v)} />
                <TimeInput label="PM Check-in"  value={wp.afternoonIn}  onChange={v => updateDraft('workPolicy.afternoonIn', v)} />
                <TimeInput label="PM Check-out" value={wp.afternoonOut} onChange={v => updateDraft('workPolicy.afternoonOut', v)} />
              </div>
            </div>

            {/* Grace period */}
            <div className="rounded-[1.25rem] border border-black/5 bg-stone-50 p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-navy-dark">Tardiness grace period</div>
              <NumberInput
                label="Grace period (minutes)"
                description="Scans within this window after AM check-in time are not counted as late."
                value={wp.gracePeriodMinutes ?? 0}
                onChange={v => updateDraft('workPolicy.gracePeriodMinutes', v)}
              />
            </div>
          </div>

          {/* Right — day selectors */}
          <div className="grid gap-3 content-start">
            <DayToggle
              label="Working days"
              activeValues={wp.workingDays || []}
              onToggle={day => toggleDay('workingDays', day)}
            />
            <DayToggle
              label="WFH days"
              activeValues={wp.wfhDays || []}
              onToggle={day => toggleDay('wfhDays', day)}
              accent
            />
            <div className="rounded-[1.25rem] border border-black/5 bg-stone-50 p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-navy-dark">Schedule label</div>
              <p className="mb-2 text-xs text-muted">Human-readable description shown on reports.</p>
              <input
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-ink outline-none transition focus:border-navy"
                onChange={e => updateDraft('workPolicy.schedule', e.target.value)}
                placeholder="Mon-Fri, 8:00 AM to 5:00 PM"
                value={wp.schedule || ''}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── SCAN RULES TAB ── */}
      {activeTab === 'attendance' && (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-[1.25rem] border border-black/5 bg-stone-50 p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-navy-dark">Check-in cooldown</div>
            <p className="mb-3 text-xs text-muted">
              Blocks a second successful check-in scan for the same employee within this window.
              Prevents accidental double-scans. Recommended: 20–30 min.
            </p>
            <NumberInput
              label="Minutes"
              value={wp.checkInCooldownMinutes ?? 30}
              onChange={v => updateDraft('workPolicy.checkInCooldownMinutes', v)}
            />
          </div>
          <div className="rounded-[1.25rem] border border-black/5 bg-stone-50 p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-navy-dark">Check-out cooldown</div>
            <p className="mb-3 text-xs text-muted">
              Blocks a second successful check-out scan within this window.
              Recommended: 3–5 min.
            </p>
            <NumberInput
              label="Minutes"
              value={wp.checkOutCooldownMinutes ?? 5}
              onChange={v => updateDraft('workPolicy.checkOutCooldownMinutes', v)}
            />
          </div>

          {/* Current policy readout */}
          <div className="rounded-[1.25rem] border border-navy/10 bg-navy/5 p-4 xl:col-span-2">
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-navy-dark">Current scan policy</div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: 'Check-in wait',   value: `${wp.checkInCooldownMinutes ?? 30} min` },
                { label: 'Check-out wait',  value: `${wp.checkOutCooldownMinutes ?? 5} min` },
                { label: 'Grace period',    value: `${wp.gracePeriodMinutes ?? 0} min` },
                { label: 'Working days',    value: (wp.workingDays || []).length === 0 ? 'None' : DAY_OPTIONS.filter(d => (wp.workingDays || []).includes(d.value)).map(d => d.label).join(', ') },
              ].map(item => (
                <div key={item.label} className="rounded-xl border border-black/5 bg-white px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-widest text-muted">{item.label}</div>
                  <div className="mt-1 text-base font-bold text-ink">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

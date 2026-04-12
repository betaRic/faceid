'use client'

import { useState } from 'react'
import OfficeLocationPicker from './OfficeLocationPicker'

const dayOptions = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
]

const officeTypeOptions = [
  'Regional Office',
  'Provincial Office',
  'HUC Office',
]

const officeTabs = [
  { id: 'location', label: 'Location' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'attendance', label: 'Scan rules' },
]

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
      <div className="rounded-2xl border border-dashed border-black/10 bg-stone-50 px-4 py-10 text-center text-sm text-muted">
        No office selected.
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      {officeDraftWarning ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {officeDraftWarning}
        </div>
      ) : null}

      <section className="grid gap-4 rounded-[1.5rem] border border-black/5 bg-stone-50 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Office name">
            <input
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy"
              onChange={event => updateDraft('name', event.target.value)}
              value={activeOffice.name}
            />
          </Field>
          <Field label="Short name">
            <input
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy"
              onChange={event => updateDraft('shortName', event.target.value)}
              value={activeOffice.shortName || ''}
            />
          </Field>
          <Field label="Office type">
            <select
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy"
              onChange={event => updateDraft('officeType', event.target.value)}
              value={activeOffice.officeType}
            >
              {officeTypeOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </Field>
          <Field label="Location">
            <input
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy"
              onChange={event => updateDraft('location', event.target.value)}
              value={activeOffice.location}
            />
          </Field>
        </div>

        <div className="flex flex-col gap-3 lg:items-end">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:min-w-[340px]">
            {officeTabs.map(tab => (
              <button
                key={tab.id}
                className={`rounded-[1rem] border px-4 py-2.5 text-sm font-semibold transition sm:rounded-full ${
                  activeTab === tab.id
                    ? 'border-navy/30 bg-navy/10 text-navy-dark'
                    : 'border-black/10 bg-white text-ink hover:bg-stone-50'
                }`}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[1rem] bg-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-navy-dark disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-full"
            disabled={savePending}
            onClick={handleSaveOffice}
            type="button"
          >
            {savePending ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Saving...
              </>
            ) : 'Save office settings'}
          </button>
        </div>
      </section>

      {activeTab === 'location' ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_420px]">
          <div>
            <DataSection
              description="Map and geofence values used for on-site validation."
              title="Location"
            >
              <OfficeLocationPicker
                latitude={activeOffice.gps.latitude}
                longitude={activeOffice.gps.longitude}
                highlightPin={highlightLocationPin}
                onChange={({ latitude, longitude }) => {
                  updateDraft('gps.latitude', latitude)
                  updateDraft('gps.longitude', longitude)
                }}
                radiusMeters={activeOffice.gps.radiusMeters}
                officeId={activeOffice.id}
              />
            </DataSection>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <button
                className="inline-flex min-h-12 items-center justify-center rounded-[1rem] border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-stone-50 sm:rounded-full"
                onClick={handleUseMyLocation}
                type="button"
                disabled={locationLoading}
              >
                {locationLoading ? 'Getting location...' : 'Use my location'}
              </button>
              <div className="rounded-[1rem] bg-navy/8 px-4 py-3 text-sm text-navy-dark sm:rounded-full">
                Click on the map to place the office pin and adjust the geofence.
              </div>
            </div>
            {locationNotice ? (
              <div className="mt-3 rounded-[1rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                {locationNotice}
              </div>
            ) : null}
          </div>

          <DataTable
            rows={[
              {
                label: 'Latitude',
                description: 'Geofence center latitude.',
                control: <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy" onChange={event => updateDraft('gps.latitude', Number(event.target.value))} step="0.0001" type="number" value={activeOffice.gps.latitude} />,
              },
              {
                label: 'Longitude',
                description: 'Geofence center longitude.',
                control: <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy" onChange={event => updateDraft('gps.longitude', Number(event.target.value))} step="0.0001" type="number" value={activeOffice.gps.longitude} />,
              },
              {
                label: 'Radius meters',
                description: 'Allowed on-site radius for kiosk scans.',
                control: <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy" onChange={event => updateDraft('gps.radiusMeters', Number(event.target.value))} type="number" value={activeOffice.gps.radiusMeters} />,
              },
              {
                label: 'WiFi SSIDs',
                description: 'Accepts multiple networks separated by commas. Leave empty to skip WiFi validation.',
                control: <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy" onChange={event => updateDraft('wifiSsid', event.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="DILG-Main, DILG-Guest, DILG-Staff" type="text" value={Array.isArray(activeOffice.wifiSsid) ? activeOffice.wifiSsid.join(', ') : String(activeOffice.wifiSsid || '')} />,
              },
            ]}
            title="Location data"
          />
        </div>
      ) : null}

      {activeTab === 'schedule' ? (
        <div className="grid gap-5">
          <DataSection
            description="Generated from the configured work days and AM/PM duty times."
            title="Schedule summary"
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <InfoCard label="Working days" value={formatCompactDays(activeOffice.workPolicy.workingDays)} />
              <InfoCard label="WFH days" value={formatCompactDays(activeOffice.workPolicy.wfhDays)} />
              <InfoCard
                label="Morning session"
                value={`${formatTime(activeOffice.workPolicy.morningIn)} to ${formatTime(activeOffice.workPolicy.morningOut)}`}
              />
              <InfoCard
                label="Afternoon session"
                value={`${formatTime(activeOffice.workPolicy.afternoonIn)} to ${formatTime(activeOffice.workPolicy.afternoonOut)}`}
              />
            </div>
          </DataSection>

          <DataTable
            rows={[
              {
                label: 'Grace period',
                description: 'Allowed late buffer before tardiness counts.',
                control: <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy" onChange={event => updateDraft('workPolicy.gracePeriodMinutes', Number(event.target.value))} type="number" value={activeOffice.workPolicy.gracePeriodMinutes} />,
              },
              {
                label: 'AM in',
                description: 'Morning expected check-in time.',
                control: <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy" onChange={event => updateDraft('workPolicy.morningIn', event.target.value)} type="time" value={activeOffice.workPolicy.morningIn} />,
              },
              {
                label: 'AM out',
                description: 'Morning expected check-out time.',
                control: <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy" onChange={event => updateDraft('workPolicy.morningOut', event.target.value)} type="time" value={activeOffice.workPolicy.morningOut} />,
              },
              {
                label: 'PM in',
                description: 'Afternoon expected check-in time.',
                control: <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy" onChange={event => updateDraft('workPolicy.afternoonIn', event.target.value)} type="time" value={activeOffice.workPolicy.afternoonIn} />,
              },
              {
                label: 'PM out',
                description: 'Afternoon expected check-out time.',
                control: <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy" onChange={event => updateDraft('workPolicy.afternoonOut', event.target.value)} type="time" value={activeOffice.workPolicy.afternoonOut} />,
              },
            ]}
            title="Schedule data"
          />

          <div className="grid gap-5 lg:grid-cols-2">
            <TagEditor
              activeValues={activeOffice.workPolicy.workingDays}
              label="Working days"
              onToggle={day => toggleDay('workingDays', day)}
            />
            <TagEditor
              activeValues={activeOffice.workPolicy.wfhDays}
              label="WFH days"
              onToggle={day => toggleDay('wfhDays', day)}
              tone="accent"
            />
          </div>
        </div>
      ) : null}

      {activeTab === 'attendance' ? (
        <div className="grid gap-5">
          <DataTable
            rows={[
              {
                label: 'Check-in cooldown',
                description: 'Blocks repeated successful IN scans for the same employee.',
                control: <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy" onChange={event => updateDraft('workPolicy.checkInCooldownMinutes', Number(event.target.value))} type="number" value={activeOffice.workPolicy.checkInCooldownMinutes ?? 30} />,
              },
              {
                label: 'Check-out cooldown',
                description: 'Blocks repeated successful OUT scans for the same employee.',
                control: <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy" onChange={event => updateDraft('workPolicy.checkOutCooldownMinutes', Number(event.target.value))} type="number" value={activeOffice.workPolicy.checkOutCooldownMinutes ?? 5} />,
              },
            ]}
            title="Scan rules"
          />

          <div className="rounded-[1.4rem] border border-black/5 bg-stone-50 p-4">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-navy-dark">Current scan policy</span>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <PolicyBadge label="Check-in wait" value={`${activeOffice.workPolicy.checkInCooldownMinutes ?? 30} min`} />
              <PolicyBadge label="Check-out wait" value={`${activeOffice.workPolicy.checkOutCooldownMinutes ?? 5} min`} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function DataSection({ title, description, children }) {
  return (
    <section className="rounded-[1.4rem] border border-black/5 bg-white p-4">
      <div className="mb-4">
        <div className="text-sm font-semibold text-ink">{title}</div>
        {description ? <div className="mt-1 text-sm text-muted">{description}</div> : null}
      </div>
      {children}
    </section>
  )
}

function DataTable({ title, rows }) {
  return (
    <section className="overflow-hidden rounded-[1.4rem] border border-black/5 bg-white">
      <div className="border-b border-black/5 px-4 py-4">
        <div className="text-sm font-semibold text-ink">{title}</div>
      </div>
      <div className="divide-y divide-black/5">
        {rows.map(row => (
          <div key={row.label} className="grid gap-3 px-4 py-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-center">
            <div>
              <div className="text-sm font-semibold text-ink">{row.label}</div>
              <div className="mt-1 text-sm leading-6 text-muted">{row.description}</div>
            </div>
            <div>{row.control}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function TagEditor({ label, activeValues, onToggle, tone = 'brand' }) {
  const activeClass = tone === 'accent'
    ? 'border-accent/40 bg-accent/10 text-ink'
    : 'border-navy/40 bg-navy/10 text-navy-dark'

  return (
    <section className="rounded-[1.4rem] border border-black/5 bg-white p-4">
      <div className="text-sm font-semibold text-ink">{label}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {dayOptions.map(day => (
          <button
            key={`${label}-${day.value}`}
            className={`rounded-full border px-4 py-2 text-sm transition ${activeValues.includes(day.value) ? activeClass : 'border-black/10 bg-white text-muted'}`}
            onClick={() => onToggle(day.value)}
            type="button"
          >
            {day.label}
          </button>
        ))}
      </div>
    </section>
  )
}

function PolicyBadge({ label, value }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white px-4 py-4">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-navy-dark">{label}</div>
      <div className="mt-2 text-lg font-semibold text-ink">{value}</div>
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

function InfoCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white px-4 py-4">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-navy-dark">{label}</div>
      <div className="mt-2 text-sm font-semibold text-ink">{value}</div>
    </div>
  )
}

function formatCompactDays(values = []) {
  if (!values.length) return 'None'

  return dayOptions
    .filter(day => values.includes(day.value))
    .map(day => day.label)
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


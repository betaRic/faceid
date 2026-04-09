'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

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

const officeTabs = [
  { id: 'location', label: 'Location' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'attendance', label: 'Attendance' },
]

export default function AdminOfficePanel({
  activeOffice,
  officeDraftWarning,
  updateDraft,
  toggleDay,
  handleUseMyLocation,
  handleSaveOffice,
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
    <div className="grid max-h-[62vh] gap-4 overflow-auto pr-1 sm:gap-5">
      {officeDraftWarning ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {officeDraftWarning}
        </div>
      ) : null}

      <section className="rounded-[1.4rem] border border-black/5 bg-stone-50 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">Office record</span>
            <h3 className="mt-2 font-display text-2xl text-ink">{activeOffice.name}</h3>
            <p className="mt-1 text-sm text-muted">{activeOffice.officeType} • {activeOffice.location}</p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {officeTabs.map(tab => (
              <button
                key={tab.id}
                className={`rounded-[1rem] border px-4 py-2.5 text-sm font-semibold transition sm:rounded-full ${
                  activeTab === tab.id
                    ? 'border-brand/30 bg-brand/10 text-brand-dark'
                    : 'border-black/10 bg-white text-ink hover:bg-stone-50'
                }`}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {activeTab === 'location' ? (
        <div className="grid gap-5">
          <div className="md:col-span-2">
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
              <div className="rounded-[1rem] bg-brand/8 px-4 py-3 text-sm text-brand-dark sm:rounded-full">
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
                label: 'Office name',
                description: 'Primary display name used in admin and kiosk records.',
                control: <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" onChange={event => updateDraft('name', event.target.value)} value={activeOffice.name} />,
              },
              {
                label: 'Location label',
                description: 'Short place label shown in office lists.',
                control: <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" onChange={event => updateDraft('location', event.target.value)} value={activeOffice.location} />,
              },
              {
                label: 'Latitude',
                description: 'Geofence center latitude.',
                control: <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" onChange={event => updateDraft('gps.latitude', Number(event.target.value))} step="0.0001" type="number" value={activeOffice.gps.latitude} />,
              },
              {
                label: 'Longitude',
                description: 'Geofence center longitude.',
                control: <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" onChange={event => updateDraft('gps.longitude', Number(event.target.value))} step="0.0001" type="number" value={activeOffice.gps.longitude} />,
              },
              {
                label: 'Radius meters',
                description: 'Allowed on-site radius for kiosk scans.',
                control: <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" onChange={event => updateDraft('gps.radiusMeters', Number(event.target.value))} type="number" value={activeOffice.gps.radiusMeters} />,
              },
            ]}
            title="Location data"
          />
        </div>
      ) : null}

      {activeTab === 'schedule' ? (
        <div className="grid gap-5">
          <DataTable
            rows={[
              {
                label: 'Schedule label',
                description: 'Human-readable office schedule.',
                control: <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" onChange={event => updateDraft('workPolicy.schedule', event.target.value)} value={activeOffice.workPolicy.schedule} />,
              },
              {
                label: 'Grace period',
                description: 'Allowed late buffer before tardiness counts.',
                control: <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" onChange={event => updateDraft('workPolicy.gracePeriodMinutes', Number(event.target.value))} type="number" value={activeOffice.workPolicy.gracePeriodMinutes} />,
              },
              {
                label: 'AM in',
                description: 'Morning expected check-in time.',
                control: <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" onChange={event => updateDraft('workPolicy.morningIn', event.target.value)} type="time" value={activeOffice.workPolicy.morningIn} />,
              },
              {
                label: 'AM out',
                description: 'Morning expected check-out time.',
                control: <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" onChange={event => updateDraft('workPolicy.morningOut', event.target.value)} type="time" value={activeOffice.workPolicy.morningOut} />,
              },
              {
                label: 'PM in',
                description: 'Afternoon expected check-in time.',
                control: <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" onChange={event => updateDraft('workPolicy.afternoonIn', event.target.value)} type="time" value={activeOffice.workPolicy.afternoonIn} />,
              },
              {
                label: 'PM out',
                description: 'Afternoon expected check-out time.',
                control: <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" onChange={event => updateDraft('workPolicy.afternoonOut', event.target.value)} type="time" value={activeOffice.workPolicy.afternoonOut} />,
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
                control: <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" onChange={event => updateDraft('workPolicy.checkInCooldownMinutes', Number(event.target.value))} type="number" value={activeOffice.workPolicy.checkInCooldownMinutes ?? 30} />,
              },
              {
                label: 'Check-out cooldown',
                description: 'Blocks repeated successful OUT scans for the same employee.',
                control: <input className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand" onChange={event => updateDraft('workPolicy.checkOutCooldownMinutes', Number(event.target.value))} type="number" value={activeOffice.workPolicy.checkOutCooldownMinutes ?? 5} />,
              },
            ]}
            title="Attendance rules"
          />

          <div className="rounded-[1.4rem] border border-black/5 bg-stone-50 p-4">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">Current policy</span>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <PolicyBadge label="Check-in wait" value={`${activeOffice.workPolicy.checkInCooldownMinutes ?? 30} min`} />
              <PolicyBadge label="Check-out wait" value={`${activeOffice.workPolicy.checkOutCooldownMinutes ?? 5} min`} />
            </div>
          </div>
        </div>
      ) : null}

      <div className="sticky bottom-0 z-10 bg-gradient-to-t from-[#f8f4ed] via-[#f8f4ed]/96 to-transparent pt-3">
        <button className="inline-flex min-h-12 w-full items-center justify-center rounded-[1rem] bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark sm:rounded-full" onClick={handleSaveOffice} type="button">
          Save office settings
        </button>
      </div>
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
    : 'border-brand/40 bg-brand/10 text-brand-dark'

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
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-dark">{label}</div>
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

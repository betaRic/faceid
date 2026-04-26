'use client'

/**
 * AdminOfficePanel
 *
 * Fixes:
 * 1. Removed tab-based navigation. All settings visible without switching tabs.
 *    WFH days were hidden in the "schedule" tab — users couldn't find it.
 * 2. Grid layout prevents scrolling on desktop for the schedule section.
 * 3. WFH and Working Days shown side by side.
 * 4. Save button always visible at the top.
 */

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

const OFFICE_TYPE_OPTIONS = ['Regional Office', 'Provincial Office', 'HUC Office']

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
        className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-navy"
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
        className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-navy"
        onChange={e => onChange(Number(e.target.value))}
        type="number"
        value={value ?? ''}
      />
    </div>
  )
}

function DayToggle({ label, activeValues = [], onToggle, accent = false }) {
  return (
    <div className="rounded-[1.25rem] border border-black/5 bg-stone-50 p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-navy-dark">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {DAY_OPTIONS.map(day => {
          const active = activeValues.includes(day.value)
          return (
            <button
              key={day.value}
              className={`rounded-full border px-3 py-1 text-sm font-semibold transition ${
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
      <p className="mt-1.5 text-xs text-muted">
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
  addDivision = () => {},
  updateDivision = () => {},
  removeDivision = () => {},
  handleUseMyLocation,
  locationLoading = false,
  locationNotice = '',
  highlightLocationPin = false,
}) {
  if (!activeOffice) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-black/10 bg-stone-50 text-sm text-muted">
        Select an office from the list above to edit its settings.
      </div>
    )
  }

  const wp = activeOffice.workPolicy || {}
  const isRegional = String(activeOffice.officeType || '') === 'Regional Office'
  const divisions = Array.isArray(activeOffice.divisions) ? activeOffice.divisions : []

  return (
    <div className="grid gap-4">
      {/* ── Identity: name, code, short name, type ── */}
      <div className="grid gap-3 rounded-[1.5rem] border border-black/5 bg-stone-50 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Office name">
          <input
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-navy"
            onChange={e => updateDraft('name', e.target.value)}
            value={activeOffice.name || ''}
          />
        </Field>
        <Field label="Code">
          <input
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-navy"
            onChange={e => updateDraft('code', e.target.value)}
            value={activeOffice.code || ''}
          />
        </Field>
        <Field label="Short name">
          <input
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-navy"
            onChange={e => updateDraft('shortName', e.target.value)}
            value={activeOffice.shortName || ''}
          />
        </Field>
        <Field label="Office type">
          <select
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-navy"
            onChange={e => updateDraft('officeType', e.target.value)}
            value={activeOffice.officeType || ''}
          >
            {OFFICE_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
      </div>
      {officeDraftWarning ? (
        <p className="-mt-2 px-1 text-xs text-amber-600">{officeDraftWarning}</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Province / city">
          <input
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-navy"
            onChange={e => updateDraft('provinceOrCity', e.target.value)}
            value={activeOffice.provinceOrCity || ''}
          />
        </Field>
        <Field label="Location label">
          <input
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-navy"
            onChange={e => updateDraft('location', e.target.value)}
            value={activeOffice.location || ''}
          />
        </Field>
      </div>

      {/* ── Office head (signs DTRs unless overridden by a division head) ── */}
      <div className="grid gap-3 rounded-[1.25rem] border border-black/5 bg-stone-50 p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-navy-dark">
          Office head{isRegional ? ' — Regional Director' : ''}
        </div>
        <p className="text-xs text-muted">
          {isRegional
            ? 'Signs DTRs only for staff under the ORD or any division/unit without a configured head. Per-division heads override this for their division\'s staff.'
            : 'Name and position printed at the bottom of every DTR for this office.'}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Head name">
            <input
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-navy uppercase"
              onChange={e => updateDraft('headName', e.target.value.toUpperCase())}
              placeholder="MARIA THERESA D. BAUTISTA"
              value={activeOffice.headName || ''}
            />
          </Field>
          <Field label="Head position">
            <input
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-navy"
              onChange={e => updateDraft('headPosition', e.target.value)}
              placeholder="City Director/LGOO VII"
              value={activeOffice.headPosition || ''}
            />
          </Field>
        </div>
      </div>

      {/* ── Divisions / Units (Regional Office only) ── */}
      {isRegional ? (
        <div className="grid gap-3 rounded-[1.25rem] border border-black/5 bg-stone-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-navy-dark">Divisions / Units</div>
              <p className="mt-1 text-xs text-muted">
                Each division or unit chief signs the DTR for staff assigned to that division.
              </p>
            </div>
            <button
              className="rounded-full border border-navy/30 bg-white px-4 py-2 text-xs font-semibold text-navy transition hover:bg-navy/5"
              onClick={addDivision}
              type="button"
            >
              + Add division
            </button>
          </div>

          {divisions.length === 0 ? (
            <div className="rounded-[1rem] border border-dashed border-black/10 bg-white px-4 py-3 text-xs text-muted">
              No divisions added yet. Click "Add division" to start.
            </div>
          ) : (
            <div className="grid gap-2">
              {divisions.map((division, index) => (
                <div
                  key={index}
                  className="grid gap-2 rounded-[1rem] border border-black/5 bg-white p-3 sm:grid-cols-[110px_minmax(0,1.5fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_auto]"
                >
                  <input
                    className="w-full rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm text-ink outline-none transition focus:border-navy uppercase"
                    onChange={e => updateDivision(index, 'shortName', e.target.value.toUpperCase())}
                    placeholder="LGCDD"
                    value={division.shortName || ''}
                  />
                  <input
                    className="w-full rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm text-ink outline-none transition focus:border-navy"
                    onChange={e => updateDivision(index, 'name', e.target.value)}
                    placeholder="Local Government Capability and Development Division"
                    value={division.name || ''}
                  />
                  <input
                    className="w-full rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm text-ink outline-none transition focus:border-navy uppercase"
                    onChange={e => updateDivision(index, 'headName', e.target.value.toUpperCase())}
                    placeholder="MARY ANN T. TRASPE"
                    value={division.headName || ''}
                  />
                  <input
                    className="w-full rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm text-ink outline-none transition focus:border-navy"
                    onChange={e => updateDivision(index, 'headPosition', e.target.value)}
                    placeholder="Division Chief / LGOO VII"
                    value={division.headPosition || ''}
                  />
                  <button
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                    onClick={() => removeDivision(index)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <div className="grid grid-cols-[110px_minmax(0,1.5fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_auto] gap-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                <span>Short</span>
                <span>Full name</span>
                <span>Head name</span>
                <span>Head position</span>
                <span />
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* ── Main grid: Location | Schedule | Cooldowns ── */}
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">

        {/* ── LOCATION ── */}
        <div className="grid gap-3 content-start">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-navy-dark">GPS Location</div>
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
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-stone-50 disabled:opacity-50"
              disabled={locationLoading}
              onClick={handleUseMyLocation}
              type="button"
            >
              {locationLoading ? 'Getting location…' : '📍 Use my location'}
            </button>
            {locationNotice && (
              <span className="self-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900">
                {locationNotice}
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
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
              label="Radius (m)"
              value={activeOffice.gps?.radiusMeters}
              onChange={v => updateDraft('gps.radiusMeters', v)}
            />
          </div>
          <div className="rounded-[1.25rem] border border-black/5 bg-stone-50 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-navy-dark">WiFi SSIDs (optional)</div>
            <p className="mb-2 text-xs text-muted">Comma-separated. Leave blank to skip WiFi check.</p>
            <input
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-navy"
              onChange={e => updateDraft('wifiSsid', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              placeholder="DILG-Main, DILG-Guest"
              value={Array.isArray(activeOffice.wifiSsid) ? activeOffice.wifiSsid.join(', ') : (activeOffice.wifiSsid || '')}
            />
          </div>
        </div>

        {/* ── SCHEDULE + WFH + COOLDOWNS ── */}
        <div className="grid gap-3 content-start">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-navy-dark">Work Schedule</div>

          {/* Schedule label */}
          <Field label="Schedule label">
            <input
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-navy"
              onChange={e => updateDraft('workPolicy.schedule', e.target.value)}
              placeholder="Mon-Fri, 8:00 AM to 5:00 PM"
              value={wp.schedule || ''}
            />
          </Field>

          {/* Session times — 2×2 grid, no scroll */}
          <div className="rounded-[1.25rem] border border-black/5 bg-stone-50 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-navy-dark">
              Session times
              <span className="ml-2 text-muted font-normal">
                {formatTime(wp.morningIn)} → {formatTime(wp.morningOut)} | {formatTime(wp.afternoonIn)} → {formatTime(wp.afternoonOut)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <TimeInput label="AM Check-in"  value={wp.morningIn}    onChange={v => updateDraft('workPolicy.morningIn', v)} />
              <TimeInput label="AM Check-out" value={wp.morningOut}   onChange={v => updateDraft('workPolicy.morningOut', v)} />
              <TimeInput label="PM Check-in"  value={wp.afternoonIn}  onChange={v => updateDraft('workPolicy.afternoonIn', v)} />
              <TimeInput label="PM Check-out" value={wp.afternoonOut} onChange={v => updateDraft('workPolicy.afternoonOut', v)} />
            </div>
          </div>

          {/* Working days & WFH days — side by side */}
          <div className="grid grid-cols-2 gap-2">
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
          </div>

          {/* Grace period */}
          <NumberInput
            label="Grace period (minutes)"
            description="Scans within this window after AM check-in time are not marked late."
            value={wp.gracePeriodMinutes ?? 0}
            onChange={v => updateDraft('workPolicy.gracePeriodMinutes', v)}
          />

          {/* Cooldowns */}
          <div className="grid grid-cols-2 gap-2">
            <NumberInput
              label="Check-in cooldown (min)"
              description="Block duplicate check-in within this window."
              value={wp.checkInCooldownMinutes ?? 30}
              onChange={v => updateDraft('workPolicy.checkInCooldownMinutes', v)}
            />
            <NumberInput
              label="Check-out cooldown (min)"
              description="Block duplicate check-out within this window."
              value={wp.checkOutCooldownMinutes ?? 5}
              onChange={v => updateDraft('workPolicy.checkOutCooldownMinutes', v)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useOffices } from '@/lib/admin/hooks/useOffices'
import OfficeEditorModal from '@/components/admin/OfficeEditorModal'

const DAY_LABELS = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
}

function formatDays(values = []) {
  return values.length > 0
    ? values.map(value => DAY_LABELS[value] || String(value)).join(', ')
    : 'None'
}

function formatScheduleSummary(office) {
  return office?.workPolicy?.schedule || 'No schedule set'
}

function formatGeofenceSummary(office) {
  const city = office?.provinceOrCity || office?.location || 'No location'
  const radius = Number.isFinite(office?.gps?.radiusMeters) ? `${office.gps.radiusMeters} m` : 'No radius'
  return { city, radius }
}

function StatusPill({ status }) {
  const active = (status || 'active') === 'active'
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
      active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
    }`}>
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

export default function OfficePanel() {
  const {
    officesLoaded,
    visibleOffices,
    selectedOfficeId,
    setSelectedOfficeId,
    activeOffice,
    draftOffice,
    officeDraftWarning,
    officeDraftDirty,
    locationLoading,
    locationNotice,
    highlightLocationPin,
    savePending,
    deletePending,
    updateDraft,
    toggleDay,
    addDivision,
    updateDivision,
    removeDivision,
    handleSaveOffice,
    handleStartCreateOffice,
    handleStartEditOffice,
    handleCancelOfficeEditor,
    handleDeleteOffice,
    handleUseMyLocation,
  } = useOffices()

  const handleEditOffice = officeId => {
    setSelectedOfficeId(officeId)
    handleStartEditOffice(officeId)
  }

  const handleCreateOffice = () => {
    handleStartCreateOffice()
  }

  const handleDelete = office => {
    const confirmed = window.confirm(`Delete ${office.name}? This only works when the office has no linked employees, admins, or attendance history.`)
    if (!confirmed) return
    handleDeleteOffice(office.id)
  }

  if (!officesLoaded) {
    return (
      <section className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-navy border-t-transparent" />
      </section>
    )
  }

  return (
    <>
      <section className="flex min-h-0 flex-col bg-white p-3 sm:p-6 md:h-full md:overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-black/5 pb-3 sm:flex-row sm:items-end sm:justify-between sm:pb-5">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-navy-dark">Office</div>
            <h2 className="mt-1 font-display text-2xl text-ink sm:mt-2 sm:text-3xl">Office list</h2>
            <p className="mt-2 hidden text-sm leading-7 text-muted sm:block">
              Manage offices from one table. Edit opens a modal. Delete stays in the action column.
            </p>
          </div>
          <button
            className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-navy px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-dark"
            onClick={handleCreateOffice}
            type="button"
          >
            Add office
          </button>
        </div>

        <div className="md:min-h-0 md:flex-1 md:overflow-auto">
          <div className="divide-y divide-black/5 bg-white lg:hidden">
            {visibleOffices.map(office => {
              const geofence = formatGeofenceSummary(office)
              const selected = office.id === selectedOfficeId

              return (
                <div key={office.id} className={`grid gap-3 px-4 py-4 ${selected ? 'bg-navy/5' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-navy-dark">
                        {office.code || office.shortName || office.id}
                      </div>
                      <div className="mt-1 text-base font-semibold text-ink">{office.name}</div>
                      <div className="mt-1 text-sm text-muted">
                        {office.shortName || '--'} · {office.provinceOrCity || office.location || 'No city'}
                      </div>
                    </div>
                    <StatusPill status={office.status} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-xl bg-stone-50 px-3 py-2">
                      <div className="text-[11px] uppercase tracking-widest text-muted">Type</div>
                      <div className="mt-1 text-ink">{office.officeType || '--'}</div>
                    </div>
                    <div className="rounded-xl bg-stone-50 px-3 py-2">
                      <div className="text-[11px] uppercase tracking-widest text-muted">Employees</div>
                      <div className="mt-1 text-ink">{office.employees || 0}</div>
                    </div>
                    <div className="col-span-2 rounded-xl bg-stone-50 px-3 py-2">
                      <div className="text-[11px] uppercase tracking-widest text-muted">Geofence</div>
                      <div className="mt-1 text-ink">{geofence.city}</div>
                      <div className="mt-1 text-xs text-muted">Radius {geofence.radius}</div>
                    </div>
                    <div className="col-span-2 rounded-xl bg-stone-50 px-3 py-2">
                      <div className="text-[11px] uppercase tracking-widest text-muted">Schedule</div>
                      <div className="mt-1 text-ink">{formatScheduleSummary(office)}</div>
                      <div className="mt-1 text-xs text-muted">WFH {formatDays(office.workPolicy?.wfhDays || [])}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-stone-100"
                      onClick={() => handleEditOffice(office.id)}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                      disabled={deletePending}
                      onClick={() => handleDelete(office)}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <table className="hidden w-full text-left text-sm lg:table">
            <thead className="bg-stone-50 text-xs uppercase tracking-[0.16em] text-muted">
              <tr>
                <th className="px-5 py-4">Code</th>
                <th className="px-5 py-4">Office</th>
                <th className="px-5 py-4">Type</th>
                <th className="px-5 py-4">Geofence</th>
                <th className="px-5 py-4">Schedule</th>
                <th className="px-5 py-4">Employees</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {visibleOffices.map(office => {
                const geofence = formatGeofenceSummary(office)
                const selected = office.id === selectedOfficeId

                return (
                  <tr key={office.id} className={`transition hover:bg-sky-light/40 ${selected ? 'bg-navy/5' : ''}`}>
                    <td className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-navy-dark">
                      {office.code || office.shortName || office.id}
                    </td>
                    <td className="px-5 py-4 align-top">
                      <div className="max-w-[280px] font-semibold leading-6 text-ink">{office.name}</div>
                      <div className="mt-1 text-xs text-muted">
                        {office.shortName || '--'} · {office.provinceOrCity || office.location || 'No city'}
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top text-muted">{office.officeType || '--'}</td>
                    <td className="px-5 py-4 align-top text-muted">
                      <div>{geofence.city}</div>
                      <div className="mt-1 text-xs text-muted/80">Radius {geofence.radius}</div>
                    </td>
                    <td className="px-5 py-4 align-top text-muted">
                      <div className="max-w-[240px] leading-6">{formatScheduleSummary(office)}</div>
                      <div className="mt-1 text-xs text-muted/80">WFH {formatDays(office.workPolicy?.wfhDays || [])}</div>
                    </td>
                    <td className="px-5 py-4 text-muted">{office.employees || 0}</td>
                    <td className="px-5 py-4">
                      <StatusPill status={office.status} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-stone-100"
                          onClick={() => handleEditOffice(office.id)}
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                          disabled={deletePending}
                          onClick={() => handleDelete(office)}
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {draftOffice ? (
        <OfficeEditorModal
          activeOffice={activeOffice}
          addDivision={addDivision}
          handleCancel={handleCancelOfficeEditor}
          handleSaveOffice={handleSaveOffice}
          handleUseMyLocation={handleUseMyLocation}
          highlightLocationPin={highlightLocationPin}
          locationLoading={locationLoading}
          locationNotice={locationNotice}
          officeDraftDirty={officeDraftDirty}
          officeDraftWarning={officeDraftWarning}
          removeDivision={removeDivision}
          saveLabel={activeOffice?.id && visibleOffices.some(office => office.id === activeOffice.id) ? 'Save changes' : 'Create office'}
          savePending={savePending}
          toggleDay={toggleDay}
          updateDivision={updateDivision}
          updateDraft={updateDraft}
        />
      ) : null}
    </>
  )
}

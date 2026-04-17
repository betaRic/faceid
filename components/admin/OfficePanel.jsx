'use client'

import { useEffect, useState } from 'react'
import { useAdminStore } from '@/lib/admin/store'
import { useOffices } from '@/lib/admin/hooks/useOffices'
import AdminOfficePanel from '@/components/AdminOfficePanel'

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
  const schedule = office?.workPolicy?.schedule
  if (schedule) return schedule
  return 'No schedule set'
}

function formatGeofenceSummary(office) {
  const city = office?.provinceOrCity || office?.location || 'No location'
  const radius = Number.isFinite(office?.gps?.radiusMeters) ? `${office.gps.radiusMeters} m` : 'No radius'
  return `${city} · ${radius}`
}

export default function OfficePanel() {
  const {
    officesLoaded,
    visibleOffices,
    selectedOfficeId,
    setSelectedOfficeId,
    selectedOffice,
    activeOffice,
    draftOffice,
    officeDraftWarning,
    locationLoading,
    locationNotice,
    highlightLocationPin,
    savePending,
    deletePending,
    updateDraft,
    toggleDay,
    handleSaveOffice,
    handleStartCreateOffice,
    handleStartEditOffice,
    handleCancelOfficeEditor,
    handleDeleteOffice,
    handleUseMyLocation,
  } = useOffices()
  const { setActivePanel } = useAdminStore()
  const [mobileView, setMobileView] = useState('list')

  useEffect(() => {
    if (!activeOffice && !selectedOffice) {
      setMobileView('list')
    }
  }, [activeOffice, selectedOffice])

  const handleSelectOffice = officeId => {
    setSelectedOfficeId(officeId)
    setActivePanel('office')
  }

  const handleEditOffice = officeId => {
    handleStartEditOffice(officeId)
    setActivePanel('office')
    setMobileView('editor')
  }

  const handleCreateOffice = () => {
    handleStartCreateOffice()
    setActivePanel('office')
    setMobileView('editor')
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
    <section className={`grid h-full min-h-0 gap-5 ${draftOffice ? 'xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.95fr)]' : ''}`}>
      <div className="xl:hidden">
        <div className="inline-flex rounded-full border border-black/5 bg-white p-1 shadow-sm">
          <button
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              mobileView === 'list'
                ? 'bg-navy text-white'
                : 'text-ink hover:bg-stone-100'
            }`}
            onClick={() => setMobileView('list')}
            type="button"
          >
            Office list
          </button>
          <button
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              mobileView === 'editor'
                ? 'bg-navy text-white'
                : 'text-ink hover:bg-stone-100'
            }`}
            onClick={() => setMobileView('editor')}
            type="button"
          >
            Editor
          </button>
        </div>
      </div>

      {/* Office list table */}
      <section className={`${mobileView === 'editor' ? 'hidden xl:flex' : 'flex'} overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-sm min-h-0 flex-col`}>
        <div className="flex flex-col gap-3 border-b border-black/5 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-navy-dark">Office</div>
            <h2 className="mt-2 font-display text-3xl text-ink">Office list</h2>
            <p className="mt-2 text-sm leading-7 text-muted">
              Start from the list. Add a new office or choose an existing one to view, edit, or delete.
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

        <div className="overflow-auto xl:min-h-0 xl:flex-1 xl:overflow-auto">
          <div className="divide-y divide-black/5 bg-white lg:hidden">
            {visibleOffices.map(office => {
              const selected = office.id === selectedOfficeId
              return (
                <div key={office.id} className="grid gap-3 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-navy-dark">
                        {office.code || office.shortName || office.id}
                      </div>
                      <div className="mt-1 text-base font-semibold text-ink">{office.name}</div>
                      <div className="mt-1 text-sm text-muted">{office.provinceOrCity || office.location}</div>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
                      (office.status || 'active') === 'active'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {(office.status || 'active') === 'active' ? 'Active' : 'Inactive'}
                    </span>
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
                      <div className="text-[11px] uppercase tracking-widest text-muted">Schedule</div>
                      <div className="mt-1 text-ink">{formatScheduleSummary(office)}</div>
                    </div>
                    <div className="col-span-2 rounded-xl bg-stone-50 px-3 py-2">
                      <div className="text-[11px] uppercase tracking-widest text-muted">Geofence</div>
                      <div className="mt-1 text-ink">{formatGeofenceSummary(office)}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={`inline-flex min-h-[44px] items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition ${
                        selected
                          ? 'border-navy/30 bg-navy/5 text-navy-dark'
                          : 'border-black/10 bg-white text-ink hover:bg-stone-100'
                      }`}
                      onClick={() => handleSelectOffice(office.id)}
                      type="button"
                    >
                      View
                    </button>
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
                const selected = office.id === selectedOfficeId
                return (
                  <tr
                    key={office.id}
                    className={`cursor-pointer transition hover:bg-sky-light/40 ${selected ? 'bg-navy/5' : ''}`}
                    onClick={() => handleSelectOffice(office.id)}
                  >
                    <td className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-navy-dark">
                      {office.code || office.shortName || office.id}
                    </td>
                    <td className="px-5 py-4 align-top">
                      <div className="max-w-[260px] font-semibold leading-6 text-ink">{office.name}</div>
                      <div className="mt-1 text-xs text-muted">
                        {office.shortName || '--'} · {office.provinceOrCity || office.location || 'No city'}
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top text-muted">{office.officeType}</td>
                    <td className="px-5 py-4 align-top text-muted">
                      <div>{office.provinceOrCity || office.location || 'No location'}</div>
                      <div className="mt-1 text-xs text-muted/80">
                        Radius {Number.isFinite(office.gps?.radiusMeters) ? `${office.gps.radiusMeters} m` : '--'}
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top text-muted">
                      <div className="max-w-[220px] leading-6">{formatScheduleSummary(office)}</div>
                      <div className="mt-1 text-xs text-muted/80">
                        WFH {formatDays(office.workPolicy?.wfhDays || [])}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-muted">{office.employees || 0}</td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
                        (office.status || 'active') === 'active'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {(office.status || 'active') === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          className={`inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition ${
                            selected
                              ? 'border-navy/30 bg-navy/5 text-navy-dark'
                              : 'border-black/10 bg-white text-ink hover:bg-stone-100'
                          }`}
                          onClick={e => {
                            e.stopPropagation()
                            handleSelectOffice(office.id)
                          }}
                          type="button"
                        >
                          View
                        </button>
                        <button
                          className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-stone-100"
                          onClick={e => {
                            e.stopPropagation()
                            handleEditOffice(office.id)
                          }}
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                          disabled={deletePending}
                          onClick={e => {
                            e.stopPropagation()
                            handleDelete(office)
                          }}
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

      {/* Office editor */}
      {draftOffice ? (
      <section className={`${mobileView === 'list' ? 'hidden xl:block' : 'block'} min-h-0 rounded-[2rem] border border-black/5 bg-white p-5 shadow-sm sm:p-6 xl:overflow-auto`}>
        <div className="mb-4 flex items-center justify-between gap-3 xl:hidden">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-navy-dark">
              {activeOffice?.id && visibleOffices.some(office => office.id === activeOffice.id) ? 'Edit office' : 'Add office'}
            </div>
            <div className="text-sm text-muted">{(draftOffice || selectedOffice)?.name || 'Create a new office or pick one from the list'}</div>
          </div>
          <button
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-stone-100"
            onClick={() => {
              handleCancelOfficeEditor()
              setMobileView('list')
            }}
            type="button"
          >
            Back to list
          </button>
        </div>
        {!activeOffice && !selectedOffice ? (
          <div className="flex h-full min-h-[280px] items-center justify-center rounded-[1.5rem] border border-dashed border-black/10 bg-stone-50 px-6 text-center">
            <div className="max-w-sm">
              <div className="text-sm font-semibold uppercase tracking-[0.2em] text-navy-dark">Office CRUD</div>
              <h3 className="mt-3 font-display text-2xl text-ink">Select first, then edit</h3>
              <p className="mt-3 text-sm leading-7 text-muted">
                Keep this workspace list-first. Choose an office to inspect it, edit it, or delete it. Use the add button to create a new office.
              </p>
              <button
                className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-full bg-navy px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-dark"
                onClick={handleCreateOffice}
                type="button"
              >
                Add office
              </button>
            </div>
          </div>
        ) : draftOffice ? (
          <AdminOfficePanel
            activeOffice={activeOffice}
            updateDraft={updateDraft}
            toggleDay={toggleDay}
            handleSaveOffice={handleSaveOffice}
            handleCancel={() => {
              handleCancelOfficeEditor()
              setMobileView('list')
            }}
            handleUseMyLocation={handleUseMyLocation}
            locationLoading={locationLoading}
            locationNotice={locationNotice}
            highlightLocationPin={highlightLocationPin}
            officeDraftWarning={officeDraftWarning}
            savePending={savePending}
            saveLabel={activeOffice?.id && visibleOffices.some(office => office.id === activeOffice.id) ? 'Save changes' : 'Create office'}
          />
        ) : null}
      </section>
      ) : null}
    </section>
  )
}

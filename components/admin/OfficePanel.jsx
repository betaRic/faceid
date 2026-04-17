'use client'

import { useEffect, useState } from 'react'
import { useAdminStore } from '@/lib/admin/store'
import { useOffices } from '@/lib/admin/hooks/useOffices'
import AdminOfficePanel from '@/components/AdminOfficePanel'

export default function OfficePanel() {
  const {
    officesLoaded,
    visibleOffices,
    selectedOfficeId,
    setSelectedOfficeId,
    activeOffice,
    officeDraftWarning,
    locationLoading,
    locationNotice,
    highlightLocationPin,
    savePending,
    updateDraft,
    toggleDay,
    handleSaveOffice,
    handleUseMyLocation,
  } = useOffices()
  const { setActivePanel } = useAdminStore()
  const [mobileView, setMobileView] = useState(selectedOfficeId ? 'editor' : 'list')

  useEffect(() => {
    if (!selectedOfficeId) {
      setMobileView('list')
    }
  }, [selectedOfficeId])

  const handleSelectOffice = officeId => {
    setSelectedOfficeId(officeId)
    setActivePanel('office')
    setMobileView('editor')
  }

  if (!officesLoaded) {
    return (
      <section className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-navy border-t-transparent" />
      </section>
    )
  }

  return (
    <section className="grid h-full min-h-0 gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
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
              Select an office below to edit its settings, GPS geofence, schedule, and WFH rules.
            </p>
          </div>
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
                  </div>
                  <button
                    className={`inline-flex min-h-[44px] items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition ${
                      selected
                        ? 'border-navy/30 bg-navy text-white'
                        : 'border-black/10 bg-white text-ink hover:bg-stone-100'
                    }`}
                    onClick={() => handleSelectOffice(office.id)}
                    type="button"
                  >
                    {selected ? 'Editing this office' : 'Edit office'}
                  </button>
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
                <th className="px-5 py-4">Province / City</th>
                <th className="px-5 py-4">Employees</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Action</th>
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
                    <td className="px-5 py-4">
                      <div className="font-semibold text-ink">{office.name}</div>
                      <div className="text-xs text-muted">{office.location}</div>
                    </td>
                    <td className="px-5 py-4 text-muted">{office.officeType}</td>
                    <td className="px-5 py-4 text-muted">{office.provinceOrCity || office.location}</td>
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
                      <button
                        className={`inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold transition ${
                          selected
                            ? 'border-navy/30 bg-navy text-white'
                            : 'border-black/10 bg-white text-ink hover:bg-stone-100'
                        }`}
                        onClick={e => {
                          e.stopPropagation()
                          handleSelectOffice(office.id)
                        }}
                        type="button"
                      >
                        {selected ? 'Editing' : 'Edit'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Office editor */}
      <section className={`${mobileView === 'list' ? 'hidden xl:block' : 'block'} min-h-0 rounded-[2rem] border border-black/5 bg-white p-5 shadow-sm sm:p-6 xl:overflow-auto`}>
        <div className="mb-4 flex items-center justify-between gap-3 xl:hidden">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-navy-dark">Office editor</div>
            <div className="text-sm text-muted">{activeOffice?.name || 'Select an office from the list first'}</div>
          </div>
          <button
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-stone-100"
            onClick={() => setMobileView('list')}
            type="button"
          >
            Back to list
          </button>
        </div>
        <AdminOfficePanel
          activeOffice={activeOffice}
          updateDraft={updateDraft}
          toggleDay={toggleDay}
          handleSaveOffice={handleSaveOffice}
          handleUseMyLocation={handleUseMyLocation}
          locationLoading={locationLoading}
          locationNotice={locationNotice}
          highlightLocationPin={highlightLocationPin}
          officeDraftWarning={officeDraftWarning}
          savePending={savePending}
        />
      </section>
    </section>
  )
}

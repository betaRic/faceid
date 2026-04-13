'use client'

import { motion } from 'framer-motion'
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
    updateDraft,
    toggleDay,
    handleSaveOffice,
    handleUseMyLocation,
  } = useOffices()
  const { setActivePanel } = useAdminStore()

  if (!officesLoaded) {
    return (
      <motion.section
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-center py-20"
        initial={{ opacity: 0, y: 18 }}
        transition={{ duration: 0.35 }}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-navy border-t-transparent" />
      </motion.section>
    )
  }

  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="grid gap-5 xl:h-full xl:min-h-0"
      initial={{ opacity: 0, y: 18 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      {/* Office list table */}
      <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white/80 shadow-glow backdrop-blur xl:flex xl:min-h-0 xl:flex-col">
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
          <table className="w-full text-left text-sm">
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
                    onClick={() => { setSelectedOfficeId(office.id); setActivePanel('office') }}
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
                          setSelectedOfficeId(office.id)
                          setActivePanel('office')
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
      <section className="rounded-[2rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur sm:p-6 xl:min-h-0 xl:overflow-auto">
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
        />
      </section>
    </motion.section>
  )
}

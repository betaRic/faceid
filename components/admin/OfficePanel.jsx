'use client'

import { motion } from 'framer-motion'
import AdminOfficePanel from '../AdminOfficePanel'

export default function OfficePanel({
  visibleOffices,
  selectedOfficeId,
  setSelectedOfficeId,
  persons,
  activeOffice,
  handleSaveOffice,
  handleUseMyLocation,
  highlightLocationPin,
  locationLoading,
  locationNotice,
  officeDraftWarning,
  isPending,
  toggleDay,
  updateDraft,
}) {
  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="grid gap-5 xl:h-full xl:min-h-0"
      initial={{ opacity: 0, y: 18 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white/80 shadow-glow backdrop-blur xl:flex xl:min-h-0 xl:flex-col">
        <div className="flex flex-col gap-3 border-b border-black/5 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-dark">Office</div>
            <h2 className="mt-2 font-display text-3xl text-ink">Office list</h2>
            <p className="mt-2 text-sm leading-7 text-muted">
              Regional admins can switch across the regional, provincial, and HUC offices and update each office record from the same workspace.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto xl:min-h-0 xl:flex-1 xl:overflow-auto">
          <table className="min-w-[980px] text-left text-sm">
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
                    className={`cursor-pointer transition ${selected ? 'bg-brand/5' : ''}`}
                    onClick={() => setSelectedOfficeId(office.id)}
                  >
                    <td className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-dark">
                      {office.code || office.shortName || office.id}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-ink">{office.name}</div>
                      <div className="text-xs text-muted">{office.location}</div>
                    </td>
                    <td className="px-5 py-4 text-muted">{office.officeType}</td>
                    <td className="px-5 py-4 text-muted">{office.provinceOrCity || office.location}</td>
                    <td className="px-5 py-4 text-muted">{office.employees ?? persons.filter(person => person.officeId === office.id).length}</td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${(office.status || 'active') === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                        {(office.status || 'active') === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-stone-100"
                        onClick={event => {
                          event.stopPropagation()
                          setSelectedOfficeId(office.id)
                        }}
                        type="button"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[2rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur sm:p-6 xl:min-h-0 xl:overflow-auto">
        <AdminOfficePanel
          activeOffice={activeOffice}
          handleSaveOffice={handleSaveOffice}
          handleUseMyLocation={handleUseMyLocation}
          highlightLocationPin={highlightLocationPin}
          locationLoading={locationLoading}
          locationNotice={locationNotice}
          officeDraftWarning={officeDraftWarning}
          savePending={isPending('office-save')}
          toggleDay={toggleDay}
          updateDraft={updateDraft}
        />
      </section>
    </motion.section>
  )
}

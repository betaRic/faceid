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

  const savePending = useAdminStore(s => s.isPending('office-save'))

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
      initial={{ opacity: 0, y: 18 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)] xl:items-start"
    >
      {/* ── Left: Office list ── */}
      <div className="overflow-hidden rounded-[2rem] border border-black/5 bg-white/80 shadow-glow backdrop-blur xl:sticky xl:top-20">
        <div className="border-b border-black/5 px-5 py-4">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-navy-dark">Office</div>
          <h2 className="mt-1 font-display text-xl text-ink">Select to edit</h2>
        </div>

        <div className="max-h-[60vh] overflow-y-auto xl:max-h-[calc(100vh-14rem)]">
          {visibleOffices.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted">No offices configured.</div>
          ) : (
            <div className="divide-y divide-black/5">
              {visibleOffices.map(office => {
                const selected = office.id === selectedOfficeId
                return (
                  <button
                    key={office.id}
                    className={`w-full px-5 py-3.5 text-left transition hover:bg-sky-light/40 ${selected ? 'bg-navy/5' : ''}`}
                    onClick={() => setSelectedOfficeId(office.id)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className={`truncate text-sm font-semibold ${selected ? 'text-navy' : 'text-ink'}`}>
                          {office.name}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted">
                          {office.officeType} · {office.provinceOrCity || office.location}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          (office.status || 'active') === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-stone-100 text-stone-500'
                        }`}>
                          {(office.status || 'active') === 'active' ? 'Active' : 'Inactive'}
                        </span>
                        {selected && (
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-navy">
                            Editing →
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Edit form ── */}
      <div className="rounded-[2rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur sm:p-6">
        {!activeOffice ? (
          <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-dashed border-black/10 bg-stone-50 text-sm text-muted">
            Select an office from the list to edit its settings.
          </div>
        ) : (
          <AdminOfficePanel
            activeOffice={activeOffice}
            officeDraftWarning={officeDraftWarning}
            updateDraft={updateDraft}
            toggleDay={toggleDay}
            handleUseMyLocation={handleUseMyLocation}
            handleSaveOffice={handleSaveOffice}
            savePending={savePending}
            locationLoading={locationLoading}
            locationNotice={locationNotice}
            highlightLocationPin={highlightLocationPin}
          />
        )}
      </div>
    </motion.section>
  )
}

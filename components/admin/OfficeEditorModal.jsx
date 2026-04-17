'use client'

import { motion } from 'framer-motion'
import AdminOfficePanel from '@/components/AdminOfficePanel'

export default function OfficeEditorModal({
  activeOffice,
  officeDraftWarning,
  updateDraft,
  toggleDay,
  handleUseMyLocation,
  handleSaveOffice,
  handleCancel,
  saveLabel,
  savePending,
  locationLoading,
  locationNotice,
  highlightLocationPin,
}) {
  if (!activeOffice) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <motion.div
        animate={{ opacity: 1, scale: 1 }}
        className="flex max-h-[92vh] w-full max-w-[1280px] flex-col overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-2xl"
        initial={{ opacity: 0, scale: 0.97 }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-black/5 px-5 py-4 sm:px-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-navy-dark">
              {activeOffice?.id ? 'Edit office' : 'Add office'}
            </div>
            <div className="mt-1 text-sm text-muted">
              {activeOffice?.name || 'Create a new office configuration'}
            </div>
          </div>
          <button
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-stone-100"
            onClick={handleCancel}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <AdminOfficePanel
            activeOffice={activeOffice}
            handleCancel={handleCancel}
            handleSaveOffice={handleSaveOffice}
            handleUseMyLocation={handleUseMyLocation}
            highlightLocationPin={highlightLocationPin}
            locationLoading={locationLoading}
            locationNotice={locationNotice}
            officeDraftWarning={officeDraftWarning}
            saveLabel={saveLabel}
            savePending={savePending}
            toggleDay={toggleDay}
            updateDraft={updateDraft}
          />
        </div>
      </motion.div>
    </div>
  )
}

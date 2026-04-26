'use client'

import { motion } from 'framer-motion'
import AdminOfficePanel from '@/components/AdminOfficePanel'

export default function OfficeEditorModal({
  activeOffice,
  officeDraftWarning,
  officeDraftDirty = false,
  updateDraft,
  toggleDay,
  addDivision,
  updateDivision,
  removeDivision,
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

  const saveDisabled = savePending || !officeDraftDirty

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <motion.div
        animate={{ opacity: 1, scale: 1 }}
        className="relative flex max-h-[92vh] w-full max-w-[1280px] flex-col overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-2xl"
        initial={{ opacity: 0, scale: 0.97 }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-black/5 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-navy-dark">
              {activeOffice?.id ? 'Edit office' : 'Add office'}
            </div>
            <div className="mt-1 truncate text-sm text-muted">
              {activeOffice?.name || 'Create a new office configuration'}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-navy px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-navy-dark disabled:cursor-not-allowed disabled:opacity-50"
              disabled={saveDisabled}
              onClick={handleSaveOffice}
              type="button"
              title={!officeDraftDirty && !savePending ? 'No changes to save' : undefined}
            >
              {savePending
                ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />Saving…</>
                : (saveLabel || 'Save changes')}
            </button>
            <button
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-stone-100 disabled:opacity-50"
              disabled={savePending}
              onClick={handleCancel}
              type="button"
            >
              Close
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <AdminOfficePanel
            activeOffice={activeOffice}
            addDivision={addDivision}
            handleUseMyLocation={handleUseMyLocation}
            highlightLocationPin={highlightLocationPin}
            locationLoading={locationLoading}
            locationNotice={locationNotice}
            officeDraftWarning={officeDraftWarning}
            removeDivision={removeDivision}
            toggleDay={toggleDay}
            updateDivision={updateDivision}
            updateDraft={updateDraft}
          />
        </div>

        {savePending ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-black/5 bg-white px-6 py-5 shadow-xl">
              <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-navy border-t-transparent" />
              <div className="text-sm font-semibold text-ink">Saving office settings…</div>
              <div className="text-xs text-muted">Don't close this window.</div>
            </div>
          </div>
        ) : null}
      </motion.div>
    </div>
  )
}

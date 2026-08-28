'use client'

import AdminOfficePanel from '@/components/AdminOfficePanel'
import { Button, LoadingState, PageHeader, Surface } from '@/components/ui'

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

  const title = activeOffice.id ? 'Edit office' : 'Add office'
  const saveDisabled = savePending || !officeDraftDirty

  return (
    <section className="h-full min-h-0">
      <Surface className="relative flex h-full min-h-0 flex-col overflow-hidden">
        <PageHeader
          actions={(
            <>
              <Button disabled={saveDisabled} onClick={handleSaveOffice} title={!officeDraftDirty && !savePending ? 'No changes to save' : undefined}>
                {savePending ? 'Saving…' : (saveLabel || 'Save changes')}
              </Button>
              <Button disabled={savePending} onClick={handleCancel} variant="secondary">Close</Button>
            </>
          )}
          className="border-b border-line px-4 py-4 sm:px-6"
          description={activeOffice.name || 'Create a new office configuration'}
          title={title}
        />

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
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface/90 px-4" role="status">
            <Surface className="px-5 py-4">
              <LoadingState label="Saving office settings…" />
              <p className="mt-2 text-xs text-secondary">Keep this page open until saving finishes.</p>
            </Surface>
          </div>
        ) : null}
      </Surface>
    </section>
  )
}

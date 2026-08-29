import { Button, Status, Surface } from '@/components/ui'

export default function ReviewStep({
  burstSummary,
  captureFeedback,
  detailsReady,
  duplicateReviewHint,
  onEditDetails,
  onRetake,
  onSubmit,
  pendingSampleCount,
  previewUrl,
  savingEnrollment,
}) {
  return (
    <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <Surface className="flex min-h-64 items-center justify-center overflow-hidden bg-black">
        {previewUrl ? <img alt="Captured face" className="max-h-[min(52vh,30rem)] w-full object-contain" src={previewUrl} /> : <span className="text-sm text-white/70">No preview yet.</span>}
      </Surface>

      <div className="grid content-start gap-3">
        <Button disabled={savingEnrollment || !detailsReady || !pendingSampleCount} onClick={onSubmit}>
          {savingEnrollment ? 'Submitting…' : 'Submit enrollment'}
        </Button>
        <Button onClick={onRetake} variant="secondary">Retake capture</Button>
        <Button onClick={onEditDetails} variant="quiet">Edit details</Button>

        {burstSummary ? (
          <Surface className="p-4">
            <Status tone={burstSummary.genuinelyDiverse ? 'success' : 'pending'}>
              {burstSummary.genuinelyDiverse ? 'Capture ready' : 'Retake recommended'}
            </Status>
            <p className="mt-3 text-sm leading-6 text-secondary">{burstSummary.keptCount} support samples kept across {burstSummary.phasesCompleted} guided poses.</p>
          </Surface>
        ) : null}
        {captureFeedback?.tone === 'warn' ? <div className="rounded-control border border-warning-line bg-warning-surface p-4 text-sm text-warning">{captureFeedback.title}: {captureFeedback.text}</div> : null}
        {duplicateReviewHint?.status === 'required' ? <div className="rounded-control border border-warning-line bg-warning-surface p-4 text-sm text-warning" role="alert">{duplicateReviewHint.message || 'A similar existing profile requires administrator review before approval.'}</div> : null}
      </div>
    </div>
  )
}

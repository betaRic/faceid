import { InfoCard } from '@/components/shared/ui'

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
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_300px]">
      <div className="flex min-h-[16rem] items-center justify-center overflow-hidden rounded-[1.5rem] border border-black/5 bg-stone-950">
        {previewUrl ? (
          <img alt="Captured" className="max-h-[min(52vh,30rem)] w-full object-contain" src={previewUrl} />
        ) : (
          <div className="text-sm text-stone-300">No preview yet.</div>
        )}
      </div>

      <div className="grid content-start gap-3">
        <button
          className="btn btn-primary w-full"
          disabled={savingEnrollment || !detailsReady || !pendingSampleCount}
          onClick={onSubmit}
          type="button"
        >
          {savingEnrollment ? 'Submitting…' : 'Submit enrollment'}
        </button>
        <button className="btn btn-ghost w-full" onClick={onRetake} type="button">
          Retake capture
        </button>
        <button className="btn btn-ghost w-full" onClick={onEditDetails} type="button">
          Edit employee details
        </button>

        {burstSummary && !burstSummary.genuinelyDiverse ? (
          <InfoCard
            title="Single angle detected"
            text="The system captured similar poses across the guided phases. For better accuracy, retake and follow the front, side, and chin-down prompts."
            tone="warn"
          />
        ) : null}

        {burstSummary && burstSummary.genuinelyDiverse ? (
          <InfoCard
            title={`${burstSummary.keptCount} diverse samples captured`}
            text={`${burstSummary.detectedCount} frames processed across ${burstSummary.phasesCompleted} guided poses. Diverse poses improve cross-device recognition accuracy.`}
          />
        ) : null}

        {captureFeedback?.tone === 'warn' ? (
          <InfoCard title={captureFeedback.title} text={captureFeedback.text} tone="warn" />
        ) : null}

        {duplicateReviewHint?.status === 'required' ? (
          <InfoCard
            title="Similarity review required"
            text={duplicateReviewHint.message || 'A similar existing profile was found. This enrollment can continue, but an admin should verify it before approval.'}
            tone="warn"
          />
        ) : null}
      </div>
    </div>
  )
}

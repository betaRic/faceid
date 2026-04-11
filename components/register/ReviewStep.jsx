import { Field, InfoCard } from '@/components/shared/ui'

export default function ReviewStep({ previewUrl, savingEnrollment, goToDetails, handleRetake, burstSummary, captureFeedback }) {
  return (
    <section className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-h-[18rem] items-center justify-center overflow-hidden rounded-[1.5rem] border border-black/5 bg-stone-950 px-4 py-4 lg:min-h-0">
        {previewUrl ? (
          <img alt="Captured preview" className="max-h-[min(52vh,30rem)] w-full object-contain" src={previewUrl} />
        ) : (
          <div className="flex min-h-[18rem] items-center justify-center px-6 text-center text-sm text-stone-300 lg:min-h-0">No preview available yet.</div>
        )}
      </div>
      <div className="grid content-start gap-3">
        <div className="grid gap-3">
          <button
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[1rem] bg-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-navy-dark sm:rounded-full"
            disabled={savingEnrollment}
            onClick={goToDetails}
            type="button"
          >
            Continue to details
          </button>
          <button
            className="inline-flex min-h-12 w-full items-center justify-center rounded-[1rem] border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-stone-50 sm:rounded-full"
            disabled={savingEnrollment}
            onClick={handleRetake}
            type="button"
          >
            Retake capture
          </button>
        </div>
        {burstSummary && <InfoCard title="Burst kept" text={`${burstSummary.keptCount} distinct sample(s) selected from ${burstSummary.detectedCount} detected burst frame(s).`} tone={captureFeedback?.tone || 'default'} />}
        {captureFeedback && <InfoCard title={captureFeedback.title} text={captureFeedback.text} tone={captureFeedback.tone} />}
      </div>
    </section>
  )
}

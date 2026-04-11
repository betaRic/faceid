import { InfoCard } from '@/components/shared/ui'
import { PERSON_APPROVAL_PENDING } from '@/lib/person-approval'

export default function CompleteStep({ lastSavedSummary, handleAddAnotherSample, handleNewPerson, captureFeedback }) {
  return (
    <section className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="overflow-auto rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-5">
        <span className={`inline-flex rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${lastSavedSummary?.approvalStatus === PERSON_APPROVAL_PENDING ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
          {lastSavedSummary?.approvalStatus === PERSON_APPROVAL_PENDING ? 'Pending admin approval' : 'Enrollment saved'}
        </span>
        <h3 className="mt-4 font-display text-3xl text-ink">{lastSavedSummary?.name}</h3>
        <div className="mt-3 space-y-2 text-sm text-muted">
          <p><strong className="text-ink">Employee ID:</strong> {lastSavedSummary?.employeeId}</p>
          <p><strong className="text-ink">Office:</strong> {lastSavedSummary?.officeName}</p>
          <p><strong className="text-ink">Saved this burst:</strong> {lastSavedSummary?.savedSampleCount}</p>
          <p><strong className="text-ink">Sample count:</strong> {lastSavedSummary?.sampleCount}</p>
          <p><strong className="text-ink">Recommended remaining:</strong> {lastSavedSummary?.remaining}</p>
        </div>
      </div>
      <div className="grid content-start gap-3">
        {captureFeedback && <InfoCard title={captureFeedback.title} text={captureFeedback.text} tone={captureFeedback.tone} />}
        <button className="inline-flex w-full items-center justify-center rounded-[1rem] bg-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-navy-dark sm:rounded-full" onClick={handleAddAnotherSample} type="button">
          Add another sample
        </button>
        <button className="inline-flex w-full items-center justify-center rounded-[1rem] border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-stone-50 sm:rounded-full" onClick={handleNewPerson} type="button">
          Enroll new employee
        </button>
      </div>
    </section>
  )
}

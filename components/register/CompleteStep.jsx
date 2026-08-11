import { PERSON_LIFECYCLE_PENDING } from '@/lib/person-approval'

export default function CompleteStep({ lastSavedSummary, onAddAnotherSample, onEnrollNewPerson }) {
  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_280px]">
      <div className="overflow-auto rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-5">
        <span className={`inline-flex rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${
          lastSavedSummary?.lifecycleStatus === PERSON_LIFECYCLE_PENDING
            ? 'bg-amber-100 text-amber-800'
            : 'bg-emerald-100 text-emerald-800'
        }`}>
          {lastSavedSummary?.lifecycleStatus === PERSON_LIFECYCLE_PENDING ? 'Pending review' : 'Saved'}
        </span>
        {lastSavedSummary?.accessCode ? (
          <div className="mt-4 rounded-[1.25rem] border border-navy/20 bg-white px-4 py-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-navy-dark">Your VeriFace access code</div>
            <div className="mt-2 font-mono text-4xl font-bold tracking-[0.3em] text-navy">{lastSavedSummary.accessCode}</div>
            <p className="mt-3 text-sm leading-6 text-muted">
              Keep this 4-digit code. You will use it at the VeriFace kiosk after HR activates your registration.
            </p>
          </div>
        ) : null}
        <h3 className="mt-5 font-display text-3xl text-ink">{lastSavedSummary?.name}</h3>
        <div className="mt-3 space-y-2 text-sm text-muted">
          <p><strong className="text-ink">Employee ID:</strong> {lastSavedSummary?.employeeId || 'Not provided'}</p>
          <p><strong className="text-ink">Office:</strong> {lastSavedSummary?.officeName}</p>
          <p><strong className="text-ink">Samples saved:</strong> {lastSavedSummary?.savedSampleCount} (guided support set)</p>
          <p><strong className="text-ink">Total on record:</strong> {lastSavedSummary?.sampleCount}</p>
          {lastSavedSummary?.remaining > 0 ? (
            <p><strong className="text-ink">Recommended additional:</strong> {lastSavedSummary?.remaining}</p>
          ) : null}
        </div>
        {lastSavedSummary?.lifecycleStatus === PERSON_LIFECYCLE_PENDING ? (
          <div className="mt-4 rounded-[1.25rem] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-900">
            Registration is open to the public, but scan access is not. This employee record and its biometric samples stay inactive until HR completes its review and activates the record.
          </div>
        ) : null}
        {lastSavedSummary?.duplicateReviewRequired ? (
          <div className="mt-4 rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-4 text-sm leading-6 text-red-900">
            {lastSavedSummary?.message || 'A similar employee profile was found. This enrollment was saved, but it requires explicit duplicate review before activation.'}
          </div>
        ) : null}
      </div>

      <div className="grid content-start gap-3">
        <button className="btn btn-primary w-full" onClick={onAddAnotherSample} type="button">
          Add another sample
        </button>
        <button className="btn btn-ghost w-full" onClick={onEnrollNewPerson} type="button">
          Enroll new employee
        </button>
      </div>
    </div>
  )
}

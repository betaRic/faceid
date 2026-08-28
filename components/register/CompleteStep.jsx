import { PERSON_LIFECYCLE_PENDING } from '@/lib/person-approval'
import { Button, Status, Surface } from '@/components/ui'

export default function CompleteStep({ lastSavedSummary, onAddAnotherSample, onEnrollNewPerson }) {
  const pending = lastSavedSummary?.lifecycleStatus === PERSON_LIFECYCLE_PENDING

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-5">
      <Surface className="p-5 sm:p-6">
        <h3 className="text-xl font-semibold text-primary">Registration submitted</h3>

        {lastSavedSummary?.accessCode ? (
          <div className="mt-5 rounded-surface border border-primary/20 bg-primary/5 p-5">
            <div className="text-sm font-medium text-secondary">VeriFace access code</div>
            <div className="mt-2 font-mono text-4xl font-bold tracking-[0.24em] text-primary">{lastSavedSummary.accessCode}</div>
            <p className="mt-3 text-sm leading-6 text-secondary">Keep this four-digit code. It can be used at the kiosk after approval.</p>
          </div>
        ) : null}

        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-secondary">Employee</dt><dd className="mt-1 font-semibold text-foreground">{lastSavedSummary?.name}</dd></div>
          <div><dt className="text-secondary">Employee ID</dt><dd className="mt-1 text-foreground">{lastSavedSummary?.employeeId || 'Not provided'}</dd></div>
          <div><dt className="text-secondary">Office</dt><dd className="mt-1 text-foreground">{lastSavedSummary?.officeName}</dd></div>
          <div><dt className="text-secondary">Status</dt><dd className="mt-1"><Status tone={pending ? 'pending' : 'success'}>{pending ? 'Pending review' : 'Saved'}</Status></dd></div>
          <div><dt className="text-secondary">Samples saved</dt><dd className="mt-1 text-foreground">{lastSavedSummary?.savedSampleCount ?? lastSavedSummary?.sampleCount ?? 0}</dd></div>
          <div><dt className="text-secondary">Samples on record</dt><dd className="mt-1 text-foreground">{lastSavedSummary?.sampleCount ?? 0}</dd></div>
        </dl>

        {pending ? (
          <div className="mt-5 rounded-control border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            Attendance access remains inactive until an administrator reviews and approves this registration.
          </div>
        ) : null}
        {lastSavedSummary?.duplicateReviewRequired ? (
          <div className="mt-4 rounded-control border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900" role="alert">
            {lastSavedSummary?.message || 'A similar employee profile was found. Explicit duplicate review is required before activation.'}
          </div>
        ) : null}
      </Surface>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onAddAnotherSample} variant="quiet">Add another sample</Button>
        <Button onClick={onEnrollNewPerson}>Enroll another employee</Button>
      </div>
    </div>
  )
}

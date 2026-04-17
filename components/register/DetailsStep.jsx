import { Field, InfoCard } from '@/components/shared/ui'

export default function DetailsStep({
  detailsReady,
  employeeId,
  employeeIdError,
  name,
  nameRef,
  officeId,
  offices,
  onBack,
  onContinue,
  onEmployeeIdChange,
  onNameChange,
  onOfficeChange,
  onRetake,
  pendingSampleCount,
  previewUrl,
}) {
  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid content-start gap-4 rounded-[1.5rem] border border-black/5 bg-stone-50 p-4">
        <div className="rounded-[1.25rem] border border-navy/10 bg-navy/5 px-4 py-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-navy/70">Before face capture</div>
          <p className="mt-2 text-sm leading-7 text-muted">
            Enter the employee details first. The system should not start biometric work before the basic identity fields are complete.
          </p>
        </div>

        <Field label="Full name">
          <input
            ref={nameRef}
            className="input uppercase"
            onChange={event => onNameChange(event.target.value.toUpperCase())}
            onKeyDown={event => {
              if (event.key === 'Enter') onContinue()
            }}
            placeholder="Enter full name"
            type="text"
            value={name}
          />
        </Field>

        <Field label="Employee ID">
          <input
            className={`input ${employeeIdError ? 'border-amber-400' : ''}`}
            onChange={event => onEmployeeIdChange(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') onContinue()
            }}
            placeholder="Enter employee ID"
            type="text"
            value={employeeId}
          />
          {employeeIdError ? <p className="text-xs text-amber-600">{employeeIdError}</p> : null}
        </Field>

        <Field label="Assigned office">
          <select className="input" onChange={event => onOfficeChange(event.target.value)} value={officeId}>
            {offices.map(office => (
              <option key={office.id} value={office.id}>{office.name}</option>
            ))}
          </select>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          {onBack ? (
            <button className="btn btn-ghost w-full" onClick={onBack} type="button">
              Back to scan
            </button>
          ) : (
            <div className="hidden sm:block" />
          )}
          <button
            className="btn btn-primary w-full"
            disabled={!detailsReady}
            onClick={onContinue}
            type="button"
          >
            {pendingSampleCount > 0 ? 'Review saved capture' : 'Continue to face capture'}
          </button>
        </div>

        {pendingSampleCount > 0 ? (
          <button className="btn btn-ghost w-full" onClick={onRetake} type="button">
            Retake face capture
          </button>
        ) : null}
      </div>

      <div className="grid content-start gap-3">
        <InfoCard
          title="Approval workflow"
          text="Public registration is open, but the submitted employee record and biometric samples stay pending and non-matchable until an admin explicitly approves them."
          tone="warn"
        />
        <InfoCard
          title="Office matters"
          text="Choose the real assigned office before capture. Public resubmissions are not allowed to silently move an existing employee record to a different office."
        />
        {previewUrl ? (
          <div className="overflow-hidden rounded-[1.5rem] border border-black/5 bg-stone-950">
            <img alt="Preview" className="max-h-[18rem] w-full object-contain" src={previewUrl} />
          </div>
        ) : (
          <InfoCard
            title="Capture standard"
            text="The guided capture uses the same oval crop, face-size band, and model runtime used in scan verification and admin re-enrollment."
          />
        )}
      </div>
    </div>
  )
}

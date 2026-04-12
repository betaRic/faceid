import { Field, InfoCard } from '@/components/shared/ui'
import { PERSON_APPROVAL_PENDING } from '@/lib/person-approval'

export default function DetailsStep({
  name, setName,
  employeeId, setEmployeeId,
  officeId, setOfficeId,
  offices,
  savingEnrollment,
  pendingSampleCount,
  handleRegister,
  setStep,
  previewUrl,
  existingPerson,
  existingSamples,
  burstSummary,
  captureFeedback,
  nameRef,
}) {
  return (
    <section className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="grid min-h-0 content-start gap-4 overflow-y-auto rounded-[1.5rem] border border-black/5 bg-stone-50 p-4">
        <Field label="Full name">
          <input
            ref={nameRef}
            className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm uppercase text-ink outline-none transition focus:border-navy"
            onChange={event => setName(event.target.value.toUpperCase())}
            onKeyDown={event => { if (event.key === 'Enter') handleRegister() }}
            placeholder="Enter full name"
            type="text"
            value={name}
          />
        </Field>
        <Field label="Employee ID">
          <input
            className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy"
            onChange={event => setEmployeeId(event.target.value)}
            placeholder="Enter employee ID"
            type="text"
            value={employeeId}
          />
        </Field>
        <Field label="Assigned office">
          <select
            className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy"
            onChange={event => setOfficeId(event.target.value)}
            value={officeId}
          >
            {offices.map(office => (
              <option key={office.id} value={office.id}>{office.name}</option>
            ))}
          </select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            className="inline-flex min-h-12 w-full items-center justify-center rounded-[1rem] border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-stone-50 sm:rounded-full"
            disabled={savingEnrollment}
            onClick={() => setStep('review')}
            type="button"
          >
            Back to review
          </button>
          <button
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[1rem] bg-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-navy-dark disabled:cursor-not-allowed disabled:opacity-40 sm:rounded-full"
            disabled={savingEnrollment || pendingSampleCount === 0 || !name.trim() || !employeeId.trim() || !officeId}
            onClick={handleRegister}
            type="button"
          >
            {savingEnrollment ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Saving...
              </>
            ) : 'Save enrollment'}
          </button>
        </div>
      </div>
      <div className="grid min-h-0 content-start gap-3">
        <section className="flex min-h-[15rem] items-center justify-center overflow-hidden rounded-[1.5rem] border border-black/5 bg-stone-950 px-4 py-4">
          {previewUrl ? (
            <img alt="Preview" className="max-h-[min(38vh,24rem)] w-full object-contain" src={previewUrl} />
          ) : (
            <div className="flex min-h-[15rem] items-center justify-center px-6 text-center text-sm text-stone-300">Capture preview unavailable.</div>
          )}
        </section>
        {existingPerson ? (
          <InfoCard title="Existing record" text={`${existingPerson.name} currently has ${existingSamples} sample(s) under ${existingPerson.officeName}.`} />
        ) : (
          <InfoCard title="Record" text="New employee." />
        )}
        {burstSummary && <InfoCard title="Prepared samples" text={`${burstSummary.keptCount} burst sample(s) are ready to save for this submission.`} tone={captureFeedback?.tone || 'default'} />}
        {captureFeedback && <InfoCard title={captureFeedback.title} text={captureFeedback.text} tone={captureFeedback.tone} />}
      </div>
    </section>
  )
}

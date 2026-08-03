import { Field, InfoCard } from '@/components/shared/ui'

export default function DetailsStep({
  detailsReady,
  employeeId,
  employeeIdError,
  firstName,
  lastName,
  middleName,
  nameRef,
  officeId,
  offices,
  position,
  privacyConsent,
  divisionId,
  onBack,
  onContinue,
  onEmployeeIdChange,
  onFirstNameChange,
  onLastNameChange,
  onMiddleNameChange,
  onOfficeChange,
  onPositionChange,
  onPrivacyConsentChange,
  onDivisionChange,
  onRetake,
  pendingSampleCount,
  previewUrl,
}) {
  const selectedOffice = offices.find(office => office.id === officeId) || null
  const isRegional = String(selectedOffice?.officeType || '') === 'Regional Office'
  const divisions = Array.isArray(selectedOffice?.divisions) ? selectedOffice.divisions : []
  return (
    <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="grid content-start gap-3 rounded-[1.25rem] border border-black/5 bg-stone-50 p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Last name">
            <input
              ref={nameRef}
              className="input"
              onChange={event => onLastNameChange(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') onContinue()
              }}
              placeholder="Enter last name"
              type="text"
              value={lastName}
            />
          </Field>

          <Field label="First name">
            <input
              className="input"
              onChange={event => onFirstNameChange(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') onContinue()
              }}
              placeholder="Enter first name"
              type="text"
              value={firstName}
            />
          </Field>

          <Field label="Middle name">
            <input
              className="input"
              onChange={event => onMiddleNameChange(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') onContinue()
              }}
              placeholder="Enter middle name"
              type="text"
              value={middleName}
            />
          </Field>
        </div>

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

        <Field label="Position">
          <input
            className="input"
            onChange={event => onPositionChange(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') onContinue()
            }}
            placeholder="Enter complete position title"
            type="text"
            value={position}
          />
        </Field>

        <Field label="Assigned office">
          <select className="input" onChange={event => onOfficeChange(event.target.value)} value={officeId}>
            {offices.map(office => (
              <option key={office.id} value={office.id}>{office.name}</option>
            ))}
          </select>
        </Field>

        {isRegional ? (
          <Field label="Division / Unit">
            <select
              className="input"
              onChange={event => onDivisionChange(event.target.value)}
              value={divisionId}
            >
              <option value="">— Select division or unit —</option>
              {divisions.map(division => (
                <option key={division.id} value={division.id}>
                  {division.shortName ? `${division.shortName} — ${division.name}` : division.name}
                </option>
              ))}
            </select>
            {divisions.length === 0 ? (
              <p className="text-xs text-amber-600">
                This regional office has no divisions configured. Ask an admin to add divisions before enrolling.
              </p>
            ) : null}
          </Field>
        ) : null}

        <section className="rounded-xl border border-sky/20 bg-sky/5 p-4 text-sm text-ink">
          <h3 className="font-bold text-navy">Data Privacy Notice</h3>
          <p className="mt-2 leading-relaxed">
            DILG Region XII collects and processes your name, employee ID, position, assigned office, facial image, and biometric templates for employee registration, identity verification, and attendance management, pursuant to the Data Privacy Act of 2012 (RA 10173).
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-muted">
            <li>For official DILG use only and accessible only to authorized personnel.</li>
            <li>Protected through appropriate organizational, technical, and physical security measures.</li>
            <li>Retained only as required for the stated purpose and applicable DILG records-retention rules and law.</li>
            <li>You may request access or correction, withdraw consent where applicable, object to processing, or lodge a complaint with the National Privacy Commission. Contact the DILG Region XII Data Protection Officer through official DILG channels.</li>
          </ul>
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg bg-white p-3 text-sm font-medium text-navy">
            <input
              checked={privacyConsent}
              className="mt-0.5 h-4 w-4 accent-navy"
              onChange={event => onPrivacyConsentChange(event.target.checked)}
              type="checkbox"
            />
            <span>I have read and understood this notice and consent to the processing of my personal and biometric data for the purposes stated above.</span>
          </label>
        </section>

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

      <div className="hidden content-start gap-3 xl:grid">
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

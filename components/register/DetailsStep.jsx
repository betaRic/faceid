import { Button, Checkbox, Field, Input, OrganizationFilterFields, Surface } from '@/components/ui'

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
  const selectedOffice = offices.find((office) => office.id === officeId) || null
  const isRegional = String(selectedOffice?.officeType || '') === 'Regional Office'
  const divisions = Array.isArray(selectedOffice?.divisions) ? selectedOffice.divisions : []
  const organizationLevels = [
    {
      id: 'office',
      label: 'Assigned office',
      value: officeId,
      placeholder: 'Select assigned office',
      options: offices.map((office) => ({ value: office.id, label: office.name })),
    },
    ...(isRegional ? [{
      id: 'division',
      label: 'Division / Unit',
      value: divisionId,
      placeholder: 'Select division or unit',
      options: divisions.map((division) => ({
        value: division.id,
        label: division.shortName ? `${division.shortName} — ${division.name}` : division.name,
      })),
    }] : []),
  ]

  function handleEnter(event) {
    if (event.key === 'Enter') onContinue()
  }

  return (
    <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="grid content-start gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field htmlFor="registration-last-name" label="Last name" required>
            <Input ref={nameRef} id="registration-last-name" onChange={(event) => onLastNameChange(event.target.value)} onKeyDown={handleEnter} placeholder="Enter last name" value={lastName} />
          </Field>
          <Field htmlFor="registration-first-name" label="First name" required>
            <Input id="registration-first-name" onChange={(event) => onFirstNameChange(event.target.value)} onKeyDown={handleEnter} placeholder="Enter first name" value={firstName} />
          </Field>
          <Field htmlFor="registration-middle-name" label="Middle name">
            <Input id="registration-middle-name" onChange={(event) => onMiddleNameChange(event.target.value)} onKeyDown={handleEnter} placeholder="Enter middle name" value={middleName} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field error={employeeIdError} htmlFor="registration-employee-id" label="Employee ID (optional)">
            <Input id="registration-employee-id" inputMode="numeric" onChange={(event) => onEmployeeIdChange(event.target.value)} onKeyDown={handleEnter} placeholder="Leave blank if unavailable" value={employeeId} />
          </Field>
          <Field htmlFor="registration-position" label="Position" required>
            <Input id="registration-position" onChange={(event) => onPositionChange(event.target.value)} onKeyDown={handleEnter} placeholder="Enter complete position title" value={position} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <OrganizationFilterFields
            levels={organizationLevels}
            onChange={(level, value) => level === 'office' ? onOfficeChange(value) : onDivisionChange(value)}
          />
        </div>
        {isRegional && divisions.length === 0 ? (
          <div className="rounded-control border border-warning-line bg-warning-surface px-4 py-3 text-sm text-warning" role="alert">
            This regional office has no divisions configured. Ask an administrator to add divisions before enrolling.
          </div>
        ) : null}

        <Surface className="p-4">
          <h3 className="text-base font-semibold text-primary">Data Privacy Notice</h3>
          <p className="mt-2 text-sm leading-6 text-secondary">
            DILG Region XII processes your identity, office assignment, facial image, and biometric templates for registration, identity verification, and attendance under the Data Privacy Act of 2012.
          </p>
          <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-3 rounded-control border border-line bg-canvas p-3 text-sm leading-6 text-foreground">
            <Checkbox checked={privacyConsent} className="mt-0.5 shrink-0" onChange={(event) => onPrivacyConsentChange(event.target.checked)} />
            <span>I have read and understood this notice and consent to the processing of my personal and biometric data for the purposes stated above.</span>
          </label>
        </Surface>

        <div className="rounded-control border border-warning-line bg-warning-surface px-4 py-3 text-sm font-medium text-warning">
          Already registered? Do not enroll again. Contact HR if your details need correction.
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {onBack ? <Button onClick={onBack} variant="quiet">Back to scan</Button> : <span />}
          <Button disabled={!detailsReady} onClick={onContinue}>
            {pendingSampleCount > 0 ? 'Review saved capture' : 'Continue to face capture'}
          </Button>
        </div>
        {pendingSampleCount > 0 ? <Button onClick={onRetake} variant="secondary">Retake face capture</Button> : null}
      </div>

      <aside className="hidden lg:block">
        <Surface className="sticky top-4 overflow-hidden p-4">
          <h3 className="text-sm font-semibold text-primary">Approval required</h3>
          <p className="mt-2 text-sm leading-6 text-secondary">Submitted records remain pending and cannot scan attendance until an administrator approves them.</p>
          {previewUrl ? <img alt="Enrollment preview" className="mt-4 max-h-64 w-full rounded-control bg-black object-contain" src={previewUrl} /> : null}
        </Surface>
      </aside>
    </div>
  )
}

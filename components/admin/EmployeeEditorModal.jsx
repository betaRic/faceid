'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useShallow } from 'zustand/react/shallow'
import { useAdminStore } from '@/lib/admin/store'
import { updatePersonRecord } from '@/lib/data-store'
import { Field } from '@/components/shared/ui'
import { buildEmployeeDisplayName } from '@/lib/person-name'
import { normalizeEmployeeWfhDays } from '@/lib/employee-wfh'
import {
  getPersonLifecycleStatus,
  PERSON_LIFECYCLE_ACTIVE,
  PERSON_LIFECYCLE_INACTIVE,
  PERSON_LIFECYCLE_PENDING,
} from '@/lib/person-approval'

export default function EmployeeEditorModal({ person, onSave, onCancel }) {
  const router = useRouter()
  const {
    offices,
    refreshEmployees,
    addToast,
    setPending,
    isPending,
  } = useAdminStore(useShallow((state) => ({
    offices: state.offices,
    refreshEmployees: state.refreshEmployees,
    addToast: state.addToast,
    setPending: state.setPending,
    isPending: state.isPending,
  })))
  const [officeId, setOfficeId] = useState('')
  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [position, setPosition] = useState('')
  const [divisionId, setDivisionId] = useState('')
  const [lifecycleStatus, setLifecycleStatus] = useState(PERSON_LIFECYCLE_PENDING)
  const [individualWfhDays, setIndividualWfhDays] = useState([])
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [weeklySchedule, setWeeklySchedule] = useState({})
  const [flexitimeEnabled, setFlexitimeEnabled] = useState(false)
  const [flexitimeRequiredMinutes, setFlexitimeRequiredMinutes] = useState(480)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [panelMode, setPanelMode] = useState('details')
  const [photoUrl, setPhotoUrl] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const photoInputRef = useRef(null)

  useEffect(() => {
    if (!person) return
    setLastName(person.lastName || '')
    setFirstName(person.firstName || '')
    setMiddleName(person.middleName || '')
    setEmployeeId(person.employeeId || '')
    setOfficeId(person.officeId || '')
    setPosition(person.position || '')
    setDivisionId(person.divisionId || '')
    setLifecycleStatus(getPersonLifecycleStatus(person))
    setIndividualWfhDays(normalizeEmployeeWfhDays(person.individualWfhDays))
    setScheduleEnabled(Object.keys(person.weeklySchedule || {}).length > 0)
    setWeeklySchedule(person.weeklySchedule || {})
    setFlexitimeEnabled(person.flexitime?.enabled === true)
    setFlexitimeRequiredMinutes(Number(person.flexitime?.requiredMinutes) || 480)
    setResetConfirmOpen(false)
    setPanelMode('details')
    setPhotoUrl(person.photoUrl || '')
    setAccessCode(person.accessCode || '')
  }, [person])

  if (!person) return null

  const selectedOffice = offices.find((o) => o.id === officeId)
  const isSaving = isPending(`employee-update-${person.id}`)
  const isUploadingPhoto = isPending(`employee-photo-${person.id}`)
  const isRegeneratingAccessCode = isPending(`employee-access-code-${person.id}`)
  const currentLifecycle = getPersonLifecycleStatus(person)

  async function handleQuickApprove() {
    setPending(`employee-approve-${person.id}`, true)
    try {
      await updatePersonRecord(person, { lifecycleStatus: PERSON_LIFECYCLE_ACTIVE })
      refreshEmployees()
      addToast(`${person.name} activated`, 'success')
      onSave(person, { lifecycleStatus: PERSON_LIFECYCLE_ACTIVE })
    } catch (err) {
      addToast(err?.message || 'Activation failed', 'error')
    }
    setPending(`employee-approve-${person.id}`, false)
  }

  async function handleQuickReject() {
    setPending(`employee-reject-${person.id}`, true)
    try {
      await updatePersonRecord(person, { lifecycleStatus: PERSON_LIFECYCLE_INACTIVE })
      refreshEmployees()
      addToast(`${person.name} set inactive`, 'success')
      onSave(person, { lifecycleStatus: PERSON_LIFECYCLE_INACTIVE })
    } catch (err) {
      addToast(err?.message || 'Rejection failed', 'error')
    }
    setPending(`employee-reject-${person.id}`, false)
  }

  async function handleQuickActivate() {
    setPending(`employee-activate-${person.id}`, true)
    try {
      await updatePersonRecord(person, { lifecycleStatus: PERSON_LIFECYCLE_ACTIVE })
      refreshEmployees()
      addToast(`${person.name} activated`, 'success')
      onSave(person, { lifecycleStatus: PERSON_LIFECYCLE_ACTIVE })
    } catch (err) {
      addToast(err?.message || 'Activation failed', 'error')
    }
    setPending(`employee-activate-${person.id}`, false)
  }

  async function handleQuickDeactivate() {
    setPending(`employee-deactivate-${person.id}`, true)
    try {
      await updatePersonRecord(person, { lifecycleStatus: PERSON_LIFECYCLE_INACTIVE })
      refreshEmployees()
      addToast(`${person.name} deactivated`, 'success')
      onSave(person, { lifecycleStatus: PERSON_LIFECYCLE_INACTIVE })
    } catch (err) {
      addToast(err?.message || 'Deactivation failed', 'error')
    }
    setPending(`employee-deactivate-${person.id}`, false)
  }

  async function handleMoveToReview() {
    setPending(`employee-review-${person.id}`, true)
    try {
      await updatePersonRecord(person, { lifecycleStatus: PERSON_LIFECYCLE_PENDING })
      refreshEmployees()
      onSave(person, { lifecycleStatus: PERSON_LIFECYCLE_PENDING })
      addToast(`${person.name} moved to pending review`, 'success')
    } catch (err) {
      addToast(err?.message || 'Could not move employee to review', 'error')
    }
    setPending(`employee-review-${person.id}`, false)
  }

  async function handleBiometricReset() {
    setPending(`biometric-reset-${person.id}`, true)
    setResetConfirmOpen(false)
    try {
      const res = await fetch(`/api/persons/${person.id}/biometric-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (data.ok) {
        refreshEmployees()
        addToast(`Face data reset — ${person.name} must re-enroll in admin or registration`, 'success')
        onSave(person, { sampleCount: 0, lifecycleStatus: PERSON_LIFECYCLE_PENDING })
      } else {
        addToast(data.message || 'Reset failed', 'error')
      }
    } catch {
      addToast('Reset failed — try again', 'error')
    }
    setPending(`biometric-reset-${person.id}`, false)
  }

  async function handleSave() {
    if (!officeId) return
    const trimmedLastName = lastName.trim()
    const trimmedFirstName = firstName.trim()
    const trimmedMiddleName = middleName.trim()
    const trimmedEmployeeId = employeeId.trim().replace(/\D/g, '')
    if (!trimmedLastName) {
      addToast('Last name is required.', 'error')
      return
    }
    if (!trimmedFirstName) {
      addToast('First name is required.', 'error')
      return
    }
    const isRegional = String(selectedOffice?.officeType || '') === 'Regional Office'
    if (isRegional && !divisionId) {
      addToast('Select a division for Regional Office staff.', 'error')
      return
    }
    const trimmedPosition = position.trim()
    if (!trimmedPosition) {
      addToast('Position is required.', 'error')
      return
    }
    const division = isRegional
      ? (Array.isArray(selectedOffice?.divisions) ? selectedOffice.divisions : []).find(d => d?.id === divisionId) || null
      : null
    setPending(`employee-update-${person.id}`, true)
    try {
      await updatePersonRecord(person, {
        lastName: trimmedLastName,
        firstName: trimmedFirstName,
        middleName: trimmedMiddleName,
        employeeId: trimmedEmployeeId,
        officeId,
        officeName: selectedOffice?.name || person.officeName,
        position: trimmedPosition,
        divisionId: isRegional ? divisionId : '',
        divisionName: isRegional ? (division?.name || '') : '',
        individualWfhDays,
        weeklySchedule: scheduleEnabled ? weeklySchedule : {},
        flexitime: { enabled: flexitimeEnabled, requiredMinutes: flexitimeRequiredMinutes },
        lifecycleStatus,
      })
      refreshEmployees()
      addToast(`${trimmedFirstName} ${trimmedLastName} updated`, 'success')
      onSave(person, {
        lastName: trimmedLastName,
        firstName: trimmedFirstName,
        middleName: trimmedMiddleName,
        employeeId: trimmedEmployeeId,
        name: buildEmployeeDisplayName({
          lastName: trimmedLastName,
          firstName: trimmedFirstName,
          middleName: trimmedMiddleName,
        }),
        officeId,
        lifecycleStatus,
        position: trimmedPosition,
        divisionId: isRegional ? divisionId : '',
        individualWfhDays,
        weeklySchedule: scheduleEnabled ? weeklySchedule : {},
        flexitime: { enabled: flexitimeEnabled, requiredMinutes: flexitimeRequiredMinutes },
      })
    } catch (err) {
      addToast(err?.message || 'Update failed', 'error')
    }
    setPending(`employee-update-${person.id}`, false)
  }

  function handleOpenReenroll() {
    setResetConfirmOpen(false)
    const personData = {
      id: person.id,
      name: person.name || '',
      employeeId: person.employeeId || '',
      officeId: person.officeId || '',
      officeName: person.officeName || '',
    }
    const encoded = encodeURIComponent(JSON.stringify(personData))
    router.push(`/admin/employee/${person.id}/reenroll?person=${encoded}`)
  }

  async function handleRegenerateAccessCode() {
    if (!window.confirm('Generate a new VeriFace access code? The current code will stop working immediately.')) return
    setPending(`employee-access-code-${person.id}`, true)
    try {
      const response = await fetch(`/api/persons/${person.id}/access-code`, { method: 'POST' })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.message || 'Failed to generate a new access code.')

      setAccessCode(result.accessCode || '')
      refreshEmployees()
      onSave(person, { accessCode: result.accessCode || '' })
      addToast('New VeriFace access code generated.', 'success')
    } catch (error) {
      addToast(error?.message || 'Failed to generate a new access code.', 'error')
    }
    setPending(`employee-access-code-${person.id}`, false)
  }

  async function handleProfilePhotoSelected(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      addToast('Choose a JPEG, PNG, or WebP image.', 'error')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      addToast('Profile photo must be 5 MB or smaller.', 'error')
      return
    }

    setPending(`employee-photo-${person.id}`, true)
    try {
      const photoDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('Could not read the selected image.'))
        reader.readAsDataURL(file)
      })
      const response = await fetch(`/api/persons/${person.id}/photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoDataUrl }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.message || 'Failed to save profile photo.')

      const nextPhotoUrl = `${result.photoUrl}?v=${Date.now()}`
      setPhotoUrl(nextPhotoUrl)
      refreshEmployees()
      onSave(person, { photoPath: result.photoPath, photoUrl: nextPhotoUrl })
      addToast('Profile photo saved. Biometric enrollment was not changed.', 'success')
    } catch (error) {
      addToast(error?.message || 'Failed to save profile photo.', 'error')
    }
    setPending(`employee-photo-${person.id}`, false)
  }

  function toggleIndividualWfhDay(day) {
    setIndividualWfhDays(current => (
      current.includes(day)
        ? current.filter(item => item !== day)
        : normalizeEmployeeWfhDays([...current, day])
    ))
  }

  function updateScheduleDay(day, field, value) {
    setWeeklySchedule(current => ({
      ...current,
      [day]: {
        working: (selectedOffice?.workPolicy?.workingDays || [1, 2, 3, 4, 5]).includes(day),
        morningIn: selectedOffice?.workPolicy?.morningIn || '08:00',
        morningOut: selectedOffice?.workPolicy?.morningOut || '12:00',
        afternoonIn: selectedOffice?.workPolicy?.afternoonIn || '13:00',
        afternoonOut: selectedOffice?.workPolicy?.afternoonOut || '17:00',
        ...(current?.[day] || {}),
        [field]: value,
      },
    }))
  }

  function setScheduleDayOverride(day, enabled) {
    setWeeklySchedule(current => {
      if (!enabled) {
        const { [day]: ignored, ...inheritedDays } = current || {}
        return inheritedDays
      }
      return {
        ...current,
        [day]: {
          working: (selectedOffice?.workPolicy?.workingDays || [1, 2, 3, 4, 5]).includes(day),
          morningIn: selectedOffice?.workPolicy?.morningIn || '08:00',
          morningOut: selectedOffice?.workPolicy?.morningOut || '12:00',
          afternoonIn: selectedOffice?.workPolicy?.afternoonIn || '13:00',
          afternoonOut: selectedOffice?.workPolicy?.afternoonOut || '17:00',
        },
      }
    })
  }

  const formatSubmittedDate = () => {
    if (!person.submittedAt) return null
    try {
      let d
      if (person.submittedAt?.toDate) {
        d = person.submittedAt.toDate()
      } else if (typeof person.submittedAt === 'string' || typeof person.submittedAt === 'number') {
        d = new Date(person.submittedAt)
      } else {
        return null
      }
      if (isNaN(d.getTime())) return null
      const days = Math.floor((Date.now() - d.getTime()) / 86400000)
      if (days === 0) return 'Submitted today'
      if (days === 1) return 'Submitted yesterday'
      if (days < 0) return 'Submitted recently'
      return `Submitted ${days} days ago`
    } catch {
      return null
    }
  }

  const submittedLabel = formatSubmittedDate()
  const phaseSampleCounts = person.captureMetadata?.phaseSampleCounts && typeof person.captureMetadata.phaseSampleCounts === 'object'
    ? person.captureMetadata.phaseSampleCounts
    : null
  const phaseLabels = [
    ['center', 'Front'],
    ['side_a', 'Side A'],
    ['side_b', 'Side B'],
    ['chin_down', 'Chin down'],
  ]

  return (
    <section className="h-full min-h-0 bg-white p-3 sm:p-6">
      <motion.div
        animate={{ opacity: 1, scale: 1 }}
        className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm"
        initial={{ opacity: 0, scale: 0.95 }}
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
        <div className="flex items-start gap-4">
          {photoUrl ? (
            <img
              alt={person.name}
              className="h-16 w-16 shrink-0 rounded-2xl object-cover"
              src={photoUrl}
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-navy/10 text-xl font-bold text-navy-dark">
              {String(person.name || '?')[0]}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-ink">{person.name}</h2>
            <p className="mt-0.5 text-sm text-muted">{person.employeeId}</p>
            {accessCode ? <p className="mt-1 text-xs font-semibold text-navy">VeriFace access code: {accessCode}</p> : null}
            {submittedLabel && currentLifecycle === PERSON_LIFECYCLE_PENDING && (
              <p className="mt-1 text-xs text-amber-600">{submittedLabel}</p>
            )}
          </div>
          <button
            aria-label="Close employee record"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white text-xl leading-none text-muted transition hover:bg-stone-100 hover:text-ink"
            onClick={onCancel}
            type="button"
          >
            ×
          </button>
        </div>

        {photoUrl ? (
          <div className="mt-5 overflow-hidden rounded-2xl border border-black/5 bg-stone-950">
            <img
              alt={`Enrollment photo for ${person.name}`}
              className="max-h-[22rem] w-full object-contain"
              src={photoUrl}
            />
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            No profile photo is saved for this employee yet. You may add one without changing the biometric enrollment.
          </div>
        )}

        <div className="mt-3">
          <input
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleProfilePhotoSelected}
            ref={photoInputRef}
            type="file"
          />
          <button
            className="w-full rounded-xl border border-navy/20 bg-white px-4 py-2.5 text-sm font-semibold text-navy-dark transition hover:bg-navy/5 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isUploadingPhoto}
            onClick={() => photoInputRef.current?.click()}
            type="button"
          >
            {isUploadingPhoto ? 'Saving profile photo...' : (photoUrl ? 'Replace profile photo' : 'Upload profile photo')}
          </button>
          <p className="mt-1.5 text-center text-xs text-muted">JPEG, PNG, or WebP up to 5 MB. This does not change biometric enrollment.</p>
        </div>

        <div className="mt-4 rounded-xl border border-black/5 bg-stone-50 px-3 py-3 text-sm text-muted">
          {(person.sampleCount ?? 0) > 0
            ? `${person.sampleCount} biometric sample(s) saved.`
            : 'No biometric samples saved yet.'}
          {phaseSampleCounts ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {phaseLabels.map(([phaseId, label]) => (
                <span key={phaseId} className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-muted">
                  {label}: {Number(phaseSampleCounts[phaseId] || 0)}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {currentLifecycle === PERSON_LIFECYCLE_PENDING && (
          <div className="mt-5 rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
            <h3 className="text-sm font-semibold text-amber-900">Pending review</h3>
            <p className="mt-1 text-sm text-amber-700">Review this enrollment before activating the employee.</p>
            {person.duplicateReviewRequired ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-900">
                <div className="font-semibold">Duplicate review required</div>
                <div className="mt-1 text-red-800">
                  {person.duplicateReviewCandidateName
                    ? `Similar to ${person.duplicateReviewCandidateName}${person.duplicateReviewCandidateEmployeeId ? ` (${person.duplicateReviewCandidateEmployeeId})` : ''}.`
                    : 'A similar existing employee profile was found.'}
                  {Number.isFinite(person.duplicateReviewDistance)
                    ? ` Best distance ${person.duplicateReviewDistance.toFixed(2)}.`
                    : ''}
                </div>
              </div>
            ) : null}
            <div className="mt-4 flex gap-3">
              <button
                className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                disabled={isPending(`employee-approve-${person.id}`)}
                onClick={handleQuickApprove}
                type="button"
              >
                {isPending(`employee-approve-${person.id}`) ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />Activating...</> : 'Activate'}
              </button>
              <button
                className="flex-1 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                disabled={isPending(`employee-reject-${person.id}`)}
                onClick={handleQuickReject}
                type="button"
              >
                {isPending(`employee-reject-${person.id}`) ? <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]" /> Setting inactive...</> : 'Set inactive'}
              </button>
            </div>
            <button
              className="mt-4 w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-stone-50"
              onClick={handleOpenReenroll}
              type="button"
            >
              Capture live face in admin
            </button>
          </div>
        )}

        {currentLifecycle === PERSON_LIFECYCLE_ACTIVE && (
          <div className="mt-5">
            <div className="mb-4 flex items-center justify-between rounded-xl border border-black/5 bg-stone-50 p-4">
              <div>
                <p className="text-sm font-medium text-ink">Account Status</p>
                <p className="text-xs text-muted">
                  {currentLifecycle === PERSON_LIFECYCLE_ACTIVE ? 'Employee can clock in' : 'Employee is inactive'}
                </p>
              </div>
              <button
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
                  currentLifecycle !== PERSON_LIFECYCLE_ACTIVE
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'border border-red-200 bg-white text-red-700 hover:bg-red-50'
                }`}
                disabled={
                  isPending(`employee-activate-${person.id}`) ||
                  isPending(`employee-deactivate-${person.id}`)
                }
                onClick={currentLifecycle !== PERSON_LIFECYCLE_ACTIVE ? handleQuickActivate : handleQuickDeactivate}
                type="button"
              >
                {currentLifecycle !== PERSON_LIFECYCLE_ACTIVE
                  ? (isPending(`employee-activate-${person.id}`) ? <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]" /> Activating...</> : 'Activate')
                  : (isPending(`employee-deactivate-${person.id}`) ? <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]" /> Deactivating...</> : 'Deactivate')
                }
              </button>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Last name">
                  <input
                    className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy"
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    type="text"
                    value={lastName}
                  />
                </Field>
                <Field label="First name">
                  <input
                    className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy"
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    type="text"
                    value={firstName}
                  />
                </Field>
                <Field label="Middle name">
                  <input
                    className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy"
                    onChange={(e) => setMiddleName(e.target.value)}
                    placeholder="Middle name"
                    type="text"
                    value={middleName}
                  />
                </Field>
              </div>

              <Field label="Employee ID (optional)">
                <input
                  className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy"
                  onChange={(e) => setEmployeeId(e.target.value.replace(/\D/g, ''))}
                  placeholder="Leave blank if unavailable"
                  type="text"
                  value={employeeId}
                />
              </Field>

              <Field label="Position">
                <input
                  className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy"
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="Complete position title"
                  type="text"
                  value={position}
                />
              </Field>

              <Field label="Office">
                <select className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy" onChange={(e) => { setOfficeId(e.target.value); setDivisionId('') }} value={officeId}>
                  <option value="">Select office</option>
                  {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </Field>

              {String(selectedOffice?.officeType || '') === 'Regional Office' ? (
                <Field label="Division / Unit">
                  <select
                    className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy"
                    onChange={(e) => setDivisionId(e.target.value)}
                    value={divisionId}
                  >
                    <option value="">— Select division or unit —</option>
                    {(Array.isArray(selectedOffice?.divisions) ? selectedOffice.divisions : []).map(division => (
                      <option key={division.id} value={division.id}>
                        {division.shortName ? `${division.shortName} — ${division.name}` : division.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}

              <Field label="Individual WFH days">
                <p className="mb-2 text-xs text-muted">A repeating weekly schedule for this employee. Office-wide WFH days still apply to everyone.</p>
                <div className="flex flex-wrap gap-1.5">
                  {[['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6], ['Sun', 0]].map(([label, day]) => {
                    const activeDay = individualWfhDays.includes(day)
                    return <button className={`rounded-full border px-3 py-1 text-sm font-semibold transition ${activeDay ? 'border-amber/40 bg-amber/15 text-amber-dark' : 'border-black/10 bg-white text-muted hover:bg-stone-100'}`} key={day} onClick={() => toggleIndividualWfhDay(day)} type="button">{label}</button>
                  })}
                </div>
              </Field>

              <div className="rounded-xl border border-navy/15 bg-navy/[0.025] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-navy-dark">Employee schedule override</p>
                    <p className="mt-0.5 text-xs text-muted">Leave a day unchecked to inherit the division or office work hours. Override only the days this employee has different AM/PM hours.</p>
                  </div>
                  <label className="flex shrink-0 items-center gap-2 text-xs font-semibold text-ink">
                    <input checked={scheduleEnabled} onChange={(event) => setScheduleEnabled(event.target.checked)} type="checkbox" />
                    Edit schedule
                  </label>
                </div>
                {scheduleEnabled ? (
                  <div className="mt-3 space-y-2">
                    {[['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6], ['Sun', 0]].map(([label, day]) => {
                      const overridden = Boolean(weeklySchedule[day])
                      const entry = weeklySchedule[day] || { working: (selectedOffice?.workPolicy?.workingDays || [1, 2, 3, 4, 5]).includes(day), morningIn: selectedOffice?.workPolicy?.morningIn || '08:00', morningOut: selectedOffice?.workPolicy?.morningOut || '12:00', afternoonIn: selectedOffice?.workPolicy?.afternoonIn || '13:00', afternoonOut: selectedOffice?.workPolicy?.afternoonOut || '17:00' }
                      return <div className="grid grid-cols-[34px_58px_44px_1fr_1fr] items-center gap-2 text-xs" key={day}>
                        <span className="font-semibold text-muted">{label}</span>
                        <label className="flex items-center gap-1"><input checked={overridden} onChange={(event) => setScheduleDayOverride(day, event.target.checked)} type="checkbox" />Set</label>
                        <label className="flex items-center gap-1"><input checked={entry.working !== false} disabled={!overridden} onChange={(event) => updateScheduleDay(day, 'working', event.target.checked)} type="checkbox" />Work</label>
                        <div className="grid grid-cols-2 gap-1"><input aria-label={`${label} AM in`} className="min-w-0 rounded border border-black/10 px-1 py-1.5 disabled:bg-stone-100" disabled={!overridden || entry.working === false} onChange={(event) => updateScheduleDay(day, 'morningIn', event.target.value)} type="time" value={entry.morningIn || '08:00'} /><input aria-label={`${label} AM out`} className="min-w-0 rounded border border-black/10 px-1 py-1.5 disabled:bg-stone-100" disabled={!overridden || entry.working === false} onChange={(event) => updateScheduleDay(day, 'morningOut', event.target.value)} type="time" value={entry.morningOut || '12:00'} /></div>
                        <div className="grid grid-cols-2 gap-1"><input aria-label={`${label} PM in`} className="min-w-0 rounded border border-black/10 px-1 py-1.5 disabled:bg-stone-100" disabled={!overridden || entry.working === false} onChange={(event) => updateScheduleDay(day, 'afternoonIn', event.target.value)} type="time" value={entry.afternoonIn || '13:00'} /><input aria-label={`${label} PM out`} className="min-w-0 rounded border border-black/10 px-1 py-1.5 disabled:bg-stone-100" disabled={!overridden || entry.working === false} onChange={(event) => updateScheduleDay(day, 'afternoonOut', event.target.value)} type="time" value={entry.afternoonOut || '17:00'} /></div>
                      </div>
                    })}
                  </div>
                ) : null}
                <div className="mt-3 border-t border-navy/10 pt-3">
                  <label className="flex items-center gap-2 text-xs font-semibold text-ink"><input checked={flexitimeEnabled} onChange={(event) => setFlexitimeEnabled(event.target.checked)} type="checkbox" />Flexible daily-hours rule</label>
                  <p className="mt-1 text-xs text-muted">When enabled, only the required daily work minutes matter; no lateness is calculated. Use 480 minutes for 8 hours or 600 minutes for a 4-day, 10-hour schedule.</p>
                  {flexitimeEnabled ? <label className="mt-2 flex items-center gap-2 text-xs text-muted">Required minutes per work day <input className="w-20 rounded border border-black/10 px-2 py-1" min="1" onChange={(event) => setFlexitimeRequiredMinutes(Number(event.target.value) || 480)} type="number" value={flexitimeRequiredMinutes} /></label> : null}
                </div>
              </div>

              <div className="rounded-xl border border-navy/15 bg-navy/5 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-navy-dark">VeriFace access code</p>
                    <p className="mt-0.5 text-xs text-muted">{accessCode || 'Not assigned'}. This unique 4-digit code is used at the kiosk.</p>
                  </div>
                  <button
                    className="shrink-0 rounded-lg border border-navy/20 bg-white px-3 py-2 text-xs font-semibold text-navy-dark transition hover:bg-navy/5 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isRegeneratingAccessCode}
                    onClick={handleRegenerateAccessCode}
                    type="button"
                  >
                    {isRegeneratingAccessCode ? 'Generating...' : 'Generate new code'}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-black/5 bg-stone-50 px-3 py-2 text-sm text-muted">
                {(person.sampleCount ?? 0) > 0
                  ? `${person.sampleCount} biometric sample(s) enrolled.`
                  : 'No biometric samples — employee must enroll face.'}
                {phaseSampleCounts ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {phaseLabels.map(([phaseId, label]) => (
                      <span key={phaseId} className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-muted">
                        {label}: {Number(phaseSampleCounts[phaseId] || 0)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <button
                className="rounded-xl bg-navy px-4 py-3 text-sm font-semibold text-white transition hover:bg-navy-dark"
                onClick={handleOpenReenroll}
                type="button"
              >
                {person.sampleCount > 0 ? 'Re-enroll live capture' : 'Enroll live capture'}
              </button>

              {resetConfirmOpen ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-medium text-red-900">Reset face data for {person.name}?</p>
                  <p className="mt-1 text-xs text-red-700">
                    All stored face samples will be cleared. Use live re-enrollment here afterward, or
                    send them to /registration and move them through review before the kiosk will recognise them again.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      className="flex-1 rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                      disabled={isPending(`biometric-reset-${person.id}`)}
                      onClick={handleBiometricReset}
                      type="button"
                    >
                      {isPending(`biometric-reset-${person.id}`) ? 'Resetting...' : 'Confirm reset'}
                    </button>
                    <button
                      className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-ink transition hover:bg-stone-50"
                      onClick={() => setResetConfirmOpen(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-muted transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                  onClick={() => setResetConfirmOpen(true)}
                  type="button"
                >
                  Reset face data
                </button>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button className="rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-stone-50" onClick={onCancel} type="button">
                  Close
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-full bg-navy px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-dark disabled:opacity-50"
                  disabled={isSaving || !officeId}
                  onClick={handleSave}
                  type="button"
                >
                  {isSaving ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />Saving...</> : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {currentLifecycle === PERSON_LIFECYCLE_INACTIVE && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">This employee is inactive.</p>
            <button
              className="mt-3 rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-stone-50"
              disabled={isPending(`employee-review-${person.id}`)}
              onClick={handleMoveToReview}
              type="button"
            >
              {isPending(`employee-review-${person.id}`) ? 'Moving…' : 'Move to pending review'}
            </button>
          </div>
        )}
        </div>
      </motion.div>
    </section>
  )
}

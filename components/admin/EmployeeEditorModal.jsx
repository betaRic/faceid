'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { useAdminStore } from '@/lib/admin/store'
import { updatePersonRecord } from '@/lib/data-store'
import { Field } from '@/components/shared/ui'
import {
  getEffectivePersonApprovalStatus,
  PERSON_APPROVAL_APPROVED,
  PERSON_APPROVAL_PENDING,
  PERSON_APPROVAL_REJECTED,
} from '@/lib/person-approval'

export default function EmployeeEditorModal({ person, onSave, onCancel }) {
  const router = useRouter()
  const store = useAdminStore()
  const offices = store.offices
  const [officeId, setOfficeId] = useState('')
  const [active, setActive] = useState(true)
  const [approvalStatus, setApprovalStatus] = useState(PERSON_APPROVAL_PENDING)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [panelMode, setPanelMode] = useState('details')

  useEffect(() => {
    if (!person) return
    setOfficeId(person.officeId || '')
    setActive(person.active !== false)
    setApprovalStatus(getEffectivePersonApprovalStatus(person))
    setResetConfirmOpen(false)
    setPanelMode('details')
  }, [person])

  if (!person) return null

  const selectedOffice = offices.find((o) => o.id === officeId)
  const isSaving = store.isPending(`employee-update-${person.id}`)
  const currentApproval = getEffectivePersonApprovalStatus(person)

  async function handleQuickApprove() {
    store.setPending(`employee-approve-${person.id}`, true)
    try {
      await updatePersonRecord(person, { approvalStatus: PERSON_APPROVAL_APPROVED })
      store.refreshEmployees()
      store.addToast(`${person.name} approved`, 'success')
      onSave(person, { approvalStatus: PERSON_APPROVAL_APPROVED })
    } catch (err) {
      store.addToast(err?.message || 'Approval failed', 'error')
    }
    store.setPending(`employee-approve-${person.id}`, false)
  }

  async function handleQuickReject() {
    store.setPending(`employee-reject-${person.id}`, true)
    try {
      await updatePersonRecord(person, { approvalStatus: PERSON_APPROVAL_REJECTED })
      store.refreshEmployees()
      store.addToast(`${person.name} rejected`, 'success')
      onSave(person, { approvalStatus: PERSON_APPROVAL_REJECTED })
    } catch (err) {
      store.addToast(err?.message || 'Rejection failed', 'error')
    }
    store.setPending(`employee-reject-${person.id}`, false)
  }

  async function handleQuickActivate() {
    store.setPending(`employee-activate-${person.id}`, true)
    try {
      await updatePersonRecord(person, { active: true })
      store.refreshEmployees()
      store.addToast(`${person.name} activated`, 'success')
      onSave(person, { active: true })
    } catch (err) {
      store.addToast(err?.message || 'Activation failed', 'error')
    }
    store.setPending(`employee-activate-${person.id}`, false)
  }

  async function handleQuickDeactivate() {
    store.setPending(`employee-deactivate-${person.id}`, true)
    try {
      await updatePersonRecord(person, { active: false })
      store.refreshEmployees()
      store.addToast(`${person.name} deactivated`, 'success')
      onSave(person, { active: false })
    } catch (err) {
      store.addToast(err?.message || 'Deactivation failed', 'error')
    }
    store.setPending(`employee-deactivate-${person.id}`, false)
  }

  async function handleBiometricReset() {
    store.setPending(`biometric-reset-${person.id}`, true)
    setResetConfirmOpen(false)
    try {
      const res = await fetch(`/api/persons/${person.id}/biometric-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (data.ok) {
        store.refreshEmployees()
        store.addToast(`Face data reset — ${person.name} must re-enroll in admin or registration`, 'success')
        onSave(person, { sampleCount: 0, approvalStatus: PERSON_APPROVAL_PENDING })
      } else {
        store.addToast(data.message || 'Reset failed', 'error')
      }
    } catch {
      store.addToast('Reset failed — try again', 'error')
    }
    store.setPending(`biometric-reset-${person.id}`, false)
  }

  async function handleSave() {
    if (!officeId) return
    store.setPending(`employee-update-${person.id}`, true)
    try {
      await updatePersonRecord(person, {
        officeId,
        officeName: selectedOffice?.name || person.officeName,
        active,
        approvalStatus,
      })
      store.refreshEmployees()
      onSave(person, { officeId, active, approvalStatus })
    } catch (err) {
      store.addToast(err?.message || 'Update failed', 'error')
    }
    store.setPending(`employee-update-${person.id}`, false)
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <motion.div
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg rounded-3xl border border-black/5 bg-white p-6 shadow-2xl"
        initial={{ opacity: 0, scale: 0.95 }}
      >
        <>
        <div className="flex items-start gap-4">
          {person.photoUrl ? (
            <img
              alt={person.name}
              className="h-16 w-16 shrink-0 rounded-2xl object-cover"
              src={person.photoUrl}
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-navy/10 text-xl font-bold text-navy-dark">
              {String(person.name || '?')[0]}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-ink">{person.name}</h2>
            <p className="mt-0.5 text-sm text-muted">{person.employeeId}</p>
            {submittedLabel && currentApproval === PERSON_APPROVAL_PENDING && (
              <p className="mt-1 text-xs text-amber-600">{submittedLabel}</p>
            )}
          </div>
        </div>

        {currentApproval === PERSON_APPROVAL_PENDING && (
          <div className="mt-5 rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
            <h3 className="text-sm font-semibold text-amber-900">Pending Approval</h3>
            <p className="mt-1 text-sm text-amber-700">Review this enrollment before approving.</p>
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
                disabled={store.isPending(`employee-approve-${person.id}`)}
                onClick={handleQuickApprove}
                type="button"
              >
                {store.isPending(`employee-approve-${person.id}`) ? 'Approving...' : 'Approve'}
              </button>
              <button
                className="flex-1 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                disabled={store.isPending(`employee-reject-${person.id}`)}
                onClick={handleQuickReject}
                type="button"
              >
                {store.isPending(`employee-reject-${person.id}`) ? 'Rejecting...' : 'Reject'}
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

        {currentApproval === PERSON_APPROVAL_APPROVED && (
          <div className="mt-5">
            <div className="mb-4 flex items-center justify-between rounded-xl border border-black/5 bg-stone-50 p-4">
              <div>
                <p className="text-sm font-medium text-ink">Account Status</p>
                <p className="text-xs text-muted">
                  {person.active !== false ? 'Employee can clock in' : 'Employee is deactivated'}
                </p>
              </div>
              <button
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
                  person.active === false
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'border border-red-200 bg-white text-red-700 hover:bg-red-50'
                }`}
                disabled={
                  store.isPending(`employee-activate-${person.id}`) ||
                  store.isPending(`employee-deactivate-${person.id}`)
                }
                onClick={person.active === false ? handleQuickActivate : handleQuickDeactivate}
                type="button"
              >
                {person.active === false
                  ? (store.isPending(`employee-activate-${person.id}`) ? 'Activating...' : 'Activate')
                  : (store.isPending(`employee-deactivate-${person.id}`) ? 'Deactivating...' : 'Deactivate')
                }
              </button>
            </div>

            <div className="grid gap-4">
              <Field label="Office">
                <select className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy" onChange={(e) => setOfficeId(e.target.value)} value={officeId}>
                  <option value="">Select office</option>
                  {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </Field>

              <div className="rounded-xl border border-black/5 bg-stone-50 px-3 py-2 text-sm text-muted">
                {(person.sampleCount ?? 0) > 0
                  ? `${person.sampleCount} biometric sample(s) enrolled.`
                  : 'No biometric samples — employee must enroll face.'}
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
                    send them to /registration and re-approve them before the kiosk will recognise them again.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      className="flex-1 rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                      disabled={store.isPending(`biometric-reset-${person.id}`)}
                      onClick={handleBiometricReset}
                      type="button"
                    >
                      {store.isPending(`biometric-reset-${person.id}`) ? 'Resetting...' : 'Confirm reset'}
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
                  {isSaving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : null}
                  {isSaving ? 'Saving...' : 'Transfer'}
                </button>
              </div>
            </div>
          </div>
        )}

        {currentApproval === PERSON_APPROVAL_REJECTED && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">This enrollment was rejected.</p>
            <button
              className="mt-3 rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-stone-50"
              onClick={() => setApprovalStatus(PERSON_APPROVAL_PENDING)}
              type="button"
            >
              Move back to Pending
            </button>
          </div>
        )}
        </>
      </motion.div>
    </div>
  )
}

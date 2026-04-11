'use client'

/**
 * EmployeeEditorModal
 *
 * Replaces the inline modal in AdminDashboard that used document.getElementById
 * to read form values — a React anti-pattern that caused race conditions and
 * returned empty/stale values, leading to the Firestore "documentPath" error
 * when approving employees.
 *
 * All form state is now controlled React state. No DOM access.
 */

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Field from './Field'
import {
  getEffectivePersonApprovalStatus,
  PERSON_APPROVAL_APPROVED,
  PERSON_APPROVAL_PENDING,
  PERSON_APPROVAL_REJECTED,
} from '../../lib/person-approval'

export default function EmployeeEditorModal({
  person,
  offices,
  isSaving,
  onSave,
  onCancel,
}) {
  const [officeId, setOfficeId] = useState('')
  const [active, setActive] = useState(true)
  const [approvalStatus, setApprovalStatus] = useState(PERSON_APPROVAL_PENDING)

  // Initialise controlled state every time a new person is opened.
  // This runs synchronously before the user can interact.
  useEffect(() => {
    if (!person) return
    setOfficeId(person.officeId || '')
    setActive(person.active !== false)
    setApprovalStatus(getEffectivePersonApprovalStatus(person))
  }, [person])

  if (!person) return null

  const selectedOffice = offices.find(o => o.id === officeId)

  function handleSave() {
    if (!officeId) return // guard — should not happen with a populated list
    onSave(person, {
      officeId,
      officeName: selectedOffice?.name || person.officeName,
      active,
      approvalStatus,
    })
  }

  const submittedLabel = (() => {
    if (!person.submittedAt) return null
    try {
      const d = person.submittedAt?.toDate
        ? person.submittedAt.toDate()
        : new Date(person.submittedAt)
      const days = Math.floor((Date.now() - d.getTime()) / 86400000)
      if (days === 0) return 'Submitted today'
      if (days === 1) return 'Submitted yesterday'
      return `Submitted ${days} days ago`
    } catch {
      return null
    }
  })()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <motion.div
        animate={{ opacity: 1, scale: 1 }}
        initial={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg rounded-[2rem] border border-black/5 bg-white p-6 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start gap-4">
          {person.photoUrl ? (
            <img
              alt={person.name}
              className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-2 ring-black/5"
              src={person.photoUrl}
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-navy/10 text-xl font-bold text-navy-dark">
              {String(person.name || '?')[0]}
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-ink">{person.name}</h2>
            <p className="mt-0.5 text-sm text-muted">{person.employeeId}</p>
            {submittedLabel && getEffectivePersonApprovalStatus(person) === PERSON_APPROVAL_PENDING ? (
              <p className="mt-1 text-xs text-amber-600">{submittedLabel}</p>
            ) : null}
          </div>
        </div>

        {/* Fields — fully controlled */}
        <div className="mt-5 grid gap-4">
          <Field label="Transfer to office">
            <select
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy"
              value={officeId}
              onChange={e => setOfficeId(e.target.value)}
            >
              {offices.length === 0 ? (
                <option value="">Loading offices…</option>
              ) : (
                offices.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))
              )}
            </select>
          </Field>

          <Field label="Approval status">
            <select
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy"
              value={approvalStatus}
              onChange={e => setApprovalStatus(e.target.value)}
            >
              <option value={PERSON_APPROVAL_PENDING}>Pending review</option>
              <option value={PERSON_APPROVAL_APPROVED}>Approved</option>
              <option value={PERSON_APPROVAL_REJECTED}>Rejected</option>
            </select>
          </Field>

          <Field label="Account status">
            <select
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-navy"
              value={String(active)}
              onChange={e => setActive(e.target.value === 'true')}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </Field>

          {person.sampleCount > 0 && (
            <div className="rounded-2xl border border-black/5 bg-stone-50 px-4 py-3 text-sm text-muted">
              {person.sampleCount} biometric sample(s) enrolled.
            </div>
          )}

          {!officeId && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Select an office before saving.
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSaving || !officeId}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-navy-dark disabled:opacity-60 disabled:cursor-not-allowed"
            onClick={handleSave}
          >
            {isSaving ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : 'Save changes'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

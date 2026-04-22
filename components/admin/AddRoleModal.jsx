'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useAdminStore } from '@/lib/admin/store'

function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())
}

function AddRoleModal({ isOpen, onClose, onSubmit, adminPending = false, hrPending = false }) {
  const offices = useAdminStore((state) => state.offices)
  const [roleType, setRoleType] = useState('admin')
  const [errors, setErrors] = useState({})

  const [adminEmail, setAdminEmail] = useState('')
  const [adminDisplayName, setAdminDisplayName] = useState('')
  const [adminScope, setAdminScope] = useState('office')
  const [adminOfficeId, setAdminOfficeId] = useState('')

  const [hrDisplayName, setHrDisplayName] = useState('')
  const [hrOfficeId, setHrOfficeId] = useState('')
  const [hrPin, setHrPin] = useState('')
  const isPending = roleType === 'admin' ? adminPending : hrPending

  const validation = useMemo(() => {
    if (roleType === 'admin') {
      return {
        adminEmail: !adminEmail.trim()
          ? 'Email is required.'
          : !validateEmail(adminEmail)
            ? 'Enter a valid email address.'
            : '',
        adminDisplayName: !adminDisplayName.trim() ? 'Display name is required.' : '',
        adminOfficeId: adminScope === 'office' && !adminOfficeId ? 'Choose an office.' : '',
      }
    }

    return {
      hrDisplayName: !hrDisplayName.trim() ? 'Display name is required.' : '',
      hrOfficeId: !hrOfficeId ? 'Choose an office.' : '',
      hrPin: !/^\d{4,8}$/.test(hrPin)
        ? 'PIN must be 4 to 8 digits.'
        : '',
    }
  }, [
    adminDisplayName,
    adminEmail,
    adminOfficeId,
    adminScope,
    hrDisplayName,
    hrOfficeId,
    hrPin,
    roleType,
  ])

  const handleSubmit = () => {
    const nextErrors = Object.fromEntries(
      Object.entries(validation).filter(([, value]) => value),
    )
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    if (roleType === 'admin') {
      onSubmit({
        type: 'admin',
        email: adminEmail.trim(),
        displayName: adminDisplayName.trim(),
        scope: adminScope,
        officeId: adminScope === 'office' ? adminOfficeId : '',
      })
    } else {
      onSubmit({
        type: 'hr',
        displayName: hrDisplayName.trim(),
        scope: 'office',
        officeId: hrOfficeId,
        pin: hrPin,
      })
    }
    resetForm()
  }

  const resetForm = () => {
    setAdminEmail('')
    setAdminDisplayName('')
    setAdminScope('office')
    setAdminOfficeId('')
    setHrDisplayName('')
    setHrOfficeId('')
    setHrPin('')
    setErrors({})
    setRoleType('admin')
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <motion.div
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg rounded-3xl border border-black/5 bg-white p-6 shadow-2xl"
        initial={{ opacity: 0, scale: 0.95 }}
      >
        <div className="mb-5">
          <h3 className="text-xl font-bold text-ink">Add New Role</h3>
          <p className="mt-1 text-sm text-muted">Create a new admin or HR user account.</p>
        </div>

        <div className="mb-5 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setRoleType('admin')
              setErrors({})
            }}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              roleType === 'admin'
                ? 'bg-navy text-white'
                : 'border border-black/10 bg-stone-50 text-ink hover:bg-stone-100'
            }`}
          >
            Admin
          </button>
          <button
            type="button"
            onClick={() => {
              setRoleType('hr')
              setErrors({})
            }}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              roleType === 'hr'
                ? 'bg-navy text-white'
                : 'border border-black/10 bg-stone-50 text-ink hover:bg-stone-100'
            }`}
          >
            HR User
          </button>
        </div>

        {roleType === 'admin' ? (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">Email</label>
              <input
                type="email"
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-navy"
                placeholder="admin@company.com"
                value={adminEmail}
                onChange={(e) => {
                  setAdminEmail(e.target.value)
                  setErrors((current) => ({ ...current, adminEmail: '' }))
                }}
              />
              {errors.adminEmail ? <p className="mt-1 text-xs text-red-600">{errors.adminEmail}</p> : null}
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">Display Name</label>
              <input
                type="text"
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-navy"
                placeholder="Admin Name"
                value={adminDisplayName}
                onChange={(e) => {
                  setAdminDisplayName(e.target.value)
                  setErrors((current) => ({ ...current, adminDisplayName: '' }))
                }}
              />
              {errors.adminDisplayName ? <p className="mt-1 text-xs text-red-600">{errors.adminDisplayName}</p> : null}
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">Scope</label>
              <select
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-navy"
                value={adminScope}
                onChange={(e) => {
                  setAdminScope(e.target.value)
                  if (e.target.value === 'regional') setAdminOfficeId('')
                }}
              >
                <option value="office">Office (can manage only their office)</option>
                <option value="regional">Regional (can manage all offices)</option>
              </select>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">Display Name</label>
              <input
                type="text"
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-navy"
                placeholder="HR Name"
                value={hrDisplayName}
                onChange={(e) => {
                  setHrDisplayName(e.target.value)
                  setErrors((current) => ({ ...current, hrDisplayName: '' }))
                }}
              />
              {errors.hrDisplayName ? <p className="mt-1 text-xs text-red-600">{errors.hrDisplayName}</p> : null}
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">Office</label>
              <select
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-navy"
                value={hrOfficeId}
                onChange={(e) => {
                  setHrOfficeId(e.target.value)
                  setErrors((current) => ({ ...current, hrOfficeId: '' }))
                }}
              >
                <option value="">Select office</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
              {errors.hrOfficeId ? <p className="mt-1 text-xs text-red-600">{errors.hrOfficeId}</p> : null}
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">PIN</label>
              <input
                autoComplete="new-password"
                type="password"
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-navy"
                placeholder="4-8 digit PIN"
                maxLength={8}
                value={hrPin}
                onChange={(e) => {
                  const next = e.target.value.replace(/\D/g, '')
                  setHrPin(next)
                  setErrors((current) => ({ ...current, hrPin: '' }))
                }}
              />
              {errors.hrPin ? <p className="mt-1 text-xs text-red-600">{errors.hrPin}</p> : null}
            </div>
          </div>
        )}

        {roleType === 'admin' && adminScope === 'office' ? (
          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">Office</label>
            <select
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-navy"
              value={adminOfficeId}
              onChange={(e) => {
                setAdminOfficeId(e.target.value)
                setErrors((current) => ({ ...current, adminOfficeId: '' }))
              }}
            >
              <option value="">Select office</option>
              {offices.map((office) => (
                <option key={office.id} value={office.id}>{office.name}</option>
              ))}
            </select>
            {errors.adminOfficeId ? <p className="mt-1 text-xs text-red-600">{errors.adminOfficeId}</p> : null}
          </div>
        ) : null}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="flex-1 rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-dark disabled:opacity-50"
          >
            {isPending ? 'Creating...' : 'Create'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

export { AddRoleModal }

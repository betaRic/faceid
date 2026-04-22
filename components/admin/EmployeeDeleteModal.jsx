'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { deletePersonRecord } from '@/lib/data-store'
import { useShallow } from 'zustand/react/shallow'
import { useAdminStore } from '@/lib/admin/store'

export default function EmployeeDeleteModal({ person, onCancel }) {
  const { refreshEmployees, addToast, setPending, isPending } = useAdminStore(useShallow((state) => ({
    refreshEmployees: state.refreshEmployees,
    addToast: state.addToast,
    setPending: state.setPending,
    isPending: state.isPending,
  })))
  const [confirmName, setConfirmName] = useState('')

  useEffect(() => {
    setConfirmName('')
  }, [person])

  if (!person) return null

  const normalizedName = String(person.name || '').trim().toLowerCase()
  const canDelete = confirmName.trim().toLowerCase() === normalizedName
  const pendingKey = `employee-hard-delete-${person.id}`
  const isDeleting = isPending(pendingKey)

  async function handleDelete() {
    if (!canDelete) return
    setPending(pendingKey, true)
    try {
      await deletePersonRecord([], person.id, { hard: true, confirmName })
      refreshEmployees()
      addToast(`${person.name} deleted`, 'success')
      onCancel()
    } catch (err) {
      addToast(err?.message || 'Delete failed', 'error')
    }
    setPending(pendingKey, false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <motion.div
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg rounded-3xl border border-red-200 bg-white p-6 shadow-2xl"
        initial={{ opacity: 0, scale: 0.95 }}
      >
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">Delete Employee</div>
          <h2 className="mt-2 text-xl font-bold text-red-950">{person.name}</h2>
          <div className="mt-1 text-sm text-red-800">{person.employeeId || 'No employee ID'}</div>
          <div className="mt-1 text-sm text-red-700">{person.officeName || 'Unassigned office'}</div>
        </div>

        <div className="mt-5 rounded-2xl border border-black/5 bg-stone-50 p-4 text-sm text-muted">
          This permanently removes the employee record, biometric index, attendance history, attendance locks,
          enrollment locks, and stored enrollment photo. Audit logs stay intact.
        </div>

        <div className="mt-5">
          <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Confirm Exact Name
          </label>
          <input
            className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-red-400"
            onChange={(event) => setConfirmName(event.target.value)}
            placeholder={`Type: ${person.name}`}
            type="text"
            value={confirmName}
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            className="rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-stone-50"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canDelete || isDeleting}
            onClick={handleDelete}
            type="button"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

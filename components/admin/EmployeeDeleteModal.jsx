'use client'

import { motion } from 'framer-motion'
import { deactivatePersonRecord } from '@/lib/data-store'
import { useShallow } from 'zustand/react/shallow'
import { useAdminStore } from '@/lib/admin/store'

export default function EmployeeDeleteModal({ person, onCancel }) {
  const { refreshEmployees, addToast, setPending, isPending } = useAdminStore(useShallow((state) => ({
    refreshEmployees: state.refreshEmployees,
    addToast: state.addToast,
    setPending: state.setPending,
    isPending: state.isPending,
  })))
  if (!person) return null

  const pendingKey = `employee-deactivate-${person.id}`
  const isDeleting = isPending(pendingKey)

  async function handleDelete() {
    setPending(pendingKey, true)
    try {
      await deactivatePersonRecord([], person.id)
      refreshEmployees()
      addToast(`${person.name} deactivated`, 'success')
      onCancel()
    } catch (err) {
      addToast(err?.message || 'Deactivation failed', 'error')
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
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">Deactivate Employee</div>
          <h2 className="mt-2 text-xl font-bold text-red-950">{person.name}</h2>
          <div className="mt-1 text-sm text-red-800">{person.employeeId || 'No employee ID'}</div>
          <div className="mt-1 text-sm text-red-700">{person.officeName || 'Unassigned office'}</div>
        </div>

        <div className="mt-5 rounded-2xl border border-black/5 bg-stone-50 p-4 text-sm text-muted">
          This blocks future attendance and keeps the employee record, biometrics, enrollment photo, attendance,
          DTR, and audit history. You can reactivate the employee later.
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            className="rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-stone-50 disabled:opacity-50"
            disabled={isDeleting}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isDeleting}
            onClick={handleDelete}
            type="button"
          >
            {isDeleting ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />Deactivating...</> : 'Deactivate'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

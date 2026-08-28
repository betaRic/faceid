'use client'

import { useRef } from 'react'
import { deactivatePersonRecord } from '@/lib/data-store'
import { useShallow } from 'zustand/react/shallow'
import { useAdminStore } from '@/lib/admin/store'
import { Button, Dialog } from '@/components/ui'

export default function EmployeeDeleteModal({ person, onCancel }) {
  const cancelRef = useRef(null)
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
    } catch (error) {
      addToast(error?.message || 'Deactivation failed', 'error')
    } finally {
      setPending(pendingKey, false)
    }
  }

  return (
    <Dialog
      footer={(
        <><Button ref={cancelRef} disabled={isDeleting} onClick={onCancel} variant="secondary">Cancel</Button><Button disabled={isDeleting} onClick={handleDelete} variant="destructive">{isDeleting ? 'Deactivating…' : 'Deactivate employee'}</Button></>
      )}
      initialFocusRef={cancelRef}
      onClose={onCancel}
      open
      title="Deactivate employee"
    >
      <div className="rounded-control border border-red-200 bg-red-50 p-4">
        <div className="font-semibold text-red-950">{person.name}</div>
        <div className="mt-1 text-sm text-red-800">{person.employeeId || 'No employee ID'} · {person.officeName || 'Unassigned office'}</div>
      </div>
      <p className="mt-4 text-sm leading-6 text-secondary">This blocks future attendance while preserving the employee record, biometrics, enrollment photo, attendance, DTR, and audit history. The employee can be reactivated later.</p>
    </Dialog>
  )
}

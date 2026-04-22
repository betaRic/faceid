import { useCallback, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAdminStore } from '../store'

export function useAdmins() {
  const store = useAdminStore(useShallow((state) => ({
    admins: state.admins,
    adminsLoaded: state.adminsLoaded,
    setAdmins: state.setAdmins,
    setAdminsLoaded: state.setAdminsLoaded,
    updateAdmin: state.updateAdmin,
    removeAdmin: state.removeAdmin,
    setPending: state.setPending,
    addToast: state.addToast,
    isPending: state.isPending,
  })))
  const abortRef = useRef(null)
  const {
    admins,
    adminsLoaded,
    setAdmins,
    setAdminsLoaded,
    updateAdmin,
    removeAdmin,
    setPending,
    addToast,
    isPending,
  } = store

  const fetchAdmins = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/admins', { signal: abortRef.current.signal })
      const data = await res.json()
      if (data.ok) {
        setAdmins(data)
        setAdminsLoaded(true)
      } else {
        setAdminsLoaded(true)
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Failed to load admins:', err)
      }
      setAdminsLoaded(true)
    }
  }, [setAdmins, setAdminsLoaded])

  useEffect(() => {
    fetchAdmins()
  }, [])

  const handleCreateAdmin = useCallback(async (adminData) => {
    setPending('admin-create', true)
    try {
      const res = await fetch('/api/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminData),
      })
      const data = await res.json()
      if (data.ok) {
        fetchAdmins()
        addToast('Admin created', 'success')
      } else {
        addToast(data.message || 'Failed to create admin', 'error')
      }
    } catch {
      addToast('Failed to create admin', 'error')
    }
    setPending('admin-create', false)
  }, [addToast, fetchAdmins, setPending])

  const handleUpdateAdmin = useCallback(async (admin, updates) => {
    if (updates.scope === 'office' && !updates.officeId) {
      addToast('Please select an office for office-scoped admins', 'error')
      return
    }
    setPending(`admin-update-${admin.id}`, true)
    try {
      const res = await fetch(`/api/admins/${admin.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...admin, ...updates }),
      })
      const data = await res.json()
      if (data.ok) {
        updateAdmin(admin.id, updates)
        addToast('Admin updated', 'success')
      } else {
        addToast(data.message || 'Failed to update admin', 'error')
      }
    } catch {
      addToast('Failed to update admin', 'error')
    }
    setPending(`admin-update-${admin.id}`, false)
  }, [addToast, setPending, updateAdmin])

  const handleDeleteAdmin = useCallback(async (admin) => {
    if (!window.confirm(`Delete admin ${admin.email}?`)) return
    setPending(`admin-delete-${admin.id}`, true)
    try {
      const res = await fetch(`/api/admins/${admin.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.ok) {
        removeAdmin(admin.id)
        addToast('Admin deleted', 'success')
      } else {
        addToast(data.message || 'Failed to delete admin', 'error')
      }
    } catch {
      addToast('Failed to delete admin', 'error')
    }
    setPending(`admin-delete-${admin.id}`, false)
  }, [addToast, removeAdmin, setPending])

  return {
    admins,
    adminsLoaded,
    handleCreateAdmin,
    handleUpdateAdmin,
    handleDeleteAdmin,
    isPending,
  }
}

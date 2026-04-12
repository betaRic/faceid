import { useCallback, useEffect, useRef } from 'react'
import { useAdminStore } from '../store'

export function useAdmins() {
  const store = useAdminStore()
  const abortRef = useRef(null)

  const fetchAdmins = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/admins', { signal: abortRef.current.signal })
      const data = await res.json()
      if (data.ok) {
        store.setAdmins(data)
        store.setAdminsLoaded(true)
      } else {
        store.setAdminsLoaded(true)
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Failed to load admins:', err)
      }
      store.setAdminsLoaded(true)
    }
  }, [])

  useEffect(() => {
    fetchAdmins()
  }, [])

  const handleCreateAdmin = useCallback(async (adminData) => {
    store.setPending('admin-create', true)
    try {
      const res = await fetch('/api/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminData),
      })
      const data = await res.json()
      if (data.ok) {
        fetchAdmins()
        store.addToast('Admin created', 'success')
      } else {
        store.addToast(data.message || 'Failed to create admin', 'error')
      }
    } catch {
      store.addToast('Failed to create admin', 'error')
    }
    store.setPending('admin-create', false)
  }, [fetchAdmins])

  const handleUpdateAdmin = useCallback(async (admin, updates) => {
    if (updates.scope === 'office' && !updates.officeId) {
      store.addToast('Please select an office for office-scoped admins', 'error')
      return
    }
    store.setPending(`admin-update-${admin.id}`, true)
    try {
      const res = await fetch(`/api/admins/${admin.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...admin, ...updates }),
      })
      const data = await res.json()
      if (data.ok) {
        store.updateAdmin(admin.id, updates)
        store.addToast('Admin updated', 'success')
      } else {
        store.addToast(data.message || 'Failed to update admin', 'error')
      }
    } catch {
      store.addToast('Failed to update admin', 'error')
    }
    store.setPending(`admin-update-${admin.id}`, false)
  }, [])

  const handleDeleteAdmin = useCallback(async (admin) => {
    if (!window.confirm(`Delete admin ${admin.email}?`)) return
    store.setPending(`admin-delete-${admin.id}`, true)
    try {
      const res = await fetch(`/api/admins/${admin.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.ok) {
        store.removeAdmin(admin.id)
        store.addToast('Admin deleted', 'success')
      } else {
        store.addToast(data.message || 'Failed to delete admin', 'error')
      }
    } catch {
      store.addToast('Failed to delete admin', 'error')
    }
    store.setPending(`admin-delete-${admin.id}`, false)
  }, [])

  return {
    admins: store.admins,
    adminsLoaded: store.adminsLoaded,
    handleCreateAdmin,
    handleUpdateAdmin,
    handleDeleteAdmin,
    isPending: store.isPending,
  }
}

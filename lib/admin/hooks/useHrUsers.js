'use client'

import { useCallback, useEffect, useState } from 'react'

export function useHrUsers() {
  const [hrUsers, setHrUsers] = useState([])
  const [hrUsersLoaded, setHrUsersLoaded] = useState(false)
  const [pending, setPending] = useState({})

  useEffect(() => {
    fetchHrUsers()
  }, [])

  const fetchHrUsers = useCallback(async () => {
    setPending(prev => ({ ...prev, 'hr-users-fetch': true }))
    try {
      const res = await fetch('/api/hr-users', { credentials: 'include' })
      const data = await res.json()
      if (data.ok) {
        setHrUsers(data.hrUsers || [])
        setHrUsersLoaded(true)
      }
    } catch (err) {
      console.error('Failed to fetch HR users:', err)
    }
    setPending(prev => ({ ...prev, 'hr-users-fetch': false }))
  }, [])

  const createHrUser = useCallback(async (hrUserData) => {
    setPending(prev => ({ ...prev, 'hr-user-create': true }))
    try {
      const res = await fetch('/api/hr-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(hrUserData),
      })
      const data = await res.json()
      if (data.ok) {
        await fetchHrUsers()
        return { ok: true, id: data.id }
      }
      return { ok: false, message: data.message }
    } catch (err) {
      return { ok: false, message: err.message }
    } finally {
      setPending(prev => ({ ...prev, 'hr-user-create': false }))
    }
  }, [fetchHrUsers])

  const updateHrUser = useCallback(async (hrUser, updates) => {
    const key = `hr-user-update-${hrUser.id}`
    setPending(prev => ({ ...prev, [key]: true }))
    try {
      const res = await fetch(`/api/hr-users/${hrUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates),
      })
      const data = await res.json()
      if (data.ok) {
        await fetchHrUsers()
        return { ok: true }
      }
      return { ok: false, message: data.message }
    } catch (err) {
      return { ok: false, message: err.message }
    } finally {
      setPending(prev => ({ ...prev, [key]: false }))
    }
  }, [fetchHrUsers])

  const deleteHrUser = useCallback(async (hrUser) => {
    const key = `hr-user-delete-${hrUser.id}`
    setPending(prev => ({ ...prev, [key]: true }))
    try {
      const res = await fetch(`/api/hr-users/${hrUser.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await res.json()
      if (data.ok) {
        await fetchHrUsers()
        return { ok: true }
      }
      return { ok: false, message: data.message }
    } catch (err) {
      return { ok: false, message: err.message }
    } finally {
      setPending(prev => ({ ...prev, [key]: false }))
    }
  }, [fetchHrUsers])

  const isPending = useCallback((key) => !!pending[key], [pending])

  return {
    hrUsers,
    hrUsersLoaded,
    fetchHrUsers,
    createHrUser,
    updateHrUser,
    deleteHrUser,
    isPending,
  }
}
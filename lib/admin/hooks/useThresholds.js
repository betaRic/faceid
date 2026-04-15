import { useCallback, useEffect, useState } from 'react'
import { useAdminStore } from '@/lib/admin/store'

export function useThresholds() {
  const [sections, setSections] = useState(null)
  const [defaults, setDefaults] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const fetchThresholds = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/thresholds')
      const data = await res.json()
      if (data.ok) {
        setSections(data.sections)
        setDefaults(data.defaults)
      } else {
        setError(data.message || 'Failed to load')
      }
    } catch {
      setError('Network error loading thresholds')
    } finally {
      setLoading(false)
    }
  }, [])

  const saveThresholds = useCallback(async (values) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', values }),
      })
      const data = await res.json()
      if (data.ok) {
        useAdminStore.getState().addToast('Settings saved. Active on next attendance scan.', 'success')
        await fetchThresholds()
        return true
      } else {
        setError(data.message || 'Failed to save')
        return false
      }
    } catch {
      setError('Network error saving thresholds')
      return false
    } finally {
      setSaving(false)
    }
  }, [fetchThresholds])

  const resetThresholds = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      })
      const data = await res.json()
      if (data.ok) {
        useAdminStore.getState().addToast('Thresholds reset to defaults.', 'success')
        await fetchThresholds()
        return true
      } else {
        setError(data.message || 'Failed to reset')
        return false
      }
    } catch {
      setError('Network error resetting thresholds')
      return false
    } finally {
      setSaving(false)
    }
  }, [fetchThresholds])

  useEffect(() => { fetchThresholds() }, [fetchThresholds])

  return { sections, defaults, loading, saving, error, fetchThresholds, saveThresholds, resetThresholds }
}

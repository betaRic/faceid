import { useState, useCallback } from 'react'

export function useAuditLogs() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null)
  const [nextOffset, setNextOffset] = useState(null)

  const fetchLogs = useCallback(async (params = {}) => {
    setLoading(true)
    setError(null)

    try {
      const query = new URLSearchParams()
      if (params.action) query.set('action', params.action)
      if (params.decisionCode) query.set('decisionCode', params.decisionCode)
      if (params.officeId) query.set('officeId', params.officeId)
      if (params.dateFrom) query.set('from', params.dateFrom)
      if (params.dateTo) query.set('to', params.dateTo)
      if (params.limit) query.set('limit', String(params.limit))
      if (params.offset) query.set('offset', params.offset)
      if (params.summary) query.set('summary', 'true')

      const res = await fetch(`/api/admin/audit-logs?${query.toString()}`, {
        signal: params.signal,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.message || 'Failed to fetch audit logs')
      }

      if (params.summary) {
        setSummary(data)
      } else {
        setLogs(prev => params.offset ? [...prev, ...data.logs] : data.logs)
        setNextOffset(data.nextOffset || null)
      }

      return data
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchSummary = useCallback(async (dateFrom, dateTo) => {
    return fetchLogs({ dateFrom, dateTo, summary: true })
  }, [fetchLogs])

  const loadMore = useCallback(async (params = {}) => {
    if (!nextOffset || loading) return
    return fetchLogs({ ...params, offset: nextOffset })
  }, [nextOffset, loading, fetchLogs])

  const clear = useCallback(() => {
    setLogs([])
    setSummary(null)
    setNextOffset(null)
    setError(null)
  }, [])

  return {
    logs,
    summary,
    loading,
    error,
    nextOffset,
    fetchLogs,
    fetchSummary,
    loadMore,
    clear,
    hasMore: nextOffset !== null,
  }
}
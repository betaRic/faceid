'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useAdminStore } from '@/lib/admin/store'

const ACTION_OPTIONS = [
  { value: 'checkin', label: 'Check In (AM or PM)' },
  { value: 'checkout', label: 'Check Out (AM or PM)' },
]

function formatTimestamp(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila',
  })
}

// Build a timestamp from a date string (YYYY-MM-DD) and a time string (HH:MM) in Manila time
function buildManilaTimestamp(dateKey, timeHHMM) {
  const [h, m] = timeHHMM.split(':').map(Number)
  // Construct ISO string in Manila time (+08:00)
  const iso = `${dateKey}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+08:00`
  return new Date(iso).getTime()
}

export default function AttendanceOverrideModal({ row, onClose, onSaved }) {
  const store = useAdminStore()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // Form state
  const [action, setAction] = useState('checkin')
  const [timeValue, setTimeValue] = useState('08:00')
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (row) fetchLogs()
  }, [row])

  async function fetchLogs() {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/admin/attendance?employeeId=${encodeURIComponent(row.employeeId)}&date=${encodeURIComponent(row.dateKey)}`,
      )
      const data = await res.json()
      if (data.ok) setLogs(data.logs || [])
    } catch {}
    setLoading(false)
  }

  async function handleAdd() {
    if (!reason.trim()) {
      store.addToast('A reason is required for every manual override.', 'error')
      return
    }
    setBusy(true)
    try {
      const timestamp = buildManilaTimestamp(row.dateKey, timeValue)
      const res = await fetch('/api/admin/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: row.employeeId,
          name: row.name,
          officeId: row.officeId,
          officeName: row.officeName,
          action,
          timestamp,
          dateKey: row.dateKey,
          reason: reason.trim(),
        }),
      })
      const data = await res.json()
      if (data.ok) {
        store.addToast(`Manual ${action === 'checkin' ? 'check-in' : 'check-out'} added.`, 'success')
        setReason('')
        await fetchLogs()
        onSaved?.()
      } else {
        store.addToast(data.message || 'Failed to add entry.', 'error')
      }
    } catch {
      store.addToast('Failed to add entry.', 'error')
    }
    setBusy(false)
  }

  async function handleDelete(log) {
    if (!window.confirm(`Delete this ${log.action} entry at ${log.time}? This cannot be undone.`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/attendance/${log.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.ok) {
        store.addToast('Entry deleted.', 'success')
        await fetchLogs()
        onSaved?.()
      } else {
        store.addToast(data.message || 'Failed to delete.', 'error')
      }
    } catch {
      store.addToast('Failed to delete.', 'error')
    }
    setBusy(false)
  }

  if (!row) return null

  const sorted = [...logs].sort((a, b) => a.timestamp - b.timestamp)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-xl rounded-3xl border border-black/5 bg-white p-6 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-ink">Attendance Override</h2>
            <p className="mt-0.5 text-sm text-muted">
              {row.name} &middot; {row.employeeId} &middot; {row.dateKey}
            </p>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="shrink-0 rounded-full border border-black/10 px-4 py-2 text-sm font-semibold text-ink hover:bg-stone-50"
          >
            Close
          </button>
        </div>

        {/* Existing log timeline */}
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Recorded entries</p>
          {loading ? (
            <div className="flex justify-center py-6">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-navy border-t-transparent" />
            </div>
          ) : sorted.length === 0 ? (
            <p className="py-4 text-sm text-muted">No entries recorded for this date.</p>
          ) : (
            <div className="mt-2 max-h-52 space-y-2 overflow-y-auto">
              {sorted.map(log => (
                <div
                  key={log.id}
                  className="flex items-center justify-between rounded-xl border border-black/5 bg-stone-50 px-4 py-2.5"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${
                        log.action === 'checkin'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {log.action === 'checkin' ? 'In' : 'Out'}
                    </span>
                    <span className="text-sm font-medium text-ink">{log.time || formatTimestamp(log.timestamp)}</span>
                    {log.source === 'manual_override' && (
                      <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                        MANUAL
                      </span>
                    )}
                    {log.overrideReason && (
                      <span className="min-w-0 truncate text-xs italic text-muted">
                        &ldquo;{log.overrideReason}&rdquo;
                      </span>
                    )}
                  </div>
                  <button
                    className="ml-3 shrink-0 rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-40"
                    disabled={busy}
                    onClick={() => handleDelete(log)}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add manual entry form */}
        <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-blue-800">
            Add manual entry
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-muted">
                Action
              </label>
              <select
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-navy"
                value={action}
                onChange={e => setAction(e.target.value)}
              >
                {ACTION_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-muted">
                Time (Manila)
              </label>
              <input
                type="time"
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-navy"
                value={timeValue}
                onChange={e => setTimeValue(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-muted">
                Reason <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-navy"
                placeholder="e.g. scanner failure"
                value={reason}
                onChange={e => setReason(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
              />
            </div>
          </div>
          <button
            className="mt-3 rounded-xl bg-navy px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-dark disabled:opacity-40"
            disabled={busy || !reason.trim()}
            onClick={handleAdd}
            type="button"
          >
            {busy ? 'Saving…' : 'Add Entry'}
          </button>
        </div>

        <p className="mt-3 text-xs text-muted">
          Every manual addition and deletion is recorded in the audit log with your admin identity.
        </p>
      </motion.div>
    </div>
  )
}

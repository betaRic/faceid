'use client'

import { useEffect, useState } from 'react'
import { useAdminStore } from '@/lib/admin/store'
import { Button, Dialog, EmptyState, Field, Input, LoadingState, Select, Status, Surface } from '@/components/ui'

const ACTION_OPTIONS = [
  { value: 'am_in', action: 'checkin', label: 'AM In' },
  { value: 'am_out', action: 'checkout', label: 'AM Out' },
  { value: 'pm_in', action: 'checkin', label: 'PM In' },
  { value: 'pm_out', action: 'checkout', label: 'PM Out' },
]

const SLOT_FIELDS = { am_in: 'amIn', am_out: 'amOut', pm_in: 'pmIn', pm_out: 'pmOut' }
const SLOT_DEFAULTS = { am_in: '08:00', am_out: '12:00', pm_in: '13:00', pm_out: '17:00' }

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
  const [action, setAction] = useState('am_in')
  const [timeValue, setTimeValue] = useState('08:00')
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (row) fetchLogs()
  }, [row])

  useEffect(() => {
    const current = row?.[SLOT_FIELDS[action]]
    setTimeValue(/^\d{2}:\d{2}$/.test(String(current || '')) ? current : SLOT_DEFAULTS[action])
  }, [action, row])

  async function fetchLogs() {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/admin/attendance?employeeId=${encodeURIComponent(row.employeeId)}&personId=${encodeURIComponent(row.personId || '')}&date=${encodeURIComponent(row.dateKey)}`,
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
      const selectedAction = ACTION_OPTIONS.find(option => option.value === action)
      const res = await fetch('/api/admin/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: row.employeeId,
          personId: row.personId || '',
          name: row.name,
          officeId: row.officeId,
          officeName: row.officeName,
          action: selectedAction?.action || 'checkin',
          manualSlot: action,
          timestamp,
          dateKey: row.dateKey,
          reason: reason.trim(),
        }),
      })
      const data = await res.json()
      if (data.ok) {
        store.addToast(`Manual ${selectedAction?.label || 'attendance'} added.`, 'success')
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

  async function handleFieldDutyReview(log, fieldDutyStatus) {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/attendance/${log.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldDutyStatus }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.message || 'Failed to review field-duty request.')
      store.addToast(`Field-duty request ${fieldDutyStatus}.`, 'success')
      await fetchLogs()
      onSaved?.()
    } catch (error) {
      store.addToast(error?.message || 'Failed to review field-duty request.', 'error')
    }
    setBusy(false)
  }

  if (!row) return null

  const sorted = [...logs].sort((a, b) => a.timestamp - b.timestamp)
  const originalValue = row[SLOT_FIELDS[action]] || 'No entry'

  return (
    <Dialog
      footer={(
        <>
          <Button disabled={busy} onClick={onClose} variant="secondary">Cancel</Button>
          <Button disabled={busy || !reason.trim()} onClick={handleAdd}>{busy ? 'Saving…' : 'Save correction'}</Button>
        </>
      )}
      onClose={onClose}
      open
      title="Attendance correction"
    >
      <div className="grid gap-5">
        <Surface className="px-4 py-3">
          <p className="font-semibold text-foreground">{row.name}</p>
          <p className="mt-1 text-sm text-secondary">{row.employeeId || 'No employee ID'} · {row.dateKey} · {row.officeName}</p>
        </Surface>

        <section aria-labelledby="recorded-entries-heading">
          <h3 className="text-sm font-semibold text-foreground" id="recorded-entries-heading">Recorded entries</h3>
          {loading ? (
            <LoadingState className="py-5" label="Loading recorded entries…" />
          ) : sorted.length === 0 ? (
            <EmptyState className="mt-2" description="A manual correction will create the first entry for this date." title="No entries recorded" />
          ) : (
            <div className="mt-2 grid gap-2">
              {sorted.map(log => (
                <Surface className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between" key={log.id}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Status tone={log.action === 'checkin' ? 'active' : 'pending'}>{log.action === 'checkin' ? 'In' : 'Out'}</Status>
                      <span className="text-sm font-semibold text-foreground">{log.time || formatTimestamp(log.timestamp)}</span>
                      {log.source === 'manual_override' ? <Status>Manual</Status> : null}
                      {log.fieldDutyStatus ? <Status tone={log.fieldDutyStatus === 'approved' ? 'active' : log.fieldDutyStatus === 'rejected' ? 'rejected' : 'pending'}>Field duty · {log.fieldDutyStatus}</Status> : null}
                    </div>
                    {log.overrideReason ? <p className="mt-2 text-xs text-secondary">Reason: {log.overrideReason}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {log.fieldDutyStatus === 'pending' ? (
                      <>
                        <Button disabled={busy} onClick={() => handleFieldDutyReview(log, 'approved')} variant="secondary">Approve</Button>
                        <Button disabled={busy} onClick={() => handleFieldDutyReview(log, 'rejected')} variant="secondary">Reject</Button>
                      </>
                    ) : null}
                    <Button disabled={busy} onClick={() => handleDelete(log)} variant="quiet">Delete</Button>
                  </div>
                </Surface>
              ))}
            </div>
          )}
        </section>

        <Surface className="grid gap-4 p-4">
          <h3 className="text-sm font-semibold text-foreground">Propose correction</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Attendance slot">
              <Select onChange={event => setAction(event.target.value)} value={action}>
                {ACTION_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            </Field>
            <div className="grid gap-2">
              <span className="text-sm font-medium text-foreground">Original</span>
              <div className="flex min-h-11 items-center rounded-control border border-line bg-canvas px-3 py-2 text-sm text-secondary">{originalValue}</div>
            </div>
            <Field label="Proposed">
              <Input onChange={event => setTimeValue(event.target.value)} type="time" value={timeValue} />
            </Field>
          </div>
          <Field label="Reason" required>
            <Input onChange={event => setReason(event.target.value)} onKeyDown={event => event.key === 'Enter' && handleAdd()} placeholder="Example: scanner failure" value={reason} />
          </Field>
          <p className="text-xs leading-5 text-secondary">The signed-in staff account, original records, proposed value, reason, and resulting change are retained in the audit trail.</p>
        </Surface>
      </div>
    </Dialog>
  )
}

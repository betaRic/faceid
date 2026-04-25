'use client'

import { memo, useCallback, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAdminStore } from '@/lib/admin/store'

const CONFIRM_PHRASE_FULL = 'DELETE ALL EMPLOYEES'
const CONFIRM_PHRASE_BIO = 'CLEAR ALL FACES'

const MODES = {
  full: {
    confirmPhrase: CONFIRM_PHRASE_FULL,
    endpoint: '/api/admin/maintenance/reset',
    title: 'Full reset',
    subtitle: 'Wipes employees, attendance, biometrics, audit logs. Keeps offices and admin accounts. Use this for first-time deployment to start clean.',
    confirmLabel: 'Reset all employee data',
    busyLabel: 'Resetting…',
  },
  biometric: {
    confirmPhrase: CONFIRM_PHRASE_BIO,
    endpoint: '/api/admin/maintenance/biometric-reset',
    title: 'Biometric-only reset',
    subtitle: 'Keeps employee records (name, ID, office, position) and attendance history. Wipes face descriptors only — every employee returns to pending and must re-capture their face.',
    confirmLabel: 'Clear all face data',
    busyLabel: 'Clearing…',
  },
}

export const MaintenancePanel = memo(function MaintenancePanel() {
  const { roleScope, addToast } = useAdminStore(useShallow(state => ({
    roleScope: state.roleScope,
    addToast: state.addToast,
  })))

  const [mode, setMode] = useState('full')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [preview, setPreview] = useState(null)
  const [confirmInput, setConfirmInput] = useState('')

  const activeMode = MODES[mode]

  const handlePreview = useCallback(async () => {
    setPreviewLoading(true)
    setPreview(null)
    setConfirmInput('')
    try {
      const response = await fetch(activeMode.endpoint, { credentials: 'include' })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.ok) {
        addToast(data?.message || 'Failed to load preview', 'error')
        setPreviewLoading(false)
        return
      }
      setPreview(data)
    } catch (error) {
      addToast(error?.message || 'Failed to load preview', 'error')
    }
    setPreviewLoading(false)
  }, [addToast, activeMode.endpoint])

  const handleReset = useCallback(async () => {
    if (confirmInput.trim() !== activeMode.confirmPhrase) {
      addToast(`Type ${activeMode.confirmPhrase} to confirm.`, 'error')
      return
    }
    setResetLoading(true)
    try {
      const response = await fetch(activeMode.endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.ok) {
        addToast(data?.message || 'Reset failed', 'error')
        setResetLoading(false)
        return
      }
      const message = mode === 'full'
        ? `Reset complete. Deleted ${data.totalDeleted} documents.`
        : `Biometric reset complete. ${data.pendingReviewCount} employees now require re-enrollment.`
      addToast(message, 'success')
      setPreview(null)
      setConfirmInput('')
    } catch (error) {
      addToast(error?.message || 'Reset failed', 'error')
    }
    setResetLoading(false)
  }, [confirmInput, addToast, activeMode, mode])

  const handleSwitchMode = useCallback((nextMode) => {
    setMode(nextMode)
    setPreview(null)
    setConfirmInput('')
  }, [])

  if (roleScope !== 'regional') return null

  const willDelete = preview?.willDelete || {}
  const willKeep = preview?.willKeep || {}
  const affected = preview?.affected || null
  const totalDelete = Object.values(willDelete).reduce((sum, value) => sum + Number(value || 0), 0)

  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold text-rose-900">Maintenance — Reset</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-rose-800">{activeMode.subtitle}</p>
        </div>
      </div>

      <div className="mt-3 inline-flex rounded-full border border-rose-200 bg-white p-0.5 text-xs font-semibold">
        {Object.entries(MODES).map(([key, def]) => (
          <button
            key={key}
            className={`rounded-full px-3 py-1.5 transition ${
              mode === key ? 'bg-rose-700 text-white' : 'text-rose-700 hover:bg-rose-50'
            }`}
            onClick={() => handleSwitchMode(key)}
            type="button"
          >
            {def.title}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          className="rounded-full border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-800 transition hover:bg-rose-50 disabled:opacity-60"
          disabled={previewLoading || resetLoading}
          onClick={handlePreview}
          type="button"
        >
          {previewLoading ? 'Loading…' : 'Preview reset'}
        </button>
        {preview && mode === 'full' ? (
          <span className="text-xs text-rose-800">
            Will delete {totalDelete} documents across {Object.keys(willDelete).length} collections.
          </span>
        ) : null}
        {preview && mode === 'biometric' && affected ? (
          <span className="text-xs text-rose-800">
            Will clear {affected.totalSamples} face samples from {affected.personsWithDescriptors} employees and {affected.biometricIndexEntries} index entries.
          </span>
        ) : null}
      </div>

      {preview && mode === 'full' ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-rose-200 bg-white p-3 text-xs">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-700">Will delete</div>
            <ul className="grid gap-1 font-mono text-rose-900">
              {Object.entries(willDelete).map(([key, value]) => (
                <li key={key} className="flex items-center justify-between gap-2">
                  <span>{key}</span>
                  <span className="font-semibold">{value}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-white p-3 text-xs">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Will keep</div>
            <ul className="grid gap-1 font-mono text-emerald-900">
              {Object.entries(willKeep).map(([key, value]) => (
                <li key={key} className="flex items-center justify-between gap-2">
                  <span>{key}</span>
                  <span className="font-semibold">{value}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {preview && mode === 'biometric' && affected ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-rose-200 bg-white p-3 text-xs">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-700">Will clear</div>
            <ul className="grid gap-1 font-mono text-rose-900">
              <li className="flex items-center justify-between gap-2"><span>Employees with face data</span><span className="font-semibold">{affected.personsWithDescriptors}</span></li>
              <li className="flex items-center justify-between gap-2"><span>Total face samples</span><span className="font-semibold">{affected.totalSamples}</span></li>
              <li className="flex items-center justify-between gap-2"><span>Biometric index entries</span><span className="font-semibold">{affected.biometricIndexEntries}</span></li>
            </ul>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-white p-3 text-xs">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Will keep</div>
            <ul className="grid gap-1 font-mono text-emerald-900">
              <li>Person records (name, ID, office, position, division)</li>
              <li>Attendance history</li>
              <li>Offices, admins, audit logs</li>
            </ul>
          </div>
        </div>
      ) : null}

      {preview ? (
        <div className="mt-4 grid gap-2 rounded-xl border border-rose-300 bg-white p-3">
          <label className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">
            Type <span className="font-mono text-rose-900">{activeMode.confirmPhrase}</span> to confirm
          </label>
          <input
            className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 font-mono text-sm uppercase tracking-wide text-rose-900 outline-none transition focus:border-rose-500"
            disabled={resetLoading}
            onChange={event => setConfirmInput(event.target.value.toUpperCase())}
            placeholder={activeMode.confirmPhrase}
            type="text"
            value={confirmInput}
          />
          <button
            className="mt-1 w-full rounded-full bg-rose-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={resetLoading || confirmInput.trim() !== activeMode.confirmPhrase}
            onClick={handleReset}
            type="button"
          >
            {resetLoading ? activeMode.busyLabel : activeMode.confirmLabel}
          </button>
        </div>
      ) : null}
    </div>
  )
})

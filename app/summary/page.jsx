'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import AppShell from '@/components/AppShell'

function SummaryContent() {
  const searchParams = useSearchParams()
  const employeeId = searchParams.get('employeeId') || ''
  
  const [attendance, setAttendance] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [person, setPerson] = useState(null)

  useEffect(() => {
    if (!employeeId) {
      setLoading(false)
      return
    }

    async function fetchData() {
      try {
        const date = new Date().toISOString().split('T')[0]
        const res = await fetch(`/api/attendance/me?employeeId=${encodeURIComponent(employeeId)}&date=${date}`)
        const data = await res.json()
        
        if (data.ok) {
          setAttendance(data.entries || [])
          
          if (data.entries && data.entries.length > 0) {
            setPerson({
              name: data.entries[0].name,
              employeeId: data.entries[0].employeeId,
              officeName: data.entries[0].officeName,
            })
          }
        } else {
          setError(data.message || 'Failed to load attendance')
        }
      } catch (err) {
        setError('Failed to load attendance')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [employeeId])

  const formatTime = (timestamp) => {
    if (!timestamp) return '--:--'
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-PH', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    })
  }

  const formatDate = (timestamp) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return date.toLocaleDateString('en-PH', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const checkIns = attendance.filter(a => a.action === 'checkin')
  const checkOuts = attendance.filter(a => a.action === 'checkout')

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl text-ink">My Attendance</h1>
        <button
          onClick={() => window.close()}
          className="rounded-xl border border-black/10 px-4 py-2 text-sm text-muted transition hover:bg-black/5"
        >
          Close
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-navy border-t-transparent" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-700">
          {error}
        </div>
      ) : !person ? (
        <div className="rounded-2xl border border-black/10 bg-white p-6 text-center">
          <p className="text-muted">No attendance records found for today.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-black/10 bg-white p-6">
            <div className="text-center">
              <div className="text-sm font-semibold uppercase tracking-wider text-muted">
                {formatDate(Date.now())}
              </div>
              <div className="mt-2 font-display text-3xl text-ink">
                {person.name}
              </div>
              <div className="mt-1 text-sm text-muted">
                {person.employeeId}
              </div>
              <div className="mt-1 text-sm text-muted">
                {person.officeName}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-black/10 bg-white p-6">
            <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-wider text-muted">
              Today&apos;s Record
            </h2>

            {attendance.length === 0 ? (
              <p className="text-center text-muted">No attendance recorded today.</p>
            ) : (
              <div className="space-y-3">
                {attendance
                  .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0))
                  .map((record, idx) => (
                    <div
                      key={record.id || idx}
                      className="flex items-center justify-between rounded-xl border border-black/5 bg-stone-50 p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                          record.action === 'checkin' 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {record.action === 'checkin' ? (
                            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M5 12l5 5L20 7" />
                            </svg>
                          ) : (
                            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M17 7l-5 5-5-5M17 17H7" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-ink capitalize">
                            {record.action === 'checkin' ? 'Check In' : 'Check Out'}
                          </div>
                          <div className="text-sm text-muted">
                            {record.attendanceMode || 'On-site'}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-display text-xl text-ink">
                          {formatTime(record.timestamp)}
                        </div>
                        {record.geofenceStatus && (
                          <div className="text-xs text-muted">
                            {record.geofenceStatus}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-black/10 bg-white p-4 text-center">
              <div className="text-3xl font-display text-emerald-600">
                {checkIns.length}
              </div>
              <div className="text-sm text-muted">Check Ins</div>
            </div>
            <div className="rounded-2xl border border-black/10 bg-white p-4 text-center">
              <div className="text-3xl font-display text-amber-600">
                {checkOuts.length}
              </div>
              <div className="text-sm text-muted">Check Outs</div>
            </div>
          </div>

          <button
            onClick={() => window.history.back()}
            className="w-full rounded-2xl bg-navy py-4 text-center font-semibold text-white transition hover:bg-navy/90"
          >
            Back to Kiosk
          </button>
        </div>
      )}
    </div>
  )
}

export default function SummaryPage() {
  return (
    <AppShell>
      <div className="page-frame">
        <Suspense fallback={
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-navy border-t-transparent" />
          </div>
        }>
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <SummaryContent />
          </motion.div>
        </Suspense>
      </div>
    </AppShell>
  )
}

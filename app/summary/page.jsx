'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import AppShell from '@/components/AppShell'
import { formatAttendanceDateKey } from '@/lib/attendance-time'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function SummaryContent() {
  const searchParams = useSearchParams()
  const urlEmployeeId = searchParams.get('employeeId') || ''
  const [employeeId, setEmployeeId] = useState(urlEmployeeId)
  
  const [monthlyData, setMonthlyData] = useState(null)
  const [dailyData, setDailyData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (urlEmployeeId) {
      setEmployeeId(urlEmployeeId)
    } else {
      const stored = sessionStorage.getItem('currentEmployeeId')
      if (stored) setEmployeeId(stored)
    }
  }, [urlEmployeeId])

  useEffect(() => {
    if (!employeeId) {
      setLoading(false)
      return
    }

    setLoading(true)

    async function fetchData() {
      try {
        const monthlyRes = await fetch(`/api/attendance/monthly?employeeId=${encodeURIComponent(employeeId)}`)
        const monthlyJson = await monthlyRes.json()
        
        const date = formatAttendanceDateKey(Date.now())
        const dailyRes = await fetch(`/api/attendance/me?employeeId=${encodeURIComponent(employeeId)}&date=${date}`)
        const dailyJson = await dailyRes.json()
        
        if (monthlyJson.ok) {
          setMonthlyData(monthlyJson)
        }
        if (dailyJson.ok) {
          setDailyData(dailyJson.entries || [])
        }
        
        if (!monthlyJson.ok && !dailyJson.ok) {
          const accessDenied = monthlyRes.status === 401 || monthlyRes.status === 403 || dailyRes.status === 401 || dailyRes.status === 403
          if (accessDenied) {
            sessionStorage.removeItem('currentEmployeeId')
            setError('Attendance view expired. Scan again at the kiosk.')
          } else {
            setError(monthlyJson.message || dailyJson.message || 'Failed to load attendance')
          }
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
      timeZone: 'Asia/Manila',
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    })
  }

  const dayOfMonth = new Date().getDate()
  const weekDay = new Date().toLocaleDateString('en-PH', { weekday: 'short' })
  const currentMonthName = MONTH_NAMES[new Date().getMonth()]

  const checkInsToday = dailyData.filter(a => a.action === 'checkin').length
  const checkOutsToday = dailyData.filter(a => a.action === 'checkout').length

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-xl text-ink">My Attendance</h1>
        <button
          onClick={() => window.history.back()}
          className="rounded-xl border border-black/10 px-4 py-2 text-sm text-muted transition hover:bg-black/5"
        >
          Back
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-navy border-t-transparent" />
        </div>
      ) : !employeeId ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-700">
          Please log in through the Kiosk first to view your attendance.
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-700">
          {error}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-navy/10 bg-navy/5 p-4 text-center">
              <div className="font-display text-3xl text-navy">{dayOfMonth}</div>
              <div className="text-xs font-medium uppercase tracking-wider text-navy/70">{weekDay}</div>
            </div>
            <div className="rounded-2xl border border-emerald/10 bg-emerald/5 p-4 text-center">
              <div className="font-display text-3xl text-emerald-600">{checkInsToday || '--'}</div>
              <div className="text-xs font-medium uppercase tracking-wider text-emerald-600/70">Check In</div>
            </div>
            <div className="rounded-2xl border border-amber/10 bg-amber/5 p-4 text-center">
              <div className="font-display text-3xl text-amber-600">{checkOutsToday || '--'}</div>
              <div className="text-xs font-medium uppercase tracking-wider text-amber-600/70">Check Out</div>
            </div>
          </div>

          {monthlyData && (
            <div className="rounded-2xl border border-black/10 bg-white p-5">
              <div className="mb-4 text-center text-sm font-semibold uppercase tracking-wider text-muted">
                {monthlyData.month && MONTH_NAMES[monthlyData.month - 1]} {monthlyData.year} Summary
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="font-display text-2xl text-ink">{monthlyData.totalDays}</div>
                  <div className="text-xs text-muted">Days</div>
                </div>
                <div className="text-center">
                  <div className="font-display text-2xl text-emerald-600">{monthlyData.checkIns}</div>
                  <div className="text-xs text-muted">Check In</div>
                </div>
                <div className="text-center">
                  <div className="font-display text-2xl text-amber-600">{monthlyData.checkOuts}</div>
                  <div className="text-xs text-muted">Check Out</div>
                </div>
                <div className="text-center">
                  <div className="font-display text-2xl text-navy">{monthlyData.wfhCount}</div>
                  <div className="text-xs text-muted">WFH</div>
                </div>
              </div>
            </div>
          )}

          {dailyData.length > 0 && (
            <div className="rounded-2xl border border-black/10 bg-white p-5">
              <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
                Today&apos;s Record
              </div>
              <div className="space-y-2">
                {dailyData
                  .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0))
                  .map((record, idx) => (
                    <div
                      key={record.id || idx}
                      className="flex items-center justify-between rounded-xl border border-black/5 bg-stone-50 p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                          record.action === 'checkin' 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {record.action === 'checkin' ? 'IN' : 'OUT'}
                        </div>
                        <div className="text-sm">
                          <div className="font-medium text-ink capitalize">{record.action === 'checkin' ? 'Check In' : 'Check Out'}</div>
                          <div className="text-xs text-muted">{record.attendanceMode || 'On-site'}</div>
                        </div>
                      </div>
                      <div className="font-display text-lg text-ink">
                        {formatTime(record.timestamp)}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function SummaryPage() {
  return (
    <AppShell fitViewport contentClassName="px-4 py-4 sm:px-6">
      <div className="page-frame h-full min-h-0">
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

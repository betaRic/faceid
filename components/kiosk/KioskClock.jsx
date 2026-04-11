import { useEffect, useState } from 'react'
import { formatTime, formatDate } from '@/lib/kiosk-utils'

export default function KioskClock() {
  const [clock, setClock] = useState('')
  const [dateStr, setDateStr] = useState('')

  useEffect(() => {
    const tick = () => {
      const now = Date.now()
      setClock(formatTime(now))
      setDateStr(formatDate(now))
    }

    tick()
    const interval = window.setInterval(tick, 1000)
    return () => window.clearInterval(interval)
  }, [])

  return { clock, dateStr }
}
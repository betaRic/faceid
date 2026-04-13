'use client'

import { useCallback, useEffect, useRef } from 'react'

const MAX_SAMPLES = 100

function percentile(arr, p) {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

export function useKioskMetrics() {
  const samplesRef = useRef([])
  const sessionStartRef = useRef(Date.now())

  const recordScan = useCallback((durationMs) => {
    samplesRef.current.push({ type: 'scan', duration: durationMs, ts: Date.now() })
    if (samplesRef.current.length > MAX_SAMPLES) samplesRef.current.shift()
  }, [])

  const recordVerification = useCallback((durationMs, success) => {
    samplesRef.current.push({ type: 'verify', duration: durationMs, success, ts: Date.now() })
    if (samplesRef.current.length > MAX_SAMPLES) samplesRef.current.shift()
  }, [])

  const recordNetwork = useCallback((durationMs, success) => {
    samplesRef.current.push({ type: 'network', duration: durationMs, success, ts: Date.now() })
    if (samplesRef.current.length > MAX_SAMPLES) samplesRef.current.shift()
  }, [])

  const getStats = useCallback(() => {
    const scans = samplesRef.current.filter(s => s.type === 'scan').map(s => s.duration)
    const verifications = samplesRef.current.filter(s => s.type === 'verify').map(s => s.duration)
    const networks = samplesRef.current.filter(s => s.type === 'network').map(s => s.duration)
    const successfulVerifications = samplesRef.current.filter(s => s.type === 'verify' && s.success)
    const totalVerifications = samplesRef.current.filter(s => s.type === 'verify')

    return {
      sessionDuration: Date.now() - sessionStartRef.current,
      sampleCount: samplesRef.current.length,
      scans: {
        count: scans.length,
        avg: scans.length ? scans.reduce((a, b) => a + b, 0) / scans.length : 0,
        p50: percentile(scans, 50),
        p95: percentile(scans, 95),
        min: Math.min(...scans, Infinity),
        max: Math.max(...scans, -Infinity),
      },
      verifications: {
        count: verifications.length,
        avg: verifications.length ? verifications.reduce((a, b) => a + b, 0) / verifications.length : 0,
        p50: percentile(verifications, 50),
        p95: percentile(verifications, 95),
        successRate: totalVerifications.length ? (successfulVerifications.length / totalVerifications.length) * 100 : 0,
      },
      network: {
        count: networks.length,
        avg: networks.length ? networks.reduce((a, b) => a + b, 0) / networks.length : 0,
        p50: percentile(networks, 50),
        p95: percentile(networks, 95),
      },
    }
  }, [])

  const metricsRef = useRef({ recordScan, recordVerification, recordNetwork, getStats })
  metricsRef.current = { recordScan, recordVerification, recordNetwork, getStats }

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      window.getKioskMetrics = () => metricsRef.current
      return () => { delete window.getKioskMetrics }
    }
  }, [])

  return { recordScan, recordVerification, recordNetwork, getStats }
}

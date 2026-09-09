export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NODE_ENV === 'test'
    || process.env.NEXT_PHASE === 'phase-production-build' || !process.env.DATABASE_URL) return
  const key = Symbol.for('faceattend.memoryRetention')
  if (globalThis[key]) return
  const [{ startMemoryRetention }, { purgeExpiredBiometricMemory }, { purgePhoneScanReports }] = await Promise.all([
    import('./lib/biometrics/memory-retention.js'),
    import('./lib/postgres/biometric-memory-retention.js'),
    import('./lib/postgres/phone-scan-reports.js'),
  ])
  // Cleanup remains enabled when collection is off. No biometric decision uses
  // these rows; restart cleanup also handles expiry while the website was asleep.
  globalThis[key] = startMemoryRetention({ purge: async () => {
    const results = await Promise.allSettled([purgeExpiredBiometricMemory(), purgePhoneScanReports()])
    if (results.some(result => result.status === 'rejected')) throw new Error('Optional report cleanup failed')
  } })
}

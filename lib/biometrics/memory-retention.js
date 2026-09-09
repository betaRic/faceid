export function startMemoryRetention({ purge, every = setInterval, cancel = clearInterval,
  onFailure = () => console.warn('[biometric-memory] Retention cleanup failed.') }) {
  let running = false
  let stopped = false
  const run = async () => {
    if (running || stopped) return
    running = true
    try { await purge() }
    catch { try { onFailure() } catch { /* Never affect server availability. */ } }
    finally { running = false }
  }
  void run()
  const timer = every(run, 60 * 60 * 1000)
  timer.unref?.()
  return () => { stopped = true; cancel(timer) }
}

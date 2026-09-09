// Optional, bounded, post-response work. A restart may drop a candidate; it must
// never drop attendance. No durable queue or second face inference is required.
let pending = 0
export function scheduleMemoryCollection(candidate, { enabled = false, schedule, collect, onFailure = () => {} } = {}) {
  if (!enabled || !candidate?.attendanceId || !candidate.personId || candidate.originalAccepted !== true
    || candidate.fieldDutyPending || candidate.frames?.length !== 2 || pending >= 2) return false
  let snapshot
  try { snapshot = structuredClone(candidate) } catch { return false }
  pending++
  try {
    schedule(async () => {
      try { await collect(snapshot) }
      catch { try { onFailure() } catch { /* Observability is optional too. */ } }
      finally { pending-- }
    })
    return true
  } catch {
    pending--
    return false
  }
}

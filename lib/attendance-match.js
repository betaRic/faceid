export function saveAttendanceMatch(match) {
  try {
    localStorage.setItem('lastScanMatch', JSON.stringify({
      name: match.name,
      employeeId: match.employeeId,
      officeName: match.officeName || '',
      timestamp: Date.now(),
      blocked: match.detail ? true : false,
      blockReason: match.detail || null,
    }))
  } catch {}
}
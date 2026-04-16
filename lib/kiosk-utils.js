import { ATTENDANCE_TIME_ZONE } from './attendance-time'

export function createKioskClockFormatter() {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: ATTENDANCE_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

export function createKioskDateFormatter() {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: ATTENDANCE_TIME_ZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function createKioskHourFormatter() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ATTENDANCE_TIME_ZONE,
    hour: '2-digit',
    hour12: false,
  })
}

let kioskClockFormatter = null
let kioskDateFormatter = null
let kioskHourFormatter = null

function getKioskClockFormatter() {
  if (!kioskClockFormatter) kioskClockFormatter = createKioskClockFormatter()
  return kioskClockFormatter
}

function getKioskDateFormatter() {
  if (!kioskDateFormatter) kioskDateFormatter = createKioskDateFormatter()
  return kioskDateFormatter
}

function getKioskHourFormatter() {
  if (!kioskHourFormatter) kioskHourFormatter = createKioskHourFormatter()
  return kioskHourFormatter
}

export function formatTime(timestamp) {
  return getKioskClockFormatter().format(new Date(timestamp))
}

export function formatDate(timestamp) {
  return getKioskDateFormatter().format(new Date(timestamp))
}

export function getGreeting(timestamp) {
  const hour = Number(getKioskHourFormatter().format(new Date(timestamp)))
  if (!Number.isFinite(hour)) return 'Welcome'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function drawBracketBox(ctx, box, color, label, confidence, scaleX = 1, scaleY = 1) {
  const x = box.x * scaleX
  const y = box.y * scaleY
  const width = box.width * scaleX
  const height = box.height * scaleY
  const avgScale = (scaleX + scaleY) / 2
  const corner = Math.max(12, 20 * avgScale)
  const lineWidth = Math.max(2, 2.5 * avgScale)

  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth

  ;[
    [[x, y + corner], [x, y], [x + corner, y]],
    [[x + width - corner, y], [x + width, y], [x + width, y + corner]],
    [[x + width, y + height - corner], [x + width, y + height], [x + width - corner, y + height]],
    [[x + corner, y + height], [x, y + height], [x, y + height - corner]],
  ].forEach(points => {
    ctx.beginPath()
    points.forEach(([px, py], index) => {
      if (index === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.stroke()
  })

  if (!label) return

  const fontSize = Math.max(12, 14 * avgScale)
  ctx.font = `bold ${fontSize}px "Outfit", sans-serif`
  const text = confidence != null ? `${label} ${(confidence * 100).toFixed(0)}%` : label
  const textWidth = ctx.measureText(text).width + fontSize
  const labelHeight = fontSize + 8

  ctx.fillStyle = `${color}cc`
  ctx.fillRect(x, y - labelHeight - 4, textWidth, labelHeight)
  ctx.fillStyle = '#06120f'
  ctx.fillText(text, x + fontSize / 2, y - 8)
}

// Draw a warning that face is detected but OUTSIDE the oval - STRICT mode visual feedback
export function drawOutsideOvalWarning(ctx, box, sourceWidth, sourceHeight, scaleX = 1, scaleY = 1) {
  const x = box.x * scaleX
  const y = box.y * scaleY
  const width = box.width * scaleX
  const height = box.height * scaleY
  const avgScale = (scaleX + scaleY) / 2
  
  // Red dashed border around face detected outside oval
  ctx.strokeStyle = '#ef4444'
  ctx.lineWidth = Math.max(3, 3 * avgScale)
  ctx.setLineDash([8, 6])
  ctx.strokeRect(x, y, width, height)
  ctx.setLineDash([])
  
  // Warning label
  const fontSize = Math.max(12, 14 * avgScale)
  ctx.font = `bold ${fontSize}px "Outfit", sans-serif`
  const text = 'Move into oval'
  const textWidth = ctx.measureText(text).width + fontSize
  const labelHeight = fontSize + 8
  
  ctx.fillStyle = '#ef4444dd'
  ctx.fillRect(x, y - labelHeight - 4, textWidth, labelHeight)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(text, x + fontSize / 2, y - 8)
}

export function selectPrimaryFace(detections, sourceWidth, sourceHeight) {
  if (!Array.isArray(detections) || detections.length === 0) return null

  const frameCenterX = sourceWidth / 2
  const frameCenterY = sourceHeight / 2

  return detections
    .map(detection => {
      const box = detection?.box || detection?.detection?.box
      if (!box) return null

      const centerX = box.x + (box.width / 2)
      const centerY = box.y + (box.height / 2)
      const area = box.width * box.height
      const distance = Math.hypot(centerX - frameCenterX, centerY - frameCenterY)
      const score = area - (distance * 0.6)

      return { detection, box, score }
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)[0] || null
}

export function getSafeDecisionMessage(decisionCode) {
  switch (decisionCode) {
    case 'blocked_no_reliable_match':
      return { name: 'Not recognized', detail: 'Face not recognized. Try again or ensure you are enrolled.' }
    case 'blocked_ambiguous_match':
      return { name: 'Ambiguous match', detail: 'Your face matches multiple employees. Approach HR to verify or re-enroll your biometrics.' }
    case 'blocked_recent_duplicate':
      return { name: 'Already recorded', detail: 'You have already checked in/out today. See your attendance history for details.' }
    case 'blocked_day_complete':
      return { name: 'Day complete', detail: 'AM and PM attendance already recorded for today.' }
    case 'blocked_missing_gps':
      return { name: 'Location needed', detail: 'Enable location services for on-site attendance.' }
    case 'blocked_geofence':
      return { name: 'Outside office', detail: 'You are outside the office geofence area.' }
    case 'blocked_rate_limited':
      return { name: 'Slow down', detail: 'Too many attempts. Wait a moment and try again.' }
    case 'blocked_inactive':
      return { name: 'Account inactive', detail: 'Your employee account is inactive. Contact HR.' }
    case 'blocked_pending_approval':
      return { name: 'Pending approval', detail: 'Your enrollment is awaiting admin approval.' }
    case 'blocked_missing_office_config':
      return { name: 'Setup issue', detail: 'Office not configured. Contact administrator.' }
    case 'blocked_no_candidate_office':
      return { name: 'No office match', detail: 'No office matches your current location.' }
    case 'blocked_wrong_office_context':
      return { name: 'Wrong office', detail: 'Your assigned office does not match current location.' }
    case 'blocked_wrong_context':
      return { name: 'Not at office', detail: 'You are not at your office and today is not a WFH day. Please check in at the office.' }
    case 'blocked_liveness':
      return { name: 'Liveness failed', detail: 'Move slightly and try again.' }
    case 'blocked_antispoof':
      return { name: 'Photo detected', detail: 'Please scan your real face, not a photo.' }
    case 'blocked_photo_detected':
    case 'blocked_photo_detected_flat':
    case 'blocked_photo_detected_flat_no_blink':
      return { name: 'Photo detected', detail: 'Please scan your real face, not a photo.' }
    case 'blocked_index_building':
      return { name: 'Index building', detail: 'System is syncing. Try again in a few seconds.' }
    case 'blocked_invalid_challenge':
      return { name: 'Session expired', detail: 'Kiosk session challenge failed. Retry the scan.' }
    case 'blocked_expired_challenge':
      return { name: 'Session expired', detail: 'Kiosk session challenge expired. Retry the scan.' }
    case 'blocked_wifi_mismatch':
      return { name: 'Wrong WiFi', detail: 'Connected to wrong WiFi. Use office WiFi or check with IT.' }
    default:
      return { name: 'Try again', detail: 'Unable to process. Try again.' }
  }
}

export function formatDebugDetail(debug) {
  if (!debug) return ''
  const parts = []
  if (debug.source) parts.push(`src ${debug.source}`)
  if (Number.isFinite(debug.bestDistance)) parts.push(`best ${debug.bestDistance.toFixed(3)}`)
  if (Number.isFinite(debug.threshold)) parts.push(`th ${debug.threshold.toFixed(3)}`)
  if (Number.isFinite(debug.secondDistance)) parts.push(`2nd ${debug.secondDistance.toFixed(3)}`)
  if (Number.isFinite(debug.ambiguousMargin)) parts.push(`amb ${debug.ambiguousMargin.toFixed(2)}`)
  if (Number.isFinite(debug.candidateCount)) parts.push(`cand ${debug.candidateCount}`)
  return parts.join(' | ')
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0))
}

function toFiniteNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function rate(count, total) {
  if (!total) return null
  return count / total
}

function percentile(values, target) {
  const sorted = values
    .map(toFiniteNumber)
    .filter(value => Number.isFinite(value))
    .sort((left, right) => left - right)
  if (!sorted.length) return null
  if (sorted.length === 1) return sorted[0]
  const index = (sorted.length - 1) * clamp(target, 0, 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  const weight = index - lower
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * weight)
}

function inferBrowser(userAgent = '') {
  const ua = String(userAgent || '')
  if (!ua) return 'Unknown'
  if (/Edg\//i.test(ua)) return 'Edge'
  if (/OPR\//i.test(ua) || /Opera/i.test(ua)) return 'Opera'
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua) && !/OPR\//i.test(ua)) return 'Chrome'
  if (/Firefox\//i.test(ua)) return 'Firefox'
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua) && !/CriOS\//i.test(ua)) return 'Safari'
  if (/CriOS\//i.test(ua)) return 'Chrome iOS'
  if (/FBAN|FBAV|Messenger/i.test(ua)) return 'Facebook/Messenger'
  return 'Other'
}

function getDeviceClass(event) {
  return String(
    event?.scanDiagnostics?.deviceClass
    || (event?.captureContext?.mobile ? 'mobile' : 'desktop')
    || 'unknown',
  ).toLowerCase()
}

function summarizeGroup(events) {
  const total = events.length
  const accepted = events.filter(event => event.status === 'accepted')
  const blocked = events.filter(event => event.status === 'blocked')
  const noReliableMatch = events.filter(event => event.decisionCode === 'blocked_no_reliable_match')
  const ambiguousMatch = events.filter(event => event.decisionCode === 'blocked_ambiguous_match')
  const livenessBlocks = events.filter(event => (
    event.decisionCode === 'blocked_liveness'
    || event.decisionCode === 'blocked_antispoof'
    || event.decisionCode === 'blocked_missing_liveness'
  ))
  const challengeUsed = events.filter(event => event.challengeUsed === true)
  const bestDistances = events
    .map(event => event?.matchDebug?.bestDistance)
    .map(toFiniteNumber)
    .filter(value => Number.isFinite(value))
  const acceptedDistances = accepted
    .map(event => event?.matchDebug?.bestDistance)
    .map(toFiniteNumber)
    .filter(value => Number.isFinite(value))
  const thresholds = events
    .map(event => event?.matchDebug?.threshold)
    .map(toFiniteNumber)
    .filter(value => Number.isFinite(value))
  const faceAreaRatios = events
    .map(event => event?.scanDiagnostics?.bestFaceAreaRatio)
    .map(toFiniteNumber)
    .filter(value => Number.isFinite(value))
  const burstQualityScores = events
    .map(event => event?.captureContext?.burstQualityScore)
    .map(toFiniteNumber)
    .filter(value => Number.isFinite(value))

  const browserMap = new Map()
  events.forEach(event => {
    const browser = inferBrowser(event?.captureContext?.userAgent || '')
    browserMap.set(browser, (browserMap.get(browser) || 0) + 1)
  })

  return {
    total,
    accepted: accepted.length,
    blocked: blocked.length,
    acceptedRate: rate(accepted.length, total),
    blockedRate: rate(blocked.length, total),
    noReliableMatchRate: rate(noReliableMatch.length, total),
    ambiguousRate: rate(ambiguousMatch.length, total),
    livenessBlockRate: rate(livenessBlocks.length, total),
    challengeCoverageRate: rate(challengeUsed.length, total),
    medianBestDistance: percentile(bestDistances, 0.5),
    p95BestDistance: percentile(bestDistances, 0.95),
    acceptedMedianDistance: percentile(acceptedDistances, 0.5),
    acceptedP95Distance: percentile(acceptedDistances, 0.95),
    medianThreshold: percentile(thresholds, 0.5),
    medianFaceAreaRatio: percentile(faceAreaRatios, 0.5),
    medianBurstQualityScore: percentile(burstQualityScores, 0.5),
    browsers: Array.from(browserMap.entries())
      .map(([browser, count]) => ({ browser, count, rate: rate(count, total) }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 5),
  }
}

function summarizeDecisions(events) {
  const decisionCounts = new Map()
  events.forEach(event => {
    const key = String(event?.decisionCode || event?.status || 'unknown')
    decisionCounts.set(key, (decisionCounts.get(key) || 0) + 1)
  })

  return Array.from(decisionCounts.entries())
    .map(([decisionCode, count]) => ({
      decisionCode,
      count,
      rate: rate(count, events.length),
    }))
    .sort((left, right) => right.count - left.count)
}

function buildCheck(id, label, status, value, detail) {
  return { id, label, status, value, detail }
}

function buildOperationalGate({ total, byDevice, challengeCoverageRate, ambiguousRate }) {
  const mobile = byDevice.mobile
  const desktop = byDevice.desktop
  const checks = []

  if (total < 200) {
    checks.push(buildCheck(
      'evidence-total',
      'Evidence volume',
      'insufficient',
      total,
      'Collect at least 200 recent scan events before treating this report as operational evidence.',
    ))
  } else {
    checks.push(buildCheck(
      'evidence-total',
      'Evidence volume',
      'pass',
      total,
      'Recent scan volume is large enough for operational trend checks.',
    ))
  }

  const mobileStatus = mobile.total >= 60 ? 'pass' : mobile.total >= 25 ? 'warn' : 'insufficient'
  checks.push(buildCheck(
    'evidence-mobile',
    'Mobile sample size',
    mobileStatus,
    mobile.total,
    mobileStatus === 'pass'
      ? 'Mobile evidence volume is usable.'
      : 'Collect more phone scans before claiming mobile stability.',
  ))

  const desktopStatus = desktop.total >= 60 ? 'pass' : desktop.total >= 25 ? 'warn' : 'insufficient'
  checks.push(buildCheck(
    'evidence-desktop',
    'Desktop sample size',
    desktopStatus,
    desktop.total,
    desktopStatus === 'pass'
      ? 'Desktop evidence volume is usable.'
      : 'Collect more desktop/laptop scans before claiming desktop stability.',
  ))

  const mobileNoMatch = mobile.noReliableMatchRate ?? 1
  checks.push(buildCheck(
    'mobile-no-match',
    'Mobile no-match rate',
    mobile.total < 25
      ? 'insufficient'
      : mobileNoMatch <= 0.08
        ? 'pass'
        : mobileNoMatch <= 0.12
          ? 'warn'
          : 'fail',
    mobileNoMatch,
    'Blocked no-match events on phones are the clearest current false-reject proxy in this telemetry.',
  ))

  const desktopNoMatch = desktop.noReliableMatchRate ?? 1
  checks.push(buildCheck(
    'desktop-no-match',
    'Desktop no-match rate',
    desktop.total < 25
      ? 'insufficient'
      : desktopNoMatch <= 0.05
        ? 'pass'
        : desktopNoMatch <= 0.08
          ? 'warn'
          : 'fail',
    desktopNoMatch,
    'Desktop no-match should stay lower than mobile if the pose/domain mismatch is being controlled.',
  ))

  checks.push(buildCheck(
    'ambiguous-match',
    'Ambiguous match rate',
    ambiguousRate == null
      ? 'insufficient'
      : ambiguousRate <= 0.02
        ? 'pass'
        : ambiguousRate <= 0.05
          ? 'warn'
          : 'fail',
    ambiguousRate,
    'Ambiguous matches indicate weak separation between enrolled profiles or poor capture quality.',
  ))

  checks.push(buildCheck(
    'challenge-coverage',
    'Challenge coverage',
    challengeCoverageRate == null
      ? 'insufficient'
      : challengeCoverageRate >= 0.95
        ? 'pass'
        : challengeCoverageRate >= 0.75
          ? 'warn'
          : 'fail',
    challengeCoverageRate,
    'This measures how many recent requests used the challenge-protected path. It does not mean server-authoritative biometrics exist.',
  ))

  const captureScale = mobile.medianFaceAreaRatio
  checks.push(buildCheck(
    'mobile-capture-scale',
    'Mobile capture scale',
    mobile.total < 25 || captureScale == null
      ? 'insufficient'
      : (captureScale >= 0.14 && captureScale <= 0.38)
        ? 'pass'
        : (captureScale >= 0.12 && captureScale <= 0.42)
          ? 'warn'
          : 'fail',
    captureScale,
    'Median mobile face area should stay inside the shared capture band. If it drifts, distance guidance is not being followed.',
  ))

  const statusRank = { pass: 0, warn: 1, insufficient: 2, fail: 3 }
  const overallStatus = checks.reduce((worst, check) => (
    statusRank[check.status] > statusRank[worst] ? check.status : worst
  ), 'pass')

  const summary = overallStatus === 'pass'
    ? 'Operational telemetry looks stable enough for continued pilot use.'
    : overallStatus === 'warn'
      ? 'Telemetry shows meaningful weaknesses. Keep piloting and fix the weak checks before wider rollout.'
      : overallStatus === 'fail'
        ? 'Operational telemetry is not rollout-ready. Fix the failing checks before claiming deployment readiness.'
        : 'There is not enough evidence yet to claim readiness.'

  return { status: overallStatus, checks, summary }
}

export function buildBiometricBenchmarkReport(scanEvents = [], options = {}) {
  const days = clamp(options.days || 14, 1, 30)
  const total = scanEvents.length
  const now = Number.isFinite(options.now) ? Number(options.now) : Date.now()
  const generatedAt = new Date(now).toISOString()
  const challengeCoverageRate = rate(scanEvents.filter(event => event.challengeUsed === true).length, total)
  const deviceGroups = {
    mobile: [],
    desktop: [],
    unknown: [],
  }

  scanEvents.forEach(event => {
    const deviceClass = getDeviceClass(event)
    if (!deviceGroups[deviceClass]) deviceGroups[deviceClass] = []
    deviceGroups[deviceClass].push(event)
  })

  const byDevice = {
    mobile: summarizeGroup(deviceGroups.mobile || []),
    desktop: summarizeGroup(deviceGroups.desktop || []),
    unknown: summarizeGroup(deviceGroups.unknown || []),
  }

  const acceptedEvents = scanEvents.filter(event => event.status === 'accepted')
  const blockedEvents = scanEvents.filter(event => event.status === 'blocked')
  const ambiguousRate = rate(
    scanEvents.filter(event => event.decisionCode === 'blocked_ambiguous_match').length,
    total,
  )

  return {
    generatedAt,
    windowDays: days,
    sampleSize: total,
    acceptedCount: acceptedEvents.length,
    blockedCount: blockedEvents.length,
    reality: {
      serverAuthoritativeBiometrics: false,
      serverAuthoritativeAttendanceDecisions: true,
      challengeProtectedTransport: true,
      embeddingSource: 'Browser-generated @vladmandic/human FaceRes descriptors',
      note: 'Current v2 adds challenge/replay protection, but the browser still generates the biometric descriptor. This is not trusted server-side embedding yet.',
    },
    summary: summarizeGroup(scanEvents),
    byDevice,
    decisions: summarizeDecisions(scanEvents).slice(0, 8),
    operationalGate: buildOperationalGate({
      total,
      byDevice,
      challengeCoverageRate,
      ambiguousRate,
    }),
  }
}

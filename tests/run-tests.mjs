import assert from 'node:assert/strict'
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { strFromU8, unzipSync } from 'fflate'

const projectRootUrl = new URL('../', import.meta.url)

function ensureJsExtension(specifier) {
  return /\.[a-z0-9]+$/i.test(specifier) ? specifier : `${specifier}.js`
}

function resolveImportSpecifier(specifier, fileUrl) {
  if (specifier.startsWith('@/')) {
    return new URL(ensureJsExtension(specifier.slice(2)), projectRootUrl).href
  }
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    return new URL(ensureJsExtension(specifier), fileUrl).href
  }
  return import.meta.resolve(specifier)
}

function rewriteModuleSpecifiers(source, fileUrl) {
  return source
    .replace(/^\s*import\s+['"]server-only['"]\s*;?\s*$/gm, '')
    .replace(/(from\s+['"])([^'"]+)(['"])/g, (_, prefix, specifier, suffix) => (
      `${prefix}${resolveImportSpecifier(specifier, fileUrl)}${suffix}`
    ))
    .replace(/(import\s*\(\s*['"])([^'"]+)(['"]\s*\))/g, (_, prefix, specifier, suffix) => (
      `${prefix}${resolveImportSpecifier(specifier, fileUrl)}${suffix}`
    ))
}

async function importLocalModule(relativePath) {
  const fileUrl = new URL(relativePath, import.meta.url)
  const source = rewriteModuleSpecifiers(await readFile(fileUrl, 'utf8'), fileUrl)
  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`)
}

async function run(name, fn) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    console.error(error instanceof Error ? error.stack : error)
    process.exitCode = 1
  }
}

const officesModule = await importLocalModule('../lib/offices.js')
const attendanceContextModule = await importLocalModule('../lib/attendance/context.js')
const dailyAttendanceModule = await importLocalModule('../lib/daily-attendance.js')
const attendanceTimeModule = await importLocalModule('../lib/attendance-time.js')
const personDirectoryModule = await importLocalModule('../lib/person-directory.js')
const personApprovalModule = await importLocalModule('../lib/person-approval.js')
const enrollmentBurstModule = await importLocalModule('../lib/biometrics/enrollment-burst.js')
const guidedCaptureValidationModule = await importLocalModule('../lib/biometrics/guided-capture-validation.js')
const faceSizeGuidanceModule = await importLocalModule('../lib/biometrics/face-size-guidance.js')
const verificationCaptureModule = await importLocalModule('../lib/biometrics/verification-capture.js')
const ovalCaptureModule = await importLocalModule('../lib/biometrics/oval-capture.js')
const dtrModule = await importLocalModule('../lib/dtr.js')
const dtrExcelModule = await importLocalModule('../lib/dtr-excel.js')
const workforcePolicyModule = await importLocalModule('../lib/workforce-policy.js')
const maintenanceEvidenceModule = await importLocalModule('../lib/maintenance/event-evidence.js')
const systemEvidenceModule = await importLocalModule('../lib/maintenance/system-evidence.js')
const shadowBenchmarkModule = await importLocalModule('../lib/biometrics/shadow-benchmark.js')
const biometricMathModule = await importLocalModule('../lib/biometric-math.js')
const personsEnrollmentPolicyModule = await importLocalModule('../lib/persons/enrollment-policy.js')
const duplicateFaceModule = await importLocalModule('../lib/persons/duplicate-face.js')
const personsDirectoryListModule = await importLocalModule('../lib/persons/directory.js')
const attendanceMatchPolicyModule = await importLocalModule('../lib/attendance/match-policy.js')
const attendanceStorageModule = await importLocalModule('../lib/attendance/storage.js')
const attendanceNormalizeModule = await importLocalModule('../lib/attendance/normalize.js')
const attendanceCapturePolicyModule = await importLocalModule('../lib/attendance/capture-policy.js')
const openVinoShadowProfileModule = await importLocalModule('../lib/biometrics/openvino-shadow-profile.js')
const attendanceDailyStoreModule = await importLocalModule('../lib/attendance-daily-store.js')
const livenessModule = await importLocalModule('../lib/biometrics/liveness.js')
const rawAttendanceWorkbookModule = await importLocalModule('../lib/raw-attendance-workbook.js')
const employeeWfhModule = await importLocalModule('../lib/employee-wfh.js')
const csrfModule = await importLocalModule('../lib/csrf.js')
const reportWindowModule = await importLocalModule('../lib/report-window.js')
const employeeAccessCodeExportModule = await importLocalModule('../lib/employee-access-code-export.js')
const nextConfig = (await import('../next.config.mjs')).default
const attendanceMatchModule = await importLocalModule('../lib/attendance-match.js')
const materializerModule = await importLocalModule('../scripts/materialize-next-externals.mjs')

const {
  calculateDistanceMeters,
  isOfficeWfhDay,
  resolveOfficeSignatory,
  normalizeDivisionList,
} = officesModule
const { checkAttendanceLocation } = attendanceContextModule
const { deriveDailyAttendanceRecord, getNextAttendanceAction } = dailyAttendanceModule
const {
  buildAttendanceEntryTiming,
  getAttendanceHour,
  getAttendanceMinutesOfDay,
  toLegacyAttendanceDate,
} = attendanceTimeModule
const {
  clampPersonDirectoryLimit,
  decodePersonDirectoryCursor,
  encodePersonDirectoryCursor,
  inferPersonDirectorySearchMode,
  normalizePersonDirectorySearchValue,
} = personDirectoryModule
const {
  getEffectivePersonApprovalStatus,
  isPersonBiometricActive,
  PERSON_APPROVAL_PENDING,
  resolvePersonLifecycleTransition,
} = personApprovalModule
const {
  normalizeEnrollmentDescriptorBatch,
  normalizeEnrollmentSampleFrames,
  validateEnrollmentCaptureMetadata,
  validateEnrollmentSampleFrames,
  selectEnrollmentBurstSamples,
  scoreEnrollmentCapture,
  summarizeEnrollmentCaptureQuality,
  validateEnrollmentDescriptorBatch,
  validateEnrollmentServerDescriptorSet,
} = enrollmentBurstModule
const { verifyGuidedCapturePoseCoverage } = guidedCaptureValidationModule
const { getFaceSizeGuidance } = faceSizeGuidanceModule
const {
  descriptorDistance: verificationDescriptorDistance,
  selectStableVerificationCaptures,
} = verificationCaptureModule
const {
  getOvalCaptureRegion,
  isFaceInsideCaptureOval,
  selectOvalReadyFace,
} = ovalCaptureModule
const {
  buildDtrDocument,
  buildDtrRangeSpec,
  filterAttendanceDaysByRange,
  getDtrCalendarDay,
} = dtrModule
const { buildDtrWorkbookFromTemplate } = dtrExcelModule
const { postgresDateKey } = workforcePolicyModule
const {
  buildMaintenanceEvidenceReport,
  classifyScanEvent,
  normalizeScanEventIdentity,
  resolvePersistedScanIdentity,
} = maintenanceEvidenceModule
const { buildSystemEvidence } = systemEvidenceModule
const { buildEngineShadowBenchmark, buildShadowBenchmarkReport } = shadowBenchmarkModule
const { matchBiometricIndexCandidates, matchBiometricIndexMultiDescriptor } = biometricMathModule
const { validatePublicEnrollmentIdentity } = personsEnrollmentPolicyModule
const {
  buildDuplicateFaceSnapshot,
  evaluateDuplicateFaceCandidates,
  DUPLICATE_STATUS_HARD_DUPLICATE,
  DUPLICATE_STATUS_REVIEW_REQUIRED,
} = duplicateFaceModule
const { parseDirectoryParams } = personsDirectoryListModule
const {
  buildMatchSupportSnapshot,
  isStrongUnambiguousSingleSampleSupport,
} = attendanceMatchPolicyModule
const { sanitizeAttendanceEntryForStorage } = attendanceStorageModule
const { normalizeEntry, validateClaimedEmployeeId } = attendanceNormalizeModule
const {
  getScanCapturePolicyAssessment,
  MIN_SCAN_STRICT_FRAMES,
  SCAN_CAPTURE_POLICY_VERSION,
} = attendanceCapturePolicyModule
const {
  getOpenVinoShadowProfileConfig,
  normalizeOpenVinoProfileSamples,
  shouldCollectOpenVinoProfileSample,
} = openVinoShadowProfileModule
const {
  getEmployeeDailyAttendanceRecord,
  listEmployeeDailyAttendanceRecordsForMonth,
  normalizeDailyRecord,
} = attendanceDailyStoreModule
const { computeIrisDelta, validateLivenessEvidence } = livenessModule
const { buildRawAttendanceWorkbookFiles, buildRawAttendanceWorksheets } = rawAttendanceWorkbookModule
const { isEmployeeWfhDay, normalizeEmployeeWfhDays } = employeeWfhModule
const { validateOrigin } = csrfModule
const { resolveReportWindow } = reportWindowModule
const {
  buildEmployeeAccessCodeWorkbookBytes,
  groupEmployeesByOffice,
} = employeeAccessCodeExportModule
const { loadAttendanceMatch, saveAttendanceMatch } = attendanceMatchModule
const { materializeNextExternalPackages } = materializerModule

function createMinimalFaceMesh({
  leftEye = { x: 100, y: 100 },
  rightEye = { x: 200, y: 100 },
  rightIris = { x: 125, y: 100 },
  leftIris = { x: 175, y: 100 },
} = {}) {
  const mesh = []
  mesh[33] = leftEye
  mesh[263] = rightEye
  mesh[468] = rightIris
  mesh[473] = leftIris
  return mesh
}

function translateMesh(mesh, dx, dy) {
  return mesh.map(point => (
    point ? { x: point.x + dx, y: point.y + dy } : point
  ))
}

await run('calculateDistanceMeters returns zero for same coordinates', () => {
  const point = { latitude: 6.4971, longitude: 124.8466 }
  assert.equal(Math.round(calculateDistanceMeters(point, point)), 0)
})

await run('isOfficeWfhDay respects configured work-from-home days', () => {
  const office = {
    id: 'office-fixture',
    name: 'WFH Test Office',
    workPolicy: {
      wfhDays: [3],
    },
  }

  const wednesday = new Date('2026-04-08T08:00:00+08:00')
  const thursday = new Date('2026-04-09T08:00:00+08:00')

  assert.equal(isOfficeWfhDay(office, wednesday), true)
  assert.equal(isOfficeWfhDay(office, thursday), false)
})

await run('individual employee WFH days are weekly and unique', () => {
  const days = normalizeEmployeeWfhDays([1, '1', 3, 7, 'invalid'])
  assert.deepEqual(days, [1, 3])
  assert.equal(isEmployeeWfhDay({ individualWfhDays: days }, new Date('2026-07-26T16:30:00.000Z')), true)
  assert.equal(isEmployeeWfhDay({ individualWfhDays: days }, new Date('2026-07-27T16:30:00.000Z')), false)
})

await run('employee and office WFH schedules combine without overriding on-site attendance', () => {
  const office = {
    id: 'office-fixture',
    workPolicy: { wfhDays: [3] },
    gps: { latitude: 6.5, longitude: 124.8, radiusMeters: 100 },
  }
  const outsideEntry = { timestamp: new Date('2026-07-26T16:30:00.000Z').getTime(), latitude: 7, longitude: 125 }
  const employeeScheduleResult = checkAttendanceLocation(
    { officeId: 'office-fixture', individualWfhDays: [1] }, office, outsideEntry, [office],
  )
  assert.equal(employeeScheduleResult.decisionCode, 'accepted_wfh')
  assert.match(employeeScheduleResult.geofenceStatus, /employee WFH/i)

  const officeScheduleResult = checkAttendanceLocation(
    { officeId: 'office-fixture', individualWfhDays: [] }, office,
    { ...outsideEntry, timestamp: new Date('2026-07-28T16:30:00.000Z').getTime() }, [office],
  )
  assert.equal(officeScheduleResult.decisionCode, 'accepted_wfh')
  assert.match(officeScheduleResult.geofenceStatus, /office WFH/i)

  const onsiteResult = checkAttendanceLocation(
    { officeId: 'office-fixture', individualWfhDays: [1] }, office,
    { ...outsideEntry, latitude: 6.5, longitude: 124.8 }, [office],
  )
  assert.equal(onsiteResult.attendanceMode, 'On-site')
})

await run('deriveDailyAttendanceRecord computes late and undertime from actual worked minutes', () => {
  const office = {
    id: 'office-1',
    name: 'Test Office',
    workPolicy: {
      schedule: 'Mon-Fri, 8:00 AM to 5:00 PM',
      workingDays: [1, 2, 3, 4, 5],
      wfhDays: [],
      morningIn: '08:00',
      morningOut: '12:00',
      afternoonIn: '13:00',
      afternoonOut: '17:00',
      gracePeriodMinutes: 15,
      checkInCooldownMinutes: 30,
      checkOutCooldownMinutes: 5,
    },
  }
  const person = {
    employeeId: 'EMP-001',
    name: 'Test Employee',
    officeId: office.id,
    officeName: office.name,
  }

  const logs = [
    {
      timestamp: new Date('2026-04-09T08:05:00+08:00').getTime(),
      decisionCode: 'accepted_onsite',
      officeId: office.id,
      officeName: office.name,
      name: person.name,
    },
    {
      timestamp: new Date('2026-04-09T12:01:00+08:00').getTime(),
      decisionCode: 'accepted_onsite',
      officeId: office.id,
      officeName: office.name,
      name: person.name,
    },
    {
      timestamp: new Date('2026-04-09T13:04:00+08:00').getTime(),
      decisionCode: 'accepted_onsite',
      officeId: office.id,
      officeName: office.name,
      name: person.name,
    },
    {
      timestamp: new Date('2026-04-09T17:02:00+08:00').getTime(),
      decisionCode: 'accepted_onsite',
      officeId: office.id,
      officeName: office.name,
      name: person.name,
    },
  ]

  const record = deriveDailyAttendanceRecord({
    logs,
    person,
    office,
    targetDateKey: '2026-04-09',
    targetDateLabel: '4/9/2026',
  })

  assert.equal(record.employeeId, 'EMP-001')
  assert.equal(record.dateKey, '2026-04-09')
  assert.equal(record.dateLabel, '4/9/2026')
  assert.equal(record.date, '2026-04-09')
  assert.equal(record.status, 'Late / Undertime')
  assert.equal(record.lateMinutes, 5)
  assert.equal(record.undertimeMinutes, 6)
  assert.equal(record.logCount, 4)
  assert.deepEqual(record.decisionCodes, ['accepted_onsite'])
  assert.equal(record.workingHours, '7h 54m')
})

await run('deriveDailyAttendanceRecord treats exact 8 worked hours as no undertime', () => {
  const office = {
    id: 'office-1b',
    name: 'Test Office 1B',
    workPolicy: {
      morningIn: '08:00',
      morningOut: '12:00',
      afternoonIn: '13:00',
      afternoonOut: '17:00',
      gracePeriodMinutes: 15,
    },
  }
  const person = {
    employeeId: 'EMP-001B',
    name: 'Eight Hour Employee',
    officeId: office.id,
    officeName: office.name,
  }
  const logs = [
    { timestamp: new Date('2026-04-09T08:00:00+08:00').getTime(), decisionCode: 'accepted_onsite', officeId: office.id, officeName: office.name, name: person.name },
    { timestamp: new Date('2026-04-09T12:00:00+08:00').getTime(), decisionCode: 'accepted_onsite', officeId: office.id, officeName: office.name, name: person.name },
    { timestamp: new Date('2026-04-09T13:00:00+08:00').getTime(), decisionCode: 'accepted_onsite', officeId: office.id, officeName: office.name, name: person.name },
    { timestamp: new Date('2026-04-09T17:00:00+08:00').getTime(), decisionCode: 'accepted_onsite', officeId: office.id, officeName: office.name, name: person.name },
  ]

  const record = deriveDailyAttendanceRecord({
    logs,
    person,
    office,
    targetDateKey: '2026-04-09',
  })

  assert.equal(record.status, 'Complete')
  assert.equal(record.lateMinutes, 0)
  assert.equal(record.undertimeMinutes, 0)
  assert.equal(record.workingMinutes, 480)
})

await run('deriveDailyAttendanceRecord does not invent pmIn from extra morning scans', () => {
  const office = {
    id: 'office-2',
    name: 'Test Office 2',
    workPolicy: {
      schedule: 'Mon-Fri, 8:00 AM to 5:00 PM',
      workingDays: [1, 2, 3, 4, 5],
      wfhDays: [],
      morningIn: '08:00',
      morningOut: '12:00',
      afternoonIn: '13:00',
      afternoonOut: '17:00',
      gracePeriodMinutes: 15,
      checkInCooldownMinutes: 30,
      checkOutCooldownMinutes: 5,
    },
  }
  const person = {
    employeeId: 'EMP-002',
    name: 'Morning Only',
    officeId: office.id,
    officeName: office.name,
  }

  const logs = [
    {
      timestamp: new Date('2026-04-09T08:03:00+08:00').getTime(),
      decisionCode: 'accepted_onsite',
      officeId: office.id,
      officeName: office.name,
      name: person.name,
    },
    {
      timestamp: new Date('2026-04-09T08:05:00+08:00').getTime(),
      decisionCode: 'accepted_onsite',
      officeId: office.id,
      officeName: office.name,
      name: person.name,
    },
    {
      timestamp: new Date('2026-04-09T11:58:00+08:00').getTime(),
      decisionCode: 'accepted_onsite',
      officeId: office.id,
      officeName: office.name,
      name: person.name,
    },
  ]

  const record = deriveDailyAttendanceRecord({
    logs,
    person,
    office,
    targetDateKey: '2026-04-09',
    targetDateLabel: '4/9/2026',
  })

  assert.equal(record.pmInTimestamp, null)
  assert.equal(record.pmOutTimestamp, null)
  assert.equal(record.amInTimestamp, logs[0].timestamp)
  assert.equal(record.amOutTimestamp, logs[2].timestamp)
})

await run('afternoon scan after missed AM out starts PM in', () => {
  const office = {
    id: 'office-missed-am-out',
    name: 'Missed AM Out Office',
    workPolicy: {
      morningIn: '08:00',
      morningOut: '12:00',
      afternoonIn: '13:00',
      afternoonOut: '17:00',
    },
  }
  const person = {
    employeeId: 'EMP-MISSED-AM',
    name: 'Missed AM Out Employee',
    officeId: office.id,
    officeName: office.name,
  }
  const amIn = {
    action: 'checkin',
    timestamp: new Date('2026-05-05T09:07:00+08:00').getTime(),
    decisionCode: 'accepted_onsite',
    officeId: office.id,
    officeName: office.name,
    name: person.name,
  }
  const afternoonScanTimestamp = new Date('2026-05-05T13:03:00+08:00').getTime()

  assert.equal(getNextAttendanceAction([amIn], office, afternoonScanTimestamp), 'checkin')

  const logs = [
    amIn,
    {
      action: 'checkin',
      timestamp: afternoonScanTimestamp,
      decisionCode: 'accepted_onsite',
      officeId: office.id,
      officeName: office.name,
      name: person.name,
    },
  ]
  const record = deriveDailyAttendanceRecord({
    logs,
    person,
    office,
    targetDateKey: '2026-05-05',
  })

  assert.equal(record.amInTimestamp, amIn.timestamp)
  assert.equal(record.amOutTimestamp, null)
  assert.equal(record.pmInTimestamp, afternoonScanTimestamp)
  assert.equal(record.pmOutTimestamp, null)
  assert.match(record.pmIn, /1:03\s?PM/i)
})

await run('flexitime accepts a continuous two-punch ten-hour day', () => {
  const office = {
    workPolicy: { morningIn: '08:00', morningOut: '12:00', afternoonIn: '13:00', afternoonOut: '17:00' },
  }
  const amIn = { action: 'checkin', timestamp: new Date('2026-05-05T06:00:00+08:00').getTime() }
  const pmOut = new Date('2026-05-05T17:00:00+08:00').getTime()
  const policyOverride = {
    schedule: { morningIn: '06:00', morningOut: '12:00', afternoonIn: '13:00', afternoonOut: '17:00' },
    flexitime: { enabled: true, requiredMinutes: 600 },
  }
  assert.equal(getNextAttendanceAction([amIn], office, pmOut, policyOverride), 'checkout')
  const record = deriveDailyAttendanceRecord({
    logs: [amIn, { action: 'checkout', timestamp: pmOut }],
    person: { employeeId: 'FLEX-10', name: 'Flex Ten' },
    office,
    policyOverride,
    targetDateKey: '2026-05-05',
  })
  assert.equal(record.workingMinutes, 660)
  assert.equal(record.undertimeMinutes, 0)
  assert.equal(record.lateMinutes, 0)
})

await run('orphan afternoon checkout after missed AM out is repaired as PM in', () => {
  const office = {
    id: 'office-repair-afternoon',
    name: 'Repair Afternoon Office',
    workPolicy: {
      morningIn: '08:00',
      morningOut: '12:00',
      afternoonIn: '13:00',
      afternoonOut: '17:00',
    },
  }
  const person = {
    employeeId: 'EMP-REPAIR',
    name: 'Repair Employee',
    officeId: office.id,
    officeName: office.name,
  }
  const logs = [
    {
      action: 'checkin',
      timestamp: new Date('2026-05-05T09:07:00+08:00').getTime(),
      decisionCode: 'accepted_onsite',
      officeId: office.id,
      officeName: office.name,
      name: person.name,
    },
    {
      action: 'checkout',
      timestamp: new Date('2026-05-05T13:03:00+08:00').getTime(),
      decisionCode: 'accepted_onsite',
      officeId: office.id,
      officeName: office.name,
      name: person.name,
    },
  ]

  const record = deriveDailyAttendanceRecord({
    logs,
    person,
    office,
    targetDateKey: '2026-05-05',
  })

  assert.equal(record.amInTimestamp, logs[0].timestamp)
  assert.equal(record.amOutTimestamp, null)
  assert.equal(record.pmInTimestamp, logs[1].timestamp)
  assert.equal(record.pmOutTimestamp, null)
  assert.match(record.pmIn, /1:03\s?PM/i)
})

await run('lunch-gap first check-in is kept as PM in', () => {
  const office = {
    id: 'office-lunch',
    name: 'Lunch Gap Office',
    workPolicy: {
      morningIn: '08:00',
      morningOut: '12:00',
      afternoonIn: '13:00',
      afternoonOut: '17:00',
    },
  }
  const person = {
    employeeId: 'EMP-LUNCH',
    name: 'Lunch Gap Employee',
    officeId: office.id,
    officeName: office.name,
  }
  const logs = [
    {
      action: 'checkin',
      timestamp: new Date('2026-04-09T12:28:00+08:00').getTime(),
      decisionCode: 'accepted_onsite',
      officeId: office.id,
      officeName: office.name,
      name: person.name,
    },
  ]

  const record = deriveDailyAttendanceRecord({
    logs,
    person,
    office,
    targetDateKey: '2026-04-09',
  })

  assert.equal(record.amInTimestamp, null)
  assert.equal(record.amOutTimestamp, null)
  assert.equal(record.pmInTimestamp, logs[0].timestamp)
  assert.equal(record.pmOutTimestamp, null)
  assert.match(record.pmIn, /12:28\s?PM/i)
  assert.equal(record.logCount, 1)
  assert.equal(getNextAttendanceAction(logs, office), 'checkout')
})

await run('lunch-gap check-in after AM checkout starts the PM segment', () => {
  const office = {
    id: 'office-lunch-2',
    name: 'Lunch Gap Office 2',
    workPolicy: {
      morningIn: '08:00',
      morningOut: '12:00',
      afternoonIn: '13:00',
      afternoonOut: '17:00',
    },
  }
  const person = {
    employeeId: 'EMP-LUNCH-2',
    name: 'Lunch Gap Employee 2',
    officeId: office.id,
    officeName: office.name,
  }
  const logs = [
    { action: 'checkin', timestamp: new Date('2026-04-09T08:00:00+08:00').getTime(), decisionCode: 'accepted_onsite', officeId: office.id, officeName: office.name, name: person.name },
    { action: 'checkout', timestamp: new Date('2026-04-09T12:00:00+08:00').getTime(), decisionCode: 'accepted_onsite', officeId: office.id, officeName: office.name, name: person.name },
    { action: 'checkin', timestamp: new Date('2026-04-09T12:30:00+08:00').getTime(), decisionCode: 'accepted_onsite', officeId: office.id, officeName: office.name, name: person.name },
    { action: 'checkout', timestamp: new Date('2026-04-09T17:00:00+08:00').getTime(), decisionCode: 'accepted_onsite', officeId: office.id, officeName: office.name, name: person.name },
  ]

  const record = deriveDailyAttendanceRecord({
    logs,
    person,
    office,
    targetDateKey: '2026-04-09',
  })

  assert.equal(record.amInTimestamp, logs[0].timestamp)
  assert.equal(record.amOutTimestamp, logs[1].timestamp)
  assert.equal(record.pmInTimestamp, logs[2].timestamp)
  assert.equal(record.pmOutTimestamp, logs[3].timestamp)
  assert.equal(record.status, 'Complete')
  assert.equal(getNextAttendanceAction(logs, office), 'complete')
})

await run('buildAttendanceEntryTiming produces machine and display dates for Manila time', () => {
  const timing = buildAttendanceEntryTiming(new Date('2026-04-09T08:05:06+08:00').getTime())

  assert.equal(timing.dateKey, '2026-04-09')
  assert.equal(timing.dateLabel, '4/9/2026')
  assert.equal(timing.date, '4/9/2026')
  assert.match(timing.time, /8:05:06\s?AM/i)
})

await run('toLegacyAttendanceDate converts ISO date keys to legacy labels', () => {
  assert.equal(toLegacyAttendanceDate('2026-04-09'), '4/9/2026')
  assert.equal(toLegacyAttendanceDate(''), '')
})

await run('attendance time helpers stay in Manila time instead of server local time', () => {
  const timestamp = new Date('2026-04-09T23:30:00Z').getTime()

  assert.equal(getAttendanceHour(timestamp), 7)
  assert.equal(getAttendanceMinutesOfDay(timestamp), (7 * 60) + 30)
})

await run('person directory search mode distinguishes names from employee IDs', () => {
  assert.equal(inferPersonDirectorySearchMode('EMP-001'), 'employeeId')
  assert.equal(inferPersonDirectorySearchMode('Jane Doe'), 'name')
  assert.equal(normalizePersonDirectorySearchValue('  Jane Doe  ', 'name'), 'jane doe')
  assert.equal(normalizePersonDirectorySearchValue(' EMP-001 ', 'employeeId'), 'EMP-001')
  assert.equal(clampPersonDirectoryLimit(null), 25)
  assert.equal(clampPersonDirectoryLimit(''), 25)
  assert.equal(clampPersonDirectoryLimit(200), 50)
})

await run('person directory carries a division filter with its selected office', () => {
  const params = parseDirectoryParams(new Request('https://attendance.test/api/persons?mode=directory&officeId=regional-12&divisionId=lgcdd'))
  assert.equal(params.officeId, 'regional-12')
  assert.equal(params.divisionId, 'lgcdd')
})

await run('person directory cursor encodes and decodes pagination state', () => {
  const cursor = encodePersonDirectoryCursor({
    id: 'person-1',
    nameLower: 'jane doe',
    employeeId: 'EMP-001',
  }, 'name')

  const decoded = decodePersonDirectoryCursor(cursor)
  assert.deepEqual(decoded, {
    mode: 'name',
    primary: 'jane doe',
    secondary: 'EMP-001',
    id: 'person-1',
  })
})

await run('person approval defaults legacy records to approved and blocks pending biometrics', () => {
  assert.equal(getEffectivePersonApprovalStatus({}), 'approved')
  assert.equal(getEffectivePersonApprovalStatus({ approvalStatus: PERSON_APPROVAL_PENDING }), 'pending')
  assert.equal(isPersonBiometricActive({ active: true }), true)
  assert.equal(isPersonBiometricActive({ active: true, approvalStatus: PERSON_APPROVAL_PENDING }), false)
})

await run('person lifecycle transitions derive compatibility fields and reject no-op changes', () => {
  assert.deepEqual(resolvePersonLifecycleTransition('pending', 'active'), {
    previousLifecycleStatus: 'pending',
    lifecycleStatus: 'active',
    active: true,
    approvalStatus: 'approved',
  })
  assert.deepEqual(resolvePersonLifecycleTransition('pending', 'rejected'), {
    previousLifecycleStatus: 'pending',
    lifecycleStatus: 'rejected',
    active: false,
    approvalStatus: 'rejected',
  })
  assert.throws(
    () => resolvePersonLifecycleTransition('active', 'active'),
    error => error?.status === 409 && /already active/i.test(error.message),
  )
  assert.throws(
    () => resolvePersonLifecycleTransition('pending', 'unknown'),
    error => error?.status === 400 && /not valid/i.test(error.message),
  )
  assert.throws(
    () => resolvePersonLifecycleTransition('active', 'rejected'),
    error => error?.status === 409 && /cannot change/i.test(error.message),
  )
  assert.throws(
    () => resolvePersonLifecycleTransition('rejected', 'active'),
    error => error?.status === 409 && /cannot change/i.test(error.message),
  )
})

await run('enrollment descriptor batch wraps a single descriptor and validates multiple samples', () => {
  const singleDescriptor = Array.from({ length: 1024 }, (_, index) => index / 1024)
  const normalizedSingle = normalizeEnrollmentDescriptorBatch(singleDescriptor)
  assert.deepEqual(normalizedSingle, [singleDescriptor])

  const normalizedBatch = normalizeEnrollmentDescriptorBatch([
    singleDescriptor,
    Array.from({ length: 1024 }, (_, index) => (index + 1) / 1024),
  ])

  assert.equal(validateEnrollmentDescriptorBatch(normalizedBatch), null)
  assert.match(
    validateEnrollmentDescriptorBatch([[0.1, 0.2], [0.1]]),
    /1024 dimensions/i,
  )
})

await run('guided enrollment sample frames normalize and validate required pose coverage', () => {
  const sampleFrames = normalizeEnrollmentSampleFrames([
    { phaseId: 'center', frameDataUrl: 'data:image/jpeg;base64,AAAA' },
    { phaseId: 'center', frameDataUrl: 'data:image/jpeg;base64,AAAB' },
    { phaseId: 'side_a', frameDataUrl: 'data:image/jpeg;base64,BBBB' },
    { phaseId: 'side_a', frameDataUrl: 'data:image/jpeg;base64,BBBC' },
    { phaseId: 'side_b', frameDataUrl: 'data:image/jpeg;base64,CCCC' },
    { phaseId: 'side_b', frameDataUrl: 'data:image/jpeg;base64,CCCD' },
    { phaseId: 'chin_down', frameDataUrl: 'data:image/jpeg;base64,DDDD' },
    { phaseId: 'chin_down', frameDataUrl: 'data:image/jpeg;base64,DDDE' },
  ])

  assert.equal(sampleFrames.length, 8)
  assert.equal(validateEnrollmentSampleFrames(sampleFrames), null)
  assert.match(
    validateEnrollmentSampleFrames(sampleFrames.filter((_, index) => index % 2 === 0)),
    /8 validated/i,
  )
})

await run('burst sample selector keeps distinct top-ranked captures', () => {
  const captures = [
    {
      attempt: 0,
      descriptor: [1, 0, 0],
      metrics: { detectionScore: 0.95, faceAreaRatio: 0.2, centeredness: 0.9, brightness: 130, contrast: 35, sharpness: 25 },
      score: 9,
    },
    {
      attempt: 1,
      descriptor: [0.999, 0.02, 0],
      metrics: { detectionScore: 0.94, faceAreaRatio: 0.2, centeredness: 0.88, brightness: 128, contrast: 35, sharpness: 25 },
      score: 8.8,
    },
    {
      attempt: 3,
      descriptor: [0.8, 0.6, 0],
      metrics: { detectionScore: 0.91, faceAreaRatio: 0.18, centeredness: 0.8, brightness: 120, contrast: 32, sharpness: 22 },
      score: 8.2,
    },
    {
      attempt: 5,
      descriptor: [0.3, 0.95, 0],
      metrics: { detectionScore: 0.9, faceAreaRatio: 0.18, centeredness: 0.78, brightness: 118, contrast: 31, sharpness: 21 },
      score: 8,
    },
  ]

  const selected = selectEnrollmentBurstSamples(captures, { maxSamples: 3 })

  assert.equal(selected.length, 3)
  assert.deepEqual(selected.map(item => item.attempt), [0, 3, 5])
})

await run('burst sample selector preserves required guided pose coverage', () => {
  const baseMetrics = { detectionScore: 0.95, faceAreaRatio: 0.3, centeredness: 0.9, brightness: 130, contrast: 35, sharpness: 25 }
  const captures = [
    { attempt: 0, phaseId: 'center', descriptor: [0, 0, 0], metrics: baseMetrics, score: 9.8 },
    { attempt: 1, phaseId: 'center', descriptor: [0.1, 0.1, 0.1], metrics: baseMetrics, score: 9.7 },
    { attempt: 2, phaseId: 'center', descriptor: [0.2, 0.2, 0.2], metrics: baseMetrics, score: 9.6 },
    { attempt: 3, phaseId: 'side_a', descriptor: [1, 0, 0], metrics: baseMetrics, score: 7 },
    { attempt: 6, phaseId: 'side_b', descriptor: [0, 1, 0], metrics: baseMetrics, score: 6.9 },
    { attempt: 9, phaseId: 'chin_down', descriptor: [0, 0, 1], metrics: baseMetrics, score: 6.8 },
  ]

  const selected = selectEnrollmentBurstSamples(captures, {
    maxSamples: 5,
    requiredPhaseIds: ['center', 'side_a', 'side_b', 'chin_down'],
  })

  assert.deepEqual(
    Array.from(new Set(selected.map(item => item.phaseId))).sort(),
    ['center', 'chin_down', 'side_a', 'side_b'].sort(),
  )
})

await run('burst sample selector keeps support pairs for every guided pose', () => {
  const baseMetrics = { detectionScore: 0.95, faceAreaRatio: 0.3, centeredness: 0.9, brightness: 130, contrast: 35, sharpness: 25 }
  const captures = [
    { attempt: 0, phaseId: 'center', descriptor: [0, 0, 0], metrics: baseMetrics, score: 9.8 },
    { attempt: 1, phaseId: 'center', descriptor: [0.08, 0, 0], metrics: baseMetrics, score: 9.7 },
    { attempt: 2, phaseId: 'center', descriptor: [0.16, 0, 0], metrics: baseMetrics, score: 9.6 },
    { attempt: 3, phaseId: 'side_a', descriptor: [1, 0, 0], metrics: baseMetrics, score: 9.5 },
    { attempt: 4, phaseId: 'side_a', descriptor: [1, 0.08, 0], metrics: baseMetrics, score: 9.4 },
    { attempt: 5, phaseId: 'side_a', descriptor: [1, 0.16, 0], metrics: baseMetrics, score: 9.3 },
    { attempt: 6, phaseId: 'side_b', descriptor: [0, 1, 0], metrics: baseMetrics, score: 9.2 },
    { attempt: 7, phaseId: 'side_b', descriptor: [0, 1, 0.08], metrics: baseMetrics, score: 9.1 },
    { attempt: 8, phaseId: 'side_b', descriptor: [0, 1, 0.16], metrics: baseMetrics, score: 9 },
    { attempt: 9, phaseId: 'chin_down', descriptor: [0, 0, 1], metrics: baseMetrics, score: 8.9 },
    { attempt: 10, phaseId: 'chin_down', descriptor: [0.08, 0, 1], metrics: baseMetrics, score: 8.8 },
    { attempt: 11, phaseId: 'chin_down', descriptor: [0.16, 0, 1], metrics: baseMetrics, score: 8.7 },
  ]

  const selected = selectEnrollmentBurstSamples(captures, {
    maxSamples: 8,
    requiredPhaseIds: ['center', 'side_a', 'side_b', 'chin_down'],
    minPhaseCounts: { center: 2, side_a: 2, side_b: 2, chin_down: 2 },
  })
  const counts = selected.reduce((acc, item) => {
    acc[item.phaseId] = (acc[item.phaseId] || 0) + 1
    return acc
  }, {})

  assert.equal(selected.length, 8)
  assert.deepEqual(counts, { center: 2, side_a: 2, side_b: 2, chin_down: 2 })
})

await run('enrollment capture metadata requires all guided poses', () => {
  assert.equal(validateEnrollmentCaptureMetadata({
    phasesCaptured: ['center', 'side_a', 'side_b', 'chin_down'],
    phaseSampleCounts: { center: 2, side_a: 2, side_b: 2, chin_down: 2 },
    genuinelyDiverse: true,
    keptCount: 8,
  }, [
    { phaseId: 'center' },
    { phaseId: 'center' },
    { phaseId: 'side_a' },
    { phaseId: 'side_a' },
    { phaseId: 'side_b' },
    { phaseId: 'side_b' },
    { phaseId: 'chin_down' },
    { phaseId: 'chin_down' },
  ]), null)

  assert.match(validateEnrollmentCaptureMetadata({
    phasesCaptured: ['center', 'side_a'],
    genuinelyDiverse: true,
    keptCount: 8,
  }, Array.from({ length: 8 }, () => [1])), /incomplete/i)

  assert.match(validateEnrollmentCaptureMetadata({
    phasesCaptured: ['center', 'side_a', 'side_b', 'chin_down'],
    genuinelyDiverse: false,
    keptCount: 8,
  }, Array.from({ length: 8 }, () => [1])), /diversity/i)

  assert.match(validateEnrollmentCaptureMetadata({
    phasesCaptured: ['center', 'side_a', 'side_b', 'chin_down'],
    phaseSampleCounts: { center: 2, side_a: 2, side_b: 2, chin_down: 1 },
    genuinelyDiverse: true,
    keptCount: 7,
  }, Array.from({ length: 7 }, () => [1])), /required 8/i)
})

await run('server guided pose verification rejects mislabeled or incomplete pose coverage', () => {
  const goodCoverage = verifyGuidedCapturePoseCoverage([
    { phaseId: 'center', rotation: { yaw: 0.02, pitch: 0.02 } },
    { phaseId: 'side_a', rotation: { yaw: 0.22, pitch: 0.01 } },
    { phaseId: 'side_b', rotation: { yaw: -0.20, pitch: 0.01 } },
    { phaseId: 'chin_down', rotation: { yaw: 0.01, pitch: 0.19 } },
  ])
  assert.equal(goodCoverage.ok, true)

  const badCoverage = verifyGuidedCapturePoseCoverage([
    { phaseId: 'center', rotation: { yaw: 0.02, pitch: 0.02 } },
    { phaseId: 'side_a', rotation: { yaw: 0.22, pitch: 0.01 } },
    { phaseId: 'side_b', rotation: { yaw: 0.18, pitch: 0.01 } },
    { phaseId: 'chin_down', rotation: { yaw: 0.01, pitch: 0.09 } },
  ])
  assert.equal(badCoverage.ok, false)
  assert.match(badCoverage.message, /opposite side pose/i)
})

await run('server enrollment descriptor set requires stable support pairs', () => {
  const descriptor = (phaseOffset, sampleOffset = 0) => (
    Array.from({ length: 1024 }, (_, index) => {
      if (index === 0) return 1
      if (index === 1) return phaseOffset + sampleOffset
      return 0
    })
  )
  const goodSamples = [
    { phaseId: 'center', descriptor: descriptor(0, 0) },
    { phaseId: 'center', descriptor: descriptor(0, 0.02) },
    { phaseId: 'side_a', descriptor: descriptor(0.15, 0) },
    { phaseId: 'side_a', descriptor: descriptor(0.15, 0.02) },
    { phaseId: 'side_b', descriptor: descriptor(0.3, 0) },
    { phaseId: 'side_b', descriptor: descriptor(0.3, 0.02) },
    { phaseId: 'chin_down', descriptor: descriptor(0.45, 0) },
    { phaseId: 'chin_down', descriptor: descriptor(0.45, 0.02) },
  ]

  assert.equal(validateEnrollmentServerDescriptorSet(goodSamples).ok, true)

  const duplicatePair = goodSamples.map(sample => ({ ...sample, descriptor: sample.descriptor.slice() }))
  duplicatePair[1].descriptor = duplicatePair[0].descriptor.slice()
  assert.equal(validateEnrollmentServerDescriptorSet(duplicatePair).reasonCode, 'duplicate_phase_support_pair')

  const inconsistentPair = goodSamples.map(sample => ({ ...sample, descriptor: sample.descriptor.slice() }))
  inconsistentPair[1].descriptor = Array.from({ length: 1024 }, (_, index) => (index === 2 ? 1 : 0))
  assert.equal(validateEnrollmentServerDescriptorSet(inconsistentPair).reasonCode, 'inconsistent_phase_support_pair')
})

await run('capture quality summary flags dim low-contrast frames', () => {
  const summary = summarizeEnrollmentCaptureQuality({
    faceAreaRatio: 0.08,
    centeredness: 0.45,
    brightness: 65,
    contrast: 14,
    sharpness: 8,
  })

  assert.equal(summary.tone, 'warn')
  assert.match(summary.text, /too small in frame/i)
})

await run('shared face-size guidance now prefers a closer capture band', () => {
  assert.equal(getFaceSizeGuidance(0.12).status, 'too-far')
  assert.equal(getFaceSizeGuidance(0.18).status, 'too-far')
  assert.equal(getFaceSizeGuidance(0.32).status, 'move-closer')
  assert.equal(getFaceSizeGuidance(0.55).status, 'ready')
  assert.equal(getFaceSizeGuidance(0.64).status, 'ready')
  assert.equal(getFaceSizeGuidance(0.72).status, 'slightly-close')
  assert.equal(getFaceSizeGuidance(0.8).status, 'too-close')
})

await run('verification capture spread compares normalized descriptors', () => {
  assert.equal(verificationDescriptorDistance([4, 0], [1, 0]), 0)
})

await run('verification capture selection prefers stable descriptors over one high-score outlier', () => {
  const stableA = {
    qualityScore: 4,
    primary: { detection: { descriptor: [1, 0] } },
  }
  const stableB = {
    qualityScore: 3.8,
    primary: { detection: { descriptor: [0.99, 0.1] } },
  }
  const stableC = {
    qualityScore: 3.7,
    primary: { detection: { descriptor: [0.98, 0.2] } },
  }
  const outlier = {
    qualityScore: 9,
    primary: { detection: { descriptor: [0, 1] } },
  }

  const selected = selectStableVerificationCaptures([stableA, stableB, stableC, outlier], {
    aggregationCount: 3,
    serverFrameLimit: 2,
  })

  assert.equal(selected.aggregationCaptures.includes(outlier), false)
  assert.equal(selected.serverFrameCaptures.includes(outlier), false)
})

await run('oval capture region center-crops wide frames to portrait view', () => {
  const region = getOvalCaptureRegion(960, 540)

  assert.equal(region.height, 540)
  assert.equal(region.width, 367)
  assert.equal(region.x, 296)
  assert.equal(region.y, 0)
})

await run('oval fit gate accepts centered faces and rejects off-center faces', () => {
  assert.equal(
    isFaceInsideCaptureOval({ x: 40, y: 120, width: 260, height: 260 }, 340, 500),
    true,
  )

  assert.equal(
    isFaceInsideCaptureOval({ x: -80, y: 120, width: 260, height: 260 }, 340, 500),
    false,
  )
})

await run('oval ready face selector ignores detections outside the live oval', () => {
  const detections = [
    { box: { x: -80, y: 120, width: 260, height: 260 } },
    { box: { x: 40, y: 120, width: 260, height: 260 } },
  ]

  const ready = selectOvalReadyFace(detections, 340, 500)

  assert.ok(ready)
  assert.deepEqual(ready.box, detections[1].box)
})

await run('oval ready face selector prefers target distance over oversized close faces', () => {
  const detections = [
    { box: { x: 20, y: 100, width: 300, height: 300 } },
    { box: { x: 2, y: 82, width: 336, height: 336 } },
  ]

  const ready = selectOvalReadyFace(detections, 340, 500)

  assert.ok(ready)
  assert.deepEqual(ready.box, detections[0].box)
})

await run('enrollment capture scoring favors target distance over close frames', () => {
  const baseMetrics = {
    detectionScore: 0.95,
    centeredness: 0.95,
    brightness: 128,
    contrast: 25,
    sharpness: 10,
  }

  const targetScore = scoreEnrollmentCapture({ ...baseMetrics, faceAreaRatio: 0.54 })
  const closeScore = scoreEnrollmentCapture({ ...baseMetrics, faceAreaRatio: 0.74 })

  assert.ok(targetScore > closeScore)
})

await run('enrollment burst ranking penalizes too-close samples', () => {
  const targetSample = {
    descriptor: [0, 0.001, 0.002],
    metrics: {
      detectionScore: 0.95,
      faceAreaRatio: 0.54,
      centeredness: 0.95,
      brightness: 128,
      contrast: 25,
      sharpness: 10,
    },
  }
  const closeSample = {
    descriptor: [0.5, 0.501, 0.502],
    metrics: {
      ...targetSample.metrics,
      faceAreaRatio: 0.74,
    },
  }

  const selected = selectEnrollmentBurstSamples([closeSample, targetSample], { maxSamples: 1 })

  assert.equal(selected[0]?.metrics?.faceAreaRatio, 0.54)
})

await run('DTR range spec normalizes custom and preset ranges', () => {
  const firstHalf = buildDtrRangeSpec({ month: 4, year: 2026, range: '1-15' })
  const custom = buildDtrRangeSpec({ month: 4, year: 2026, range: 'custom', customStartDay: 22, customEndDay: 18 })

  assert.deepEqual(
    { start: firstHalf.startDay, end: firstHalf.endDay, label: firstHalf.label },
    { start: 1, end: 15, label: '1-15' },
  )
  assert.deepEqual(
    { start: custom.startDay, end: custom.endDay, label: custom.label },
    { start: 18, end: 22, label: '18-22' },
  )
})

await run('PostgreSQL date keys preserve the local calendar date', () => {
  assert.equal(typeof postgresDateKey, 'function')
  const localDate = new Date('2026-08-18T16:00:00.000Z')
  localDate.getFullYear = () => 2026
  localDate.getMonth = () => 7
  localDate.getDate = () => 19
  assert.equal(localDate.toISOString().slice(0, 10), '2026-08-18')
  assert.equal(postgresDateKey(localDate), '2026-08-19')
  assert.equal(postgresDateKey('2026-08-20'), '2026-08-20')
})

await run('filterAttendanceDaysByRange keeps only selected rows', () => {
  const rangeSpec = buildDtrRangeSpec({ month: 4, year: 2026, range: '16-end' })
  const days = [
    { dateKey: '2026-04-10' },
    { dateKey: '2026-04-16' },
    { dateKey: '2026-04-28' },
  ]

  assert.deepEqual(
    filterAttendanceDaysByRange(days, rangeSpec).map(day => day.dateKey),
    ['2026-04-16', '2026-04-28'],
  )
})

await run('DTR calendar weekends are computed from the selected month and year', () => {
  const mayDtr = buildDtrDocument({
    employee: { name: 'JAN ERIC LONARIO', employeeId: 'EMP-001' },
    month: 5,
    year: 2026,
    dayRecords: [],
  })
  const juneDtr = buildDtrDocument({
    employee: { name: 'JAN ERIC LONARIO', employeeId: 'EMP-001' },
    month: 6,
    year: 2026,
    dayRecords: [],
  })

  assert.equal(getDtrCalendarDay(2026, 5, 2), 6)
  assert.equal(mayDtr.rows.find(row => row.day === 2).dayOfWeek, 'SATURDAY')
  assert.equal(mayDtr.rows.find(row => row.day === 3).dayOfWeek, 'SUNDAY')
  assert.equal(juneDtr.rows.find(row => row.day === 6).dayOfWeek, 'SATURDAY')
  assert.equal(juneDtr.rows.find(row => row.day === 7).dayOfWeek, 'SUNDAY')
  assert.equal(juneDtr.rows.find(row => row.day === 2).isWeekend, false)
})

await run('DTR document carries parsed name parts and office schedule details', () => {
  const dtr = buildDtrDocument({
    employee: { name: 'JAN ERIC LONARIO', employeeId: 'EMP-001' },
    office: {
      workPolicy: {
        workingDays: [1, 2, 3, 4, 5],
        morningIn: '08:00',
        morningOut: '12:00',
        afternoonIn: '13:00',
        afternoonOut: '17:00',
      },
    },
    month: 5,
    year: 2026,
    dayRecords: [],
  })

  assert.deepEqual(dtr.employee.nameParts, {
    familyName: 'Lonario',
    firstName: 'Jan Eric',
    middleInitial: '',
  })
  assert.equal(dtr.officialHours.regularDays, 'Monday- Friday')
  assert.equal(dtr.officialHours.arrivalDeparture, '8:00-12:00 to 1:00-5:00')
})

await run('DTR derives a middle initial from legacy display names when the stored middle name is absent', () => {
  const dtr = buildDtrDocument({
    employee: {
      name: 'LONARIO, JAN ERIC LANCIOLA',
      lastName: 'LONARIO',
      firstName: 'JAN ERIC',
      employeeId: '12254',
    },
    month: 7,
    year: 2026,
    dayRecords: [],
  })

  assert.deepEqual(dtr.employee.nameParts, {
    familyName: 'Lonario',
    firstName: 'Jan Eric',
    middleInitial: 'L.',
  })
})

await run('DTR carries manual and system time logs in a department-sorted detail sheet', async () => {
  const dtr = buildDtrDocument({
    employee: { name: 'JAN ERIC LONARIO', employeeId: '12254', divisionName: 'HR Division' },
    month: 5,
    year: 2026,
    dayRecords: [{ dateKey: '2026-05-04', day: 4, manualEntries: [{ time: '8:15 AM', action: 'checkin', remark: 'Forgot to scan AM in' }], timeLogEntries: [{ time: '8:00 AM', action: 'checkin', source: 'System scan', timestamp: 1 }, { time: '8:15 AM', action: 'checkin', source: 'Manual override', remark: 'Forgot to scan AM in', timestamp: 2 }], remarks: ['Forgot to scan AM in'] }],
  })
  assert.deepEqual(dtr.rows.find(row => row.day === 4).remarks, ['Forgot to scan AM in'])
  assert.deepEqual(dtr.manualRemarks, [{ dateKey: '2026-05-04', day: 4, time: '8:15 AM', action: 'checkin', remark: 'Forgot to scan AM in' }])
  assert.equal(dtr.timeLogDetails.length, 2)

  const templateBytes = new Uint8Array(await readFile(new URL('../lib/templates/dtr-format.xlsx', import.meta.url)))
  const files = unzipSync(buildDtrWorkbookFromTemplate(templateBytes, [dtr]))
  const workbookXml = strFromU8(files['xl/workbook.xml'])
  const remarksXml = strFromU8(files['xl/worksheets/sheet2.xml'])
  assert.match(workbookXml, /<sheet name="Time Log Details" sheetId="2" r:id="rIdDtrSheet2"\/>/)
  assert.match(remarksXml, /Forgot to scan AM in/)
  assert.match(remarksXml, /8:15 AM/)
  assert.match(remarksXml, /System scan/)
  assert.match(remarksXml, /HR Division/)
  const dtrXml = strFromU8(files['xl/worksheets/sheet1.xml'])
  assert.match(dtrXml, /SYSTEM GENERATED DTR/)
  assert.match(dtrXml, /Verification ID: FA-[A-F0-9]{16}/)
})

await run('DTR Excel workbook fills official template cells dynamically', async () => {
  const dtr = buildDtrDocument({
    employee: { name: 'JAN ERIC LONARIO', employeeId: '12-254' },
    office: {
      name: 'DILG Region XII',
      headName: 'MARIA THERESA D. BAUTISTA',
      headPosition: 'Regional Director',
      workPolicy: {
        workingDays: [1, 2, 3, 4, 5],
        morningIn: '08:00',
        morningOut: '12:00',
        afternoonIn: '13:00',
        afternoonOut: '17:00',
      },
    },
    month: 5,
    year: 2026,
    dayRecords: [
      {
        dateKey: '2026-05-04',
        day: 4,
        amIn: '9:02 AM',
        amOut: '10:58 AM',
        pmIn: '12:06 PM',
        pmOut: '6:59 PM',
      },
    ],
  })
  const templateBytes = new Uint8Array(await readFile(new URL('../lib/templates/dtr-format.xlsx', import.meta.url)))
  const workbookBytes = buildDtrWorkbookFromTemplate(templateBytes, [dtr])
  const files = unzipSync(workbookBytes)
  const sheetXml = strFromU8(files['xl/worksheets/sheet1.xml'])
  const stylesXml = strFromU8(files['xl/styles.xml'])
  const workbookXml = strFromU8(files['xl/workbook.xml'])
  const relsXml = strFromU8(files['xl/_rels/workbook.xml.rels'])
  assert.match(sheetXml, /<c r="B4" s="2" t="inlineStr"><is><t>JAN ERIC LONARIO<\/t><\/is><\/c>/)
  assert.match(sheetXml, /<c r="D5" s="5" t="inlineStr"><is><t>MAY 1-31, 2026<\/t><\/is><\/c>/)
  assert.match(sheetXml, /<t>9:02 AM<\/t>/)
  assert.match(sheetXml, /<t>10:58 AM<\/t>/)
  assert.match(sheetXml, /<t>12:06 PM<\/t>/)
  assert.match(sheetXml, /<t>6:59 PM<\/t>/)
  // Generated grid cells must never fall back to Excel's default unbordered
  // style merely because the empty template cell did not have a <c> node.
  for (const cell of ['B14', 'C14', 'D14', 'E14', 'J14', 'K14', 'L14', 'M14']) {
    assert.match(sheetXml, new RegExp(`<c r="${cell}" s="[1-9]\\d*"[^>]*>[\\s\\S]*?<t>`))
  }
  assert.match(stylesXml, /<font><sz val="8"\/><color rgb="FF808080"\/><name val="Arial"/)
  assert.match(sheetXml, /<t>MARIA THERESA D\. BAUTISTA<\/t>/)
  assert.match(sheetXml, /<t>REGIONAL DIRECTOR<\/t>/)
  assert.match(sheetXml, /<c r="B57"[^>]*>[\s\S]*?<t>MARIA THERESA D\. BAUTISTA<\/t>/)
  assert.match(sheetXml, /<c r="B58"[^>]*>[\s\S]*?<t>REGIONAL DIRECTOR<\/t>/)
  assert.match(sheetXml, /<c r="J57"[^>]*>[\s\S]*?<t>MARIA THERESA D\. BAUTISTA<\/t>/)
  assert.match(sheetXml, /<c r="J58"[^>]*>[\s\S]*?<t>REGIONAL DIRECTOR<\/t>/)
  assert.doesNotMatch(sheetXml, /<c r="B59"[^>]*>[\s\S]*?MARIA THERESA D\. BAUTISTA/)
  assert.match(workbookXml, /_xlnm\.Print_Area" localSheetId="0">'12-254 Jan Eric Lonario'!\$A\$1:\$O\$58<\/definedName>/)
  assert.match(workbookXml, /<sheet name="12-254 Jan Eric Lonario" sheetId="1" r:id="rIdDtrSheet1"\/>/)
  assert.equal(relsXml.includes('calcChain'), false)
})

await run('DTR Excel applies special-day fills to the full Form 48 row', async () => {
  const dtr = buildDtrDocument({
    employee: { name: 'Color Test', employeeId: 'COLOR-1' },
    month: 5,
    year: 2026,
    dayRecords: [
      { dateKey: '2026-05-04', day: 4, specialCode: 'OB' },
      { dateKey: '2026-05-05', day: 5, specialCode: 'WL' },
      { dateKey: '2026-05-06', day: 6, specialCode: 'CTO' },
      { dateKey: '2026-05-03', day: 3, specialCode: 'SL' },
    ],
  })
  const templateBytes = new Uint8Array(await readFile(new URL('../lib/templates/dtr-format.xlsx', import.meta.url)))
  const files = unzipSync(buildDtrWorkbookFromTemplate(templateBytes, [dtr]))
  const sheetXml = strFromU8(files['xl/worksheets/sheet1.xml'])
  const stylesXml = strFromU8(files['xl/styles.xml'])
  assert.match(sheetXml, /<c r="A14" s="\d+"><v>4<\/v><\/c>/)
  assert.match(sheetXml, /<c r="B14" s="\d+" t="inlineStr"><is><t>OB<\/t><\/is><\/c>/)
  assert.match(sheetXml, /<c r="J14" s="\d+" t="inlineStr"><is><t>OB<\/t><\/is><\/c>/)
  assert.match(sheetXml, /<c r="B15" s="\d+" t="inlineStr"><is><t>WL<\/t><\/is><\/c>/)
  assert.match(sheetXml, /<c r="B16" s="\d+" t="inlineStr"><is><t>CTO<\/t><\/is><\/c>/)
  assert.match(sheetXml, /<c r="B13" s="\d+" t="inlineStr"><is><t>SL<\/t><\/is><\/c>/)
  assert.doesNotMatch(sheetXml, /<c r="B13"[^>]*>[\s\S]*?<t>SUNDAY<\/t>/)
  for (const color of ['FFBBF7D0', 'FFFECACA', 'FFBFDBFE', 'FFFFFFFF', 'FFF3F4F6', 'FFE0E7FF', 'FFFEF3C7']) assert.match(stylesXml, new RegExp(`fgColor rgb="${color}"`))
})

await run('buildDtrDocument shades inactive half-month rows and preserves active day data', () => {
  const dtr = buildDtrDocument({
    employee: { name: 'Test Employee', employeeId: 'EMP-777', office: 'Main Office' },
    month: 4,
    year: 2026,
    range: '16-end',
    dayRecords: [
      {
        dateKey: '2026-04-16',
        day: 16,
        amIn: '08:01 AM',
        amOut: '12:00 PM',
        pmIn: '01:02 PM',
        pmOut: '05:00 PM',
        undertime: 3,
        totalHours: 477,
      },
    ],
  })

  const day10 = dtr.rows.find(row => row.day === 10)
  const day16 = dtr.rows.find(row => row.day === 16)

  assert.equal(day10.isActive, false)
  assert.equal(day10.isDisabled, true)
  assert.equal(day10.amIn, '')
  assert.equal(day16.isActive, true)
  assert.equal(day16.amIn, '08:01 AM')
  assert.equal(dtr.period.periodLabel, 'APRIL 16-30, 2026')
})

await run('resolveOfficeSignatory returns division head for regional office staff', () => {
  const office = {
    officeType: 'Regional Office',
    headName: 'REGIONAL DIRECTOR',
    headPosition: 'Regional Director',
    divisions: normalizeDivisionList([
      { shortName: 'LGCDD', name: 'Local Government Capability and Development Division',
        headName: 'MARY ANN T. TRASPE', headPosition: 'Division Chief / LGOO VII' },
    ]),
  }
  const signatory = resolveOfficeSignatory(office, 'lgcdd')
  assert.equal(signatory.name, 'MARY ANN T. TRASPE')
  assert.equal(signatory.position, 'Division Chief / LGOO VII')
})

await run('resolveOfficeSignatory falls back to office head when division is missing', () => {
  const office = {
    officeType: 'Regional Office',
    headName: 'REGIONAL DIRECTOR',
    headPosition: 'Regional Director',
    divisions: normalizeDivisionList([
      { shortName: 'LGCDD', name: 'LGCDD', headName: 'CHIEF', headPosition: 'Chief' },
    ]),
  }
  const signatory = resolveOfficeSignatory(office, 'unknown-division')
  assert.equal(signatory.name, 'REGIONAL DIRECTOR')
  assert.equal(signatory.position, 'Regional Director')
})

await run('resolveOfficeSignatory uses office head for non-regional offices', () => {
  const office = {
    officeType: 'HUC Office',
    headName: 'MARIA THERESA D. BAUTISTA',
    headPosition: 'City Director / LGOO VII',
    divisions: [],
  }
  const signatory = resolveOfficeSignatory(office, '')
  assert.equal(signatory.name, 'MARIA THERESA D. BAUTISTA')
  assert.equal(signatory.position, 'City Director / LGOO VII')
})

await run('buildDtrDocument resolves signatory from office for field office staff', () => {
  const office = {
    officeType: 'HUC Office',
    headName: 'MARIA THERESA D. BAUTISTA',
    headPosition: 'City Director / LGOO VII',
    divisions: [],
  }
  const dtr = buildDtrDocument({
    employee: { name: 'JANE DOE', employeeId: 'EMP-001', position: 'LGOO II', office: 'DILG GenSan' },
    office,
    month: 4,
    year: 2026,
    dayRecords: [],
  })
  assert.equal(dtr.signatory.name, 'Maria Theresa D. Bautista')
  assert.equal(dtr.signatory.position, 'City Director / LGOO VII')
  assert.equal(dtr.employee.position, 'LGOO II')
})

await run('buildDtrDocument resolves division head for regional office staff', () => {
  const office = {
    officeType: 'Regional Office',
    headName: 'ATTY. ROCHELLE D. MAHINAY-SERO',
    headPosition: 'Regional Director',
    divisions: normalizeDivisionList([
      { shortName: 'LGCDD', name: 'Local Government Capability and Development Division',
        headName: 'MARY ANN T. TRASPE', headPosition: 'Division Chief / LGOO VII' },
    ]),
  }
  const dtr = buildDtrDocument({
    employee: { name: 'JOHN DOE', employeeId: 'EMP-002', position: 'LGOO I', office: 'DILG R12' },
    office,
    divisionId: 'lgcdd',
    month: 4,
    year: 2026,
    dayRecords: [],
  })
  assert.equal(dtr.signatory.name, 'Mary Ann T. Traspe')
  assert.equal(dtr.signatory.position, 'Division Chief / LGOO VII')
  assert.equal(dtr.employee.divisionName, 'Local Government Capability and Development Division')
  assert.equal(dtr.employee.divisionShortName, 'LGCDD')
})

await run('buildDtrDocument signatoryOverride wins over auto-resolved head', () => {
  const office = {
    officeType: 'HUC Office',
    headName: 'MARIA THERESA D. BAUTISTA',
    headPosition: 'City Director / LGOO VII',
    divisions: [],
  }
  const dtr = buildDtrDocument({
    employee: { name: 'JANE DOE', employeeId: 'EMP-001' },
    office,
    signatoryOverride: { name: 'OIC NAME', position: 'OIC-City Director' },
    month: 4,
    year: 2026,
    dayRecords: [],
  })
  assert.equal(dtr.signatory.name, 'Oic Name')
  assert.equal(dtr.signatory.position, 'OIC-City Director')
})

await run('buildDtrDocument emits empty signatory when no office is supplied', () => {
  const dtr = buildDtrDocument({
    employee: { name: 'JANE DOE', employeeId: 'EMP-001' },
    month: 4,
    year: 2026,
    dayRecords: [],
  })
  assert.equal(dtr.signatory.name, '')
  assert.equal(dtr.signatory.position, '')
})

await run('report windows resolve exact Manila calendar dates and months', () => {
  const todayWindow = resolveReportWindow(new URLSearchParams({ date: '2026-05-20' }), {
    now: new Date('2026-05-20T09:00:00+08:00').getTime(),
  })
  assert.equal(todayWindow.mode, 'date')
  assert.equal(todayWindow.fromDateKey, '2026-05-20')
  assert.equal(todayWindow.toDateKey, '2026-05-20')
  assert.equal(todayWindow.startUtc, '2026-05-19T16:00:00.000Z')
  assert.equal(todayWindow.endUtcExclusive, '2026-05-20T16:00:00.000Z')

  const monthWindow = resolveReportWindow(new URLSearchParams({ month: '2026-05' }), {
    now: new Date('2026-05-20T09:00:00+08:00').getTime(),
  })
  assert.equal(monthWindow.mode, 'month')
  assert.equal(monthWindow.windowDays, 31)
  assert.equal(monthWindow.fromDateKey, '2026-05-01')
  assert.equal(monthWindow.toDateKey, '2026-05-31')
  assert.equal(monthWindow.endDateExclusive, '2026-06-01')
})

await run('maintenance evidence treats claimed identity mismatch as biometric failure', () => {
  const event = {
    status: 'blocked',
    decisionCode: 'blocked_claimed_employee_mismatch',
    employeeId: '1234',
    matchDebug: {
      resolvedPersonId: 'person-1',
      resolvedEmployeeId: 'EMP-1',
      bestDistance: 0.82,
      threshold: 0.8,
    },
  }

  assert.equal(classifyScanEvent(event), 'claimed_identity_mismatch')
  assert.deepEqual(normalizeScanEventIdentity(event), {
    personId: 'person-1',
    employeeId: 'EMP-1',
    officeId: '',
  })
})

await run('scan telemetry persists resolved 1:1 identity before claimed access code', () => {
  assert.deepEqual(resolvePersistedScanIdentity({
    entry: { employeeId: '1234' },
    debug: {
      resolvedPersonId: 'person-1',
      resolvedEmployeeId: 'EMP-1',
      officeId: 'office-1',
    },
  }), {
    personId: 'person-1',
    employeeId: 'EMP-1',
    officeId: 'office-1',
  })
})

await run('scan telemetry trusts resolved and server office identity before client office input', () => {
  assert.deepEqual(resolvePersistedScanIdentity({
    entry: { employeeId: '1234', officeId: 'client-office' },
    debug: {
      resolvedPersonId: 'person-1',
      resolvedEmployeeId: 'EMP-1',
    },
    requestMeta: { officeId: 'server-office' },
  }), {
    personId: 'person-1',
    employeeId: 'EMP-1',
    officeId: 'server-office',
  })

  assert.equal(normalizeScanEventIdentity({
    officeId: 'claimed-office',
    matchDebug: { officeId: 'resolved-office' },
  }).officeId, 'resolved-office')
})

await run('pre-comparison account blocks do not count as successful face verification', () => {
  const events = [
    {
      status: 'blocked',
      decisionCode: 'blocked_pending_approval',
      personId: 'pending-person',
      matchDebug: { resolvedPersonId: 'pending-person', resolvedEmployeeId: 'PENDING' },
    },
    {
      status: 'blocked',
      decisionCode: 'blocked_inactive',
      personId: 'inactive-person',
      matchDebug: { resolvedPersonId: 'inactive-person', resolvedEmployeeId: 'INACTIVE' },
    },
  ]
  const report = buildMaintenanceEvidenceReport(events, {
    totalWindowEvents: events.length,
    currentEmployees: [
      { personId: 'pending-person', employeeId: 'PENDING' },
      { personId: 'inactive-person', employeeId: 'INACTIVE' },
    ],
  })

  assert.equal(report.verification1to1.denominator, 0)
  assert.equal(report.verification1to1.verifiedIdentityCount, 0)
  assert.equal(report.population.representedCurrentEmployees, 0)
})

await run('population coverage does not merge employees that share an Employee ID', () => {
  const currentEmployees = [
    { personId: 'person-1', employeeId: 'DUPLICATE' },
    { personId: 'person-2', employeeId: 'DUPLICATE' },
  ]
  const attributed = buildMaintenanceEvidenceReport([
    { status: 'accepted', personId: 'person-1', employeeId: 'DUPLICATE' },
  ], { totalWindowEvents: 1, currentEmployees })
  const unattributed = buildMaintenanceEvidenceReport([
    { status: 'accepted', employeeId: 'DUPLICATE' },
  ], { totalWindowEvents: 1, currentEmployees })

  assert.equal(attributed.population.representedCurrentEmployees, 1)
  assert.equal(unattributed.population.representedCurrentEmployees, 0)
})

await run('maintenance evidence cannot report stable verification from high mismatch evidence', () => {
  const events = [
    ...Array.from({ length: 20 }, () => ({
      status: 'accepted',
      decisionCode: 'accepted_onsite',
      personId: 'person-1',
      employeeId: 'EMP-1',
      matchDebug: { bestDistance: 0.61, threshold: 0.8 },
      scanDiagnostics: { serverMatchMode: 'two_frame_required' },
    })),
    ...Array.from({ length: 10 }, () => ({
      status: 'blocked',
      decisionCode: 'blocked_claimed_employee_mismatch',
      matchDebug: {
        resolvedPersonId: 'person-1',
        resolvedEmployeeId: 'EMP-1',
        bestDistance: 0.84,
        threshold: 0.8,
      },
      scanDiagnostics: { serverMatchMode: 'two_frame_required' },
    })),
  ]

  const report = buildMaintenanceEvidenceReport(events, {
    totalWindowEvents: 30,
    currentEmployees: [{ personId: 'person-1', employeeId: 'EMP-1' }],
  })

  assert.equal(report.version, 2)
  assert.equal(report.verification1to1.denominator, 30)
  assert.equal(report.verification1to1.claimedMismatchCount, 10)
  assert.equal(report.statuses.verification1to1.status, 'failing')
  assert.equal(report.calibration.status, 'unavailable')
  assert.equal(report.calibration.thresholdRecommendation, null)
  assert.deepEqual(report.breakdowns.matchModes, [{ key: 'two_frame_required', count: 30, rate: 1 }])
})

await run('maintenance evidence marks truncated and unknown evidence unsafe', () => {
  const report = buildMaintenanceEvidenceReport([
    { status: 'blocked', decisionCode: 'legacy_unknown' },
  ], {
    totalWindowEvents: 5,
    currentEmployees: [],
  })

  assert.equal(report.evidence.truncated, true)
  assert.equal(report.evidence.unknownOutcomeCount, 1)
  assert.notEqual(report.statuses.telemetry.status, 'sufficient')
  assert.notEqual(report.statuses.verification1to1.status, 'stable')
  assert.equal(
    report.breakdowns.categories.reduce((sum, item) => sum + item.count, 0),
    report.evidence.loadedEvents,
  )
})

await run('system evidence is read-only, complete, and secret-free', async () => {
  const queries = []
  const query = async (sql, params = []) => {
    queries.push({ sql: String(sql), params })
    if (/SHOW server_version/i.test(sql)) return { rows: [{ server_version: '18.1' }] }
    if (/FROM schema_migrations/i.test(sql)) return { rows: [{ version: '0001_local_core.sql' }] }
    if (/FULL OUTER JOIN/i.test(sql)) {
      return { rows: [{
        raw_person_count: 2,
        summary_person_count: 2,
        missing_summary_count: 0,
        unexpected_summary_count: 0,
        stale_summary_count: 0,
        newest_summary_at: '2026-08-27T18:00:00.000Z',
      }] }
    }
    return { rows: [{ offices: 6, persons: 73, pending_persons: 4, biometric_index: 31, attendance: 500, attendance_daily: 100, scan_events: 504, audit_logs: 20, admin_users: 2, hr_users: 6 }] }
  }
  const report = await buildSystemEvidence({
    query,
    now: new Date('2026-08-28T10:00:00+08:00').getTime(),
    env: {
      NODE_ENV: 'production',
      LOCAL_FILE_STORAGE_DIR: 'D:/private/storage',
      OPENVINO_MODEL_DIR: 'D:/private/models',
      ADMIN_SESSION_SECRET: 'do-not-return-admin',
      HR_SESSION_SECRET: 'do-not-return-hr',
      HR_PIN_SALT: 'do-not-return-salt',
      CRON_SECRET: 'do-not-return-cron',
    },
    cwd: 'D:/projects/faceid',
    access: async () => undefined,
    readdir: async directory => String(directory).endsWith('migrations')
      ? ['0001_local_core.sql']
      : [],
    readFile: async file => String(file).endsWith('BUILD_ID') ? 'build-123\n' : '',
    uptime: () => 120,
    nodeVersion: 'v22.18.0',
  })

  assert.equal(report.database.connected, true)
  assert.equal(Number.isFinite(report.database.latencyMs), true)
  assert.deepEqual(report.migrations.pending, [])
  assert.equal(report.storage.configured, true)
  assert.equal(report.storage.directoryExists, true)
  assert.equal('root' in report.storage, false)
  assert.equal(report.dailySummary.rawPersonCount, 2)
  assert.equal(report.dailySummary.summaryPersonCount, 2)
  assert.equal(report.runtime.buildId, 'build-123')
  assert.equal(queries.every(entry => /^\s*(SHOW|SELECT|WITH)/i.test(entry.sql)), true)
  assert.equal(JSON.stringify(report).includes('do-not-return'), false)
  assert.equal(JSON.stringify(report).includes('D:/private'), false)
})

await run('system evidence does not echo dependency failure details', async () => {
  const report = await buildSystemEvidence({
    query: async () => { throw new Error('postgres://private-user:private-password@private-host/database') },
    env: { LOCAL_FILE_STORAGE_DIR: 'D:/private/storage' },
    cwd: 'D:/private/project',
    access: async () => { throw new Error('D:/private/storage access denied') },
    readdir: async () => { throw new Error('D:/private/migrations missing') },
    readFile: async () => { throw new Error('D:/private/BUILD_ID missing') },
  })

  assert.doesNotMatch(JSON.stringify(report), /private|postgres:\/\//i)
})

await run('system evidence requires every Human model used by verification and server enrollment', async () => {
  const report = await buildSystemEvidence({
    query: async sql => {
      if (/SHOW server_version/i.test(sql)) return { rows: [{ server_version: '18.1' }] }
      if (/FROM schema_migrations/i.test(sql)) return { rows: [] }
      if (/FULL OUTER JOIN/i.test(sql)) {
        return { rows: [{
          raw_person_count: 0,
          summary_person_count: 0,
          missing_summary_count: 0,
          unexpected_summary_count: 0,
          stale_summary_count: 0,
          newest_summary_at: null,
        }] }
      }
      return { rows: [{}] }
    },
    cwd: 'D:/projects/faceid',
    access: async target => {
      if (String(target).endsWith('liveness.bin')) throw new Error('missing')
    },
    readdir: async () => [],
    readFile: async () => 'build-123',
  })

  assert.equal(report.models.human.requiredFileCount, 12)
  assert.equal(report.models.human.status, 'failing')
  assert.deepEqual(report.models.human.missing, ['liveness.bin'])
  assert.ok(report.actions.some(action => action.id === 'human-models'))
})

await run('daily-summary evidence detects equal-count identity and freshness mismatches', async () => {
  const report = await buildSystemEvidence({
    query: async sql => {
      if (/SHOW server_version/i.test(sql)) return { rows: [{ server_version: '18.1' }] }
      if (/FROM schema_migrations/i.test(sql)) return { rows: [] }
      if (/FULL OUTER JOIN/i.test(sql)) {
        return { rows: [{
          raw_person_count: 2,
          summary_person_count: 2,
          missing_summary_count: 1,
          unexpected_summary_count: 1,
          stale_summary_count: 1,
          newest_summary_at: '2026-08-27T18:00:00.000Z',
        }] }
      }
      if (/FROM attendance\s+WHERE date_key/i.test(sql)) return { rows: [{ count: 2 }] }
      if (/FROM attendance_daily\s+WHERE date_key/i.test(sql)) return { rows: [{ count: 2, newest: '2026-08-27T18:00:00.000Z' }] }
      return { rows: [{}] }
    },
    now: new Date('2026-08-28T10:00:00+08:00').getTime(),
    cwd: 'D:/projects/faceid',
    access: async () => undefined,
    readdir: async () => [],
    readFile: async () => 'build-123',
  })

  assert.equal(report.dailySummary.status, 'stale')
  assert.equal(report.dailySummary.missingSummaryCount, 1)
  assert.equal(report.dailySummary.unexpectedSummaryCount, 1)
  assert.equal(report.dailySummary.staleSummaryCount, 1)
  assert.ok(report.actions.some(action => action.id === 'daily-summary'))
})

await run('system evidence surfaces migration uncertainty as an action', async () => {
  const report = await buildSystemEvidence({
    query: async sql => {
      if (/SHOW server_version/i.test(sql)) return { rows: [{ server_version: '18.1' }] }
      if (/FROM schema_migrations/i.test(sql)) throw new Error('migration table unavailable')
      if (/FULL OUTER JOIN/i.test(sql)) {
        return { rows: [{
          raw_person_count: 0,
          summary_person_count: 0,
          missing_summary_count: 0,
          unexpected_summary_count: 0,
          stale_summary_count: 0,
          newest_summary_at: null,
        }] }
      }
      return { rows: [{}] }
    },
    cwd: 'D:/projects/faceid',
    access: async () => undefined,
    readdir: async () => ['0001_local_core.sql'],
    readFile: async () => 'build-123',
  })

  assert.equal(report.migrations.status, 'unknown')
  assert.ok(report.actions.some(action => action.id === 'migrations'))
})

await run('shadow benchmark ranks 1:N candidates without storing descriptor vectors in report', () => {
  const samples = [
    { engine: 'human', sampleId: 'a-enroll', personId: 'a', employeeId: 'A', split: 'enroll', descriptor: [1, 0] },
    { engine: 'human', sampleId: 'b-enroll', personId: 'b', employeeId: 'B', split: 'enroll', descriptor: [-1, 0] },
    { engine: 'human', sampleId: 'a-query', personId: 'a', employeeId: 'A', split: 'query', descriptor: [0.99, 0.01] },
    { engine: 'human', sampleId: 'b-query', personId: 'b', employeeId: 'B', split: 'query', descriptor: [-0.99, -0.01] },
  ]

  const report = buildEngineShadowBenchmark(samples, { engine: 'human', metric: 'l2' })
  assert.equal(report.identification.top1Correct, 2)
  assert.equal(report.identification.top1Mismatch, 0)
  assert.equal(report.distributions.separationStatus, 'separated')
  assert.equal(Array.isArray(report.thresholdSearch.candidates), true)
  assert.equal('descriptor' in report, false)
})

await run('shadow benchmark flags nearest-neighbor mismatches for false-accept review', () => {
  const report = buildShadowBenchmarkReport({
    human: [
      { engine: 'human', sampleId: 'a-enroll', personId: 'a', employeeId: 'A', split: 'enroll', descriptor: [1, 0] },
      { engine: 'human', sampleId: 'b-enroll', personId: 'b', employeeId: 'B', split: 'enroll', descriptor: [-1, 0] },
      { engine: 'human', sampleId: 'a-query', personId: 'a', employeeId: 'A', split: 'query', descriptor: [-0.98, 0.02] },
    ],
  }, { now: new Date('2026-04-20T08:00:00+08:00').getTime() })

  const human = report.engines.human
  assert.equal(human.identification.top1Mismatch, 1)
  assert.equal(human.identification.mismatchExamples[0].expected, 'A')
  assert.equal(human.identification.mismatchExamples[0].nearest, 'B')
  assert.equal(report.dataset.note.includes('must not contain raw frames'), true)
})

await run('attendance storage sanitizer strips raw biometric evidence', () => {
  const stored = sanitizeAttendanceEntryForStorage({
    employeeId: 'EMP-1',
    descriptor: [1, 2, 3],
    descriptors: [[1, 2, 3]],
    landmarks: [{ x: 1 }],
    challenge: { token: 'secret' },
    scanFrames: [{ frameDataUrl: 'data:image/jpeg;base64,abc' }],
    sampleFrames: [{ frameDataUrl: 'data:image/jpeg;base64,def' }],
    captureContext: { serverEmbeddingFrames: 2 },
  })

  assert.equal(stored.employeeId, 'EMP-1')
  assert.deepEqual(stored.captureContext, { serverEmbeddingFrames: 2 })
  assert.equal(Object.hasOwn(stored, 'descriptor'), false)
  assert.equal(Object.hasOwn(stored, 'descriptors'), false)
  assert.equal(Object.hasOwn(stored, 'landmarks'), false)
  assert.equal(Object.hasOwn(stored, 'challenge'), false)
  assert.equal(Object.hasOwn(stored, 'scanFrames'), false)
  assert.equal(Object.hasOwn(stored, 'sampleFrames'), false)
})

await run('OpenVINO shadow enrollment only collects from strong accepted Human matches', () => {
  const config = {
    enabled: true,
    maxSamples: 6,
    maxHumanDistance: 0.68,
    minHumanMargin: 0.08,
    minSupport: 2,
  }
  const entry = {
    scanFrames: [{ frameDataUrl: 'data:image/jpeg;base64,abc' }],
  }
  const personMatch = {
    ok: true,
    debug: {
      bestDistance: 0.52,
      secondDistance: 0.67,
      supportCount: 3,
      supportDescriptorCount: 3,
    },
  }

  assert.equal(shouldCollectOpenVinoProfileSample({ personMatch, entry }, config).ok, true)

  const weakMargin = {
    ...personMatch,
    debug: { ...personMatch.debug, secondDistance: 0.57 },
  }
  const weakDistance = {
    ...personMatch,
    debug: { ...personMatch.debug, bestDistance: 0.72 },
  }
  const noFrames = { scanFrames: [] }

  assert.equal(shouldCollectOpenVinoProfileSample({ personMatch: weakMargin, entry }, config).reason, 'human_match_margin_too_small')
  assert.equal(shouldCollectOpenVinoProfileSample({ personMatch: weakDistance, entry }, config).reason, 'human_match_distance_too_weak')
  assert.equal(shouldCollectOpenVinoProfileSample({ personMatch, entry: noFrames }, config).reason, 'missing_scan_frames')
})

await run('OpenVINO shadow defaults on only when local runtime is included', () => {
  const previousShadow = process.env.OPENVINO_SHADOW_ENABLED
  const previousInclude = process.env.INCLUDE_OPENVINO_RUNTIME

  try {
    delete process.env.OPENVINO_SHADOW_ENABLED
    delete process.env.INCLUDE_OPENVINO_RUNTIME
    assert.equal(getOpenVinoShadowProfileConfig().enabled, false)

    process.env.INCLUDE_OPENVINO_RUNTIME = 'true'
    assert.equal(getOpenVinoShadowProfileConfig().enabled, true)
    assert.equal(getOpenVinoShadowProfileConfig().framesPerScan, 2)

    process.env.OPENVINO_SHADOW_ENABLED = 'false'
    assert.equal(getOpenVinoShadowProfileConfig().enabled, false)
  } finally {
    if (previousShadow === undefined) delete process.env.OPENVINO_SHADOW_ENABLED
    else process.env.OPENVINO_SHADOW_ENABLED = previousShadow
    if (previousInclude === undefined) delete process.env.INCLUDE_OPENVINO_RUNTIME
    else process.env.INCLUDE_OPENVINO_RUNTIME = previousInclude
  }
})

await run('OpenVINO shadow profile samples strip invalid vectors and cap metadata', () => {
  const samples = normalizeOpenVinoProfileSamples([
    {
      vector: Array.from({ length: 256 }, (_, index) => index / 256),
      modelVersion: 'openvino-retail-reid-0095-v1',
      distanceMetric: 'cosine',
      source: 'accepted_human_scan_shadow',
      browser: 'Chrome'.repeat(30),
    },
    { vector: [1, 2, 3] },
  ])

  assert.equal(samples.length, 1)
  assert.equal(samples[0].vector.length, 256)
  assert.equal(samples[0].distanceMetric, 'cosine')
  assert.equal(samples[0].browser.length, 80)
})

await run('daily attendance records normalize PostgreSQL payloads', () => {
  const record = normalizeDailyRecord({
    id: 'person-001_2026-04-09',
    employeeId: 'EMP-001',
    personId: 'person-001',
    dateKey: '2026-04-09',
    logCount: 1,
    amInTimestamp: 1,
  })

  assert.equal(record.id, 'person-001_2026-04-09')
  assert.equal(record.employeeId, 'EMP-001')
  assert.equal(record.personId, 'person-001')
  assert.equal(record.dateKey, '2026-04-09')
})

await run('daily attendance records repair orphan PM out from missed AM out', () => {
  const record = normalizeDailyRecord({
    id: 'person-001_2026-05-05',
    employeeId: 'EMP-001',
    personId: 'person-001',
    dateKey: '2026-05-05',
    logCount: 2,
    amInTimestamp: 1777933620000,
    amIn: '9:07 AM',
    amOut: '--',
    pmIn: '--',
    pmOutTimestamp: 1777942980000,
    pmOut: '1:03 PM',
  })

  assert.equal(record.amIn, '9:07 AM')
  assert.equal(record.amOut, '--')
  assert.equal(record.pmInTimestamp, 1777942980000)
  assert.equal(record.pmIn, '1:03 PM')
  assert.equal(record.pmOutTimestamp, null)
  assert.equal(record.pmOut, '--')
})

await run('raw attendance workbook creates one worksheet per employee', () => {
  const rows = [
    {
      name: 'Alpha Employee',
      employeeId: 'EMP-001',
      officeName: 'Office A',
      dateKey: '2026-04-09',
      amIn: '8:00 AM',
      amOut: '12:00 PM',
      pmIn: '1:00 PM',
      pmOut: '5:00 PM',
      lateMinutes: 0,
      undertimeMinutes: 0,
      workingMinutes: 480,
      workingHours: '8h 00m',
      status: 'Complete',
    },
    {
      name: 'Beta Employee',
      employeeId: 'EMP-002',
      officeName: 'Office B',
      dateKey: '2026-04-09',
      amIn: '8:10 AM',
      amOut: '12:00 PM',
      pmIn: '1:00 PM',
      pmOut: '4:50 PM',
      lateMinutes: 10,
      undertimeMinutes: 20,
      workingMinutes: 460,
      workingHours: '7h 40m',
      status: 'Late / Undertime',
    },
  ]

  const worksheets = buildRawAttendanceWorksheets(rows)

  assert.equal(worksheets.length, 2)
  assert.equal(worksheets[0].rows[0][0], 'Department')
  assert.equal(worksheets[0].rows[1][4], '2026-04-09')
  assert.equal(worksheets[1].rows[1][9], 10)
  assert.equal(worksheets[1].rows[1][10], 20)
})

await run('raw attendance workbook files contain worksheet XML for each employee', () => {
  const { worksheets, files } = buildRawAttendanceWorkbookFiles([
    { name: 'Alpha Employee', employeeId: 'EMP-001', officeName: 'Office A', dateKey: '2026-04-09' },
    { name: 'Beta Employee', employeeId: 'EMP-002', officeName: 'Office B', dateKey: '2026-04-09' },
  ])

  assert.equal(worksheets.length, 2)
  assert.equal(files.some(file => file.name === 'xl/worksheets/sheet1.xml'), true)
  assert.equal(files.some(file => file.name === 'xl/worksheets/sheet2.xml'), true)
  assert.match(files.find(file => file.name === 'xl/workbook.xml').content, /Unassigned - Alpha Employee/)
  assert.match(files.find(file => file.name === 'xl/workbook.xml').content, /Unassigned - Beta Employee/)
})

await run('origin guard rejects unconfigured production remote host', () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL

  process.env.NODE_ENV = 'production'
  delete process.env.NEXT_PUBLIC_SITE_URL

  try {
    assert.equal(validateOrigin(new Request('https://local-attendance.example/api/attendance/v2', {
      headers: { origin: 'https://example.com' },
    })), false)
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
    if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
    else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl
  }
})

await run('origin guard ignores spoofed forwarding headers', () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL
  const previousTrustProxy = process.env.TRUST_SMARTASP_PROXY

  process.env.NODE_ENV = 'production'
  process.env.NEXT_PUBLIC_SITE_URL = 'https://attendance.example.test'
  delete process.env.TRUST_SMARTASP_PROXY

  try {
    const spoofed = new Request('https://attendance.example.test/api/attendance/v2', {
      headers: {
        origin: 'https://evil.example.test',
        'x-forwarded-host': 'evil.example.test',
        'x-forwarded-proto': 'https',
      },
    })
    assert.equal(validateOrigin(spoofed), false)
    assert.equal(validateOrigin(new Request('https://attendance.example.test/api/attendance/v2', {
      headers: { origin: 'https://attendance.example.test' },
    })), true)
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
    if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
    else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl
    if (previousTrustProxy === undefined) delete process.env.TRUST_SMARTASP_PROXY
    else process.env.TRUST_SMARTASP_PROXY = previousTrustProxy
  }
})

await run('security headers publish a reviewed CSP in report-only mode', async () => {
  const rules = await nextConfig.headers()
  const globalHeaders = rules.find(rule => rule.source === '/(.*)')?.headers || []
  const csp = globalHeaders.find(header => header.key === 'Content-Security-Policy-Report-Only')?.value || ''
  const permissions = globalHeaders.find(header => header.key === 'Permissions-Policy')?.value || ''
  assert.match(csp, /default-src 'self'/)
  assert.match(csp, /worker-src 'self' blob:/)
  assert.match(csp, /object-src 'none'/)
  assert.match(permissions, /camera=\(self\)/)
})

await run('attendance normalization preserves iris liveness evidence for server validation', () => {
  const entry = normalizeEntry({
    descriptor: Array.from({ length: 1024 }, (_, index) => (index === 0 ? 1 : 0)),
    livenessEvidence: {
      earSamples: [0.25, 0.18, 0.25],
      meshDeltas: [0.05, 0.05],
      irisDeltas: [0.22, 0.24],
      blinkCount: 0,
      avgMeshDelta: 0.05,
      avgIrisDelta: 0.23,
      avgAntispoof: 0.92,
      avgLiveness: 0.88,
      hasEyeSignal: true,
      hasMotionSignal: true,
      frameCount: 3,
      score: 0.75,
      pass: true,
    },
  })

  assert.deepEqual(entry.livenessEvidence.irisDeltas, [0.22, 0.24])
  assert.equal(entry.livenessEvidence.avgIrisDelta, 0.23)
  assert.equal(entry.livenessEvidence.hasEyeSignal, true)
  assert.equal(entry.livenessEvidence.hasMotionSignal, true)

  const validation = validateLivenessEvidence(entry.livenessEvidence)
  assert.equal(validation.ok, true)
  assert.ok(validation.avgIrisDelta >= 0.2)
})

await run('iris motion ignores rigid photo movement across the frame', () => {
  const stillPhotoFrame = createMinimalFaceMesh()
  const movedPhotoFrame = translateMesh(stillPhotoFrame, 18, 7)
  const relativeIrisMotion = computeIrisDelta(stillPhotoFrame, movedPhotoFrame)

  assert.ok(relativeIrisMotion < 0.001)
})

await run('iris motion detects movement relative to the face', () => {
  const frameA = createMinimalFaceMesh()
  const frameB = translateMesh(frameA, 18, 7)
  frameB[468] = { x: frameB[468].x + 2, y: frameB[468].y }
  frameB[473] = { x: frameB[473].x - 2, y: frameB[473].y }

  const relativeIrisMotion = computeIrisDelta(frameA, frameB)

  assert.ok(relativeIrisMotion > 1)
})

await run('liveness blocks photo-like rigid motion without eye evidence', () => {
  const validation = validateLivenessEvidence({
    earSamples: [0.25, 0.25, 0.25, 0.25],
    meshDeltas: [0.34, 0.39, 0.36],
    irisDeltas: [0.02, 0.03, 0.02],
    avgAntispoof: 0.82,
    avgLiveness: 0.74,
    frameCount: 4,
  })

  assert.equal(validation.ok, false)
  assert.equal(validation.reason, 'photo_like_rigid_motion')
})

await run('liveness keeps gray-zone antispoof as risk instead of blocking real scans', () => {
  const validation = validateLivenessEvidence({
    earSamples: [0.24, 0.17, 0.25],
    meshDeltas: [0.31, 0.29],
    irisDeltas: [0.22, 0.24],
    avgAntispoof: 0.53,
    avgLiveness: 0.42,
    frameCount: 3,
  })

  assert.equal(validation.ok, true)
  assert.equal(validation.riskFlags.includes('pad_gray_zone'), true)
  assert.equal(validation.riskFlags.includes('weak_human_liveness_score'), true)
})

await run('scan strict frame floor matches liveness frame requirement', () => {
  assert.equal(MIN_SCAN_STRICT_FRAMES, 3)

  const validation = validateLivenessEvidence({
    earSamples: [0.24, 0.17],
    meshDeltas: [0.31],
    irisDeltas: [0.22],
    avgAntispoof: 0.82,
    avgLiveness: 0.74,
    frameCount: 2,
  })

  assert.equal(validation.ok, false)
  assert.equal(validation.reason, 'insufficient_liveness_frames')
})

await run('scan capture policy treats one low PAD frame as risk when temporal liveness is strong', () => {
  const assessment = getScanCapturePolicyAssessment({
    descriptor: Array.from({ length: 1024 }, (_, index) => (index === 0 ? 1 : 0)),
    antispoof: 0.29,
    liveness: 0.82,
    captureContext: {
      capturePolicyVersion: SCAN_CAPTURE_POLICY_VERSION,
      verificationFrames: 4,
      trackWidth: 720,
      trackHeight: 1280,
      trackFacingMode: 'user',
      screenOrientation: 'portrait-primary',
      mobile: true,
    },
    scanDiagnostics: {
      strictFrames: 3,
      descriptorSpread: 0.09,
    },
    livenessEvidence: {
      earSamples: [0.25, 0.17, 0.25],
      meshDeltas: [0.31, 0.29],
      irisDeltas: [0.22, 0.24],
      avgAntispoof: 0.42,
      avgLiveness: 0.82,
      frameCount: 3,
    },
  })

  assert.equal(assessment.ok, true)
  assert.equal(assessment.riskFlags.includes('single_frame_pad_low'), true)
  assert.equal(assessment.riskFlags.includes('pad_gray_zone'), true)
})

await run('scan capture policy trusts server descriptor spread over legacy raw client spread', () => {
  const assessment = getScanCapturePolicyAssessment({
    descriptor: Array.from({ length: 1024 }, (_, index) => (index === 0 ? 1 : 0)),
    antispoof: 0.29,
    liveness: 0.82,
    captureContext: {
      capturePolicyVersion: SCAN_CAPTURE_POLICY_VERSION,
      verificationFrames: 4,
      trackWidth: 720,
      trackHeight: 1280,
      trackFacingMode: 'user',
      screenOrientation: 'portrait-primary',
      mobile: true,
    },
    scanDiagnostics: {
      strictFrames: 3,
      descriptorSpread: 5.4,
      serverDescriptorSpread: 0.22,
    },
    livenessEvidence: {
      earSamples: [0.25, 0.17, 0.25],
      meshDeltas: [0.31, 0.29],
      irisDeltas: [0.22, 0.24],
      avgAntispoof: 0.42,
      avgLiveness: 0.82,
      frameCount: 3,
    },
  })

  assert.equal(assessment.ok, true)
  assert.equal(assessment.riskFlags.includes('legacy_client_descriptor_spread'), true)
  assert.equal(assessment.riskFlags.includes('client_server_descriptor_spread_mismatch'), true)
  assert.equal(assessment.riskFlags.includes('unstable_descriptor_spread'), false)
})

await run('scan capture policy blocks server-authoritative unstable descriptor spread', () => {
  const assessment = getScanCapturePolicyAssessment({
    descriptor: Array.from({ length: 1024 }, (_, index) => (index === 0 ? 1 : 0)),
    antispoof: 0.82,
    liveness: 0.82,
    captureContext: {
      capturePolicyVersion: SCAN_CAPTURE_POLICY_VERSION,
      verificationFrames: 4,
      trackWidth: 720,
      trackHeight: 1280,
      trackFacingMode: 'user',
      screenOrientation: 'portrait-primary',
      mobile: true,
    },
    scanDiagnostics: {
      strictFrames: 3,
      descriptorSpread: 0.12,
      serverDescriptorSpread: 0.9,
    },
    livenessEvidence: {
      earSamples: [0.25, 0.17, 0.25],
      meshDeltas: [0.31, 0.29],
      irisDeltas: [0.22, 0.24],
      avgAntispoof: 0.82,
      avgLiveness: 0.82,
      frameCount: 3,
    },
  })

  assert.equal(assessment.ok, false)
  assert.equal(assessment.decisionCode, 'blocked_unstable_descriptor_burst')
  assert.equal(assessment.riskFlags.includes('unstable_descriptor_spread'), true)
})

await run('scan capture policy treats low PAD as risk when only eye signal is weak', () => {
  const assessment = getScanCapturePolicyAssessment({
    descriptor: Array.from({ length: 1024 }, (_, index) => (index === 0 ? 1 : 0)),
    antispoof: 0.29,
    liveness: 0.82,
    captureContext: {
      capturePolicyVersion: SCAN_CAPTURE_POLICY_VERSION,
      verificationFrames: 4,
      trackWidth: 720,
      trackHeight: 1280,
      trackFacingMode: 'user',
      screenOrientation: 'portrait-primary',
      mobile: true,
    },
    scanDiagnostics: {
      strictFrames: 3,
      descriptorSpread: 0.09,
    },
    livenessEvidence: {
      earSamples: [0.25, 0.25, 0.25],
      meshDeltas: [0.31, 0.29],
      irisDeltas: [0.22, 0.24],
      avgAntispoof: 0.82,
      avgLiveness: 0.82,
      frameCount: 3,
    },
  })

  assert.equal(assessment.ok, true)
  assert.equal(assessment.riskFlags.includes('weak_eye_signal'), true)
  assert.equal(assessment.riskFlags.includes('single_frame_pad_low'), true)
})

await run('scan capture policy still blocks low PAD when temporal evidence is static', () => {
  const assessment = getScanCapturePolicyAssessment({
    descriptor: Array.from({ length: 1024 }, (_, index) => (index === 0 ? 1 : 0)),
    antispoof: 0.29,
    liveness: 0.82,
    captureContext: {
      capturePolicyVersion: SCAN_CAPTURE_POLICY_VERSION,
      verificationFrames: 4,
      trackWidth: 720,
      trackHeight: 1280,
      trackFacingMode: 'user',
      screenOrientation: 'portrait-primary',
      mobile: true,
    },
    scanDiagnostics: {
      strictFrames: 3,
      descriptorSpread: 0.09,
    },
    livenessEvidence: {
      earSamples: [0.25, 0.25, 0.25],
      meshDeltas: [0.05, 0.06],
      irisDeltas: [0.02, 0.03],
      avgAntispoof: 0.42,
      avgLiveness: 0.82,
      frameCount: 3,
    },
  })

  assert.equal(assessment.ok, false)
  assert.equal(assessment.decisionCode, 'blocked_liveness')
})

await run('liveness still hard-blocks clear anti-spoof failures', () => {
  const validation = validateLivenessEvidence({
    earSamples: [0.24, 0.17, 0.25],
    meshDeltas: [0.31, 0.29],
    irisDeltas: [0.22, 0.24],
    avgAntispoof: 0.2,
    avgLiveness: 0.9,
    frameCount: 3,
  })

  assert.equal(validation.ok, false)
  assert.equal(validation.reason, 'antispoof_hard_fail')
})

await run('match support snapshot blocks weak single-sample support on marginal matches', () => {
  const descriptors = [
    [1, 0],
    [-1, 0],
    [0, -1],
    [-0.2, -0.98],
  ]
  const queryDescriptor = [0.68, 0.733]

  const snapshot = buildMatchSupportSnapshot({ descriptors }, queryDescriptor, 0.85)

  assert.equal(snapshot.descriptorCount, 4)
  assert.equal(snapshot.requiresStrongSupport, true)
  assert.equal(snapshot.supportCount, 1)
  assert.equal(snapshot.weakSingleSample, true)
})

await run('match support allows a strong single-sample hit only with a wide global margin', () => {
  const descriptors = [
    [1, 0],
    [-1, 0],
    [0, -1],
    [-0.2, -0.98],
  ]
  const queryDescriptor = [0.84, 0.543]
  const snapshot = buildMatchSupportSnapshot({ descriptors }, queryDescriptor, 0.85)

  assert.equal(snapshot.weakSingleSample, true)
  assert.equal(isStrongUnambiguousSingleSampleSupport(snapshot, { secondDistance: 0.82 }), true)
  assert.equal(isStrongUnambiguousSingleSampleSupport(snapshot, { secondDistance: 0.7 }), false)
})

await run('multi-descriptor match blocks a single lucky descriptor without corroboration', () => {
  const candidateSamples = [
    {
      personId: 'wrong-person',
      employeeId: 'E-1',
      name: 'Wrong Person',
      officeId: 'office-a',
      officeName: 'Office A',
      normalizedDescriptor: [1, 0],
    },
    {
      personId: 'actual-person',
      employeeId: 'E-2',
      name: 'Actual Person',
      officeId: 'office-a',
      officeName: 'Office A',
      normalizedDescriptor: [-1, 0],
    },
  ]

  const descriptors = [
    [0.68, 0.733],
    [0.6, -0.8],
    [0.58, -0.81],
  ]

  const result = matchBiometricIndexMultiDescriptor(candidateSamples, descriptors, 0.85, 0.02)

  assert.equal(result.ok, false)
  assert.equal(result.decisionCode, 'blocked_no_reliable_match')
  assert.equal(result.debug.supportGate, 'weak_query_descriptor_support')
})

await run('multi-descriptor match accepts strong partial query support with a safe challenger margin', () => {
  const candidateSamples = [
    {
      personId: 'person-a',
      employeeId: 'E-1',
      name: 'Person A',
      officeId: 'office-a',
      officeName: 'Office A',
      normalizedDescriptor: [1, 0],
    },
    {
      personId: 'person-b',
      employeeId: 'E-2',
      name: 'Person B',
      officeId: 'office-a',
      officeName: 'Office A',
      normalizedDescriptor: [0, 1],
    },
  ]

  const descriptors = [
    [0.88, 0.47],
    [0.68, 0.733],
  ]

  const result = matchBiometricIndexMultiDescriptor(candidateSamples, descriptors, 0.85, 0.02)

  assert.equal(result.ok, true)
  assert.equal(result.personId, 'person-a')
  assert.equal(result.debug.supportGate, 'strong_partial_query_support')
})

await run('multi-descriptor strong partial support still blocks a close raw challenger', () => {
  const candidateSamples = [
    {
      personId: 'person-a',
      employeeId: 'E-1',
      name: 'Person A',
      officeId: 'office-a',
      officeName: 'Office A',
      normalizedDescriptor: [1, 0],
    },
    {
      personId: 'person-b',
      employeeId: 'E-2',
      name: 'Person B',
      officeId: 'office-a',
      officeName: 'Office A',
      normalizedDescriptor: [0.45, 0.893],
    },
  ]

  const descriptors = [
    [0.88, 0.47],
    [0.4, -0.916],
  ]

  const result = matchBiometricIndexMultiDescriptor(candidateSamples, descriptors, 0.85, 0.02)

  assert.equal(result.ok, false)
  assert.equal(result.decisionCode, 'blocked_no_reliable_match')
  assert.equal(result.debug.supportGate, 'weak_query_descriptor_support')
})

await run('multi-descriptor match blocks a close raw challenger even when not viable', () => {
  const candidateSamples = [
    {
      personId: 'person-a',
      employeeId: 'E-1',
      name: 'Person A',
      officeId: 'office-a',
      officeName: 'Office A',
      normalizedDescriptor: [1, 0],
    },
    {
      personId: 'person-b',
      employeeId: 'E-2',
      name: 'Person B',
      officeId: 'office-a',
      officeName: 'Office A',
      normalizedDescriptor: [0.9995, 0.0316],
    },
  ]

  const descriptors = [
    [1, 0],
    [0.999, 0.02],
    [0.999, -0.02],
  ]

  const result = matchBiometricIndexMultiDescriptor(candidateSamples, descriptors, 0.85, 0.02)

  assert.equal(result.ok, false)
  assert.equal(result.decisionCode, 'blocked_ambiguous_match')
  assert.equal(result.debug.supportGate, 'raw_competitor_too_close')
  assert.ok(result.debug.secondDistance < result.debug.ambiguousMargin)
})

await run('single-descriptor match enforces a safer ambiguity floor', () => {
  const candidateSamples = [
    {
      personId: 'person-a',
      employeeId: 'E-1',
      name: 'Person A',
      officeId: 'office-a',
      officeName: 'Office A',
      normalizedDescriptor: [1, 0],
    },
    {
      personId: 'person-b',
      employeeId: 'E-2',
      name: 'Person B',
      officeId: 'office-a',
      officeName: 'Office A',
      normalizedDescriptor: [0.9995, 0.0316],
    },
  ]

  const result = matchBiometricIndexCandidates(candidateSamples, [1, 0], 0.85, 0.02)

  assert.equal(result.ok, false)
  assert.equal(result.decisionCode, 'blocked_ambiguous_match')
  assert.equal(result.debug.ambiguousMargin, 0.04)
})

await run('attendance access code validation requires exactly four digits', () => {
  assert.equal(validateClaimedEmployeeId('0123'), null)
  assert.match(validateClaimedEmployeeId(''), /required/i)
  assert.match(validateClaimedEmployeeId('123'), /exactly four/i)
  assert.match(validateClaimedEmployeeId('ABCD'), /exactly four/i)
  assert.match(validateClaimedEmployeeId('12-3'), /exactly four/i)
})

await run('multi-descriptor match accepts corroborated uncertain support for the same person', () => {
  const candidateSamples = [
    {
      personId: 'person-a',
      employeeId: 'E-1',
      name: 'Person A',
      officeId: 'office-a',
      officeName: 'Office A',
      normalizedDescriptor: [1, 0],
    },
    {
      personId: 'person-b',
      employeeId: 'E-2',
      name: 'Person B',
      officeId: 'office-a',
      officeName: 'Office A',
      normalizedDescriptor: [0, 1],
    },
  ]

  const descriptors = [
    [0.75, 0.66],
    [0.79, 0.61],
    [0.77, 0.63],
  ]

  const result = matchBiometricIndexMultiDescriptor(candidateSamples, descriptors, 0.85, 0.02)

  assert.equal(result.ok, true)
  assert.equal(result.personId, 'person-a')
  assert.equal(result.debug.supportCount >= 2, true)
})

await run('public enrollment cannot silently change identity fields on an existing pending record', () => {
  const existing = {
    name: 'JUAN DELA CRUZ',
    officeId: 'office-a',
    approvalStatus: 'pending',
  }

  assert.match(
    validatePublicEnrollmentIdentity(existing, {
      name: 'JUAN DELA CRUZ',
      officeId: 'office-b',
    }),
    /different office/i,
  )

  assert.match(
    validatePublicEnrollmentIdentity(existing, {
      name: 'PEDRO DELA CRUZ',
      officeId: 'office-a',
    }),
    /name changes/i,
  )

  assert.equal(
    validatePublicEnrollmentIdentity(existing, {
      name: 'JUAN DELA CRUZ',
      officeId: 'office-a',
    }),
    null,
  )
})

await run('duplicate face snapshot catches same person across multiple guided query samples', () => {
  const person = {
    id: 'person-a',
    approvalStatus: 'approved',
    descriptors: [
      [1, 0, 0, 0],
      [0.98, 0.18, 0, 0],
      [0.98, -0.18, 0, 0],
      [0.95, 0.05, 0.3, 0],
    ],
  }

  const queryDescriptors = [
    [0.97, 0.16, 0.02, 0],
    [0.96, -0.14, 0.01, 0],
    [0.94, 0.04, 0.28, 0],
  ]

  const snapshot = buildDuplicateFaceSnapshot(person, queryDescriptors)

  assert.equal(snapshot?.duplicate, true)
  assert.equal(snapshot?.status, DUPLICATE_STATUS_HARD_DUPLICATE)
  assert.ok(snapshot?.matchedQueries >= 2)
  assert.ok(snapshot?.bestDistance < 0.5)
})

await run('duplicate face snapshot routes uncertain duplicate evidence into review instead of hard block', () => {
  const person = {
    id: 'person-b',
    approvalStatus: 'approved',
    descriptors: [
      [1, 0, 0, 0],
      [0.99, 0.12, 0, 0],
    ],
  }

  const queryDescriptors = [
    [0.99, 0.11, 0, 0],
    [0.98, 0.16, 0, 0],
    [0.97, 0.19, 0, 0],
  ]

  const snapshot = buildDuplicateFaceSnapshot(person, queryDescriptors)

  assert.equal(snapshot?.duplicate, false)
  assert.equal(snapshot?.reviewRequired, true)
  assert.equal(snapshot?.status, DUPLICATE_STATUS_REVIEW_REQUIRED)
})

await run('duplicate face snapshot does not block a weak single-query resemblance', () => {
  const person = {
    id: 'person-c',
    approvalStatus: 'approved',
    descriptors: [
      [1, 0, 0, 0],
      [0.98, 0.18, 0, 0],
      [0.98, -0.18, 0, 0],
      [0.95, 0.05, 0.3, 0],
    ],
  }

  const queryDescriptors = [
    [0.56, 0.83, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
  ]

  const snapshot = buildDuplicateFaceSnapshot(person, queryDescriptors)

  assert.equal(snapshot?.duplicate, false)
  assert.equal(snapshot?.reviewRequired, false)
})

await run('duplicate evaluation degrades hard duplicate to review when the nearest second person is too close', () => {
  const candidates = [
    {
      id: 'person-a',
      name: 'ALPHA',
      employeeId: 'A-1',
      approvalStatus: 'approved',
      descriptors: [
        [1, 0, 0, 0],
        [0.998, 0.06, 0, 0],
        [0.997, -0.05, 0, 0],
      ],
    },
    {
      id: 'person-b',
      name: 'BETA',
      employeeId: 'B-1',
      approvalStatus: 'approved',
      descriptors: [
        [0.999, 0.045, 0, 0],
        [0.997, 0.08, 0, 0],
        [0.996, -0.02, 0, 0],
      ],
    },
  ]

  const queryDescriptors = [
    [0.999, 0.04, 0, 0],
    [0.998, 0.03, 0, 0],
    [0.999, 0.01, 0, 0],
  ]

  const evaluation = evaluateDuplicateFaceCandidates(candidates, queryDescriptors)

  assert.equal(evaluation?.duplicate, false)
  assert.equal(evaluation?.reviewRequired, true)
  assert.equal(evaluation?.status, DUPLICATE_STATUS_REVIEW_REQUIRED)
  assert.ok((evaluation?.marginToNext ?? 1) < 0.05)
})

await run('pending profiles can trigger review but cannot hard-block enrollment', () => {
  const candidates = [
    {
      id: 'person-pending',
      name: 'PENDING USER',
      employeeId: 'P-1',
      approvalStatus: 'pending',
      descriptors: [
        [1, 0, 0, 0],
        [0.99, 0.11, 0, 0],
        [0.99, -0.1, 0, 0],
      ],
    },
  ]

  const queryDescriptors = [
    [0.999, 0.03, 0, 0],
    [0.998, 0.05, 0, 0],
    [0.999, -0.01, 0, 0],
  ]

  const evaluation = evaluateDuplicateFaceCandidates(candidates, queryDescriptors)

  assert.equal(evaluation?.duplicate, false)
  assert.equal(evaluation?.reviewRequired, true)
  assert.equal(evaluation?.status, DUPLICATE_STATUS_REVIEW_REQUIRED)
})

await run('attendance match storage keeps canonical person identity when Employee ID is absent', () => {
  class MemoryStorage {
    constructor() { this.values = new Map() }
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null }
    removeItem(key) { this.values.delete(key) }
    setItem(key, value) { this.values.set(key, String(value)) }
  }

  const previousLocalStorage = globalThis.localStorage
  const previousSessionStorage = globalThis.sessionStorage
  globalThis.localStorage = new MemoryStorage()
  globalThis.sessionStorage = new MemoryStorage()
  try {
    saveAttendanceMatch({
      personId: 'person-with-optional-id',
      employeeId: '',
      name: 'Optional ID Employee',
      employeeViewSession: 'signed-session',
      employeeViewSessionExpiresAt: Date.now() + 60_000,
    })
    const stored = loadAttendanceMatch()
    assert.equal(stored.personId, 'person-with-optional-id')
    assert.equal(stored.employeeId, '')
    assert.equal(stored.employeeViewSession, 'signed-session')
    assert.equal(globalThis.sessionStorage.getItem('currentEmployeeId'), null)
  } finally {
    if (previousLocalStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previousLocalStorage
    if (previousSessionStorage === undefined) delete globalThis.sessionStorage
    else globalThis.sessionStorage = previousSessionStorage
  }
})

await run('employee access-code export groups offices and sorts complete names alphabetically', () => {
  const groups = groupEmployeesByOffice([
    { officeName: 'DILG South Cotabato', name: 'Zara Garcia', accessCode: '0321' },
    { officeName: 'DILG Region 12', name: 'Carlos Reyes', accessCode: '8888' },
    { officeName: 'DILG Region 12', name: 'Ana Santos', accessCode: '0007' },
    { officeName: '', firstName: 'Berto', lastName: 'Dela Cruz', accessCode: '' },
  ])

  assert.deepEqual(groups.map(group => group.officeName), ['DILG Region 12', 'DILG South Cotabato', 'Unassigned'])
  assert.deepEqual(groups[0].employees.map(employee => employee.completeName), ['Ana Santos', 'Carlos Reyes'])
  assert.equal(groups[2].employees[0].accessCode, 'Not assigned')
})

await run('employee access-code export creates a valid Excel workbook with office headings', () => {
  const workbook = buildEmployeeAccessCodeWorkbookBytes([
    { officeName: 'Regional ICT Unit', name: 'Ana Santos', accessCode: '0007' },
  ], 'August 3, 2026, 9:00 AM')
  const files = unzipSync(workbook)
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml'])

  assert.ok(files['xl/workbook.xml'])
  assert.match(sheet, /Office Assignment: Regional ICT Unit/)
  assert.match(sheet, /Access Code/)
  assert.match(sheet, /0007/)
  assert.match(sheet, /Ana Santos/)
})

await run('materializeNextExternalPackages replaces a Junction and copies its dependency closure', async () => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'faceattend-next-alias-'))
  try {
    const sourceNodeModules = path.join(fixtureRoot, 'node_modules')
    const mainPackage = path.join(sourceNodeModules, 'pkg-main')
    const dependencyPackage = path.join(sourceNodeModules, 'pkg-dependency')
    const outputNodeModules = path.join(fixtureRoot, '.next', 'node_modules')
    const aliasPath = path.join(outputNodeModules, 'pkg-main-hash')

    await mkdir(mainPackage, { recursive: true })
    await mkdir(dependencyPackage, { recursive: true })
    await mkdir(outputNodeModules, { recursive: true })
    await writeFile(path.join(mainPackage, 'package.json'), JSON.stringify({ name: 'pkg-main', main: 'index.js', dependencies: { 'pkg-dependency': '1.0.0', string_decoder: '1.0.0' }, peerDependencies: { 'react-native-b4a': '*' }, peerDependenciesMeta: { 'react-native-b4a': { optional: true } } }))
    await writeFile(path.join(mainPackage, 'index.js'), 'module.exports = {}')
    await writeFile(path.join(mainPackage, 'marker.txt'), 'main')
    await writeFile(path.join(dependencyPackage, 'package.json'), JSON.stringify({ name: 'pkg-dependency', main: 'index.js' }))
    await writeFile(path.join(dependencyPackage, 'index.js'), 'module.exports = {}')
    await writeFile(path.join(dependencyPackage, 'marker.txt'), 'dependency')
    await symlink(mainPackage, aliasPath, 'junction')

    const result = await materializeNextExternalPackages({ projectRoot: fixtureRoot })

    assert.deepEqual(result.aliases, ['pkg-main-hash'])
    assert.equal((await lstat(aliasPath)).isSymbolicLink(), false)
    assert.equal(await readFile(path.join(aliasPath, 'marker.txt'), 'utf8'), 'main')
    assert.equal(await readFile(path.join(outputNodeModules, 'pkg-dependency', 'marker.txt'), 'utf8'), 'dependency')
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})

function extractPostgresQueryParams(source, queryMarker) {
  const queryStart = source.indexOf(queryMarker)
  assert.notEqual(queryStart, -1, `Could not find PostgreSQL query: ${queryMarker}`)

  const paramsStart = source.indexOf('      [', queryStart)
  const paramsEndOffset = source.slice(paramsStart).search(/\r?\n\s{6}\],\r?\n\s{4}\)/)
  const paramsEnd = paramsEndOffset === -1 ? -1 : paramsStart + paramsEndOffset
  assert.notEqual(paramsStart, -1, `Could not find bind parameters for: ${queryMarker}`)
  assert.notEqual(paramsEnd, -1, `Could not end bind parameters for: ${queryMarker}`)

  return source.slice(paramsStart, paramsEnd)
}

await run('PostgreSQL public enrollment binds lifecycle status before active and approval status', async () => {
  const source = await readFile(new URL('../lib/postgres/person-store.js', import.meta.url), 'utf8')
  const params = extractPostgresQueryParams(source, 'INSERT INTO persons (')

  assert.match(
    params,
    /nextPerson\.lifecycleStatus,\s*nextPerson\.active,\s*nextPerson\.approvalStatus,/,
  )
})

await run('PostgreSQL employee lifecycle transition binds the authoritative lifecycle status', async () => {
  const source = await readFile(new URL('../lib/postgres/person-store.js', import.meta.url), 'utf8')
  const params = extractPostgresQueryParams(source, 'SET lifecycle_status = $2,')

  assert.match(
    params,
    /existing\.id,\s*transition\.lifecycleStatus,\s*approvedAt,\s*now,/,
  )
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}

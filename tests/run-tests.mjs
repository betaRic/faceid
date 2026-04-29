import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

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
  return specifier
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
const dailyAttendanceModule = await importLocalModule('../lib/daily-attendance.js')
const attendanceTimeModule = await importLocalModule('../lib/attendance-time.js')
const personDirectoryModule = await importLocalModule('../lib/person-directory.js')
const personApprovalModule = await importLocalModule('../lib/person-approval.js')
const enrollmentBurstModule = await importLocalModule('../lib/biometrics/enrollment-burst.js')
const guidedCaptureValidationModule = await importLocalModule('../lib/biometrics/guided-capture-validation.js')
const faceSizeGuidanceModule = await importLocalModule('../lib/biometrics/face-size-guidance.js')
const ovalCaptureModule = await importLocalModule('../lib/biometrics/oval-capture.js')
const dtrModule = await importLocalModule('../lib/dtr.js')
const biometricBenchmarkModule = await importLocalModule('../lib/biometric-benchmark.js')
const shadowBenchmarkModule = await importLocalModule('../lib/biometrics/shadow-benchmark.js')
const biometricIndexModule = await importLocalModule('../lib/biometric-index.js')
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
const csrfModule = await importLocalModule('../lib/csrf.js')

const {
  calculateDistanceMeters,
  isOfficeWfhDay,
  resolveOfficeSignatory,
  normalizeDivisionList,
} = officesModule
const { deriveDailyAttendanceRecord } = dailyAttendanceModule
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
} = personApprovalModule
const {
  normalizeEnrollmentDescriptorBatch,
  normalizeEnrollmentSampleFrames,
  validateEnrollmentCaptureMetadata,
  validateEnrollmentSampleFrames,
  selectEnrollmentBurstSamples,
  summarizeEnrollmentCaptureQuality,
  validateEnrollmentDescriptorBatch,
  validateEnrollmentServerDescriptorSet,
} = enrollmentBurstModule
const { verifyGuidedCapturePoseCoverage } = guidedCaptureValidationModule
const { getFaceSizeGuidance } = faceSizeGuidanceModule
const {
  getOvalCaptureRegion,
  isFaceInsideCaptureOval,
  selectOvalReadyFace,
} = ovalCaptureModule
const {
  buildDtrDocument,
  buildDtrRangeSpec,
  filterAttendanceDaysByRange,
} = dtrModule
const { buildBiometricBenchmarkReport } = biometricBenchmarkModule
const { buildEngineShadowBenchmark, buildShadowBenchmarkReport } = shadowBenchmarkModule
const { matchBiometricIndexCandidates, matchBiometricIndexMultiDescriptor } = biometricIndexModule
const { validatePublicEnrollmentIdentity } = personsEnrollmentPolicyModule
const {
  buildDuplicateFaceSnapshot,
  evaluateDuplicateFaceCandidates,
  DUPLICATE_STATUS_HARD_DUPLICATE,
  DUPLICATE_STATUS_REVIEW_REQUIRED,
} = duplicateFaceModule
const { mapPersonRecord } = personsDirectoryListModule
const { buildMatchSupportSnapshot } = attendanceMatchPolicyModule
const { sanitizeAttendanceEntryForStorage } = attendanceStorageModule
const { normalizeEntry } = attendanceNormalizeModule
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
} = attendanceDailyStoreModule
const { computeIrisDelta, validateLivenessEvidence } = livenessModule
const { buildRawAttendanceWorkbookFiles, buildRawAttendanceWorksheets } = rawAttendanceWorkbookModule
const { validateOrigin } = csrfModule
const firestoreIndexAdminModule = await importLocalModule('../lib/firestore-index-admin.js')
const { loadFirestoreIndexManifest } = firestoreIndexAdminModule

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
  assert.equal(clampPersonDirectoryLimit(200), 50)
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

await run('person directory summary uses sampleCount without requiring descriptors', () => {
  const record = {
    id: 'person-1',
    data: () => ({
      name: 'JANE DOE',
      employeeId: 'EMP-001',
      officeName: 'DILG R12',
      approvalStatus: 'approved',
      sampleCount: 4,
    }),
  }

  const person = mapPersonRecord(record)

  assert.equal(person.sampleCount, 4)
  assert.equal(Object.hasOwn(person, 'descriptors'), false)
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
      descriptor: [0, 0, 0],
      metrics: { detectionScore: 0.95, faceAreaRatio: 0.2, centeredness: 0.9, brightness: 130, contrast: 35, sharpness: 25 },
      score: 9,
    },
    {
      attempt: 1,
      descriptor: [0.01, 0.01, 0.01],
      metrics: { detectionScore: 0.94, faceAreaRatio: 0.2, centeredness: 0.88, brightness: 128, contrast: 35, sharpness: 25 },
      score: 8.8,
    },
    {
      attempt: 3,
      descriptor: [0.2, 0.2, 0.2],
      metrics: { detectionScore: 0.91, faceAreaRatio: 0.18, centeredness: 0.8, brightness: 120, contrast: 32, sharpness: 22 },
      score: 8.2,
    },
    {
      attempt: 5,
      descriptor: [0.38, 0.38, 0.38],
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
  assert.equal(getFaceSizeGuidance(0.12).status, 'move-closer')
  assert.equal(getFaceSizeGuidance(0.24).status, 'ready')
  assert.equal(getFaceSizeGuidance(0.64).status, 'ready')
  assert.equal(getFaceSizeGuidance(0.8).status, 'slightly-close')
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
    isFaceInsideCaptureOval({ x: 90, y: 140, width: 160, height: 160 }, 340, 500),
    true,
  )

  assert.equal(
    isFaceInsideCaptureOval({ x: -80, y: 140, width: 160, height: 160 }, 340, 500),
    false,
  )
})

await run('oval ready face selector ignores detections outside the live oval', () => {
  const detections = [
    { box: { x: 0, y: 145, width: 158, height: 158 } },
    { box: { x: 92, y: 140, width: 160, height: 160 } },
  ]

  const ready = selectOvalReadyFace(detections, 340, 500)

  assert.ok(ready)
  assert.deepEqual(ready.box, detections[1].box)
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
  assert.equal(dtr.signatory.name, 'MARIA THERESA D. BAUTISTA')
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
  assert.equal(dtr.signatory.name, 'MARY ANN T. TRASPE')
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
  assert.equal(dtr.signatory.name, 'OIC NAME')
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

await run('biometric benchmark report exposes operational gate and honest reality flags', () => {
  const now = new Date('2026-04-16T10:00:00+08:00').getTime()
  const baseEvent = {
    status: 'accepted',
    challengeUsed: true,
    decisionCode: 'accepted_onsite',
    matchDebug: { bestDistance: 0.52, threshold: 0.78 },
    scanDiagnostics: { deviceClass: 'mobile', bestFaceAreaRatio: 0.2, serverMatchMode: 'single_frame_fast', serverEmbeddingAverageMs: 720 },
    captureContext: { userAgent: 'Mozilla/5.0 Chrome/124.0', burstQualityScore: 4.1, mobile: true },
    performance: { totalMeasuredMs: 1600, serverEmbeddingMs: 820, matchingMs: 90, firestoreReadMs: 120, firestoreWriteMs: 180 },
  }

  const events = [
    ...Array.from({ length: 120 }, (_, index) => ({
      ...baseEvent,
      timestamp: now - (index * 1000),
    })),
    ...Array.from({ length: 80 }, (_, index) => ({
      ...baseEvent,
      timestamp: now - (index * 1000),
      scanDiagnostics: { deviceClass: 'desktop', bestFaceAreaRatio: 0.19, serverMatchMode: 'two_frame_fallback', serverEmbeddingAverageMs: 950 },
      captureContext: { userAgent: 'Mozilla/5.0 Safari/605.1.15', burstQualityScore: 4.0, mobile: false },
      performance: { totalMeasuredMs: 2600, serverEmbeddingMs: 1900, matchingMs: 110, firestoreReadMs: 150, firestoreWriteMs: 220 },
    })),
  ]

  const report = buildBiometricBenchmarkReport(events, { days: 14, now })

  assert.equal(report.reality.serverAuthoritativeBiometrics, true)
  assert.equal(report.reality.challengeProtectedTransport, true)
  assert.equal(report.sampleSize, 200)
  assert.equal(report.byDevice.mobile.total, 120)
  assert.equal(report.byDevice.desktop.total, 80)
  assert.equal(report.operationalGate.status, 'pass')
  assert.equal(report.summary.serverTimingCoverageRate, 1)
  assert.equal(report.summary.twoFrameFallbackRate, 0.4)
  assert.equal(report.deploymentHealth.p95ServerEmbeddingMs, 1900)
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

await run('OpenVINO shadow defaults on for Railway but remains opt-out', () => {
  const previousShadow = process.env.OPENVINO_SHADOW_ENABLED
  const previousRailway = process.env.RAILWAY_SERVICE_ID
  const previousInclude = process.env.INCLUDE_OPENVINO_RUNTIME

  try {
    delete process.env.OPENVINO_SHADOW_ENABLED
    delete process.env.INCLUDE_OPENVINO_RUNTIME
    process.env.RAILWAY_SERVICE_ID = 'railway-service-fixture'
    assert.equal(getOpenVinoShadowProfileConfig().enabled, true)
    assert.equal(getOpenVinoShadowProfileConfig().framesPerScan, 2)

    process.env.OPENVINO_SHADOW_ENABLED = 'false'
    assert.equal(getOpenVinoShadowProfileConfig().enabled, false)
  } finally {
    if (previousShadow === undefined) delete process.env.OPENVINO_SHADOW_ENABLED
    else process.env.OPENVINO_SHADOW_ENABLED = previousShadow
    if (previousRailway === undefined) delete process.env.RAILWAY_SERVICE_ID
    else process.env.RAILWAY_SERVICE_ID = previousRailway
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

await run('employee monthly attendance reads exact daily docs for the month', async () => {
  const requestedIds = []
  const db = {
    collection(name) {
      assert.equal(name, 'attendance_daily')
      return {
        doc(id) {
          requestedIds.push(id)
          return { id }
        },
      }
    },
    async getAll(...refs) {
      return refs.map(ref => ({
        id: ref.id,
        exists: ref.id.endsWith('_2026-04-09'),
        data: () => ({
          employeeId: 'EMP-001',
          dateKey: '2026-04-09',
          logCount: 2,
          amInTimestamp: 1,
          pmOutTimestamp: 2,
        }),
      }))
    },
  }

  const records = await listEmployeeDailyAttendanceRecordsForMonth(db, 'EMP-001', 2026, 4)

  assert.equal(requestedIds.length, 30)
  assert.equal(requestedIds[0], 'EMP-001_2026-04-01')
  assert.equal(requestedIds[29], 'EMP-001_2026-04-30')
  assert.equal(records.length, 1)
  assert.equal(records[0].dateKey, '2026-04-09')
})

await run('employee daily attendance reads one cached daily doc by id', async () => {
  let requestedId = ''
  const db = {
    collection(name) {
      assert.equal(name, 'attendance_daily')
      return {
        doc(id) {
          requestedId = id
          return {
            async get() {
              return {
                id,
                exists: true,
                data: () => ({
                  employeeId: 'EMP-001',
                  dateKey: '2026-04-09',
                  logCount: 1,
                  amInTimestamp: 1,
                }),
              }
            },
          }
        },
      }
    },
  }

  const record = await getEmployeeDailyAttendanceRecord(db, 'EMP-001', '2026-04-09')

  assert.equal(requestedId, 'EMP-001_2026-04-09')
  assert.equal(record.employeeId, 'EMP-001')
  assert.equal(record.dateKey, '2026-04-09')
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
  assert.equal(worksheets[0].rows[0][0], 'Name')
  assert.equal(worksheets[0].rows[1][3], '2026-04-09')
  assert.equal(worksheets[1].rows[1][8], 10)
  assert.equal(worksheets[1].rows[1][9], 20)
})

await run('raw attendance workbook files contain worksheet XML for each employee', () => {
  const { worksheets, files } = buildRawAttendanceWorkbookFiles([
    { name: 'Alpha Employee', employeeId: 'EMP-001', officeName: 'Office A', dateKey: '2026-04-09' },
    { name: 'Beta Employee', employeeId: 'EMP-002', officeName: 'Office B', dateKey: '2026-04-09' },
  ])

  assert.equal(worksheets.length, 2)
  assert.equal(files.some(file => file.name === 'xl/worksheets/sheet1.xml'), true)
  assert.equal(files.some(file => file.name === 'xl/worksheets/sheet2.xml'), true)
  assert.match(files.find(file => file.name === 'xl/workbook.xml').content, /EMP-001 Alpha Employee/)
  assert.match(files.find(file => file.name === 'xl/workbook.xml').content, /EMP-002 Beta Employee/)
})

await run('origin guard accepts Railway public domain when site URL is not set', () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL
  const previousRailwayHost = process.env.RAILWAY_PUBLIC_DOMAIN

  process.env.NODE_ENV = 'production'
  delete process.env.NEXT_PUBLIC_SITE_URL
  process.env.RAILWAY_PUBLIC_DOMAIN = 'faceattend-one-month-bridge.up.railway.app'

  try {
    assert.equal(validateOrigin(new Request('https://faceattend-one-month-bridge.up.railway.app/api/attendance/v2', {
      headers: { origin: 'https://faceattend-one-month-bridge.up.railway.app' },
    })), true)
    assert.equal(validateOrigin(new Request('https://faceattend-one-month-bridge.up.railway.app/api/attendance/v2', {
      headers: { origin: 'https://example.com' },
    })), false)
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
    if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
    else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl
    if (previousRailwayHost === undefined) delete process.env.RAILWAY_PUBLIC_DOMAIN
    else process.env.RAILWAY_PUBLIC_DOMAIN = previousRailwayHost
  }
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

await run('firestore index manifest loads from repo root', async () => {
  const manifest = await loadFirestoreIndexManifest()

  assert.ok(Array.isArray(manifest.indexes))
  assert.ok(Array.isArray(manifest.fieldOverrides))
  assert.ok(manifest.indexes.length > 0)
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}

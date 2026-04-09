import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function importLocalModule(relativePath) {
  const fileUrl = new URL(relativePath, import.meta.url)
  const source = await readFile(fileUrl, 'utf8')
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
const ovalCaptureModule = await importLocalModule('../lib/biometrics/oval-capture.js')

const { calculateDistanceMeters, isOfficeWfhDay } = officesModule
const { deriveDailyAttendanceRecord } = dailyAttendanceModule
const { buildAttendanceEntryTiming, toLegacyAttendanceDate } = attendanceTimeModule
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
  selectEnrollmentBurstSamples,
  summarizeEnrollmentCaptureQuality,
  validateEnrollmentDescriptorBatch,
} = enrollmentBurstModule
const {
  getOvalCaptureRegion,
  isFaceInsideCaptureOval,
  selectOvalReadyFace,
} = ovalCaptureModule
const firestoreIndexAdminModule = await importLocalModule('../lib/firestore-index-admin.js')
const { loadFirestoreIndexManifest } = firestoreIndexAdminModule

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

await run('deriveDailyAttendanceRecord computes complete day totals', () => {
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
  assert.equal(record.status, 'Complete')
  assert.equal(record.lateMinutes, 0)
  assert.equal(record.undertimeMinutes, 0)
  assert.equal(record.logCount, 4)
  assert.deepEqual(record.decisionCodes, ['accepted_onsite'])
  assert.equal(record.workingHours, '7h 54m')
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
  const normalizedSingle = normalizeEnrollmentDescriptorBatch([0.1, 0.2, 0.3])
  assert.deepEqual(normalizedSingle, [[0.1, 0.2, 0.3]])

  const normalizedBatch = normalizeEnrollmentDescriptorBatch([
    [0.1, 0.2, 0.3],
    [0.4, 0.5, 0.6],
  ])

  assert.equal(validateEnrollmentDescriptorBatch(normalizedBatch), null)
  assert.match(
    validateEnrollmentDescriptorBatch([[0.1, 0.2], [0.1]]),
    /same length/i,
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

  const selected = selectEnrollmentBurstSamples(captures)

  assert.equal(selected.length, 3)
  assert.deepEqual(selected.map(item => item.attempt), [0, 3, 5])
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
  assert.match(summary.text, /Lighting is too dim/i)
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
    isFaceInsideCaptureOval({ x: -5, y: 140, width: 160, height: 160 }, 340, 500),
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

await run('firestore index manifest loads from repo root', async () => {
  const manifest = await loadFirestoreIndexManifest()

  assert.ok(Array.isArray(manifest.indexes))
  assert.ok(Array.isArray(manifest.fieldOverrides))
  assert.ok(manifest.indexes.length > 0)
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}

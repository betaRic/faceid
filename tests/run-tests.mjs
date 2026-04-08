import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function importLocalModule(relativePath) {
  const fileUrl = new URL(relativePath, import.meta.url)
  const source = await readFile(fileUrl, 'utf8')
  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`)
}

function run(name, fn) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    console.error(error instanceof Error ? error.stack : error)
    process.exitCode = 1
  }
}

const officesModule = await importLocalModule('../lib/offices.js')
const dailyAttendanceModule = await importLocalModule('../lib/daily-attendance.js')

const { calculateDistanceMeters, isOfficeWfhDay, REGION12_OFFICES } = officesModule
const { deriveDailyAttendanceRecord } = dailyAttendanceModule

run('calculateDistanceMeters returns zero for same coordinates', () => {
  const point = { latitude: 6.4971, longitude: 124.8466 }
  assert.equal(Math.round(calculateDistanceMeters(point, point)), 0)
})

run('isOfficeWfhDay respects configured work-from-home days', () => {
  const office = REGION12_OFFICES.find(item => item.id === 'south-cotabato-provincial-office')
  assert.ok(office, 'Expected office fixture to exist')

  const wednesday = new Date('2026-04-08T08:00:00+08:00')
  const thursday = new Date('2026-04-09T08:00:00+08:00')

  assert.equal(isOfficeWfhDay(office, wednesday), true)
  assert.equal(isOfficeWfhDay(office, thursday), false)
})

run('deriveDailyAttendanceRecord computes complete day totals', () => {
  const office = REGION12_OFFICES[0]
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
    targetDate: '4/9/2026',
  })

  assert.equal(record.employeeId, 'EMP-001')
  assert.equal(record.status, 'Complete')
  assert.equal(record.lateMinutes, 0)
  assert.equal(record.undertimeMinutes, 0)
  assert.equal(record.logCount, 4)
  assert.deepEqual(record.decisionCodes, ['accepted_onsite'])
  assert.equal(record.workingHours, '7h 54m')
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}

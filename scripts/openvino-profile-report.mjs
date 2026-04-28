import { loadRepoEnv } from './lib/load-local-env.mjs'
import { getAdminDb } from './lib/firebase-admin-client.mjs'

loadRepoEnv()

function getEffectiveApprovalStatus(person = {}) {
  return String(person.approvalStatus || 'approved').trim().toLowerCase() || 'approved'
}

function getSampleCount(person = {}) {
  const count = Number(person.openvinoProfileSampleCount)
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
}

function increment(map, key) {
  map[key] = (map[key] || 0) + 1
}

function boolEnv(name, fallback = false) {
  const value = process.env[name]
  if (value == null || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase())
}

const targetSamples = Number.isFinite(Number(process.env.OPENVINO_PROFILE_MAX_SAMPLES))
  ? Math.max(1, Math.floor(Number(process.env.OPENVINO_PROFILE_MAX_SAMPLES)))
  : 6
const includeDetails = boolEnv('OPENVINO_PROFILE_REPORT_DETAILS', false)
const db = getAdminDb()
const snapshot = await db.collection('persons')
  .select(
    'employeeId',
    'name',
    'officeId',
    'officeName',
    'active',
    'approvalStatus',
    'openvinoProfileStatus',
    'openvinoProfileSampleCount',
    'openvinoProfileUpdatedAt',
  )
  .get()

const offices = {}
const histogram = {}
const notReady = []
let activeApproved = 0
let ready = 0
let collecting = 0
let empty = 0

for (const record of snapshot.docs) {
  const person = record.data() || {}
  const active = person.active !== false
  const approved = getEffectiveApprovalStatus(person) === 'approved'
  if (!active || !approved) continue

  activeApproved += 1
  const count = getSampleCount(person)
  const officeId = String(person.officeId || 'unassigned')
  const officeName = String(person.officeName || 'Unassigned')
  if (!offices[officeId]) {
    offices[officeId] = {
      officeId,
      officeName,
      activeApproved: 0,
      ready: 0,
      collecting: 0,
      empty: 0,
    }
  }

  offices[officeId].activeApproved += 1
  increment(histogram, String(count))

  if (count >= targetSamples || person.openvinoProfileStatus === 'ready') {
    ready += 1
    offices[officeId].ready += 1
  } else if (count > 0) {
    collecting += 1
    offices[officeId].collecting += 1
    if (includeDetails) {
      notReady.push({
        personId: record.id,
        employeeId: String(person.employeeId || ''),
        name: String(person.name || ''),
        officeName,
        sampleCount: count,
      })
    }
  } else {
    empty += 1
    offices[officeId].empty += 1
    if (includeDetails) {
      notReady.push({
        personId: record.id,
        employeeId: String(person.employeeId || ''),
        name: String(person.name || ''),
        officeName,
        sampleCount: 0,
      })
    }
  }
}

console.log(JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  targetSamples,
  activeApproved,
  ready,
  collecting,
  empty,
  readyPercent: activeApproved > 0 ? Math.round((ready / activeApproved) * 10000) / 100 : 0,
  sampleHistogram: histogram,
  offices: Object.values(offices).sort((left, right) => left.officeName.localeCompare(right.officeName)),
  detailMode: includeDetails,
  notReadyCount: collecting + empty,
  notReady: includeDetails
    ? notReady
      .sort((left, right) => left.officeName.localeCompare(right.officeName) || left.name.localeCompare(right.name))
      .slice(0, 100)
    : [],
}, null, 2))

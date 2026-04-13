import { calculateDistanceMeters, isOfficeWfhDay } from '@/lib/offices'
import { listOfficeRecords } from '@/lib/office-directory'
import { isPersonApproved } from '@/lib/person-approval'

export async function getCandidateAttendanceContext(db, entry) {
  const offices = await listOfficeRecords(db)
  const { candidateOfficeIds, onsiteOfficeIds, wfhOfficeIds } = getCandidateOfficeIds(offices, entry)
  return { offices, candidateOfficeIds, onsiteOfficeIds, wfhOfficeIds }
}

export function getCandidateOfficeIds(offices, entry) {
  const now = new Date(entry.timestamp)
  const hasGps = Number.isFinite(entry.latitude) && Number.isFinite(entry.longitude)

  // Get WFH-eligible offices (where today is a WFH day for that office)
  const wfhOfficeIds = offices
    .filter(office => isOfficeWfhDay(office, now))
    .map(office => office.id)

  // Get onsite-eligible offices (within GPS range)
  const onsiteOfficeIds = []
  if (hasGps) {
    offices.forEach(office => {
      if (
        Number.isFinite(office?.gps?.latitude) &&
        Number.isFinite(office?.gps?.longitude) &&
        Number.isFinite(office?.gps?.radiusMeters)
      ) {
        const distanceMeters = calculateDistanceMeters(
          { latitude: entry.latitude, longitude: entry.longitude },
          office.gps,
        )
        if (distanceMeters <= office.gps.radiusMeters) {
          onsiteOfficeIds.push(office.id)
        }
      }
    })
  }

  return {
    candidateOfficeIds: Array.from(new Set([...onsiteOfficeIds, ...wfhOfficeIds])),
    onsiteOfficeIds,
    wfhOfficeIds,
  }
}

export async function getAllActivePersonOfficeIds(db) {
  // Get ALL active approved employees' office IDs for fallback matching
  // This is used when location context doesn't match anyone
  const snapshot = await db
    .collection('persons')
    .where('active', '==', true)
    .get()
  
  const officeIds = new Set()
  snapshot.docs.forEach(doc => {
    const data = doc.data()
    if (isPersonApproved(data) && data.officeId) {
      officeIds.add(data.officeId)
    }
  })
  
  return Array.from(officeIds)
}

export async function getPersonsForOfficeIds(db, officeIds, fallbackToAll = false) {
  if (!officeIds.length) {
    // No candidate offices - use fallback to search ALL offices
    if (fallbackToAll) {
      return getAllApprovedPersons(db)
    }
    return []
  }

  const uniqueOfficeIds = Array.from(new Set(officeIds.filter(Boolean)))
  const chunks = []

  for (let index = 0; index < uniqueOfficeIds.length; index += 10) {
    chunks.push(uniqueOfficeIds.slice(index, index + 10))
  }

  const snapshots = await Promise.all(chunks.map(chunk => (
    db
      .collection('persons')
      .where('active', '==', true)
      .where('officeId', 'in', chunk)
      .get()
  )))

  const deduped = new Map()
  snapshots.forEach(snapshot => {
    snapshot.docs.forEach(record => {
      deduped.set(record.id, { id: record.id, ...record.data() })
    })
  })

  return Array.from(deduped.values()).filter(person => isPersonApproved(person))
}

async function getAllApprovedPersons(db) {
  // Fallback: get all active approved persons when location-based search fails
  const snapshot = await db
    .collection('persons')
    .where('active', '==', true)
    .limit(500)
    .get()

  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(person => isPersonApproved(person))
}
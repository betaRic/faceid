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

  const wfhOfficeIds = offices
    .filter(office => isOfficeWfhDay(office, now))
    .map(office => office.id)

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

export async function getPersonsForOfficeIds(db, officeIds) {
  if (!officeIds.length) return []

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

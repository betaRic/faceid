import { calculateDistanceMeters, isOfficeWfhDay } from '@/lib/offices'
import { isPersonApproved } from '@/lib/person-approval'

/**
 * Post-identification location check.
 *
 * Called AFTER biometric match — we know who the person is.
 * 1. WFH day for their office → accept, no GPS needed.
 * 2. Not WFH → GPS required → must be within any DILG office geofence.
 *    WiFi SSID verified against the office they're physically at (if configured).
 */
export function checkAttendanceLocation(person, office, entry, allOffices) {
  const now = new Date(entry.timestamp)
  const hasGps = Number.isFinite(entry.latitude) && Number.isFinite(entry.longitude)

  // WFH: today is a designated WFH day for the employee's assigned office
  if (isOfficeWfhDay(office, now)) {
    return {
      ok: true,
      attendanceMode: 'WFH',
      geofenceStatus: 'WFH day',
      decisionCode: 'accepted_wfh',
    }
  }

  // On-site: GPS is mandatory
  if (!hasGps) {
    return {
      ok: false,
      message: 'GPS location is required for on-site attendance.',
      decisionCode: 'blocked_missing_gps',
    }
  }

  const coords = { latitude: entry.latitude, longitude: entry.longitude }

  // Check if within any DILG office geofence (cross-office check-in is allowed)
  for (const loc of allOffices) {
    if (
      !Number.isFinite(loc?.gps?.latitude) ||
      !Number.isFinite(loc?.gps?.longitude) ||
      !Number.isFinite(loc?.gps?.radiusMeters)
    ) continue

    const distanceMeters = calculateDistanceMeters(coords, loc.gps)
    if (distanceMeters > loc.gps.radiusMeters) continue

    // Inside this office's geofence — check WiFi if configured
    if (entry.wifiSsid) {
      const clientSsid = entry.wifiSsid.toLowerCase().trim()
      const officeWifi = Array.isArray(loc.wifiSsid) ? loc.wifiSsid : [loc.wifiSsid].filter(Boolean)
      if (officeWifi.length > 0 && !officeWifi.some(s => s.toLowerCase().trim() === clientSsid)) {
        return {
          ok: false,
          message: `Connected to "${entry.wifiSsid}" but expected: ${officeWifi.join(', ')}`,
          decisionCode: 'blocked_wifi_mismatch',
        }
      }
    }

    const atAssignedOffice = loc.id === person.officeId
    return {
      ok: true,
      attendanceMode: 'On-site',
      geofenceStatus: atAssignedOffice
        ? 'Inside office radius'
        : `Checked in at ${loc.name} (not assigned office)`,
      decisionCode: atAssignedOffice ? 'accepted_onsite' : 'accepted_onsite_other_office',
    }
  }

  // Not within any DILG office and not a WFH day
  return {
    ok: false,
    message: 'You are not within any DILG office location. If today is a WFH day, contact your admin to enable WFH for your office.',
    decisionCode: 'blocked_geofence',
  }
}

export async function getPersonsForOfficeIds(db, officeIds) {
  if (!officeIds.length) return []

  const uniqueOfficeIds = Array.from(new Set(officeIds.filter(Boolean)))
  const chunks = []
  for (let i = 0; i < uniqueOfficeIds.length; i += 10) {
    chunks.push(uniqueOfficeIds.slice(i, i + 10))
  }

  const snapshots = await Promise.all(
    chunks.map(chunk =>
      db.collection('persons').where('active', '==', true).where('officeId', 'in', chunk).get(),
    ),
  )

  const deduped = new Map()
  snapshots.forEach(snapshot => {
    snapshot.docs.forEach(record => {
      deduped.set(record.id, { id: record.id, ...record.data() })
    })
  })

  return Array.from(deduped.values()).filter(person => isPersonApproved(person))
}
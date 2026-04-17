import { calculateDistanceMeters, isOfficeWfhDay } from '@/lib/offices'
import { isPersonApproved } from '@/lib/person-approval'

/**
 * Post-identification location check.
 *
 * Called AFTER biometric match — we know who the person is.
 * 1. GPS is always required on the public scan flow.
 * 2. If inside any DILG office geofence → accept as on-site.
 * 3. Otherwise, if today is a WFH day for their assigned office → accept as WFH.
 * 4. WiFi SSID remains advisory context only.
 */
export function checkAttendanceLocation(person, office, entry, allOffices) {
  const now = new Date(entry.timestamp)
  const hasGps = Number.isFinite(entry.latitude) && Number.isFinite(entry.longitude)

  if (!hasGps) {
    return {
      ok: false,
      message: 'Verified GPS location is required for attendance.',
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

    // Inside this office's geofence — Wi-Fi is advisory context only.
    // Browser-reported SSID is not a trustworthy security boundary.
    let wifiNote = ''
    if (entry.wifiSsid) {
      const clientSsid = entry.wifiSsid.toLowerCase().trim()
      const officeWifi = Array.isArray(loc.wifiSsid) ? loc.wifiSsid : [loc.wifiSsid].filter(Boolean)
      if (officeWifi.length > 0 && !officeWifi.some(s => s.toLowerCase().trim() === clientSsid)) {
        wifiNote = ` · Wi-Fi context mismatch (${entry.wifiSsid})`
      }
    }

    const atAssignedOffice = loc.id === person.officeId
    return {
      ok: true,
      attendanceMode: 'On-site',
      geofenceStatus: atAssignedOffice
        ? `Inside office radius${wifiNote}`
        : `Checked in at ${loc.name} (not assigned office)${wifiNote}`,
      decisionCode: atAssignedOffice ? 'accepted_onsite' : 'accepted_onsite_other_office',
    }
  }

  if (isOfficeWfhDay(office, now)) {
    return {
      ok: true,
      attendanceMode: 'WFH',
      geofenceStatus: 'Outside office radius on WFH day',
      decisionCode: 'accepted_wfh',
    }
  }

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
  for (let i = 0; i < uniqueOfficeIds.length; i += 30) {
    chunks.push(uniqueOfficeIds.slice(i, i + 30))
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

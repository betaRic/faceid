import { calculateDistanceMeters, isOfficeWfhDay } from '@/lib/offices'
import { isEmployeeWfhDay } from '@/lib/employee-wfh'

/**
 * Post-identification location check.
 *
 * Called AFTER biometric match — we know who the person is.
 * 1. GPS is always required on the public scan flow.
 * 2. If inside any DILG office geofence → accept as on-site.
 * 3. Otherwise, if today is an employee-specific or office WFH day → accept as WFH.
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

  const individualWfh = isEmployeeWfhDay(person, now)
  if (individualWfh || isOfficeWfhDay(office, now)) {
    return {
      ok: true,
      attendanceMode: 'WFH',
      geofenceStatus: individualWfh
        ? 'Outside office radius on employee WFH day'
        : 'Outside office radius on office WFH day',
      decisionCode: 'accepted_wfh',
    }
  }

  return {
    ok: false,
    message: 'You are not within any DILG office location. Contact Admin or HR if you need an individual WFH schedule.',
    decisionCode: 'blocked_geofence',
  }
}

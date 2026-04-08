import { firebaseEnabled } from './firebase'
import { REGION12_OFFICES } from './offices'

const OFFICES_STORAGE_KEY = 'face_id_office_configs'

function normalizeOffice(office) {
  return {
    ...office,
    gps: {
      latitude: Number(office.gps.latitude),
      longitude: Number(office.gps.longitude),
      radiusMeters: Number(office.gps.radiusMeters),
    },
    workPolicy: {
      schedule: office.workPolicy.schedule,
      workingDays: [...office.workPolicy.workingDays],
      wfhDays: [...office.workPolicy.wfhDays],
      morningIn: office.workPolicy.morningIn || '08:00',
      morningOut: office.workPolicy.morningOut || '12:00',
      afternoonIn: office.workPolicy.afternoonIn || '13:00',
      afternoonOut: office.workPolicy.afternoonOut || '17:00',
      gracePeriodMinutes: Number(office.workPolicy.gracePeriodMinutes),
    },
  }
}

function loadLocalOffices() {
  try {
    const raw = localStorage.getItem(OFFICES_STORAGE_KEY)
    if (!raw) return REGION12_OFFICES.map(normalizeOffice)
    return JSON.parse(raw).map(normalizeOffice)
  } catch {
    return REGION12_OFFICES.map(normalizeOffice)
  }
}

function saveLocalOffices(offices) {
  localStorage.setItem(OFFICES_STORAGE_KEY, JSON.stringify(offices.map(normalizeOffice)))
}

export function subscribeToOfficeConfigs(onData, onError) {
  if (!firebaseEnabled) {
    onData(loadLocalOffices())
    return () => {}
  }

  let active = true

  const load = async () => {
    try {
      const response = await fetch('/api/offices', { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.message || 'Failed to load offices')
      if (!active) return
      onData((payload?.offices || REGION12_OFFICES).map(normalizeOffice))
    } catch (error) {
      if (active) onError(error)
    }
  }

  load()
  const interval = window.setInterval(load, 15000)

  return () => {
    active = false
    window.clearInterval(interval)
  }
}

export async function saveOfficeConfig(office) {
  const normalized = normalizeOffice(office)

  if (!firebaseEnabled) {
    const current = loadLocalOffices()
    const next = current.some(item => item.id === normalized.id)
      ? current.map(item => (item.id === normalized.id ? normalized : item))
      : [...current, normalized]

    saveLocalOffices(next)
    return { mode: 'local', offices: next }
  }

  const response = await fetch(`/api/admin/offices/${normalized.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ office: normalized }),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.message || 'Failed to save office configuration')
  }

  return { mode: 'firebase', office: payload?.office || normalized }
}

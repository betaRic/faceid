import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore'
import { db, firebaseEnabled } from './firebase'
import { REGION12_OFFICES } from './offices'

const OFFICES_COLLECTION = 'offices'
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
  if (!firebaseEnabled || !db) {
    onData(loadLocalOffices())
    return () => {}
  }

  const officesQuery = query(collection(db, OFFICES_COLLECTION), orderBy('name'))
  return onSnapshot(
    officesQuery,
    snapshot => {
      if (snapshot.empty) {
        onData(REGION12_OFFICES.map(normalizeOffice))
        return
      }

      onData(snapshot.docs.map(record => normalizeOffice({ id: record.id, ...record.data() })))
    },
    onError,
  )
}

export async function saveOfficeConfig(office) {
  const normalized = normalizeOffice(office)

  if (!firebaseEnabled || !db) {
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

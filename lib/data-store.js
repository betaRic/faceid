import {
  ATTENDANCE_KEY,
  STORAGE_KEY,
  DUPLICATE_FACE_THRESHOLD,
} from './config'
import { firebaseEnabled, localFallbackAllowed } from './firebase'

function mapPersonRecord(id, payload) {
  return {
    id,
    name: String(payload.name || '').toUpperCase(),
    employeeId: payload.employeeId || '',
    nameLower: payload.nameLower || String(payload.name || '').toLowerCase(),
    officeId: payload.officeId || '',
    officeName: payload.officeName || 'Unassigned',
    active: payload.active !== false,
    sampleCount: Number(payload.sampleCount ?? payload.descriptors?.length ?? 0),
    descriptors: [],
  }
}

function loadLocalPersons() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw).map(person => mapPersonRecord(person.id, person))
  } catch {
    return []
  }
}

function saveLocalPersons(persons) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(
      persons.map(person => ({
        id: person.id,
        name: person.name,
        employeeId: person.employeeId || '',
        nameLower: person.nameLower || person.name.toLowerCase(),
        officeId: person.officeId || '',
        officeName: person.officeName || 'Unassigned',
        active: person.active !== false,
        descriptors: person.descriptors.map(descriptor => Array.from(descriptor)),
      })),
    ),
  )
}

function loadLocalAttendance() {
  try {
    return JSON.parse(localStorage.getItem(ATTENDANCE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveLocalAttendance(attendance) {
  localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(attendance.slice(0, 500)))
}

function findDuplicateFace(persons, employeeId, descriptor) {
  let bestMatch = null

  persons.forEach(person => {
    if (employeeId && person.employeeId === employeeId) return

    person.descriptors.forEach(sample => {
      const distance = euclideanDistance(sample, descriptor)
      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = {
          person,
          distance,
        }
      }
    })
  })

  if (!bestMatch || bestMatch.distance > DUPLICATE_FACE_THRESHOLD) return null
  return bestMatch
}

function euclideanDistance(left, right) {
  let total = 0

  for (let index = 0; index < left.length; index += 1) {
    const diff = left[index] - right[index]
    total += diff * diff
  }

  return Math.sqrt(total)
}

function normalizeEmployeeId(employeeId) {
  return employeeId.trim()
}

function requireLocalBiometricFallback() {
  if (localFallbackAllowed) return

  throw new Error(
    'Biometric enrollment and attendance require Firebase. Local browser storage is disabled unless NEXT_PUBLIC_ALLOW_LOCAL_BIOMETRIC_FALLBACK=true.',
  )
}

export function subscribeToPersons(onData, onError) {
  if (!firebaseEnabled) {
    onData(loadLocalPersons())
    return () => {}
  }

  let active = true

  const load = async () => {
    try {
      const response = await fetch('/api/persons', { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.message || 'Failed to load employees')
      if (!active) return
      onData((payload?.persons || []).map(person => mapPersonRecord(person.id, person)))
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

export function subscribeToAttendance(onData, onError) {
  if (!firebaseEnabled) {
    onData(loadLocalAttendance())
    return () => {}
  }

  let active = true

  const load = async () => {
    try {
      const response = await fetch('/api/attendance/recent', { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.message || 'Failed to load attendance')
      if (!active) return
      onData(payload?.attendance || [])
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

export async function upsertPersonSample(persons, profile, descriptor) {
  const serializedDescriptor = Array.from(descriptor)
  const normalizedName = profile.name.trim().toUpperCase()
  const normalizedEmployeeId = normalizeEmployeeId(profile.employeeId)
  const nameLower = normalizedName.toLowerCase()
  const officeId = profile.officeId
  const officeName = profile.officeName

  if (!normalizedEmployeeId) {
    throw new Error('Employee ID is required')
  }

  const existing = persons.find(person => person.employeeId === normalizedEmployeeId)
  const duplicateEmployeeId = persons.find(
    person => person.employeeId === normalizedEmployeeId && person.id !== existing?.id,
  )

  if (duplicateEmployeeId) {
    throw new Error(`Employee ID ${normalizedEmployeeId} already exists`)
  }

  const duplicateFace = findDuplicateFace(persons, normalizedEmployeeId, descriptor)
  if (duplicateFace) {
    throw new Error(
      `Face is too similar to ${duplicateFace.person.name} (${duplicateFace.person.employeeId || 'no employee ID'})`,
    )
  }

  if (!firebaseEnabled) {
    requireLocalBiometricFallback()

    const nextPersons = existing
      ? persons.map(person => (
          person.id === existing.id
            ? {
                ...person,
                name: normalizedName,
                employeeId: normalizedEmployeeId,
                officeId,
                officeName,
                active: person.active !== false,
                descriptors: [...person.descriptors, new Float32Array(serializedDescriptor)],
              }
            : person
        ))
      : [
          ...persons,
          {
            id: Date.now().toString(),
            name: normalizedName,
            employeeId: normalizedEmployeeId,
            nameLower,
            officeId,
            officeName,
            active: true,
            descriptors: [new Float32Array(serializedDescriptor)],
          },
        ]

    saveLocalPersons(nextPersons)
    return { mode: 'local', persons: nextPersons }
  }

  const response = await fetch('/api/persons', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      profile: {
        name: normalizedName,
        employeeId: normalizedEmployeeId,
        officeId,
        officeName,
      },
      descriptor: serializedDescriptor,
    }),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.message || 'Failed to save enrollment')
  }

  return { mode: 'firebase' }
}

export async function deletePersonRecord(persons, id) {
  if (!firebaseEnabled) {
    const nextPersons = persons.filter(person => person.id !== id)
    saveLocalPersons(nextPersons)
    return { mode: 'local', persons: nextPersons }
  }

  const response = await fetch(`/api/persons/${id}`, {
    method: 'DELETE',
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.message || 'Failed to delete employee')
  }

  return { mode: 'firebase' }
}

export async function updatePersonRecord(person, updates) {
  const normalized = {
    name: typeof updates.name === 'string' ? updates.name.trim().toUpperCase() : person.name,
    officeId: typeof updates.officeId === 'string' ? updates.officeId : person.officeId,
    officeName: typeof updates.officeName === 'string' ? updates.officeName : person.officeName,
    active: typeof updates.active === 'boolean' ? updates.active : person.active !== false,
  }

  if (!firebaseEnabled) {
    const current = loadLocalPersons()
    const nextPersons = current.map(item => (
      item.id === person.id
        ? {
            ...item,
            ...normalized,
            nameLower: normalized.name.toLowerCase(),
          }
        : item
    ))

    saveLocalPersons(nextPersons)
    return { mode: 'local', persons: nextPersons }
  }

  const response = await fetch(`/api/persons/${person.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(normalized),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.message || 'Failed to update employee')
  }

  return { mode: 'firebase' }
}

export async function logAttendanceEntry(entry) {
  if (!firebaseEnabled) {
    requireLocalBiometricFallback()

    const nextAttendance = [entry, ...loadLocalAttendance()].slice(0, 500)
    saveLocalAttendance(nextAttendance)
    return { mode: 'local', attendance: nextAttendance }
  }

  const challengeId = String(entry.challengeId || '').trim()
  let resolvedChallengeId = challengeId

  if (!resolvedChallengeId) {
    const challengeResponse = await fetch('/api/attendance/challenge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: 'kiosk',
      }),
    })

    const challengePayload = await challengeResponse.json().catch(() => null)
    if (!challengeResponse.ok || !challengePayload?.challenge?.challengeId) {
      throw new Error(challengePayload?.message || 'Failed to start attendance verification')
    }

    resolvedChallengeId = challengePayload.challenge.challengeId
  }

  const response = await fetch('/api/attendance', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...entry,
      challengeId: resolvedChallengeId,
    }),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(payload?.message || 'Failed to log attendance')
    error.decisionCode = payload?.decisionCode || null
    error.entry = payload?.entry || null
    throw error
  }

  return { mode: 'firebase', entry: payload?.entry || null }
}

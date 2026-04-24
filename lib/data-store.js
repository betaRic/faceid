import {
  ATTENDANCE_KEY,
  STORAGE_KEY,
} from './config'
import {
  normalizeEnrollmentDescriptorBatch,
  validateEnrollmentDescriptorBatch,
} from './biometrics/enrollment-burst'
import {
  normalizeStoredDescriptors,
} from './biometrics/descriptor-utils'
import { firebaseEnabled, localFallbackAllowed } from './firebase/client'
import { createPollingSubscription } from './client-polling'
import {
  getEffectivePersonApprovalStatus,
  PERSON_APPROVAL_APPROVED,
  PERSON_APPROVAL_PENDING,
} from './person-approval'
import { evaluateDuplicateFaceCandidates } from './persons/duplicate-face'

function mapPersonRecord(id, payload) {
  const rawDescriptors = payload.descriptors || []
  const descriptors = Array.isArray(rawDescriptors) 
    ? rawDescriptors.map(d => {
        if (Array.isArray(d)) return d
        if (d && typeof d === 'object' && Array.isArray(d.vector)) return d.vector
        return null
      }).filter(d => Array.isArray(d) && d.length > 0)
    : []
  
  return {
    id,
    name: String(payload.name || '').toUpperCase(),
    employeeId: payload.employeeId || '',
    nameLower: payload.nameLower || String(payload.name || '').toLowerCase(),
    officeId: payload.officeId || '',
    officeName: payload.officeName || 'Unassigned',
    active: payload.active !== false,
    approvalStatus: getEffectivePersonApprovalStatus(payload),
    sampleCount: descriptors.length,
    descriptors,
    duplicateReviewRequired: payload?.duplicateReviewRequired === true || payload?.duplicateReviewStatus === 'required',
    duplicateReviewStatus: String(payload?.duplicateReviewStatus || 'clear'),
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
        approvalStatus: getEffectivePersonApprovalStatus(person),
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

function normalizeEmployeeId(employeeId) {
  return employeeId.trim().replace(/[^A-Za-z0-9-]/g, '')
}

function requireLocalBiometricFallback() {
  if (localFallbackAllowed) return
  throw new Error(
    'Biometric enrollment and attendance require Firebase. Local browser storage is disabled unless NEXT_PUBLIC_ALLOW_LOCAL_BIOMETRIC_FALLBACK=true.',
  )
}

export function subscribeToPersons(onData, onError, { requireAuth = true } = {}) {
  if (!firebaseEnabled) {
    onData(loadLocalPersons())
    return () => {}
  }

  const load = async () => {
    const endpoint = requireAuth ? '/api/persons' : '/api/public/persons'
    const response = await fetch(endpoint, { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const error = new Error(payload?.message || 'Failed to load employees')
      error.status = response.status
      throw error
    }
    return (payload?.persons || []).map(person => mapPersonRecord(person.id, person))
  }

  return createPollingSubscription(load, onData, onError)
}

export function subscribeToAttendance(onData, onError) {
  if (!firebaseEnabled) {
    onData(loadLocalAttendance())
    return () => {}
  }

  const load = async () => {
    const response = await fetch('/api/attendance/recent', { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const error = new Error(payload?.message || 'Failed to load attendance')
      error.status = response.status
      throw error
    }
    return payload?.attendance || []
  }

  return createPollingSubscription(load, onData, onError)
}

export async function upsertPersonSample(persons, profile, descriptors) {
  const normalizedDescriptors = normalizeEnrollmentDescriptorBatch(descriptors)
  const descriptorValidationError = validateEnrollmentDescriptorBatch(normalizedDescriptors)
  const normalizedName = profile.name.trim().toUpperCase()
  const normalizedEmployeeId = normalizeEmployeeId(profile.employeeId)
  const nameLower = normalizedName.toLowerCase()
  const officeId = profile.officeId
  const officeName = profile.officeName

  if (descriptorValidationError) throw new Error(descriptorValidationError)
  if (!normalizedEmployeeId) throw new Error('Employee ID is required')

  const existing = persons.find(person => person.employeeId === normalizedEmployeeId)

  if (!firebaseEnabled) {
    requireLocalBiometricFallback()

    const evaluation = evaluateDuplicateFaceCandidates(
      persons,
      normalizedDescriptors,
      existing?.id || '',
    )
    if (evaluation?.duplicate) {
      throw new Error(`Face is too similar to ${evaluation.person.name} (${evaluation.person.employeeId || 'no employee ID'})`)
    }

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
                approvalStatus: getEffectivePersonApprovalStatus(person),
                descriptors: [
                  ...person.descriptors,
                  ...normalizedDescriptors.map(descriptor => new Float32Array(descriptor)),
                ],
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
            approvalStatus: PERSON_APPROVAL_APPROVED,
            descriptors: normalizedDescriptors.map(descriptor => new Float32Array(descriptor)),
          },
        ]

    saveLocalPersons(nextPersons)
    return {
      mode: 'local',
      persons: nextPersons,
      savedSampleCount: normalizedDescriptors.length,
      sampleCount: (existing?.sampleCount ?? 0) + normalizedDescriptors.length,
    }
  }

  const response = await fetch('/api/persons', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profile: {
        name: normalizedName,
        employeeId: normalizedEmployeeId,
        officeId,
        officeName,
        photoDataUrl: profile.photoDataUrl || null,
        captureMetadata: profile.captureMetadata || null,
      },
      descriptors: normalizedDescriptors,
    }),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.message || 'Failed to save enrollment')

  return {
    mode: 'firebase',
    approvalStatus: payload?.approvalStatus || PERSON_APPROVAL_PENDING,
    sampleCount: Number(payload?.sampleCount || 1),
    savedSampleCount: Number(payload?.savedSampleCount || normalizedDescriptors.length),
    personId: payload?.personId || '',
    message: payload?.message || '',
  }
}

export async function checkEnrollmentDuplicate(descriptors, personId = '') {
  const normalizedDescriptors = normalizeEnrollmentDescriptorBatch(descriptors)
  const descriptorValidationError = validateEnrollmentDescriptorBatch(normalizedDescriptors)
  if (descriptorValidationError) throw new Error(descriptorValidationError)

  if (!firebaseEnabled) {
    const persons = loadLocalPersons()
    const evaluation = evaluateDuplicateFaceCandidates(persons, normalizedDescriptors, personId)
    return {
      mode: 'local',
      duplicate: Boolean(evaluation?.duplicate),
      reviewRequired: Boolean(evaluation?.reviewRequired),
      existingPerson: evaluation?.person || null,
      message: evaluation?.duplicate
        ? 'A face similar to an existing employee was found. Duplicate enrollment blocked.'
        : evaluation?.reviewRequired
          ? 'A similar face was found. Registration can continue, but this submission will be flagged for admin review.'
          : '',
    }
  }

  const response = await fetch('/api/persons/check-duplicate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      descriptors: normalizedDescriptors,
      personId,
    }),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.message || 'Failed to check duplicate')

  return {
    mode: 'firebase',
    duplicate: Boolean(payload?.duplicate),
    reviewRequired: Boolean(payload?.reviewRequired),
    existingPerson: payload?.existingPerson || null,
    message: payload?.message || '',
  }
}

export async function deletePersonRecord(persons, id, options = {}) {
  if (!firebaseEnabled) {
    const nextPersons = persons.filter(person => person.id !== id)
    saveLocalPersons(nextPersons)
    return { mode: 'local', persons: nextPersons }
  }

  const params = new URLSearchParams()
  if (options.hard) params.set('hard', 'true')
  if (options.confirmName) params.set('confirm', options.confirmName)
  const suffix = params.toString() ? `?${params.toString()}` : ''
  const response = await fetch(`/api/persons/${id}${suffix}`, { method: 'DELETE' })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.message || 'Failed to delete employee')
  return { mode: 'firebase', ...payload }
}

export async function updatePersonRecord(person, updates) {
  const normalized = {
    name: typeof updates.name === 'string' ? updates.name.trim().toUpperCase() : person.name,
    officeId: typeof updates.officeId === 'string' ? updates.officeId : person.officeId,
    officeName: typeof updates.officeName === 'string' ? updates.officeName : person.officeName,
    active: typeof updates.active === 'boolean' ? updates.active : person.active !== false,
    approvalStatus: typeof updates.approvalStatus === 'string'
      ? updates.approvalStatus
      : getEffectivePersonApprovalStatus(person),
  }

  if (!firebaseEnabled) {
    const current = loadLocalPersons()
    const nextPersons = current.map(item => (
      item.id === person.id
        ? { ...item, ...normalized, nameLower: normalized.name.toLowerCase() }
        : item
    ))
    saveLocalPersons(nextPersons)
    return { mode: 'local', persons: nextPersons }
  }

  const response = await fetch(`/api/persons/${person.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalized),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.message || 'Failed to update employee')
  return { mode: 'firebase' }
}

export async function logAttendanceEntry(entry) {
  if (!firebaseEnabled) {
    requireLocalBiometricFallback()
    const nextAttendance = [entry, ...loadLocalAttendance()].slice(0, 500)
    saveLocalAttendance(nextAttendance)
    return { mode: 'local', attendance: nextAttendance }
  }

  if (!entry?.challenge?.token && !entry?.challenge?.challengeId) {
    const error = new Error('Attendance challenge is required before submitting a scan.')
    error.decisionCode = 'blocked_invalid_challenge'
    throw error
  }

  const response = await fetch('/api/attendance/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[AttendanceAPI] Request rejected', {
        status: response.status,
        message: payload?.message || 'Failed to log attendance',
        decisionCode: payload?.decisionCode || null,
        debug: payload?.debug || null,
      })
    }
    const error = new Error(payload?.message || 'Failed to log attendance')
    error.decisionCode = payload?.decisionCode || null
    error.entry = payload?.entry || null
    error.debug = payload?.debug || null
    error.employeeViewSession = payload?.employeeViewSession || ''
    error.employeeViewSessionExpiresAt = Number(payload?.employeeViewSessionExpiresAt || 0) || null
    error.challenge = payload?.challenge || null
    error.riskFlags = Array.isArray(payload?.riskFlags) ? payload.riskFlags : []
    throw error
  }

  return {
    mode: 'firebase',
    entry: payload?.entry || null,
    debug: payload?.debug || null,
    employeeViewSession: payload?.employeeViewSession || '',
    employeeViewSessionExpiresAt: Number(payload?.employeeViewSessionExpiresAt || 0) || null,
    challenge: payload?.challenge || null,
    riskFlags: Array.isArray(payload?.riskFlags) ? payload.riskFlags : [],
  }
}

export async function requestAttendanceChallenge(entry = {}) {
  if (!firebaseEnabled) {
    return {
      mode: 'local',
      challenge: {
        challengeId: `local-${Date.now()}`,
        token: `local-${Date.now()}`,
        expiresAt: Date.now() + 30_000,
        mode: 'passive',
        motionType: null,
        riskFlags: [],
      },
      riskFlags: [],
    }
  }

  const response = await fetch('/api/attendance/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(payload?.message || 'Failed to issue attendance challenge')
    error.decisionCode = payload?.decisionCode || null
    throw error
  }

  return {
    mode: 'firebase',
    challenge: payload?.challenge || null,
    riskFlags: Array.isArray(payload?.riskFlags) ? payload.riskFlags : [],
  }
}

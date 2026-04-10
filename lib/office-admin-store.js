'use client'

import { normalizeOfficeRecord } from './offices'
import { createPollingSubscription } from './client-polling'

export function subscribeToOfficeConfigs(onData, onError) {
  const load = async () => {
    const response = await fetch('/api/offices', { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(payload?.message || 'Failed to load offices')
    return (payload?.offices || []).map(normalizeOfficeRecord)
  }

  return createPollingSubscription(load, onData, onError)
}

export async function saveOfficeConfig(office) {
  const normalized = normalizeOfficeRecord(office)

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

  return { mode: 'firebase', office: normalizeOfficeRecord(payload?.office || normalized) }
}


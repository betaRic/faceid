'use client'

import { createPollingSubscription } from './client-polling'

function toPublicOffice(office) {
  return {
    id: String(office?.id || ''),
    code: String(office?.code || ''),
    officeType: String(office?.officeType || ''),
    name: String(office?.name || ''),
    shortName: String(office?.shortName || ''),
    location: String(office?.location || ''),
    provinceOrCity: String(office?.provinceOrCity || ''),
    status: String(office?.status || 'active'),
  }
}

export function subscribeToPublicOffices(onData, onError) {
  const load = async () => {
    const response = await fetch('/api/public/offices', { cache: 'no-store' })
    const payload = await response.json().catch(() => null)

    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.message || 'Failed to load offices.')
    }

    return Array.isArray(payload?.offices) ? payload.offices.map(toPublicOffice) : []
  }

  return createPollingSubscription(load, onData, onError)
}



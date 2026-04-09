'use client'

import { createPollingSubscription } from './client-polling'

export function subscribeToPublicOffices(onData, onError) {
  const load = async () => {
    const response = await fetch('/api/public/offices', { cache: 'no-store' })
    const payload = await response.json().catch(() => null)

    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.message || 'Failed to load offices.')
    }

    return Array.isArray(payload?.offices) ? payload.offices : []
  }

  return createPollingSubscription(load, onData, onError)
}


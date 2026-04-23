'use client'

import { useEffect, useState } from 'react'

const DEFAULT_PORTAL = {
  href: '/login',
  label: 'Login',
  role: null,
}

const ROLE_PORTAL = {
  admin: { href: '/admin', label: 'Admin', role: 'admin' },
  hr: { href: '/admin', label: 'HR', role: 'hr' },
}

let inFlight = null

function fetchPortalStatus() {
  if (inFlight) return inFlight
  inFlight = fetch('/api/portal-status', { credentials: 'include', cache: 'no-store' })
    .then(response => (response.ok ? response.json() : { role: null }))
    .catch(() => ({ role: null }))
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

export function usePortalDestination() {
  const [portal, setPortal] = useState(DEFAULT_PORTAL)

  useEffect(() => {
    let cancelled = false
    fetchPortalStatus().then(data => {
      if (cancelled) return
      setPortal(ROLE_PORTAL[data?.role] || DEFAULT_PORTAL)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return portal
}

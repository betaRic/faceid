'use client'

import { useEffect, useState } from 'react'

const DEFAULT_PORTAL = {
  href: '/login',
  label: 'Login',
  role: null,
}

export function usePortalDestination() {
  const [portal, setPortal] = useState(DEFAULT_PORTAL)

  useEffect(() => {
    let cancelled = false

    async function resolvePortal() {
      try {
        const adminResponse = await fetch('/api/admin/session', { credentials: 'include', cache: 'no-store' })
        if (adminResponse.ok) {
          if (!cancelled) {
            setPortal({
              href: '/admin',
              label: 'Admin',
              role: 'admin',
            })
          }
          return
        }

        const hrResponse = await fetch('/api/hr/session', { credentials: 'include', cache: 'no-store' })
        if (hrResponse.ok) {
          if (!cancelled) {
            setPortal({
              href: '/admin',
              label: 'HR',
              role: 'hr',
            })
          }
          return
        }

        if (!cancelled) {
          setPortal(DEFAULT_PORTAL)
        }
      } catch {
        if (!cancelled) {
          setPortal(DEFAULT_PORTAL)
        }
      }
    }

    resolvePortal()
    return () => {
      cancelled = true
    }
  }, [])

  return portal
}

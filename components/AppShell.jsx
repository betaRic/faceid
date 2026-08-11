'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import BrandMark from './BrandMark'
import { usePortalDestination } from './usePortalDestination'

const PUBLIC_ATTENDANCE_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PUBLIC_ATTENDANCE === 'true'
const baseNavItems = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/scan', label: 'Scan', icon: 'scan' },
  ...(PUBLIC_ATTENDANCE_ENABLED ? [{ href: '/attendance', label: 'Attendance', icon: 'attendance' }] : []),
  { href: '/registration', label: 'Register', icon: 'register' },
]

function NavIcon({ name }) {
  const common = { className: 'h-[18px] w-[18px]', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', 'aria-hidden': true }
  if (name === 'scan') return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 7V5a1 1 0 0 1 1-1h2m10 0h2a1 1 0 0 1 1 1v2M4 17v2a1 1 0 0 0 1 1h2m10 0h2a1 1 0 0 0 1-1v-2M8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z" /></svg>
  if (name === 'register') return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M15 19a6 6 0 1 0-12 0m6-9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-3v6m3-3h-6" /></svg>
  if (name === 'attendance') return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm4 8 2 2 4-4" /></svg>
  return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Zm6 11v-6h6v6" /></svg>
}

function StaffAccessIcon() {
  return <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" d="M13 5h5a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-5m-3-4 4-3-4-3m4 3H4" /></svg>
}

export default function AppShell({
  children,
  actions = null,
  navItems = null,
  contentClassName = '',
  onBeforeNavigate = null,
  fitViewport = false,
  showNavigation = true,
  onMobileMenuChange = null,
}) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const portal = usePortalDestination()
  const resolvedNavItems = navItems ?? baseNavItems
  const canRenderNavigation = showNavigation && resolvedNavItems.length > 0

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!canRenderNavigation && mobileOpen) {
      setMobileOpen(false)
    }
  }, [canRenderNavigation, mobileOpen])

  useEffect(() => {
    if (typeof onMobileMenuChange === 'function') {
      onMobileMenuChange(mobileOpen)
    }
  }, [mobileOpen, onMobileMenuChange])

  const handleNavigate = href => {
    if (typeof onBeforeNavigate === 'function' && href !== pathname) {
      onBeforeNavigate(href)
    }
  }

  return (
    <div className={`app-shell flex flex-col ${fitViewport ? 'h-[100dvh] overflow-hidden' : 'min-h-screen'}`}>
      {/* ── Header ── */}
      <header className="nav-header sticky top-0 z-50 relative">
        <div className="container-fluid flex w-full items-center gap-3 py-3">
          <Link href="/" className="shrink-0" onClick={() => handleNavigate('/')}>
            <BrandMark compact />
          </Link>

          {/* Desktop nav */}
          {canRenderNavigation ? (
            <nav className="ml-4 hidden items-center gap-1 md:flex">
              {resolvedNavItems.map(item => {
                const active = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href))
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => handleNavigate(item.href)}
                    className={`nav-link ${active ? 'active' : ''}`}
                    aria-label={item.label}
                  >
                    <NavIcon name={item.icon} />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </nav>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            {actions}
            <Link
              href={portal.href}
              onClick={() => handleNavigate(portal.href)}
              aria-label={`${portal.label} staff access`}
              title={`${portal.label} staff access`}
              className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${pathname?.startsWith('/admin') || pathname === '/login' ? 'border-navy bg-navy text-white' : 'border-navy/20 bg-navy/5 text-navy hover:bg-navy hover:text-white'}`}
            >
              <StaffAccessIcon />
              <span className="sr-only">{portal.label} staff access</span>
            </Link>
            {/* Mobile hamburger */}
          {canRenderNavigation ? (
              <button
                aria-expanded={mobileOpen}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-navy-50/60 bg-white text-slate transition-colors hover:bg-sky-light md:hidden"
                onClick={() => setMobileOpen(v => !v)}
                aria-label="Toggle navigation"
                type="button"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {mobileOpen
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />}
                </svg>
              </button>
            ) : null}
          </div>
        </div>

        {/* Mobile menu */}
        {canRenderNavigation && mobileOpen ? (
          <div className="absolute inset-x-3 top-full z-50 mt-2 md:hidden">
            <div className="overflow-hidden rounded-[1.25rem] border border-navy-50/40 bg-white shadow-lg">
              <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Navigation</span>
                <button
                  aria-label="Close navigation menu"
                  className="rounded-lg border border-black/10 px-2 py-1 text-[11px] font-semibold text-muted"
                  onClick={() => setMobileOpen(false)}
                  type="button"
                >
                  Close
                </button>
              </div>
              <nav className="grid gap-1 p-3">
                {resolvedNavItems.map(item => {
                  const active = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href))
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => { handleNavigate(item.href); setMobileOpen(false) }}
                      className={`rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                        active ? 'bg-navy-50/80 text-navy font-semibold' : 'text-slate hover:bg-sky-light hover:text-navy'
                      }`}
                    >
                      <span className="flex items-center gap-3"><NavIcon name={item.icon} />{item.label}</span>
                    </Link>
                  )
                })}
              </nav>
            </div>
          </div>
        ) : null}
      </header>

      {/* ── Main Content — full width ── */}
      <main className={`flex min-h-0 w-full flex-1 flex-col ${fitViewport ? 'overflow-hidden' : ''} ${contentClassName}`}>
        {children}
      </main>

    </div>
  )
}

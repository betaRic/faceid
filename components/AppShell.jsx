'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import BrandMark from './BrandMark'
import { usePortalDestination } from './usePortalDestination'
import { Icon, IconButton, Surface, cx } from './ui'

const PUBLIC_ATTENDANCE_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PUBLIC_ATTENDANCE === 'true'
const baseNavItems = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/scan', label: 'Scan', icon: 'scan' },
  ...(PUBLIC_ATTENDANCE_ENABLED ? [{ href: '/attendance', label: 'Attendance', icon: 'attendance' }] : []),
  { href: '/registration', label: 'Register', icon: 'user-add' },
]

function isActiveRoute(pathname, href) {
  return pathname === href || (href !== '/' && pathname?.startsWith(href))
}

function NavigationLinks({ items, pathname, onNavigate, mobile = false }) {
  return items.map((item) => {
    const active = isActiveRoute(pathname, item.href)
    return (
      <Link
        aria-current={active ? 'page' : undefined}
        aria-label={item.label}
        className={cx(
          'inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-medium transition-colors',
          mobile && 'w-full px-4',
          active ? 'bg-primary/10 text-primary' : 'text-secondary hover:bg-canvas hover:text-primary',
        )}
        href={item.href}
        key={item.href}
        onClick={() => onNavigate(item.href)}
      >
        <Icon name={item.icon || 'home'} />
        <span>{item.label}</span>
      </Link>
    )
  })
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
  const mobileTriggerRef = useRef(null)
  const mobileMenuId = useId()
  const portal = usePortalDestination()
  const resolvedNavItems = navItems ?? baseNavItems
  const canRenderNavigation = showNavigation && resolvedNavItems.length > 0
  const staffLabel = portal.role === 'admin' ? 'Admin' : portal.role === 'hr' ? 'HR' : 'Staff'

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!canRenderNavigation && mobileOpen) setMobileOpen(false)
  }, [canRenderNavigation, mobileOpen])

  useEffect(() => {
    onMobileMenuChange?.(mobileOpen)
  }, [mobileOpen, onMobileMenuChange])

  useEffect(() => {
    if (!mobileOpen) return undefined
    function handleEscape(event) {
      if (event.key !== 'Escape') return
      setMobileOpen(false)
      mobileTriggerRef.current?.focus()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [mobileOpen])

  function handleNavigate(href) {
    if (href !== pathname) onBeforeNavigate?.(href)
  }

  function handleMobileNavigate(href) {
    handleNavigate(href)
    setMobileOpen(false)
  }

  return (
    <div className={cx('app-shell flex flex-col bg-canvas', fitViewport ? 'h-[100dvh] overflow-hidden' : 'min-h-screen')}>
      <header className="sticky top-0 z-50 border-b border-line bg-surface/95 backdrop-blur">
        <div className="container-fluid flex min-h-16 w-full items-center gap-3 py-2">
          <Link aria-label="VeriFace home" className="inline-flex min-h-11 shrink-0 items-center rounded-control" href="/" onClick={() => handleNavigate('/')}>
            <BrandMark compact />
          </Link>

          {canRenderNavigation ? (
            <nav aria-label="Primary navigation" className="ml-3 hidden items-center gap-1 md:flex">
              <NavigationLinks items={resolvedNavItems} onNavigate={handleNavigate} pathname={pathname} />
            </nav>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            {actions}
            <Link
              aria-label={`${staffLabel} staff access`}
              className={cx(
                'inline-flex min-h-11 items-center gap-2 rounded-control border px-3 text-sm font-semibold transition-colors',
                pathname?.startsWith('/admin') || pathname === '/login'
                  ? 'border-primary bg-primary text-white'
                  : 'border-line bg-surface text-primary hover:bg-canvas',
              )}
              href={portal.href}
              onClick={() => handleNavigate(portal.href)}
            >
              <Icon name="security" />
              <span className="hidden sm:inline">{staffLabel}</span>
            </Link>

            {canRenderNavigation ? (
              <IconButton
                aria-controls={mobileMenuId}
                aria-expanded={mobileOpen}
                aria-label="Open navigation"
                className="md:hidden"
                onClick={() => setMobileOpen(true)}
                ref={mobileTriggerRef}
                variant="secondary"
              >
                <Icon name="menu" />
              </IconButton>
            ) : null}
          </div>
        </div>

        {canRenderNavigation && mobileOpen ? (
          <div className="absolute inset-x-3 top-full z-50 mt-2 md:hidden" id={mobileMenuId}>
            <Surface className="overflow-hidden shadow-menu">
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
                <span className="text-sm font-semibold text-foreground">Navigation</span>
                <IconButton aria-label="Close navigation" onClick={() => {
                  setMobileOpen(false)
                  mobileTriggerRef.current?.focus()
                }}>
                  <Icon name="close" />
                </IconButton>
              </div>
              <nav aria-label="Primary navigation" className="grid gap-1 p-2">
                <NavigationLinks items={resolvedNavItems} mobile onNavigate={handleMobileNavigate} pathname={pathname} />
              </nav>
            </Surface>
          </div>
        ) : null}
      </header>

      <main className={cx('flex min-h-0 w-full flex-1 flex-col', fitViewport && 'overflow-hidden', contentClassName)}>
        {children}
      </main>
    </div>
  )
}

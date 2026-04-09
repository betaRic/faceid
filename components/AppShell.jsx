'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import BrandMark from './BrandMark'

const defaultNavItems = [
  { href: '/', label: 'Home' },
  { href: '/kiosk', label: 'Kiosk' },
  { href: '/registration', label: 'Register' },
  { href: '/admin', label: 'Admin' },
]

export default function AppShell({
  children,
  actions = null,
  navItems = defaultNavItems,
  contentClassName = '',
  onBeforeNavigate = null,
}) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleNavigate = href => {
    if (typeof onBeforeNavigate === 'function' && href !== pathname) {
      onBeforeNavigate(href)
    }
  }

  return (
    <div className="app-shell flex min-h-screen flex-col">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 nav-header">
        <div className="container-fluid flex w-full items-center gap-3 py-3">
          <Link href="/" className="shrink-0" onClick={() => handleNavigate('/')}>
            <BrandMark compact />
          </Link>

          {/* Desktop nav */}
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {navItems.map(item => {
              const active = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => handleNavigate(item.href)}
                  className={`nav-link ${active ? 'active' : ''}`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {actions}
            {/* Mobile hamburger */}
            <button
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
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-navy-50/40 bg-white/95 backdrop-blur-xl md:hidden"
            >
              <nav className="container-fluid flex flex-col gap-1 py-3">
                {navItems.map(item => {
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
                      {item.label}
                    </Link>
                  )
                })}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ── Main Content — full width ── */}
      <main className={`w-full flex-1 ${contentClassName}`}>
        {children}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-navy-50/40 bg-white">
        <div className="container-fluid flex flex-col gap-1 py-4 text-xs text-slate-light sm:flex-row sm:items-center sm:justify-between">
          <span className="font-medium text-navy/70">FaceAttend — DILG Region XII</span>
          <span className="opacity-60">GPS-validated · Biometric · Server-enforced</span>
        </div>
      </footer>
    </div>
  )
}

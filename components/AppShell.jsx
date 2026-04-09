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

export default function AppShell({ children, actions = null, navItems = defaultNavItems, contentClassName = '' }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-black/[0.06] bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="shrink-0">
            <BrandMark compact />
          </Link>

          <nav className="ml-2 hidden items-center gap-1 md:flex">
            {navItems.map(item => {
              const active = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href))

              return (
                <Link
                  key={item.href}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-all duration-150 ${
                    active
                      ? 'bg-brand text-white shadow-sm'
                      : 'text-muted hover:bg-black/[0.04] hover:text-ink'
                  }`}
                  href={item.href}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
            {actions}
            <button
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-black/[0.08] bg-white/80 text-muted transition-colors hover:bg-white md:hidden"
              onClick={() => setMobileOpen(value => !value)}
              aria-label="Toggle navigation"
              type="button"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        <AnimatePresence>
          {mobileOpen ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-black/[0.06] bg-white/90 backdrop-blur-xl md:hidden"
            >
              <nav className="flex flex-col gap-1 p-3">
                {navItems.map(item => {
                  const active = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href))

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                        active
                          ? 'bg-brand/10 text-brand-dark'
                          : 'text-muted hover:bg-black/[0.04] hover:text-ink'
                      }`}
                    >
                      {item.label}
                    </Link>
                  )
                })}
              </nav>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </header>

      <main className={`w-full flex-1 ${contentClassName}`}>{children}</main>

      <footer className="border-t border-black/[0.06] bg-white/60">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-0.5 px-4 py-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>FaceAttend — DILG Region XII</span>
          <span className="opacity-60">GPS-validated · Biometric · Server-enforced</span>
        </div>
      </footer>
    </div>
  )
}

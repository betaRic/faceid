'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import BrandMark from './BrandMark'

const defaultNavItems = [
  { href: '/', label: 'Home' },
  { href: '/kiosk', label: 'Kiosk' },
  { href: '/registration', label: 'Registration' },
  { href: '/admin', label: 'Admin' },
]

export default function AppShell({ children, actions = null, navItems = defaultNavItems, contentClassName = '' }) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-hero-wash">
      <header className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link className="min-w-0" href="/">
            <BrandMark compact />
          </Link>

          <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {navItems.map(item => {
              const active = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href))

              return (
                <Link
                  key={item.href}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    active
                      ? 'bg-brand text-white'
                      : 'border border-black/8 bg-white/80 text-ink hover:bg-stone-50'
                  }`}
                  href={item.href}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {actions ? <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </header>

      <div className={contentClassName}>{children}</div>

      <footer className="border-t border-black/5 bg-white/75">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>Mobile-first attendance pilot for DILG Region XII.</p>
          <p>Minimal UI, server-validated writes, GPS and biometric workflow.</p>
        </div>
      </footer>
    </div>
  )
}

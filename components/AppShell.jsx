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
    <div className="flex min-h-screen flex-col bg-hero-wash">
      <header className="sticky top-0 z-40 border-b border-black/5 bg-white/82 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2.5 sm:px-6 lg:px-8">
          <Link className="min-w-0" href="/">
            <BrandMark compact />
          </Link>

          <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {navItems.map(item => {
              const active = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href))

              return (
                <Link
                  key={item.href}
                  className={`rounded-full px-3.5 py-2 text-sm font-semibold transition ${
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

          {actions ? <div className="ml-auto flex flex-wrap items-center gap-1.5">{actions}</div> : null}
        </div>
      </header>

      <main className={`flex-1 ${contentClassName}`}>{children}</main>

      <footer className="border-t border-black/5 bg-white/75">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-2 text-[11px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>FaceAttend for DILG Region XII.</p>
          <p>Minimal workspace, server-validated writes, GPS and biometric workflow.</p>
        </div>
      </footer>
    </div>
  )
}

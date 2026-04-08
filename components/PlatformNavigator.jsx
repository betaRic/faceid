'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import BrandMark from './BrandMark'

const entryCards = [
  {
    title: 'Kiosk Attendance',
    href: '/kiosk',
    description: 'Shared office scanning for walk-by attendance with face recognition and GPS validation.',
    tone: 'from-brand/15 via-white/85 to-white',
  },
  {
    title: 'Employee Registration',
    href: '/registration',
    description: 'Automatic face capture with office assignment, duplicate validation, and faster guided enrollment.',
    tone: 'from-accent/15 via-white/85 to-white',
  },
  {
    title: 'System Blueprint',
    href: '/blueprint',
    description: 'Product and architecture reference page so the live entry flow stays focused and uncluttered.',
    tone: 'from-stone-200/60 via-white/90 to-white',
  },
  {
    title: 'Admin Login',
    href: '/admin/login',
    description: 'Office setup, GPS configuration, schedules, WFH rules, and attendance administration.',
    tone: 'from-ink via-stone-900 to-stone-800',
    dark: true,
  },
]

export default function PlatformNavigator() {
  return (
    <main className="min-h-screen bg-hero-wash px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="grid gap-5 overflow-hidden rounded-[2rem] border border-black/5 bg-white/70 p-6 shadow-glow backdrop-blur xl:grid-cols-[1.25fr_.75fr] xl:p-8">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="min-w-0"
            initial={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          >
            <BrandMark />
            <h1 className="mt-4 max-w-4xl font-display text-4xl leading-none text-ink sm:text-5xl lg:text-6xl">
              A cleaner entry point for kiosk, registration, and secure admin workflows.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-muted sm:text-lg">
              This approach is the right compromise. It gives the system a modern navigation shell without forcing every
              user into a kiosk-first screen, and it keeps the product simpler than the old all-in-one attendance app.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex items-center justify-center rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark"
                href="/kiosk"
              >
                Open kiosk
              </Link>
              <Link
                className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white/70 px-5 py-3 text-sm font-semibold text-ink transition hover:bg-white"
                href="/admin/login"
              >
                Open admin
              </Link>
            </div>
          </motion.div>

          <motion.aside
            animate={{ opacity: 1, x: 0 }}
            className="rounded-[1.75rem] border border-black/5 bg-gradient-to-br from-brand/10 via-white/80 to-accent/10 p-6"
            initial={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.5, ease: 'easeOut', delay: 0.08 }}
          >
            <div className="space-y-4">
              <span className="inline-flex rounded-full bg-white/80 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">
                Build Direction
              </span>
              <h2 className="font-display text-2xl text-ink">Modern, fast, and restrained.</h2>
              <p className="text-sm leading-7 text-muted">
                Tailwind gives us the design system. Framer Motion gives us controlled transitions. Security and trust
                still come from authentication, validation, Firestore rules, and predictable architecture.
              </p>
              <div className="grid gap-3 pt-2 text-sm text-muted">
                <div className="rounded-2xl border border-black/5 bg-white/75 p-4">
                  Fast mobile-first surfaces
                </div>
                <div className="rounded-2xl border border-black/5 bg-white/75 p-4">
                  Separate modules instead of one overloaded page
                </div>
                <div className="rounded-2xl border border-black/5 bg-white/75 p-4">
                  Security built into data flow, not just UI
                </div>
              </div>
            </div>
          </motion.aside>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {entryCards.map((card, index) => (
            <motion.div
              key={card.title}
              animate={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 18 }}
              transition={{ duration: 0.4, ease: 'easeOut', delay: 0.08 * index }}
            >
              <Link
                className={`group flex min-h-[250px] flex-col justify-between rounded-[1.75rem] border border-black/5 bg-gradient-to-br ${card.tone} p-6 shadow-glow transition duration-200 hover:-translate-y-1 hover:shadow-2xl`}
                href={card.href}
              >
                <div>
                  <span className={`text-xs font-semibold uppercase tracking-[0.18em] ${card.dark ? 'text-white/70' : 'text-brand-dark'}`}>
                    Open module
                  </span>
                  <h2 className={`mt-4 font-display text-3xl leading-tight ${card.dark ? 'text-white' : 'text-ink'}`}>
                    {card.title}
                  </h2>
                  <p className={`mt-3 max-w-xl text-sm leading-7 ${card.dark ? 'text-white/75' : 'text-muted'}`}>
                    {card.description}
                  </p>
                </div>
                <span className={`mt-8 text-sm font-semibold ${card.dark ? 'text-white' : 'text-ink'}`}>
                  Go to page
                </span>
              </Link>
            </motion.div>
          ))}
        </section>
      </div>
    </main>
  )
}

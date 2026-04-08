'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import AppShell from './AppShell'

const entryCards = [
  {
    title: 'Kiosk Attendance',
    href: '/kiosk',
    description: 'Face scan and GPS attendance for assigned employees.',
    tone: 'from-brand/15 via-white/85 to-white',
  },
  {
    title: 'Employee Registration',
    href: '/registration',
    description: 'Guided enrollment with office assignment and duplicate blocking.',
    tone: 'from-accent/15 via-white/85 to-white',
  },
  {
    title: 'System Blueprint',
    href: '/blueprint',
    description: 'Internal planning and architecture notes.',
    tone: 'from-stone-200/60 via-white/90 to-white',
  },
  {
    title: 'Admin Login',
    href: '/admin/login',
    description: 'Office setup, schedules, employees, and reports.',
    tone: 'from-ink via-stone-900 to-stone-800',
    dark: true,
  },
]

export default function PlatformNavigator() {
  return (
    <AppShell contentClassName="px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <section className="grid gap-4 rounded-[1.6rem] border border-black/5 bg-white/78 p-4 shadow-glow backdrop-blur lg:grid-cols-[minmax(0,1fr)_320px]">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="min-w-0"
            initial={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <div className="inline-flex rounded-full bg-brand/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">
              Main Navigation
            </div>
            <h1 className="mt-3 max-w-3xl font-display text-3xl leading-tight text-ink sm:text-4xl">
              Fast access to kiosk, registration, admin, and system reference.
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted sm:text-base">
              Compact by default. Staff should reach the right module immediately without reading a landing page.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                className="inline-flex items-center justify-center rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark"
                href="/kiosk"
              >
                Open kiosk
              </Link>
              <Link
                className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-stone-50"
                href="/admin/login"
              >
                Open admin
              </Link>
            </div>
          </motion.div>

          <motion.aside
            animate={{ opacity: 1, x: 0 }}
            className="grid gap-3 rounded-[1.4rem] border border-black/5 bg-gradient-to-br from-brand/10 via-white/90 to-accent/10 p-4"
            initial={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.45, ease: 'easeOut', delay: 0.06 }}
          >
            <QuickStat label="Interface" value="Minimal" />
            <QuickStat label="Flow" value="Module-based" />
            <QuickStat label="Attendance" value="GPS + face" />
          </motion.aside>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {entryCards.map((card, index) => (
            <motion.div
              key={card.title}
              animate={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 18 }}
              transition={{ duration: 0.35, ease: 'easeOut', delay: 0.05 * index }}
            >
              <Link
                className={`group flex min-h-[168px] flex-col justify-between rounded-[1.35rem] border border-black/5 bg-gradient-to-br ${card.tone} p-4 shadow-glow transition duration-200 hover:-translate-y-1 hover:shadow-2xl`}
                href={card.href}
              >
                <div>
                  <span className={`text-xs font-semibold uppercase tracking-[0.18em] ${card.dark ? 'text-white/70' : 'text-brand-dark'}`}>
                    Module
                  </span>
                  <h2 className={`mt-3 font-display text-2xl leading-tight ${card.dark ? 'text-white' : 'text-ink'}`}>
                    {card.title}
                  </h2>
                  <p className={`mt-2 text-sm leading-6 ${card.dark ? 'text-white/75' : 'text-muted'}`}>
                    {card.description}
                  </p>
                </div>
                <span className={`mt-5 text-sm font-semibold ${card.dark ? 'text-white' : 'text-ink'}`}>Open</span>
              </Link>
            </motion.div>
          ))}
        </section>
      </div>
    </AppShell>
  )
}

function QuickStat({ label, value }) {
  return (
    <div className="rounded-[1.1rem] border border-black/5 bg-white/78 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">{label}</div>
      <div className="mt-1.5 font-display text-2xl text-ink">{value}</div>
    </div>
  )
}

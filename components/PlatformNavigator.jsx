'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import AppShell from './AppShell'

const modules = [
  {
    title: 'Kiosk',
    description: 'Attendance scanning for enrolled employees.',
    href: '/kiosk',
    accent: 'from-brand/12 to-brand/4',
    border: 'border-brand/20',
    tag: 'Live',
    tagColor: 'bg-emerald-100 text-emerald-700',
  },
  {
    title: 'Registration',
    description: 'Public face registration for new users.',
    href: '/registration',
    accent: 'from-accent/12 to-accent/4',
    border: 'border-accent/20',
    tag: 'Open',
    tagColor: 'bg-amber-100 text-amber-700',
  },
  {
    title: 'Admin',
    description: 'Registration, office setup, employee management, and reports.',
    href: '/admin/login',
    accent: 'from-ink/90 to-stone-800/90',
    border: 'border-ink/10',
    tag: 'Restricted',
    tagColor: 'bg-white/20 text-white/80',
    dark: true,
  },
]

const stats = [
  { label: 'Offices', value: '5' },
  { label: 'GPS Sites', value: '5' },
  { label: 'Admin Auth', value: 'Google' },
]

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
}

export default function PlatformNavigator() {
  return (
    <AppShell contentClassName="px-4 py-6 sm:px-6 lg:px-8">
      <div className="page-frame space-y-6">
        <motion.section
          variants={stagger}
          initial="hidden"
          animate="show"
          className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,420px)] xl:items-end"
        >
          <div className="space-y-6">
            <motion.div variants={fadeUp}>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-brand-dark">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                DILG Region XII
              </span>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="max-w-3xl font-display text-4xl leading-tight text-ink sm:text-5xl"
            >
              Face attendance for regional government offices.
            </motion.h1>

            <motion.p variants={fadeUp} className="max-w-2xl text-base leading-relaxed text-muted">
              Open the kiosk for attendance or the admin portal for registration and setup.
            </motion.p>

            <motion.div variants={fadeUp} className="flex flex-wrap gap-3">
              <Link
                href="/kiosk"
                className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-dark hover:shadow-md"
              >
                Open Kiosk
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              <Link
                href="/admin/login"
                className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-6 py-3 text-sm font-semibold text-ink shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-stone-50 hover:shadow-md"
              >
                Admin Portal
              </Link>
            </motion.div>
          </div>

          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-1"
          >
            {stats.map(stat => (
              <motion.div
                key={stat.label}
                variants={fadeUp}
                className="rounded-2xl border border-black/[0.06] bg-white/70 p-4 backdrop-blur-sm"
              >
                <div className="font-display text-3xl text-ink">{stat.value}</div>
                <div className="mt-1 text-xs font-semibold uppercase tracking-widest text-muted">{stat.label}</div>
              </motion.div>
            ))}
          </motion.div>
        </motion.section>

        <motion.section
          variants={stagger}
          initial="hidden"
          animate="show"
          className="rounded-[1.8rem] border border-black/[0.06] bg-white/55 p-4 shadow-glow backdrop-blur-sm"
        >
          <motion.h2
            variants={fadeUp}
            className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted"
          >
            Modules
          </motion.h2>

          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-3">
            {modules.map(module => (
              <motion.div key={module.href} variants={fadeUp}>
                <Link
                  href={module.href}
                  className={`group flex h-full min-h-[180px] flex-col justify-between rounded-2xl border ${module.border} bg-gradient-to-br ${module.accent} p-5 backdrop-blur-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className={`font-display text-2xl ${module.dark ? 'text-white' : 'text-ink'}`}>
                      {module.title}
                    </h3>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest ${module.tagColor}`}>
                      {module.tag}
                    </span>
                  </div>
                  <div>
                    <p className={`mb-3 text-sm leading-relaxed ${module.dark ? 'text-white/70' : 'text-muted'}`}>
                      {module.description}
                    </p>
                    <span className={`text-xs font-semibold ${module.dark ? 'text-white/60' : 'text-brand'}`}>
                      Open →
                    </span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </motion.section>

      </div>
    </AppShell>
  )
}

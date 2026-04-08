'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import AppShell from './AppShell'

const modules = [
  {
    title: 'Kiosk',
    description: 'Face scan attendance with GPS validation for enrolled employees.',
    href: '/kiosk',
    accent: 'from-brand/12 to-brand/4',
    border: 'border-brand/20',
    tag: 'Live',
    tagColor: 'bg-emerald-100 text-emerald-700',
  },
  {
    title: 'Registration',
    description: 'Enroll employees with guided face capture and office assignment.',
    href: '/registration',
    accent: 'from-accent/12 to-accent/4',
    border: 'border-accent/20',
    tag: 'Enrollment',
    tagColor: 'bg-amber-100 text-amber-700',
  },
  {
    title: 'Blueprint',
    description: 'System architecture, policy model, and office data reference.',
    href: '/blueprint',
    accent: 'from-stone-200/70 to-stone-100/50',
    border: 'border-black/[0.06]',
    tag: 'Reference',
    tagColor: 'bg-stone-100 text-stone-600',
  },
  {
    title: 'Admin',
    description: 'Office setup, employee management, schedules and reporting.',
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
  { label: 'Policy Layers', value: '3' },
  { label: 'Auth Model', value: 'Google' },
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
    <AppShell contentClassName="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-10">

        {/* Hero */}
        <motion.section
          variants={stagger}
          initial="hidden"
          animate="show"
          className="space-y-6"
        >
          <motion.div variants={fadeUp}>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-brand-dark">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              DILG Region XII
            </span>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="max-w-2xl font-display text-4xl leading-tight text-ink sm:text-5xl"
          >
            Face-based attendance for regional government offices.
          </motion.h1>

          <motion.p variants={fadeUp} className="max-w-xl text-base leading-relaxed text-muted">
            GPS-validated, server-enforced attendance with biometric enrollment.
            One office per employee. No client-side trust.
          </motion.p>

          <motion.div variants={fadeUp} className="flex flex-wrap gap-3">
            <Link
              href="/kiosk"
              className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-brand-dark hover:-translate-y-0.5 hover:shadow-md"
            >
              Open Kiosk
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
            <Link
              href="/admin/login"
              className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-6 py-3 text-sm font-semibold text-ink shadow-sm transition-all duration-200 hover:bg-stone-50 hover:-translate-y-0.5 hover:shadow-md"
            >
              Admin Portal
            </Link>
          </motion.div>
        </motion.section>

        {/* Stats strip */}
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {stats.map(s => (
            <motion.div
              key={s.label}
              variants={fadeUp}
              className="rounded-2xl border border-black/[0.06] bg-white/70 p-4 backdrop-blur-sm"
            >
              <div className="font-display text-3xl text-ink">{s.value}</div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-widest text-muted">{s.label}</div>
            </motion.div>
          ))}
        </motion.div>

        {/* Module cards */}
        <motion.section
          variants={stagger}
          initial="hidden"
          animate="show"
        >
          <motion.h2
            variants={fadeUp}
            className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted"
          >
            Modules
          </motion.h2>

          <div className="grid gap-3 sm:grid-cols-2">
            {modules.map(m => (
              <motion.div key={m.href} variants={fadeUp}>
                <Link
                  href={m.href}
                  className={`group flex h-full min-h-[160px] flex-col justify-between rounded-2xl border ${m.border} bg-gradient-to-br ${m.accent} p-5 backdrop-blur-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className={`font-display text-2xl ${m.dark ? 'text-white' : 'text-ink'}`}>
                      {m.title}
                    </h3>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest ${m.tagColor}`}>
                      {m.tag}
                    </span>
                  </div>
                  <div>
                    <p className={`mb-3 text-sm leading-relaxed ${m.dark ? 'text-white/70' : 'text-muted'}`}>
                      {m.description}
                    </p>
                    <span className={`text-xs font-semibold transition-all duration-200 group-hover:gap-2 ${m.dark ? 'text-white/60' : 'text-brand'}`}>
                      Open →
                    </span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* System note */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="rounded-2xl border border-amber-200/60 bg-amber-50/60 px-5 py-4"
        >
          <p className="text-sm leading-relaxed text-amber-800">
            <span className="font-semibold">Controlled rollout:</span>{' '}
            Face detection runs on the client. The server validates GPS, identity, and office policy before accepting attendance.
            Not a fully hardened biometric platform — treat as a pilot deployment.
          </p>
        </motion.div>

      </div>
    </AppShell>
  )
}

'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import AppShell from './AppShell'
import BrandMark from './BrandMark'
import { usePortalDestination } from './usePortalDestination'

/* ─── Animation variants ─────────────────────────────────── */
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
}

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
}

const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.4, ease: 'easeOut' } },
}

/* ─── Data ───────────────────────────────────────────────── */
const stats = [
  { value: 'DILG R12', label: 'Deployment Scope', icon: '🏛️' },
  { value: 'GPS', label: 'Location Verified', icon: '📍' },
  { value: '4-Pose', label: 'Face Capture', icon: '🎯' },
  { value: 'Live', label: 'Real-time Logs', icon: '⚡' },
]

const howItWorks = [
  {
    step: '01',
    title: 'Employee Enrolls',
    body: 'A new employee visits the registration page, completes a guided four-pose face capture, and submits their name, ID, and assigned office. A server-side duplicate check runs automatically.',
  },
  {
    step: '02',
    title: 'Admin Approves',
    body: 'The enrollment lands in the admin approval queue. The admin reviews the submitted photo and approves the record. Pending records are blocked from clocking in.',
  },
  {
    step: '03',
    title: 'Employee Scans',
    body: 'At the office or during WFH, the employee opens the scan page. The browser captures the verification burst, the server evaluates the match and attendance policy, and GPS confirms the attendance context.',
  },
  {
    step: '04',
    title: 'Attendance Recorded',
    body: 'Check-in and check-out are logged with timestamps and mode (on-site or WFH). HR and admin portals show AM/PM sessions, late/undertime minutes, and exportable DTR summaries.',
  },
]

const trustPoints = [
  { label: 'Server-side attendance decisions', desc: 'Attendance approval, policy checks, audit logging, and descriptor generation happen on the server. The browser still submits still frames, GPS, and passive liveness evidence, so suspicious scans fail closed.' },
  { label: 'Approval-gated biometrics', desc: 'Public enrollments cannot access attendance until an admin explicitly approves the record. Admins can also reset face data and require re-enrollment.' },
  { label: 'Rate limiting & scan telemetry', desc: 'Logins, approvals, and attendance scans are rate-limited. Structured scan telemetry records why a scan passed or failed by device, pose, and match quality.' },
  { label: 'Geofence + liveness enforcement', desc: 'On-site attendance requires GPS within the configured office radius. Anti-spoofing rejects printed photos and screen replays, while Wi-Fi is treated as advisory context instead of a fake security boundary.' },
]

/* ─── Component ──────────────────────────────────────────── */
export default function PlatformNavigator() {
  const portal = usePortalDestination()
  const portalLabel = portal.role === 'admin' ? 'Admin' : portal.role === 'hr' ? 'HR' : 'Login'
  const portalCtaLabel = portal.role === 'admin' ? 'Admin Portal' : portal.role === 'hr' ? 'HR Portal' : 'Login Portal'
  const modules = [
    {
      title: 'Public Scan',
      tag: 'Live',
      tagStyle: 'bg-emerald-100 text-emerald-700',
      href: '/scan',
      description: 'Phone-first face scanning for enrolled employees. The browser captures the face burst, the server makes the attendance decision, GPS validates location, and the system records AM/PM attendance.',
      features: ['Open-and-scan flow', 'Challenge-protected attendance requests', 'GPS context validation', 'AM / PM session tracking'],
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      ),
      accent: 'from-navy to-navy-light',
      border: 'border-navy/10',
      bg: 'bg-white',
    },
    {
      title: 'Employee Registration',
      tag: 'Open',
      tagStyle: 'bg-amber-100 text-amber-700',
      href: '/registration',
      description: 'Enroll a new employee with a guided four-pose face capture. A server-side duplicate check runs before submission. Records are locked until an admin approves them.',
      features: ['4-pose guided capture', 'Server-side duplicate check', 'Oval alignment guide', 'Pending admin approval'],
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
      ),
      accent: 'from-amber to-amber-light',
      border: 'border-amber/20',
      bg: 'bg-white',
    },
    {
      title: 'Portal Access',
      tag: 'Restricted',
      tagStyle: 'bg-slate-100 text-slate',
      href: portal.href,
      description: 'Separate Admin and HR portals. Admins manage offices, GPS geofences, employee records, and approval queues. HR handles DTR exports and employee face data resets.',
      features: ['Office & GPS geofence setup', 'Employee approval + face reset', 'Daily DTR summary & export', `Direct ${portalCtaLabel}`],
      icon: (
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      accent: 'from-slate to-slate-light',
      border: 'border-slate/10',
      bg: 'bg-white',
    },
  ]

  return (
    <AppShell>
      {/* ══════════════════════════════════════
          HERO — Navy gradient, full width
      ══════════════════════════════════════ */}
      <section className="relative w-full overflow-hidden bg-hero-gradient">
        {/* Decorative circles */}
        <div className="pointer-events-none absolute -right-32 -top-32 h-[500px] w-[500px] rounded-full bg-sky/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-[400px] w-[400px] rounded-full bg-amber/8 blur-3xl" />

        <div className="container-fluid relative z-10 py-20 md:py-28 lg:py-32">
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="mx-auto max-w-4xl text-center"
          >
            <motion.div variants={fadeUp}>
              <BrandMark inverted className="mx-auto mb-8 justify-center" />
            </motion.div>

            <motion.div variants={fadeUp}>
              <span className="badge badge-sky mb-5 inline-flex">
                <span className="h-1.5 w-1.5 rounded-full bg-amber animate-pulse" />
                DILG Region XII · Live System
              </span>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl"
            >
              Face Attendance<br />
              <span className="text-amber">Made Simple.</span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-sky/80 sm:text-lg"
            >
              A GPS-validated, biometric attendance platform built for DILG Region XII government offices.
              Server-enforced identity verification with a phone-first scan flow and a full admin workflow from enrollment to daily summary exports.
            </motion.p>

            <motion.div variants={fadeUp} className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Link href="/scan" className="btn btn-amber text-base px-7 py-3.5 shadow-glow-orange">
                Open Kiosk
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              <Link href="/registration" className="btn btn-white text-base px-7 py-3.5">
                Register Employee
              </Link>
              <Link href={portal.href} className="btn text-sm px-6 py-3.5 border border-sky/30 text-sky hover:bg-sky/10 rounded-full transition-all duration-200">
                {portalLabel} →
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          STATS BAR — Full width
      ══════════════════════════════════════ */}
      <section className="w-full border-y border-navy/8 bg-white">
        <div className="container-fluid py-6">
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="grid grid-cols-2 gap-4 sm:grid-cols-4"
          >
            {stats.map(stat => (
              <motion.div key={stat.label} variants={fadeIn} className="flex items-center gap-3 py-2">
                <span className="text-2xl">{stat.icon}</span>
                <div>
                  <div className="text-xl font-bold text-navy">{stat.value}</div>
                  <div className="text-xs font-medium text-slate-light">{stat.label}</div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          MODULES — Full width cards
      ══════════════════════════════════════ */}
      <section className="w-full bg-off-white py-16 lg:py-20">
        <div className="container-fluid">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45 }}
            className="mb-10"
          >
            <span className="badge badge-navy mb-3">Platform Modules</span>
            <h2 className="text-2xl font-bold text-navy sm:text-3xl">Three focused tools, one system.</h2>
            <p className="mt-2 max-w-xl text-slate-light">
              Each module has a single responsibility: scan attendance, enrollment, or administration. No feature bloat.
            </p>
          </motion.div>

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="grid gap-5 md:grid-cols-3"
          >
            {modules.map(mod => (
              <motion.div key={mod.href} variants={fadeUp}>
                <Link
                  href={mod.href}
                  className="group flex h-full flex-col rounded-2xl border border-navy/8 bg-white p-6 shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-card-hover"
                >
                  {/* Header */}
                  <div className="mb-4 flex items-start justify-between">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${mod.accent} text-white shadow-sm`}>
                      {mod.icon}
                    </div>
                    <span className={`badge ${mod.tagStyle}`}>{mod.tag}</span>
                  </div>

                  {/* Title + description */}
                  <h3 className="mb-2 text-lg font-bold text-navy">{mod.title}</h3>
                  <p className="mb-5 text-sm leading-relaxed text-slate-light flex-1">{mod.description}</p>

                  {/* Feature list */}
                  <ul className="mb-5 space-y-1.5">
                    {mod.features.map(f => (
                      <li key={f} className="flex items-center gap-2 text-xs font-medium text-slate">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <div className="flex items-center gap-1 text-sm font-semibold text-navy group-hover:text-navy-light transition-colors">
                    Open module
                    <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          HOW IT WORKS — Full width
      ══════════════════════════════════════ */}
      <section className="w-full bg-white py-16 lg:py-20">
        <div className="container-fluid">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45 }}
            className="mb-10"
          >
            <span className="badge badge-amber mb-3">How It Works</span>
            <h2 className="text-2xl font-bold text-navy sm:text-3xl">From enrollment to daily report.</h2>
          </motion.div>

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
          >
            {howItWorks.map((step, i) => (
              <motion.div
                key={step.step}
                variants={fadeUp}
                className="relative rounded-2xl border border-navy/8 bg-sky-light/40 p-6"
              >
                {/* Connector line */}
                {i < howItWorks.length - 1 && (
                  <div className="absolute -right-2.5 top-10 z-10 hidden h-px w-5 bg-navy/20 lg:block" />
                )}
                <div className="mb-4 text-3xl font-black text-navy/10 leading-none">{step.step}</div>
                <h3 className="mb-2 text-base font-bold text-navy">{step.title}</h3>
                <p className="text-sm leading-relaxed text-slate-light">{step.body}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          TRUST / SECURITY — Full width navy band
      ══════════════════════════════════════ */}
      <section className="w-full bg-navy py-16 lg:py-20">
        <div className="container-fluid">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45 }}
            className="mb-10"
          >
            <span className="badge badge-sky mb-3">Security Model</span>
            <h2 className="text-2xl font-bold text-white sm:text-3xl">Built for accountability.</h2>
            <p className="mt-2 max-w-xl text-sky/70 text-sm">
              This is a controlled rollout system, not a toy. Every meaningful action is logged, rate-limited, and enforced server-side.
            </p>
          </motion.div>

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            {trustPoints.map(point => (
              <motion.div key={point.label} variants={fadeUp} className="rounded-xl border border-sky/10 bg-navy-light/60 p-5">
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-amber/15">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber" />
                </div>
                <div className="mb-1 text-sm font-semibold text-white">{point.label}</div>
                <div className="text-xs leading-relaxed text-sky/60">{point.desc}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          CTA — Full width
      ══════════════════════════════════════ */}
      <section className="w-full bg-off-white py-14">
        <div className="container-fluid">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center justify-between gap-6 rounded-2xl border border-navy/8 bg-white p-8 shadow-card sm:flex-row"
          >
            <div>
              <h3 className="text-xl font-bold text-navy">Ready to start?</h3>
              <p className="mt-1 text-sm text-slate-light">Open the kiosk scan page for attendance or enter the correct portal for office management and DTR work.</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <Link href="/scan" className="btn btn-primary px-6 py-3">Open Kiosk</Link>
              <Link href={portal.href} className="btn btn-ghost px-6 py-3">{portalCtaLabel}</Link>
            </div>
          </motion.div>
        </div>
      </section>
    </AppShell>
  )
}

'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import AppShell from './AppShell'
import BrandMark from './BrandMark'

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'offices', label: 'Offices' },
  { id: 'policy', label: 'Policy' },
  { id: 'mobile', label: 'Mobile UX' },
]

export default function WorkforceAttendanceSuite({ initialData }) {
  const [activeTab, setActiveTab] = useState('overview')

  const officeBreakdown = useMemo(() => {
    return initialData.offices.reduce((groups, office) => {
      groups[office.officeType] = (groups[office.officeType] || 0) + 1
      return groups
    }, {})
  }, [initialData.offices])

  return (
    <AppShell contentClassName="px-4 py-4 sm:px-6 lg:px-8">
      <div className="page-frame flex flex-col gap-4 xl:min-h-[calc(100dvh-10.4rem)]">
        <section className="grid gap-4 rounded-[1.5rem] border border-black/5 bg-white/80 p-4 shadow-glow backdrop-blur xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="min-w-0"
          >
            <BrandMark />
            <h1 className="mt-3 max-w-4xl font-display text-3xl leading-tight text-ink sm:text-4xl">
              Office-based attendance with GPS, WFH rules, and mobile-first workflows.
            </h1>
            <p className="mt-2 max-w-4xl text-sm leading-7 text-muted">
              This page should behave like a compact strategy workspace, not a scrolling concept deck. The model is
              simple: one employee, one office, server-side attendance decisions, and office-aware policy control.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                className="inline-flex items-center justify-center rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark"
                href="/attendance"
              >
                Open live prototype
              </Link>
              <Link
                className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-stone-50"
                href="/api/system/blueprint"
              >
                Open server data
              </Link>
            </div>
          </motion.div>

          <motion.aside
            animate={{ opacity: 1, x: 0 }}
            initial={{ opacity: 0, x: 18 }}
            transition={{ duration: 0.4, ease: 'easeOut', delay: 0.06 }}
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"
          >
            <MetricCard label="Office Records" value={initialData.totals.offices} detail="Region, provincial, and HUC" />
            <MetricCard label="Employees Modeled" value={initialData.totals.employees} detail="Assigned per office" />
            <MetricCard label="GPS Sites" value={initialData.totals.gpsEnabledOffices} detail="Each with its own radius" />
            <MetricCard label="Role Layers" value={initialData.roles.length} detail="Regional, office admin, employee" />
          </motion.aside>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {initialData.featureCards.map((card, index) => (
            <motion.article
              key={card.title}
              animate={{ opacity: 1, y: 0 }}
              initial={{ opacity: 0, y: 18 }}
              transition={{ duration: 0.3, ease: 'easeOut', delay: 0.04 * index }}
              className="rounded-[1.35rem] border border-black/5 bg-gradient-to-br from-brand/10 via-white/92 to-accent/10 p-4 shadow-glow"
            >
              <h2 className="font-display text-2xl leading-tight text-ink">{card.title}</h2>
              <p className="mt-2 text-sm leading-7 text-muted">{card.body}</p>
            </motion.article>
          ))}
        </section>

        <section className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <motion.aside
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.35, ease: 'easeOut', delay: 0.08 }}
            className="rounded-[1.5rem] border border-black/5 bg-white/80 p-4 shadow-glow backdrop-blur"
          >
            <div className="grid gap-3">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  className={`rounded-2xl border p-4 text-left text-sm font-semibold transition ${
                    activeTab === tab.id
                      ? 'border-brand/30 bg-brand/10 text-brand-dark'
                      : 'border-black/5 bg-stone-50 text-ink hover:bg-white'
                  }`}
                  onClick={() => setActiveTab(tab.id)}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </motion.aside>

          <motion.section
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 }}
            className="min-h-0 rounded-[1.5rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur"
          >
            {activeTab === 'overview' ? (
              <div className="grid h-full min-h-0 gap-4 lg:grid-cols-2">
                <section className="rounded-[1.35rem] border border-black/5 bg-stone-50 p-4">
                  <PanelTitle title="Coverage" subtitle={initialData.organization.name} />
                  <p className="mt-3 text-sm leading-7 text-muted">{initialData.organization.coverage}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {Object.entries(officeBreakdown).map(([type, count]) => (
                      <span key={type} className="rounded-full bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-dark">
                        {type}: {count}
                      </span>
                    ))}
                  </div>
                </section>

                <section className="min-h-0 rounded-[1.35rem] border border-black/5 bg-stone-50 p-4">
                  <PanelTitle title="Server And Client Split" subtitle="Recommended production architecture" />
                  <div className="mt-4 grid max-h-[52vh] gap-3 overflow-auto pr-1">
                    {initialData.buildFlow.map(flow => (
                      <article key={flow.title} className="rounded-[1.2rem] border border-black/5 bg-white p-4">
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">{flow.stage}</span>
                        <h3 className="mt-2 text-base font-semibold text-ink">{flow.title}</h3>
                        <div className="mt-3 grid gap-2">
                          {flow.points.map(point => (
                            <div key={point} className="rounded-xl bg-stone-50 px-3 py-2 text-sm text-muted">
                              {point}
                            </div>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            ) : null}

            {activeTab === 'offices' ? (
              <div className="grid max-h-[62vh] gap-3 overflow-auto pr-1">
                {initialData.offices.map(office => (
                  <article key={office.id} className="rounded-[1.35rem] border border-black/5 bg-stone-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">{office.officeType}</span>
                        <h3 className="mt-2 font-display text-2xl text-ink">{office.name}</h3>
                      </div>
                      <span className="rounded-full bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink">
                        {office.employees} employees
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-7 text-muted">{office.location}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                        GPS radius: {office.gps.radiusMeters} m
                      </span>
                      <span className="rounded-full bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                        {office.workPolicy.schedule}
                      </span>
                      <span className="rounded-full bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                        {office.workPolicy.wfhMode}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            {activeTab === 'policy' ? (
              <div className="grid h-full min-h-0 gap-4 lg:grid-cols-2">
                <section className="rounded-[1.35rem] border border-black/5 bg-stone-50 p-4">
                  <PanelTitle title="Admin Controls" subtitle="Per-office policy management" />
                  <div className="mt-4 grid gap-2">
                    {[
                      'Assign each employee to a single office record by default.',
                      'Set normal working days, work hours, grace period, and GPS radius per office.',
                      'Enable WFH by recurring day, custom date, or hourly window such as morning-only WFH.',
                      'Allow exception paths for field work, travel, and approved off-site attendance.',
                      'Keep audit logs whenever an admin changes office policy or attendance status.',
                    ].map(item => (
                      <div key={item} className="rounded-xl bg-white px-3 py-3 text-sm leading-7 text-muted">
                        {item}
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-[1.35rem] border border-black/5 bg-stone-50 p-4">
                  <PanelTitle title="Role Design" subtitle="Access should follow office scope" />
                  <div className="mt-4 grid gap-3">
                    {initialData.roles.map(role => (
                      <article key={role.id} className="rounded-[1.2rem] border border-black/5 bg-white p-4">
                        <h3 className="text-base font-semibold text-ink">{role.title}</h3>
                        <p className="mt-2 text-sm leading-7 text-muted">{role.scope}</p>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            ) : null}

            {activeTab === 'mobile' ? (
              <div className="grid h-full min-h-0 gap-4 lg:grid-cols-2">
                <section className="min-h-0 rounded-[1.35rem] border border-black/5 bg-stone-50 p-4">
                  <PanelTitle title="Employee Mobile Cards" subtitle="Primary day-to-day view" />
                  <div className="mt-4 grid max-h-[52vh] gap-3 overflow-auto pr-1">
                    {initialData.sampleEmployees.map(employee => (
                      <article key={employee.id} className="rounded-[1.2rem] border border-black/5 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-base font-semibold text-ink">{employee.name}</h3>
                            <p className="mt-1 text-sm text-muted">{employee.office}</p>
                          </div>
                          <span className="rounded-full bg-brand/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-dark">
                            {employee.status}
                          </span>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <span className="rounded-full bg-stone-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                            {employee.shift}
                          </span>
                          <span className="rounded-full bg-stone-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                            {employee.todayRule}
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="rounded-[1.35rem] border border-black/5 bg-stone-50 p-4">
                  <PanelTitle title="UX Direction" subtitle="Fast, responsive, mobile first" />
                  <div className="mt-4 grid gap-2">
                    {[
                      'Loading shell before camera, GPS, and employee data are ready.',
                      'Idle state with clear next action: clock in, clock out, or check today status.',
                      'Animated confirmation after successful attendance with friendly feedback.',
                      'Compact reusable components for cards, schedule chips, and approval banners.',
                      'Framer Motion is appropriate for restrained page transitions and status changes.',
                    ].map(item => (
                      <div key={item} className="rounded-xl bg-white px-3 py-3 text-sm leading-7 text-muted">
                        {item}
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            ) : null}
          </motion.section>
        </section>
      </div>
    </AppShell>
  )
}

function MetricCard({ label, value, detail }) {
  return (
    <article className="rounded-[1.2rem] border border-black/5 bg-gradient-to-br from-brand/10 via-white/90 to-accent/10 p-4">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">{label}</span>
      <strong className="mt-2 block font-display text-3xl text-ink">{value}</strong>
      <p className="mt-1 text-sm text-muted">{detail}</p>
    </article>
  )
}

function PanelTitle({ title, subtitle }) {
  return (
    <header>
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">{title}</span>
      <h2 className="mt-2 font-display text-2xl text-ink">{subtitle}</h2>
    </header>
  )
}

'use client'

import { useMemo, useState } from 'react'

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'offices', label: 'Offices' },
  { id: 'policy', label: 'Policy Engine' },
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
    <main className="suite-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="eyebrow">DILG Region XII</span>
          <h1>Office-based attendance with GPS, WFH rules, and mobile-first workflows.</h1>
          <p>
            Yes, this system is doable. The correct structure is an office-aware attendance platform where employees
            are assigned to one office, GPS validation follows that office, and admins manage WFH and work schedules at
            the office level with exception handling when needed.
          </p>

          <div className="hero-actions">
            <a className="primary-action" href="#questions">Required clarifications</a>
            <a className="secondary-action" href="/api/system/blueprint">Server data sample</a>
            <a className="secondary-action" href="/attendance">Open live prototype</a>
          </div>
        </div>

        <div className="hero-stats">
          <MetricCard label="Office Records" value={initialData.totals.offices} detail="Region, provincial, and HUC" />
          <MetricCard label="Employees Modeled" value={initialData.totals.employees} detail="Assigned per office" />
          <MetricCard label="GPS Sites" value={initialData.totals.gpsEnabledOffices} detail="Each with its own radius" />
          <MetricCard label="Role Layers" value={initialData.roles.length} detail="Regional, office admin, employee" />
        </div>
      </section>

      <section className="feature-grid">
        {initialData.featureCards.map(card => (
          <article key={card.title} className="feature-card">
            <h2>{card.title}</h2>
            <p>{card.body}</p>
          </article>
        ))}
      </section>

      <section className="workspace-panel">
        <div className="tab-row" role="tablist" aria-label="System detail tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`tab-button ${activeTab === tab.id ? 'tab-active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' ? (
          <div className="detail-grid">
            <section className="panel-card">
              <PanelTitle title="Coverage" subtitle={initialData.organization.name} />
              <p className="panel-copy">{initialData.organization.coverage}</p>
              <div className="chips">
                {Object.entries(officeBreakdown).map(([type, count]) => (
                  <span key={type} className="chip">
                    {type}: {count}
                  </span>
                ))}
              </div>
            </section>

            <section className="panel-card">
              <PanelTitle title="Server And Client Split" subtitle="Recommended production architecture" />
              <div className="flow-stack">
                {initialData.buildFlow.map(flow => (
                  <article key={flow.title} className="flow-card">
                    <span className="flow-stage">{flow.stage}</span>
                    <h3>{flow.title}</h3>
                    <ul>
                      {flow.points.map(point => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {activeTab === 'offices' ? (
          <div className="office-list">
            {initialData.offices.map(office => (
              <article key={office.id} className="office-card">
                <div className="office-head">
                  <div>
                    <span className="office-type">{office.officeType}</span>
                    <h3>{office.name}</h3>
                  </div>
                  <span className="employee-count">{office.employees} employees</span>
                </div>
                <p className="office-location">{office.location}</p>
                <div className="office-meta">
                  <span>GPS radius: {office.gps.radiusMeters} m</span>
                  <span>{office.workPolicy.schedule}</span>
                  <span>{office.workPolicy.wfhMode}</span>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {activeTab === 'policy' ? (
          <div className="detail-grid">
            <section className="panel-card">
              <PanelTitle title="Admin Controls" subtitle="Per-office policy management" />
              <ul className="bullet-list">
                <li>Assign each employee to a single office record by default.</li>
                <li>Set normal working days, work hours, grace period, and GPS radius per office.</li>
                <li>Enable WFH by recurring day, custom date, or hourly window such as morning-only WFH.</li>
                <li>Allow exception paths for field work, travel, and approved off-site attendance.</li>
                <li>Keep audit logs whenever an admin changes office policy or attendance status.</li>
              </ul>
            </section>

            <section className="panel-card">
              <PanelTitle title="Role Design" subtitle="Access should follow office scope" />
              <div className="role-stack">
                {initialData.roles.map(role => (
                  <article key={role.id} className="role-card">
                    <h3>{role.title}</h3>
                    <p>{role.scope}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {activeTab === 'mobile' ? (
          <div className="detail-grid">
            <section className="panel-card">
              <PanelTitle title="Employee Mobile Cards" subtitle="Primary day-to-day view" />
              <div className="employee-stack">
                {initialData.sampleEmployees.map(employee => (
                  <article key={employee.id} className="employee-card">
                    <div className="employee-top">
                      <div>
                        <h3>{employee.name}</h3>
                        <p>{employee.office}</p>
                      </div>
                      <span className="status-pill">{employee.status}</span>
                    </div>
                    <div className="employee-bottom">
                      <span>{employee.shift}</span>
                      <span>{employee.todayRule}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel-card">
              <PanelTitle title="UX Direction" subtitle="Fast, responsive, mobile first" />
              <ul className="bullet-list">
                <li>Loading shell before camera, GPS, and employee data are ready.</li>
                <li>Idle state with clear next action: clock in, clock out, or check today status.</li>
                <li>Animated confirmation after successful attendance with friendly feedback.</li>
                <li>Compact reusable components for cards, schedule chips, and approval banners.</li>
                <li>Framer Motion is appropriate for restrained page transitions and status changes.</li>
              </ul>
            </section>
          </div>
        ) : null}
      </section>

      <section className="questions-panel" id="questions">
        <PanelTitle title="Questions That Will Define The Real Build" subtitle="I need these from you before full implementation" />
        <ol className="question-list">
          {initialData.nextQuestions.map(question => (
            <li key={question}>{question}</li>
          ))}
        </ol>
      </section>
    </main>
  )
}

function MetricCard({ label, value, detail }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}

function PanelTitle({ title, subtitle }) {
  return (
    <header className="panel-title">
      <span>{title}</span>
      <h2>{subtitle}</h2>
    </header>
  )
}

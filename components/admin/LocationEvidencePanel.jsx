'use client'
import { useState } from 'react'

const number = (v, suffix = '') => typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v * 10) / 10}${suffix}` : 'Unknown'
const seconds = v => typeof v === 'number' && Number.isFinite(v) ? `${(v / 1000).toFixed(1)} s` : 'Unknown'
const connectionName = value => ({ ethernet: 'LAN', wifi: 'Wi-Fi', cellular: 'Mobile data', unknown: 'Unknown' }[value] || value)
export default function LocationEvidencePanel({ evidence }) {
  const [filters, setFilters] = useState({ device: '', os: '', browser: '', connection: '', buildId: '' })
  if (!evidence) return null
  const all = evidence.groups || []
  const groups = all.filter(row => Object.entries(filters).every(([key, value]) => !value || row[key] === value))
  const recent = (evidence.reports || []).filter(row => Object.entries(filters).every(([key, value]) => !value || row[key] === value)).slice(0, 20)
  return <details className="mt-5 border-t border-line pt-3" open>
    <summary className="min-h-11 cursor-pointer py-2 text-base font-semibold text-primary">Location and devices</summary>
    {!evidence.available ? <p className="py-3 text-sm text-secondary">Location reports are unavailable. Attendance is not affected.</p> : <>
      <p className="mt-2 text-sm text-secondary">{evidence.examined} of {evidence.total} received checks reviewed. Kept for 14 days. These are browser observations, not verified attendance outcomes. Closed pages or lost connections can leave checks unreported.</p>
      <p className="mt-2 text-sm text-secondary">Connection is shown only when the browser reports it. Network quality such as “4g” does not identify LAN or Wi-Fi. Accuracy is the device’s estimate, not a measured distance error. Waiting time may include responding to a permission prompt.</p>
      {evidence.truncated && <p role="status" className="mt-2 text-sm text-warning">Incomplete window. Choose a shorter period; comparisons are not ready for review.</p>}
      <div className="my-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries({ device: 'Device', os: 'Operating system', browser: 'Browser', connection: 'Connection', buildId: 'App build' }).map(([key, label]) => <label key={key} className="text-sm text-primary">
          {label}<select aria-label={`Location ${label.toLowerCase()}`} value={filters[key]} onChange={e => setFilters(current => ({ ...current, [key]: e.target.value }))} className="mt-1 block min-h-11 w-full rounded-control border border-line bg-canvas px-3 text-primary">
            <option value="">All</option>{[...new Set(all.map(row => row[key]))].sort().map(value => <option key={value} value={value}>{key === 'connection' ? connectionName(value) : value}</option>)}
          </select>
        </label>)}
      </div>
      {!groups.length ? <p className="py-3 text-sm text-secondary">No location checks match this selection. Reports will appear after employees use the updated scan page.</p> : <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="pb-3 text-left text-secondary">Location startup comparisons. Waits include failed checks; cancelled checks are counted separately. Export JSON includes all groups in the selected period.</caption>
          <thead><tr className="border-b border-line">{['Device and browser', 'Connection', 'Checks / ready', 'Typical / slow wait', 'Reported accuracy', 'Evidence'].map(title => <th key={title} className="px-3 py-3 font-semibold">{title}</th>)}</tr></thead>
          <tbody>{groups.map((row, index) => <tr key={index} className="border-b border-line align-top">
            <td className="px-3 py-3"><div>{row.os} · {row.device}</div><div>{row.browser} {row.browserVersion}</div><details className="mt-2"><summary className="cursor-pointer">Details</summary>
              <p className="mt-2 break-all">Build: {row.buildId}</p><p>Accepted limit: ±{number(row.maxAccuracy, ' m')}</p>
              <p>First reading: {seconds(row.medianFirstReadingMs)}</p><p>Ready checks only: {seconds(row.medianReadyMs)}</p>
              <p>{row.sessions} browser sessions across {row.days} days; not unique devices.</p>
              <p>{row.cancelled} cancelled; {row.missingAccuracy} without accuracy.</p>
              {Object.entries(row.outcomes).filter(([key]) => !['ready', 'cancelled'].includes(key)).map(([key, count]) => <p key={key}>{key.replaceAll('_', ' ')}: {count}</p>)}
            </details></td>
            <td className="px-3 py-3">{connectionName(row.connection)}<div className="text-xs text-muted">{row.connection === 'unknown' ? 'Not exposed by browser' : 'Browser reported'}</div></td>
            <td className="px-3 py-3">{row.completed} / {row.ready}<div>{row.readyRate == null ? 'Unknown' : `${Math.round(row.readyRate * 100)}% ready`}</div></td>
            <td className="px-3 py-3">{seconds(row.medianWaitMs)} / {seconds(row.slowWaitMs)}</td>
            <td className="px-3 py-3">{row.medianAccuracy == null ? 'Unknown' : `±${number(row.medianAccuracy, ' m')}`}</td>
            <td className="px-3 py-3">{row.evidenceStatus}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      <p className="mt-3 text-xs leading-5 text-muted">Ready for review requires 30 completed checks, 3 days and 5 browser sessions per group with a known build. It does not prove one browser is better: equipment and conditions can differ. Compare the same operating system, build and location rules before giving browser advice.</p>
      <p className="mt-2 text-xs text-muted">Export includes up to 500 recent check details, including reading age, retries and available network estimates. {evidence.detailTruncated ? 'Detail limit reached; summary covers the reviewed checks above.' : ''}</p>
      <details className="mt-4 border-t border-line py-3">
        <summary className="min-h-11 cursor-pointer text-sm font-semibold text-primary">Recent location checks ({recent.length} shown)</summary>
        <ul className="divide-y divide-line text-sm text-secondary">{recent.map(row => <li key={row.id} className="py-3">
          <p className="font-medium text-primary">{new Date(row.receivedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} · {row.os} · {row.browser} {row.browserVersion}</p>
          <p>{row.reason.replaceAll('_', ' ')} · Wait {seconds(row.elapsedMs)} · First accuracy {number(row.metrics?.firstAccuracy, ' m')} · Best accuracy {number(row.metrics?.bestAccuracy, ' m')}</p>
          <p>First reading {seconds(row.metrics?.firstReadingMs)} · Within accuracy limit {seconds(row.metrics?.acceptedMs)} · Reading age {seconds(row.metrics?.readingAgeMs)} · Attempt {number(row.metrics?.attempt)} · {connectionName(row.connection)}</p>
          <p>Permission observed: {row.permission} · Network estimate: {row.networkQuality} · Reported delay: {number(row.metrics?.rtt, ' ms')} · Reported speed: {number(row.metrics?.downlink, ' Mbps')}</p>
        </li>)}</ul>
        {!recent.length && <p className="text-sm text-secondary">No recent details match these filters.</p>}
      </details>
    </>}
  </details>
}

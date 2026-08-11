'use client'

const BLANK = '\u00a0'

function NameSlot({ value, label }) {
  return (
    <div className="form48-name-slot">
      <div className="form48-name-value">{value || BLANK}</div>
      <div className="form48-name-label">{label}</div>
    </div>
  )
}

function DetailRow({ label, children, small }) {
  return (
    <div className="form48-detail-row">
      <div className="form48-detail-label">
        {label}
        {small ? <span className="form48-detail-small"> {small}</span> : null}
      </div>
      <div className="form48-detail-colon">:</div>
      <div className="form48-detail-value">{children || BLANK}</div>
    </div>
  )
}

function hasTimes(row) {
  return Boolean(row?.amIn || row?.amOut || row?.pmIn || row?.pmOut)
}

function renderTime(value, row) {
  if (!row?.isActive) return BLANK
  return value || BLANK
}

function DtrTimeRow({ row }) {
  const weekendLabel = row?.inMonth && row?.isWeekend && !hasTimes(row) ? row.dayOfWeek : ''

  if (weekendLabel) {
    return (
      <tr>
        <td className="form48-day-cell">{row.day}</td>
        <td className="form48-weekend-cell" colSpan={2}>{weekendLabel}</td>
        <td className="form48-weekend-cell" colSpan={2}>{weekendLabel}</td>
        <td className="form48-weekend-cell" colSpan={2}>{weekendLabel}</td>
      </tr>
    )
  }

  return (
    <tr className={row?.specialColor ? `form48-special-${row.specialColor}` : row?.isAbsent ? 'form48-special-absent' : ''}>
      <td className="form48-day-cell">{row?.inMonth ? <><span>{row.day}</span>{row.specialLabel ? <small>{row.specialLabel}</small> : row.isAbsent ? <small>ABSENT</small> : null}</> : BLANK}</td>
      {row?.specialCode === 'CTO' ? <>
        <td className="form48-time-cell form48-cto-arrival">CTO</td>
        <td className="form48-time-cell">{BLANK}</td>
        <td className="form48-time-cell">{BLANK}</td>
        <td className="form48-time-cell">{BLANK}</td>
        <td className="form48-time-cell">{BLANK}</td>
        <td className="form48-time-cell">{BLANK}</td>
      </> : row?.specialCode || row?.isAbsent ? <>
        <td className="form48-time-cell form48-special-cell">{row.specialCode || (row.isAbsent ? 'ABSENT' : BLANK)}</td>
        <td className="form48-time-cell">{BLANK}</td>
        <td className="form48-time-cell">{BLANK}</td>
        <td className="form48-time-cell">{BLANK}</td>
        <td className="form48-time-cell">{BLANK}</td>
        <td className="form48-time-cell">{BLANK}</td>
      </> : <>
        <td className="form48-time-cell">{renderTime(row?.amIn, row)}</td>
        <td className="form48-time-cell">{renderTime(row?.amOut, row)}</td>
        <td className="form48-time-cell">{renderTime(row?.pmIn, row)}</td>
        <td className="form48-time-cell">{renderTime(row?.pmOut, row)}</td>
        <td className="form48-time-cell">{row?.undertimeHours ?? BLANK}</td>
        <td className="form48-time-cell">{row?.undertimeMinutes ?? BLANK}</td>
      </>}
    </tr>
  )
}

function DtrTimeTable({ rows }) {
  return (
    <table className="form48-time-table" aria-label="Daily time record entries">
      <colgroup>
        <col className="form48-col-day" />
        <col className="form48-col-time" />
        <col className="form48-col-time" />
        <col className="form48-col-time" />
        <col className="form48-col-time" />
        <col className="form48-col-undertime" />
        <col className="form48-col-undertime" />
      </colgroup>
      <thead>
        <tr>
          <th className="form48-day-header" rowSpan={2}>Days</th>
          <th className="form48-time-header" colSpan={2}>AM</th>
          <th className="form48-time-header" colSpan={2}>PM</th>
          <th className="form48-time-header" colSpan={2}>Under time</th>
        </tr>
        <tr>
          <th className="form48-time-subheader">Arrival</th>
          <th className="form48-time-subheader">Departure</th>
          <th className="form48-time-subheader">Arrival</th>
          <th className="form48-time-subheader">Departure</th>
          <th className="form48-time-subheader">Hour(s)</th>
          <th className="form48-time-subheader">Min.(s)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <DtrTimeRow key={row.dateKey} row={row} />
        ))}
      </tbody>
    </table>
  )
}

function DtrCopy({ dtr }) {
  const rows = dtr?.rows || []
  const employee = dtr?.employee || {}
  const nameParts = employee.nameParts || {}
  const periodLabel = dtr?.period?.periodLabel || ''
  const officialHours = dtr?.officialHours || {}
  const employeeName = String(employee.name || '').trim().toUpperCase()
  const signatoryName = String(dtr?.signatory?.name || '').trim().toUpperCase()
  const signatoryPosition = String(dtr?.signatory?.position || '').trim()

  return (
    <section className="form48-copy">
      <div className="form48-code">CIVIL SERVICE COMMISSION FORM NO. 48</div>
      <h1 className="form48-title">DAILY&nbsp; TIME&nbsp; RECORD</h1>

      <div className="form48-full-name">Name: <span>{employeeName || BLANK}</span></div>

      <div className="form48-details">
        <DetailRow label="For the month of">{periodLabel}</DetailRow>
        <DetailRow label="Official hours for" small="Regular Days">{officialHours.regularDays || 'Monday- Friday'}</DetailRow>
        <DetailRow label="Arrival / Departure">{officialHours.arrivalDeparture || '8:00-12:00 to 1:00-5:00'}</DetailRow>
      </div>

      <DtrTimeTable rows={rows} />

      <div className="form48-certification">
        <p>I hereby CERTIFY on my honor that the above is true and correct report of the hours</p>
        <p>performed. Records of which was made daily at the time of arrival and departure from office</p>
      </div>

      <div className="form48-signature-space">
        <div className="form48-employee-name">{employeeName || 'Name of Employee'}</div>
        <div className="form48-signature-label">Signature of Employee</div>
      </div>

      <div className="form48-verified">Verified as to prescribed office hours:</div>

      <div className="form48-head-block">
        <div className="form48-head-name">{signatoryName || 'Name of Head of Office'}</div>
        <div className="form48-head-position">{signatoryPosition || 'Position of Head of Office'}</div>
      </div>
    </section>
  )
}

function SingleEmployeeDtrPage({ dtr, isFirst }) {
  return (
    <div className={`form48-page ${!isFirst ? 'print:break-before-page' : ''}`}>
      <div className="form48-page-grid">
        <DtrCopy dtr={dtr} />
        <div aria-hidden="true" />
        <DtrCopy dtr={dtr} />
      </div>
    </div>
  )
}

export function Form48Renderer({ dtr }) {
  if (!dtr) {
    return <div className="flex items-center justify-center p-8 text-sm text-muted">No DTR data available.</div>
  }

  return (
    <div className="form48-container bg-white">
      <SingleEmployeeDtrPage dtr={dtr} isFirst />
      <PrintStyles />
    </div>
  )
}

export function MassDtrRenderer({ employees }) {
  if (!employees || employees.length === 0) {
    return <div className="flex items-center justify-center p-8 text-sm text-muted">No DTR data to display.</div>
  }

  return (
    <div className="form48-container bg-white">
      {employees.map((dtr, index) => (
        <SingleEmployeeDtrPage
          key={`${dtr.employee?.employeeId || 'employee'}-${index}`}
          dtr={dtr}
          isFirst={index === 0}
        />
      ))}
      <PrintStyles />
    </div>
  )
}

function PrintStyles() {
  return (
    <style jsx global>{`
      .form48-container {
        background: #ffffff;
      }

      .form48-page {
        box-sizing: border-box;
        width: 8.27in;
        height: 11.69in;
        margin: 0 auto;
        padding: 0.34in 0.24in;
        background: #ffffff;
        color: #000000;
      }

      .form48-page-grid {
        display: grid;
        grid-template-columns: 3.72in 0.19in 3.72in;
        justify-content: center;
        height: 100%;
      }

      .form48-copy {
        box-sizing: border-box;
        display: flex;
        min-width: 0;
        height: 100%;
        flex-direction: column;
        border: 2px solid #000000;
        padding: 0.16in 0.12in 0.13in;
        font-family: Arial, sans-serif;
        color: #000000;
      }

      .form48-code {
        min-height: 0.27in;
        font-size: 10pt;
        line-height: 1.1;
      }

      .form48-title {
        margin: 0.2in 0 0;
        text-align: center;
        font-family: Algerian, "Arial Black", Arial, sans-serif;
        font-size: 16pt;
        font-weight: 700;
        letter-spacing: 0;
        line-height: 1;
      }

      .form48-name-grid {
        display: grid;
        grid-template-columns: 1.04fr 1.36fr 0.62fr;
        column-gap: 0.12in;
        margin-top: 0.45in;
      }

      .form48-name-value {
        min-height: 0.18in;
        border-bottom: 1.5px solid #000000;
        text-align: center;
        font-size: 9pt;
        font-weight: 700;
        line-height: 1.2;
        text-transform: uppercase;
      }

      .form48-name-label {
        padding-top: 0.04in;
        text-align: center;
        font-size: 10pt;
        line-height: 1;
      }

      .form48-details {
        margin-top: 0.22in;
      }

      .form48-detail-row {
        display: grid;
        grid-template-columns: 1.31in 0.09in minmax(0, 1fr);
        align-items: baseline;
        min-height: 0.18in;
        font-size: 10pt;
        line-height: 1.05;
      }

      .form48-detail-label {
        white-space: nowrap;
      }

      .form48-detail-small {
        font-size: 7pt;
      }

      .form48-detail-colon {
        text-align: center;
        font-weight: 700;
      }

      .form48-detail-value {
        overflow: hidden;
        font-size: 10pt;
        font-weight: 700;
        line-height: 1.05;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .form48-time-table {
        width: 100%;
        margin-top: 0.24in;
        table-layout: fixed;
        border-collapse: collapse;
        font-size: 9pt;
        line-height: 1;
      }

      .form48-col-day {
        width: 11%;
      }

      .form48-col-time {
        width: 14.5%;
      }
      .form48-col-undertime {
        width: 15.5%;
      }

      .form48-day-header,
      .form48-time-header {
        height: 0.18in;
        padding: 0;
        text-align: center;
        font-weight: 400;
        line-height: 1;
      }

      .form48-time-header {
        border-bottom: 1.5px solid #000000;
        font-size: 11pt;
      }

      .form48-day-header {
        font-size: 8pt;
      }

      .form48-day-cell,
      .form48-time-cell,
      .form48-weekend-cell {
        height: 0.178in;
        padding: 0;
        text-align: center;
        vertical-align: middle;
      }

      .form48-day-cell {
        font-size: 9pt;
        font-weight: 700;
      }
      .form48-time-subheader {
        height: 0.16in;
        padding: 0;
        border-bottom: 1.5px solid #000000;
        font-size: 6.4pt;
        font-weight: 400;
        line-height: 1;
      }
      .form48-full-name { margin-top: 0.45in; font-size: 10pt; }
      .form48-full-name span { display: inline-block; min-width: 2.5in; border-bottom: 1.5px solid #000; text-align: center; font-weight: 700; }
      .form48-day-cell small { display: block; font-size: 5pt; font-weight: 400; line-height: 1; }
      .form48-special-cell { border-bottom: 1.5px solid #000; text-align: center; font-size: 8pt; font-weight: 700; }
      .form48-cto-arrival { background: #fef3c7; font-weight: 700; }
      .form48-special-ob { background: #bbf7d0; }
      .form48-special-absent { background: #fecaca; }
      .form48-special-wl { background: #bfdbfe; }
      .form48-special-vl { background: #fff; }
      .form48-special-cto { background: #fef3c7; }
      .form48-special-sl { background: #e0e7ff; }
      .form48-special-holiday { background: #f3f4f6; }

      .form48-time-cell,
      .form48-weekend-cell {
        border-bottom: 1.5px solid #000000;
      }

      .form48-time-cell {
        font-size: 8.5pt;
      }

      .form48-weekend-cell {
        font-size: 11pt;
        font-style: italic;
        font-weight: 700;
      }

      .form48-certification {
        margin-top: 0.19in;
        text-align: center;
        font-size: 6.5pt;
        line-height: 1.45;
      }

      .form48-certification p {
        margin: 0;
      }

      .form48-signature-space {
        display: flex;
        min-height: 1.55in;
        flex-direction: column;
        justify-content: flex-end;
        text-align: center;
      }

      .form48-employee-name {
        font-size: 11pt;
        font-weight: 700;
        line-height: 1.1;
      }

      .form48-signature-label {
        margin-top: 0.55in;
        font-size: 9pt;
        font-style: italic;
        line-height: 1.1;
      }

      .form48-verified {
        margin-top: 0.22in;
        padding-left: 0.72in;
        font-size: 8.5pt;
        line-height: 1.1;
      }

      .form48-head-block {
        margin-top: auto;
        text-align: center;
      }

      .form48-head-name {
        font-size: 11pt;
        font-weight: 700;
        line-height: 1.15;
      }

      .form48-head-position {
        margin-top: 0.06in;
        font-size: 9pt;
        font-style: italic;
        line-height: 1.1;
      }

      @media print {
        body * { visibility: hidden !important; }
        .form48-container, .form48-container * { visibility: visible !important; }
        .form48-container {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
        }
        .form48-page {
          box-shadow: none !important;
          page-break-inside: avoid;
        }
        .form48-page, .form48-page * {
          color: #000 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .print\\:break-before-page { break-before: page; }
        @page {
          size: A4 portrait;
          margin: 0;
        }
      }
    `}</style>
  )
}

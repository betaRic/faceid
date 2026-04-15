'use client'

const OFFICIAL_HOURS = {
  amArrival: '08:00',
  pmArrival: '01:00',
  amDeparture: '12:00',
  pmDeparture: '05:00',
}

function SignatureBlock({ name, subtitle, extraTopSpace = false }) {
  return (
    <div className={`text-center ${extraTopSpace ? 'pt-[8px]' : ''}`}>
      <div className="mx-auto w-[68%] border-b border-black" />
      <div className="pt-[3px] text-[8px] font-bold uppercase leading-[1.15]">{name || '\u00a0'}</div>
      <div className="pt-[2px] text-[8px] leading-[1.15]">{subtitle}</div>
    </div>
  )
}

function HeaderField({ label, value, lineWidth }) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-end gap-x-[4px] text-[7pt] leading-[1.05]">
      <span className="font-bold">{label}</span>
      <span
        className="inline-flex min-h-[13px] items-end border-b border-black px-[3px] pb-[2px] font-bold uppercase"
        style={{ width: lineWidth }}
      >
        {value || '\u00a0'}
      </span>
    </div>
  )
}

function OfficialHoursBlock() {
  return (
    <table className="mt-[6px] w-full table-fixed border-collapse text-[6.8pt] leading-[1.05]">
      <colgroup>
        <col className="w-[34%]" />
        <col className="w-[19%]" />
        <col className="w-[19%]" />
        <col className="w-[28%]" />
      </colgroup>
      <tbody>
        <tr>
          <td className="border border-black px-[3px] py-[2px] align-middle" rowSpan={2}>Official hours for</td>
          <td className="border border-black px-[3px] py-[2px] text-center font-bold">AM</td>
          <td className="border border-black px-[3px] py-[2px] text-center font-bold">PM</td>
          <td className="border border-black px-[3px] py-[2px] text-center font-bold" rowSpan={2}>Regular Days</td>
        </tr>
        <tr>
          <td className="border border-black px-[3px] py-[2px]">
            <div className="flex items-center justify-between gap-[4px]">
              <span className="font-bold">Arrival</span>
              <span className="font-bold">{OFFICIAL_HOURS.amArrival}</span>
            </div>
            <div className="mt-[2px] flex items-center justify-between gap-[4px]">
              <span className="font-bold">Departure</span>
              <span className="font-bold">{OFFICIAL_HOURS.amDeparture}</span>
            </div>
          </td>
          <td className="border border-black px-[3px] py-[2px]">
            <div className="flex items-center justify-center font-bold">{OFFICIAL_HOURS.pmArrival}</div>
            <div className="mt-[2px] flex items-center justify-center font-bold">{OFFICIAL_HOURS.pmDeparture}</div>
          </td>
        </tr>
      </tbody>
    </table>
  )
}

function DtrTable({ rows, summary }) {
  return (
    <table className="mt-[2px] w-full table-fixed border-collapse text-[6.8pt] leading-[1]">
      <colgroup>
        <col className="w-[12%]" />
        <col className="w-[17%]" />
        <col className="w-[17%]" />
        <col className="w-[17%]" />
        <col className="w-[17%]" />
        <col className="w-[10%]" />
        <col className="w-[10%]" />
      </colgroup>
      <thead>
        <tr>
          <th rowSpan={2} className="border border-black px-[2px] py-[4px] text-center font-bold align-middle">Day</th>
          <th colSpan={2} className="border border-black px-[2px] py-[2px] text-center font-bold">AM</th>
          <th colSpan={2} className="border border-black px-[2px] py-[2px] text-center font-bold">PM</th>
          <th colSpan={2} className="border border-black px-[2px] py-[2px] text-center font-bold">Undertime</th>
        </tr>
        <tr>
          <th className="border border-black px-[2px] py-[3px] text-center font-bold">Arrival</th>
          <th className="border border-black px-[2px] py-[3px] text-center font-bold">Depart.</th>
          <th className="border border-black px-[2px] py-[3px] text-center font-bold">Arrival</th>
          <th className="border border-black px-[2px] py-[3px] text-center font-bold">Depart.</th>
          <th className="border border-black px-[2px] py-[3px] text-center font-bold">Hour(s)</th>
          <th className="border border-black px-[2px] py-[3px] text-center font-bold">Min.(s)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.dateKey}>
            <td className="border border-black px-[2px] py-[4px] text-center align-middle">{row.inMonth ? row.day : ''}</td>
            <td className="border border-black px-[2px] py-[4px] text-center align-middle">{renderTimeCell(row.amIn, row)}</td>
            <td className="border border-black px-[2px] py-[4px] text-center align-middle">{row.amOut || '\u00a0'}</td>
            <td className="border border-black px-[2px] py-[4px] text-center align-middle">{row.pmIn || '\u00a0'}</td>
            <td className="border border-black px-[2px] py-[4px] text-center align-middle">{row.pmOut || '\u00a0'}</td>
            <td className="border border-black px-[2px] py-[4px] text-center align-middle">
              {row.undertimeHours !== '' ? row.undertimeHours : '\u00a0'}
            </td>
            <td className="border border-black px-[2px] py-[4px] text-center align-middle">
              {row.undertimeMinutes !== '' ? row.undertimeMinutes : '\u00a0'}
            </td>
          </tr>
        ))}
        <tr>
          <td className="border border-black px-[2px] py-[4px] text-center">&nbsp;</td>
          <td colSpan={4} className="border border-black px-[2px] py-[4px] text-center font-bold">TOTAL</td>
          <td className="border border-black px-[2px] py-[4px] text-center">
            {summary?.undertime ? Math.floor(summary.undertime / 60) : '\u00a0'}
          </td>
          <td className="border border-black px-[2px] py-[4px] text-center">
            {summary?.undertime ? summary.undertime % 60 : '\u00a0'}
          </td>
        </tr>
      </tbody>
    </table>
  )
}

function renderTimeCell(value, row) {
  if (value) return value
  if (row?.isWeekend && row?.isActive) return row.dayOfWeek
  return '\u00a0'
}

function DtrCopy({ dtr }) {
  const rows = dtr?.rows || []
  const summary = dtr?.summary || {}
  const name = dtr?.employee?.name || ''
  const periodLabel = dtr?.period?.periodLabel || ''

  return (
    <section
      className="flex min-h-[9.72in] flex-col bg-white px-[1px] pt-[1px] text-black"
      style={{ fontFamily: 'Arial, sans-serif' }}
    >
      <div className="text-center leading-[1.15]">
        <div className="text-[7pt] font-bold uppercase">CIVIL SERVICE COMMISSION FORM NO. 48</div>
        <div className="pt-[2px] text-[8.5pt] font-bold uppercase">DAILY TIME RECORD</div>
      </div>

      <div className="mt-[12px] space-y-[5px]">
        <HeaderField label="Name:" value={name} lineWidth="72%" />
        <HeaderField label="For the month of:" value={periodLabel} lineWidth="54%" />
      </div>

      <OfficialHoursBlock />
      <DtrTable rows={rows} summary={summary} />

      <div className="flex-1 min-h-[18px]" />

      <div className="min-h-[38px] border border-transparent px-[1px] pt-[2px] text-[7pt] italic leading-[1.35]">
        <div>I certify on my honor that the above is the true and correct report of the hours of work I performed.</div>
        <div>Record of which was made daily at the time of arrival and departure from the office.</div>
      </div>

      <div className="h-[10px]" />
      <SignatureBlock name={name} subtitle="Name & Signature of Employee" />

      <div className="pt-[12px] text-center text-[7pt] italic leading-[1.15]">Validated as to the prescribed official hours.</div>

      <div className="h-[12px]" />
      <SignatureBlock name="MARIA THERESA D. BAUTISTA" subtitle="City Director/LGOO VII" />
    </section>
  )
}

function SingleEmployeeDtrPage({ dtr, isFirst }) {
  return (
    <div
      className={`form48-page mx-auto box-border h-[11.69in] w-[8.27in] bg-white ${!isFirst ? 'print:break-before-page' : ''}`}
      style={{ padding: '0.75in 0.25in', boxSizing: 'border-box' }}
    >
      <div className="grid h-full grid-cols-[3.58in_0.21in_3.58in] items-start justify-center">
        <DtrCopy dtr={dtr} />
        <div />
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
          box-sizing: border-box;
          page-break-inside: avoid;
          box-shadow: none !important;
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

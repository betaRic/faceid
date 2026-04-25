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
      <div className="pt-[3px] text-[8pt] font-bold uppercase leading-[1.2]">{name || ' '}</div>
      <div className="pt-[2px] text-[8pt] leading-[1.2]">{subtitle || ' '}</div>
    </div>
  )
}

function HeaderField({ label, value, lineWidth }) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-end gap-x-[4px] text-[7.5pt] leading-[1.2]">
      <span className="font-bold">{label}</span>
      <span
        className="inline-flex min-h-[14px] items-end border-b border-black px-[3px] pb-[2px] font-bold uppercase"
        style={{ width: lineWidth }}
      >
        {value || ' '}
      </span>
    </div>
  )
}

function OfficialHoursBlock() {
  return (
    <table className="mt-[6px] w-full table-fixed border-collapse text-[7pt] leading-[1.2]">
      <colgroup>
        <col className="w-[34%]" />
        <col className="w-[19%]" />
        <col className="w-[19%]" />
        <col className="w-[28%]" />
      </colgroup>
      <tbody>
        <tr>
          <td className="border border-black px-[3px] py-[3px] align-middle" rowSpan={2}>
            <span className="block leading-[1.2]">Official hours for</span>
          </td>
          <td className="border border-black px-[3px] py-[3px] text-center font-bold leading-[1.2]">AM</td>
          <td className="border border-black px-[3px] py-[3px] text-center font-bold leading-[1.2]">PM</td>
          <td className="border border-black px-[3px] py-[3px] text-center font-bold align-middle leading-[1.2]" rowSpan={2}>
            Regular Days
          </td>
        </tr>
        <tr>
          <td className="border border-black px-[3px] py-[3px]">
            <div className="flex items-center justify-between gap-[4px] leading-[1.2]">
              <span className="font-bold">Arrival</span>
              <span className="font-bold">{OFFICIAL_HOURS.amArrival}</span>
            </div>
            <div className="mt-[2px] flex items-center justify-between gap-[4px] leading-[1.2]">
              <span className="font-bold">Departure</span>
              <span className="font-bold">{OFFICIAL_HOURS.amDeparture}</span>
            </div>
          </td>
          <td className="border border-black px-[3px] py-[3px]">
            <div className="flex items-center justify-center font-bold leading-[1.2]">{OFFICIAL_HOURS.pmArrival}</div>
            <div className="mt-[2px] flex items-center justify-center font-bold leading-[1.2]">{OFFICIAL_HOURS.pmDeparture}</div>
          </td>
        </tr>
      </tbody>
    </table>
  )
}

function DtrTable({ rows, summary }) {
  return (
    <table className="mt-[3px] w-full table-fixed border-collapse text-[7pt] leading-[1.2]">
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
          <th rowSpan={2} className="border border-black px-[2px] py-[3px] text-center font-bold align-middle leading-[1.2]">Day</th>
          <th colSpan={2} className="border border-black px-[2px] py-[3px] text-center font-bold leading-[1.2]">AM</th>
          <th colSpan={2} className="border border-black px-[2px] py-[3px] text-center font-bold leading-[1.2]">PM</th>
          <th colSpan={2} className="border border-black px-[2px] py-[3px] text-center font-bold leading-[1.2]">Undertime</th>
        </tr>
        <tr>
          <th className="border border-black px-[2px] py-[3px] text-center font-bold leading-[1.2]">Arrival</th>
          <th className="border border-black px-[2px] py-[3px] text-center font-bold leading-[1.2]">Depart.</th>
          <th className="border border-black px-[2px] py-[3px] text-center font-bold leading-[1.2]">Arrival</th>
          <th className="border border-black px-[2px] py-[3px] text-center font-bold leading-[1.2]">Depart.</th>
          <th className="border border-black px-[2px] py-[3px] text-center font-bold leading-[1.2]">Hour(s)</th>
          <th className="border border-black px-[2px] py-[3px] text-center font-bold leading-[1.2]">Mins.</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.dateKey}>
            <td className="border border-black px-[2px] py-[3px] text-center align-middle leading-[1.2]">{row.isActive ? row.day : ''}</td>
            <td className="border border-black px-[2px] py-[3px] text-center align-middle leading-[1.2]">{renderTimeCell(row.amIn, row)}</td>
            <td className="border border-black px-[2px] py-[3px] text-center align-middle leading-[1.2]">{row.amOut || ' '}</td>
            <td className="border border-black px-[2px] py-[3px] text-center align-middle leading-[1.2]">{row.pmIn || ' '}</td>
            <td className="border border-black px-[2px] py-[3px] text-center align-middle leading-[1.2]">{row.pmOut || ' '}</td>
            <td className="border border-black px-[2px] py-[3px] text-center align-middle leading-[1.2]">
              {row.undertimeHours !== '' ? row.undertimeHours : ' '}
            </td>
            <td className="border border-black px-[2px] py-[3px] text-center align-middle leading-[1.2]">
              {row.undertimeMinutes !== '' ? row.undertimeMinutes : ' '}
            </td>
          </tr>
        ))}
        <tr>
          <td className="border border-black px-[2px] py-[3px] text-center leading-[1.2]">&nbsp;</td>
          <td colSpan={4} className="border border-black px-[2px] py-[3px] text-center font-bold leading-[1.2]">TOTAL</td>
          <td className="border border-black px-[2px] py-[3px] text-center leading-[1.2]">
            {summary?.undertime ? Math.floor(summary.undertime / 60) : ' '}
          </td>
          <td className="border border-black px-[2px] py-[3px] text-center leading-[1.2]">
            {summary?.undertime ? summary.undertime % 60 : ' '}
          </td>
        </tr>
      </tbody>
    </table>
  )
}

function renderTimeCell(value, row) {
  if (value) return value
  if (row?.isWeekend && row?.isActive) return row.dayOfWeek
  return ' '
}

function DtrCopy({ dtr }) {
  const rows = dtr?.rows || []
  const summary = dtr?.summary || {}
  const name = dtr?.employee?.name || ''
  const position = dtr?.employee?.position || ''
  const periodLabel = dtr?.period?.periodLabel || ''
  const signatoryName = dtr?.signatory?.name || ''
  const signatoryPosition = dtr?.signatory?.position || ''

  return (
    <section
      className="flex min-h-[9.72in] flex-col bg-white px-[1px] pt-[1px] text-black"
      style={{ fontFamily: 'Arial, sans-serif' }}
    >
      <div className="text-center leading-[1.2]">
        <div className="text-[7.5pt] font-bold uppercase">CIVIL SERVICE COMMISSION FORM NO. 48</div>
        <div className="pt-[2px] text-[9pt] font-bold uppercase">DAILY TIME RECORD</div>
      </div>

      <div className="mt-[12px] space-y-[5px]">
        <HeaderField label="Name:" value={name} lineWidth="72%" />
        <HeaderField label="Position:" value={position} lineWidth="72%" />
        <HeaderField label="For the month of:" value={periodLabel} lineWidth="54%" />
      </div>

      <OfficialHoursBlock />
      <DtrTable rows={rows} summary={summary} />

      <div className="mt-auto flex flex-col">
        <div className="px-[1px] pt-[10px] text-[7.5pt] italic leading-[1.35]">
          <div>I certify on my honor that the above is the true and correct report of the hours of work I performed.</div>
          <div>Record of which was made daily at the time of arrival and departure from the office.</div>
        </div>

        <div className="h-[10px]" />
        <SignatureBlock name={name} subtitle="Name & Signature of Employee" />

        <div className="pt-[12px] text-center text-[7.5pt] italic leading-[1.2]">Validated as to the prescribed official hours.</div>

        <div className="h-[12px]" />
        <SignatureBlock name={signatoryName} subtitle={signatoryPosition} />
      </div>
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

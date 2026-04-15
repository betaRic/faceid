'use client'

function RawAttendancePage({ dtr, isFirst }) {
  const rows = (dtr?.rows || []).filter((row) => row.inMonth && row.isActive)

  return (
    <div
      className={`raw-attendance-page mx-auto box-border bg-white ${!isFirst ? 'print:break-before-page' : ''}`}
      style={{ fontFamily: 'Arial, sans-serif', boxSizing: 'border-box' }}
    >
      <div className="raw-attendance-sheet mx-auto flex flex-col text-black">
        <div className="border-b border-black pb-[10px] text-center">
          <div className="text-[12pt] font-bold uppercase tracking-[0.06em]">Raw Attendance Log</div>
          <div className="mt-[6px] text-[9pt]">
            <span className="font-bold">Name:</span> {dtr?.employee?.name || '\u00a0'}
          </div>
          <div className="mt-[2px] text-[9pt]">
            <span className="font-bold">Employee ID:</span> {dtr?.employee?.employeeId || '\u00a0'}
            <span className="mx-[14px] text-black/50">|</span>
            <span className="font-bold">Office:</span> {dtr?.employee?.office || '\u00a0'}
          </div>
          <div className="mt-[2px] text-[9pt]">
            <span className="font-bold">Period:</span> {dtr?.period?.periodLabel || '\u00a0'}
          </div>
        </div>

        <table className="mt-[14px] w-full table-fixed border-collapse text-[9pt]">
          <colgroup>
            <col className="w-[36%]" />
            <col className="w-[16%]" />
            <col className="w-[16%]" />
            <col className="w-[16%]" />
            <col className="w-[16%]" />
          </colgroup>
          <thead>
            <tr>
              <th className="border border-black px-[6px] py-[7px] text-left font-bold">DATE</th>
              <th className="border border-black px-[6px] py-[7px] text-center font-bold">AM IN</th>
              <th className="border border-black px-[6px] py-[7px] text-center font-bold">AM OUT</th>
              <th className="border border-black px-[6px] py-[7px] text-center font-bold">PM IN</th>
              <th className="border border-black px-[6px] py-[7px] text-center font-bold">PM OUT</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="border border-black px-[6px] py-[12px] text-center" colSpan={5}>No raw attendance records.</td>
              </tr>
            ) : rows.map((row) => (
              <tr key={row.dateKey}>
                <td className="border border-black px-[6px] py-[5px]">{row.dateKey || '\u00a0'}</td>
                <td className="border border-black px-[6px] py-[5px] text-center">{row.amIn || '\u00a0'}</td>
                <td className="border border-black px-[6px] py-[5px] text-center">{row.amOut || '\u00a0'}</td>
                <td className="border border-black px-[6px] py-[5px] text-center">{row.pmIn || '\u00a0'}</td>
                <td className="border border-black px-[6px] py-[5px] text-center">{row.pmOut || '\u00a0'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function RawAttendanceRenderer({ dtr }) {
  if (!dtr) {
    return <div className="flex items-center justify-center p-8 text-sm text-muted">No raw attendance data available.</div>
  }

  return (
    <div className="form48-container bg-white">
      <RawAttendancePage dtr={dtr} isFirst />
      <PrintStyles />
    </div>
  )
}

export function MassRawAttendanceRenderer({ employees }) {
  if (!employees || employees.length === 0) {
    return <div className="flex items-center justify-center p-8 text-sm text-muted">No raw attendance data to display.</div>
  }

  return (
    <div className="form48-container bg-white">
      {employees.map((dtr, index) => (
        <RawAttendancePage
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
      .raw-attendance-page {
        box-sizing: border-box;
        width: 8.27in;
        min-height: 11.69in;
        padding: 0.45in 0.5in;
      }

      .raw-attendance-sheet {
        width: 100%;
        max-width: 6.95in;
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
        .raw-attendance-page {
          box-sizing: border-box;
          width: 8.27in;
          min-height: 11.69in;
          page-break-inside: avoid;
          box-shadow: none !important;
          padding: 0.45in 0.5in;
        }
        .raw-attendance-sheet {
          max-width: 6.95in;
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

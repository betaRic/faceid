import { MassDtrRenderer } from '@/components/hr/Form48Dtr'
import { MassRawAttendanceRenderer } from '@/components/hr/RawAttendancePdf'
import { DTR_MONTH_NAMES } from '@/lib/dtr'

export default function DtrPreviewView({
  downloadKind,
  dtrEmployees,
  dtrMonth,
  dtrYear,
  pdfDownloading,
  totalRawRows,
  onBack,
  onClose,
  onDownloadAgain,
}) {
  return (
    <div className="print:contents">
      <div className="flex items-center justify-between border-b border-black/5 px-6 py-4 print:hidden">
        <div>
          <h3 className="font-display text-lg font-bold text-ink">
            {downloadKind === 'raw' ? 'Raw Attendance PDF Generated' : 'DTR Generated'}
          </h3>
          <p className="text-xs text-muted">{dtrEmployees.length} employee(s) — {DTR_MONTH_NAMES[dtrMonth - 1]} {dtrYear}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-xl border border-navy px-4 py-2 text-sm font-semibold text-navy transition hover:bg-navy/5 disabled:opacity-50"
            disabled={pdfDownloading}
            onClick={onDownloadAgain}
            type="button"
          >
            {pdfDownloading ? 'Downloading...' : 'Download Again'}
          </button>
          <button
            className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-stone-100"
            onClick={onBack}
            type="button"
          >
            Back
          </button>
          <button
            className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-stone-100"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
      </div>

      <div className="max-h-[70vh] overflow-auto print:max-h-none print:overflow-visible">
        {downloadKind === 'raw' ? (
          <div className="p-6 print:hidden">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-black/5 bg-stone-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Employees</div>
                <div className="mt-2 text-3xl font-bold text-ink">{dtrEmployees.length}</div>
              </div>
              <div className="rounded-2xl border border-black/5 bg-stone-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Covered Days</div>
                <div className="mt-2 text-3xl font-bold text-ink">{totalRawRows}</div>
              </div>
              <div className="rounded-2xl border border-black/5 bg-stone-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Document Type</div>
                <div className="mt-2 text-lg font-bold text-ink">Raw Time In/Out</div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-black/5 bg-white">
              <div className="border-b border-black/5 px-5 py-4">
                <h4 className="text-sm font-semibold text-ink">Included Employees</h4>
                <p className="mt-1 text-xs text-muted">
                  The PDF is ready. This preview keeps the modal readable and shows who is included instead of rendering the full raw sheet.
                </p>
              </div>
              <div className="divide-y divide-black/5">
                {dtrEmployees.map((dtr, index) => {
                  const rows = (dtr?.rows || []).filter(row => row.inMonth && row.isActive)
                  const withLogs = rows.filter(row => row.amIn || row.amOut || row.pmIn || row.pmOut).length

                  return (
                    <div key={`${dtr.employee?.employeeId || 'employee'}-${index}`} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] sm:items-center">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-ink">{dtr.employee?.name || 'Unknown employee'}</div>
                        <div className="mt-1 text-xs text-muted">
                          {(dtr.employee?.employeeId || '--')} • {(dtr.employee?.office || 'Unassigned')}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Period</div>
                        <div className="mt-1 text-sm text-ink">{dtr.period?.periodLabel || '--'}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Rows</div>
                        <div className="mt-1 text-sm text-ink">{rows.length}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">With Logs</div>
                        <div className="mt-1 text-sm text-ink">{withLogs}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : (
          <MassDtrRenderer employees={dtrEmployees} />
        )}
      </div>

      <div aria-hidden="true" className="fixed left-[-200vw] top-0">
        {downloadKind === 'raw'
          ? <MassRawAttendanceRenderer employees={dtrEmployees} />
          : <MassDtrRenderer employees={dtrEmployees} />}
      </div>
    </div>
  )
}

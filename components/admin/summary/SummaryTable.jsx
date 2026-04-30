import { Badge } from '@/components/shared/ui'

export default function SummaryTable({ summaryLoading, summaryRows, onEditAttendance }) {
  return (
    <div className="rounded-xl border border-black/5 md:min-h-0 md:flex-1 md:overflow-auto">
      {summaryLoading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-navy border-t-transparent" />
          <span className="text-sm text-muted">Loading...</span>
        </div>
      ) : (
        <>
          <div className="divide-y divide-black/5 bg-white md:hidden">
            {summaryRows.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted">
                No attendance records for this date.
              </div>
            ) : (
              summaryRows.map(row => (
                <div key={`${row.employeeId}-${row.dateKey}`} className="grid gap-3 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-base font-semibold text-ink">{row.name}</div>
                      <div className="mt-1 text-xs uppercase tracking-wider text-muted">{row.employeeId}</div>
                    </div>
                    <Badge variant={row.status === 'Complete' ? 'success' : 'warning'}>
                      {row.status || '--'}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-xl bg-stone-50 px-3 py-2"><span className="block text-[11px] uppercase tracking-widest text-muted">AM In</span>{row.amIn || '--'}</div>
                    <div className="rounded-xl bg-stone-50 px-3 py-2"><span className="block text-[11px] uppercase tracking-widest text-muted">AM Out</span>{row.amOut || '--'}</div>
                    <div className="rounded-xl bg-stone-50 px-3 py-2"><span className="block text-[11px] uppercase tracking-widest text-muted">PM In</span>{row.pmIn || '--'}</div>
                    <div className="rounded-xl bg-stone-50 px-3 py-2"><span className="block text-[11px] uppercase tracking-widest text-muted">PM Out</span>{row.pmOut || '--'}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted">
                    <span>{row.officeName}</span>
                    <span>{`Late: ${row.lateMinutes ? `${row.lateMinutes}m` : '--'}`}</span>
                    <span>{`Hours: ${row.workingHours || '--'}`}</span>
                  </div>
                  <button
                    className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-stone-100"
                    onClick={() => onEditAttendance(row)}
                    type="button"
                  >
                    Edit attendance
                  </button>
                </div>
              ))
            )}
          </div>

          <table className="hidden w-full text-left text-sm md:table">
            <thead className="sticky top-0 bg-stone-100 text-xs uppercase tracking-widest text-muted">
              <tr>
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">Office</th>
                <th className="px-5 py-3">AM In</th>
                <th className="px-5 py-3">AM Out</th>
                <th className="px-5 py-3">PM In</th>
                <th className="px-5 py-3">PM Out</th>
                <th className="px-5 py-3">Late</th>
                <th className="px-5 py-3">Hours</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Override</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 bg-white">
              {summaryRows.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-center text-muted" colSpan={10}>
                    No attendance records for this date.
                  </td>
                </tr>
              ) : (
                summaryRows.map(row => (
                  <tr key={`${row.employeeId}-${row.dateKey}`} className="bg-white">
                    <td className="px-5 py-3">
                      <div className="font-medium text-ink">{row.name}</div>
                      <div className="text-xs uppercase tracking-wider text-muted">{row.employeeId}</div>
                    </td>
                    <td className="px-5 py-3 text-muted">{row.officeName}</td>
                    <td className="px-5 py-3">{row.amIn || '--'}</td>
                    <td className="px-5 py-3">{row.amOut || '--'}</td>
                    <td className="px-5 py-3">{row.pmIn || '--'}</td>
                    <td className="px-5 py-3">{row.pmOut || '--'}</td>
                    <td className="px-5 py-3">{row.lateMinutes ? `${row.lateMinutes}m` : '--'}</td>
                    <td className="px-5 py-3">{row.workingHours || '--'}</td>
                    <td className="px-5 py-3">
                      <Badge variant={row.status === 'Complete' ? 'success' : 'warning'}>
                        {row.status || '--'}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      <button
                        className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-stone-100"
                        onClick={() => onEditAttendance(row)}
                        type="button"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

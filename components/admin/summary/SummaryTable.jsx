import {
  Button, EmptyState, LoadingState, ResponsiveRecordList, Status, TableFrame,
} from '@/components/ui'

function rowKey(row) {
  return `${row.personId || row.employeeId || row.name}-${row.dateKey}`
}

function statusFor(row) {
  const label = row.status || 'Incomplete'
  return <Status tone={label === 'Complete' ? 'active' : 'pending'}>{label}</Status>
}

export default function SummaryTable({ summaryLoading, summaryRows, onEditAttendance }) {
  if (summaryLoading) {
    return <LoadingState className="justify-center rounded-surface border border-line bg-surface py-12" label="Loading attendance…" />
  }

  if (summaryRows.length === 0) {
    return <EmptyState description="Change the date or filters to inspect another attendance period." title="No attendance records" />
  }

  const records = summaryRows.map(row => ({
    id: rowKey(row), row,
    fields: [
      { label: 'Employee', value: <div><strong className="font-semibold">{row.name}</strong><div className="mt-1 text-xs text-secondary">{row.employeeId || 'No Employee ID'}</div></div> },
      { label: 'Office', value: row.officeName || '—' },
      { label: 'AM in', value: row.amIn || '—' },
      { label: 'AM out', value: row.amOut || '—' },
      { label: 'PM in', value: row.pmIn || '—' },
      { label: 'PM out', value: row.pmOut || '—' },
      { label: 'Late', value: row.lateMinutes ? `${row.lateMinutes}m` : '—' },
      { label: 'Hours', value: row.workingHours || '—' },
      { label: 'Status', value: statusFor(row) },
    ],
  }))

  return (
    <div className="min-h-0 md:flex-1 md:overflow-y-auto">
      <ResponsiveRecordList
        className="md:hidden"
        records={records}
        renderActions={record => <Button onClick={() => onEditAttendance(record.row)} variant="secondary">Correct attendance</Button>}
      />
      <TableFrame className="hidden md:block">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 border-b border-line bg-canvas text-xs font-medium text-secondary">
            <tr>
              <th className="px-4 py-3">Employee</th><th className="px-4 py-3">Office</th>
              <th className="px-4 py-3">AM in</th><th className="px-4 py-3">AM out</th>
              <th className="px-4 py-3">PM in</th><th className="px-4 py-3">PM out</th>
              <th className="px-4 py-3">Late</th><th className="px-4 py-3">Hours</th>
              <th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {summaryRows.map(row => (
              <tr className="hover:bg-canvas" key={rowKey(row)}>
                <td className="px-4 py-3"><div className="font-semibold text-foreground">{row.name}</div><div className="mt-1 text-xs text-secondary">{row.employeeId || 'No Employee ID'}</div></td>
                <td className="px-4 py-3 text-secondary">{row.officeName || '—'}</td>
                <td className="px-4 py-3 tabular-nums">{row.amIn || '—'}</td><td className="px-4 py-3 tabular-nums">{row.amOut || '—'}</td>
                <td className="px-4 py-3 tabular-nums">{row.pmIn || '—'}</td><td className="px-4 py-3 tabular-nums">{row.pmOut || '—'}</td>
                <td className="px-4 py-3 tabular-nums">{row.lateMinutes ? `${row.lateMinutes}m` : '—'}</td>
                <td className="px-4 py-3 tabular-nums">{row.workingHours || '—'}</td>
                <td className="px-4 py-3">{statusFor(row)}</td>
                <td className="px-4 py-3"><Button onClick={() => onEditAttendance(row)} variant="secondary">Correct</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableFrame>
    </div>
  )
}

'use client'

import { memo, useCallback, useMemo, useState } from 'react'
import { useSummary, useOffices } from '@/lib/admin/hooks'
import AttendanceOverrideModal from './AttendanceOverrideModal'
import DtrModal from './summary/DtrModal'
import SummaryFilters from './summary/SummaryFilters'
import SummaryTable from './summary/SummaryTable'

function SummaryPanelInner() {
  const {
    summaryDate, setSummaryDate,
    summaryOfficeFilter, setSummaryOfficeFilter,
    summaryDivisionFilter, setSummaryDivisionFilter,
    summaryEmployeeFilter, setSummaryEmployeeFilter,
    summaryQuery, setSummaryQuery,
    summaryRows, summaryLoading,
    summaryEmployeeOptions,
    reloadSummary,
  } = useSummary()
  const { visibleOffices } = useOffices()
  const selectedOffice = useMemo(
    () => visibleOffices.find((office) => office.id === summaryOfficeFilter) || null,
    [summaryOfficeFilter, visibleOffices],
  )
  const summaryDivisionOptions = Array.isArray(selectedOffice?.divisions) ? selectedOffice.divisions : []

  const [overrideRow, setOverrideRow] = useState(null)
  const [showDtr, setShowDtr] = useState(false)

  const handleOverrideSaved = useCallback(() => {
    reloadSummary()
  }, [reloadSummary])

  if (showDtr) {
    return <DtrModal onClose={() => setShowDtr(false)} />
  }

  return (
    <section className="flex min-h-0 flex-col gap-2 bg-white p-3 sm:p-4 md:h-full md:overflow-hidden">
      <SummaryFilters
        summaryDate={summaryDate}
        summaryEmployeeFilter={summaryEmployeeFilter}
        summaryEmployeeOptions={summaryEmployeeOptions}
        summaryLoading={summaryLoading}
        summaryQuery={summaryQuery}
        summaryOfficeFilter={summaryOfficeFilter}
        summaryDivisionFilter={summaryDivisionFilter}
        summaryDivisionOptions={summaryDivisionOptions}
        showDivisionFilter={summaryDivisionOptions.length > 0}
        summaryRows={summaryRows}
        visibleOffices={visibleOffices}
        onOpenDtr={() => setShowDtr(true)}
        onSetSummaryDate={setSummaryDate}
        onSetSummaryEmployeeFilter={setSummaryEmployeeFilter}
        onSetSummaryQuery={setSummaryQuery}
        onSetSummaryOfficeFilter={setSummaryOfficeFilter}
        onSetSummaryDivisionFilter={setSummaryDivisionFilter}
      />

      <SummaryTable
        summaryLoading={summaryLoading}
        summaryRows={summaryRows}
        onEditAttendance={setOverrideRow}
      />

      {overrideRow ? (
        <AttendanceOverrideModal
          row={overrideRow}
          onClose={() => setOverrideRow(null)}
          onSaved={handleOverrideSaved}
        />
      ) : null}

    </section>
  )
}

export const SummaryPanel = memo(SummaryPanelInner)

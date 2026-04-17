'use client'

import { memo, useCallback, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useSummary, useOffices } from '@/lib/admin/hooks'
import AttendanceOverrideModal from './AttendanceOverrideModal'
import DtrModal from './summary/DtrModal'
import SummaryFilters from './summary/SummaryFilters'
import SummaryTable from './summary/SummaryTable'

function SummaryPanelInner() {
  const {
    summaryDate, setSummaryDate,
    summaryOfficeFilter, setSummaryOfficeFilter,
    summaryEmployeeFilter, setSummaryEmployeeFilter,
    summaryRows, summaryLoading,
    summaryEmployeeOptions,
    reloadSummary,
    handleRawExport, isPending,
  } = useSummary()
  const { visibleOffices } = useOffices()

  const [overrideRow, setOverrideRow] = useState(null)
  const [showDtr, setShowDtr] = useState(false)

  const handleOverrideSaved = useCallback(() => {
    reloadSummary()
  }, [reloadSummary])

  return (
    <section className="flex h-full min-h-0 flex-col gap-5 overflow-hidden rounded-[2rem] border border-black/5 bg-white p-4 shadow-sm sm:p-6">
      <SummaryFilters
        isRawExportPending={isPending('summary-raw-export')}
        summaryDate={summaryDate}
        summaryEmployeeFilter={summaryEmployeeFilter}
        summaryEmployeeOptions={summaryEmployeeOptions}
        summaryLoading={summaryLoading}
        summaryOfficeFilter={summaryOfficeFilter}
        summaryRows={summaryRows}
        visibleOffices={visibleOffices}
        onExportRaw={handleRawExport}
        onOpenDtr={() => setShowDtr(true)}
        onSetSummaryDate={setSummaryDate}
        onSetSummaryEmployeeFilter={setSummaryEmployeeFilter}
        onSetSummaryOfficeFilter={setSummaryOfficeFilter}
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

      <AnimatePresence>
        {showDtr ? (
          <DtrModal
            summaryRows={summaryRows}
            onClose={() => setShowDtr(false)}
          />
        ) : null}
      </AnimatePresence>
    </section>
  )
}

export const SummaryPanel = memo(SummaryPanelInner)

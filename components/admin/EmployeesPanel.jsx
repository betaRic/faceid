'use client'

import { memo, startTransition, useCallback, useEffect, useMemo, useState } from 'react'
import { useEmployees, useOffices } from '@/lib/admin/hooks'
import {
  Button,
  Checkbox,
  EmptyState,
  Field,
  FilterBar,
  Input,
  LoadingState,
  OrganizationFilterFields,
  Pagination,
  ResponsiveRecordList,
  Select,
  Surface,
  TableFrame,
} from '@/components/ui'
import EmployeeAccessCodeExportActions from './EmployeeAccessCodeExportActions'
import EmployeeLifecycleStatus from './EmployeeLifecycleStatus'

function EmployeesPanelInner() {
  const {
    employees, employeesLoaded, employeeTotal,
    employeeHasMore, employeeHistoryLength,
    employeeQuery, setEmployeeQuery,
    employeeOfficeFilter, setEmployeeOfficeFilter,
    employeeDivisionFilter, setEmployeeDivisionFilter,
    employeeStatusFilter, setEmployeeStatusFilter,
    handlePreviousPage, handleNextPage, refreshEmployees,
    handleBulkEmployeeUpdate,
    setEditingEmployee, setDeletingEmployee,
  } = useEmployees()
  const { visibleOffices } = useOffices()
  const selectedOffice = useMemo(() => visibleOffices.find((office) => office.id === employeeOfficeFilter) || null, [employeeOfficeFilter, visibleOffices])
  const officeDivisions = Array.isArray(selectedOffice?.divisions) ? selectedOffice.divisions : []
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([])
  const [bulkAction, setBulkAction] = useState('')
  const selectedEmployeeIdSet = useMemo(() => new Set(selectedEmployeeIds), [selectedEmployeeIds])
  const selectedEmployees = useMemo(() => employees.filter((person) => selectedEmployeeIdSet.has(person.id)), [employees, selectedEmployeeIdSet])
  const canActivateSelected = selectedEmployees.length > 0 && selectedEmployees.every((person) => ['pending', 'inactive'].includes(person.lifecycleStatus))
  const canDeactivateSelected = selectedEmployees.length > 0 && selectedEmployees.every((person) => person.lifecycleStatus === 'active')
  const allPageSelected = employees.length > 0 && selectedEmployeeIds.length === employees.length
  const pendingOnPage = useMemo(() => employees.filter((person) => person.lifecycleStatus === 'pending'), [employees])
  const employeePage = employeeHistoryLength + 1
  const employeePageCount = Math.max(1, Math.ceil(employeeTotal / 24))

  useEffect(() => {
    setSelectedEmployeeIds((current) => current.filter((id) => employees.some((person) => person.id === id)))
  }, [employees])

  const toggleSelectedEmployee = useCallback((personId) => {
    setSelectedEmployeeIds((current) => current.includes(personId) ? current.filter((id) => id !== personId) : [...current, personId])
  }, [])

  const runBulkUpdate = useCallback(async (mode) => {
    if (selectedEmployees.length === 0 || (mode === 'activate' && !canActivateSelected) || (mode === 'deactivate' && !canDeactivateSelected)) return
    setBulkAction(mode)
    const config = mode === 'activate'
      ? { updates: { lifecycleStatus: 'active' }, successMessage: `Activated ${selectedEmployees.length} employee(s)`, failureMessage: 'Bulk activation incomplete', pendingKey: 'employees-bulk-activate', reason: 'Activated employee using a bulk directory action.' }
      : { updates: { lifecycleStatus: 'inactive' }, successMessage: `Deactivated ${selectedEmployees.length} employee(s)`, failureMessage: 'Bulk deactivation incomplete', pendingKey: 'employees-bulk-deactivate', reason: 'Deactivated employee using a bulk directory action.' }
    await handleBulkEmployeeUpdate(selectedEmployees, config.updates, config)
    setSelectedEmployeeIds([])
    setBulkAction('')
  }, [canActivateSelected, canDeactivateSelected, handleBulkEmployeeUpdate, selectedEmployees])

  const mobileRecords = employees.map((person) => ({
    id: person.id,
    person,
    fields: [
      { label: 'Select', value: <Checkbox aria-label={`Select ${person.name}`} checked={selectedEmployeeIdSet.has(person.id)} onChange={() => toggleSelectedEmployee(person.id)} /> },
      { label: 'Employee', value: <><span className="font-semibold">{person.name}</span>{person.employeeId ? <span className="ml-2 text-secondary">{person.employeeId}</span> : null}</> },
      { label: 'Office', value: [person.officeName, person.divisionName].filter(Boolean).join(' — ') },
      { label: 'Samples', value: person.sampleCount ?? 0 },
      { label: 'Lifecycle', value: <EmployeeLifecycleStatus status={person.lifecycleStatus} /> },
      ...(person.duplicateReviewRequired ? [{ label: 'Review', value: 'Duplicate review required' }] : []),
    ],
  }))

  return (
    <section className="flex min-h-0 flex-col gap-3 p-3 sm:p-4 md:h-full md:overflow-hidden">
      <FilterBar search={(
        <Field htmlFor="employee-search" label="Search employees">
          <Input id="employee-search" onChange={(event) => startTransition(() => setEmployeeQuery(event.target.value))} placeholder="Name or employee ID" value={employeeQuery} />
        </Field>
      )}>
        <OrganizationFilterFields
          levels={[
            { id: 'office', label: 'Office', value: employeeOfficeFilter, emptyValue: 'all', options: visibleOffices.map((office) => ({ value: office.id, label: office.name })) },
            { id: 'division', label: 'Division', value: employeeDivisionFilter, emptyValue: 'all', options: officeDivisions.map((division) => ({ value: division.id, label: division.name })) },
          ]}
          onChange={(level, value) => level === 'office' ? setEmployeeOfficeFilter(value) : setEmployeeDivisionFilter(value)}
        />
        <Field htmlFor="employee-status" label="Status">
          <Select id="employee-status" onChange={(event) => setEmployeeStatusFilter(event.target.value)} value={employeeStatusFilter}>
            <option value="all">All status</option><option value="pending">Pending review</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="rejected">Rejected</option>
          </Select>
        </Field>
      </FilterBar>

      <Surface className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-secondary">{employeesLoaded ? `${employeeTotal} employee records` : 'Loading employees…'}</span>
        <div className="flex flex-wrap gap-2">
          <Button disabled={employees.length === 0} onClick={() => setSelectedEmployeeIds(allPageSelected ? [] : employees.map((person) => person.id))} variant="quiet">{allPageSelected ? 'Clear page' : 'Select page'}</Button>
          <Button disabled={pendingOnPage.length === 0} onClick={() => setSelectedEmployeeIds(pendingOnPage.map((person) => person.id))} variant="quiet">Select pending</Button>
          <Button disabled={!employeesLoaded} onClick={refreshEmployees} variant="quiet">Refresh</Button>
          <EmployeeAccessCodeExportActions />
        </div>
      </Surface>

      {selectedEmployees.length > 0 ? (
        <Surface className="flex flex-wrap items-center gap-2 border-primary/20 bg-primary/5 p-3">
          <span className="mr-auto text-sm font-medium">{selectedEmployees.length} selected</span>
          <Button disabled={Boolean(bulkAction) || !canActivateSelected} onClick={() => runBulkUpdate('activate')} variant="secondary">{bulkAction === 'activate' ? 'Processing…' : 'Activate selected'}</Button>
          <Button disabled={Boolean(bulkAction) || !canDeactivateSelected} onClick={() => runBulkUpdate('deactivate')} variant="secondary">{bulkAction === 'deactivate' ? 'Processing…' : 'Deactivate selected'}</Button>
          <Button onClick={() => setSelectedEmployeeIds([])} variant="quiet">Clear selection</Button>
        </Surface>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!employeesLoaded ? <LoadingState className="justify-center py-16" label="Loading employees…" /> : employees.length === 0 ? (
          <EmptyState description="Change the current filters or search terms." title="No employees found" />
        ) : (
          <>
            <div className="md:hidden">
              <ResponsiveRecordList
                records={mobileRecords}
                renderActions={(record) => (
                  <><Button onClick={() => setEditingEmployee(record.person)} variant="secondary">{record.person.lifecycleStatus === 'pending' ? 'Review record' : 'Manage record'}</Button>{record.person.lifecycleStatus === 'active' ? <Button onClick={() => setDeletingEmployee(record.person)} variant="destructive">Deactivate</Button> : null}</>
                )}
              />
            </div>
            <div className="hidden md:block">
              <TableFrame>
                <table aria-label="Employee directory" className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-canvas text-xs text-secondary"><tr><th className="w-12 px-4 py-3"><span className="sr-only">Select</span></th><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Office</th><th className="px-4 py-3">Samples</th><th className="px-4 py-3">Lifecycle</th><th className="px-4 py-3">Actions</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {employees.map((person) => (
                      <tr key={person.id}>
                        <td className="px-4 py-3"><Checkbox aria-label={`Select ${person.name}`} checked={selectedEmployeeIdSet.has(person.id)} onChange={() => toggleSelectedEmployee(person.id)} /></td>
                        <td className="px-4 py-3"><div className="font-medium">{person.name}</div><div className="text-xs text-secondary">{person.employeeId || 'No employee ID'}{person.accessCode ? ` · Access code ${person.accessCode}` : ''}</div>{person.duplicateReviewRequired ? <div className="mt-1 text-xs font-medium text-warning">Duplicate review required</div> : null}</td>
                        <td className="px-4 py-3 text-secondary">{person.officeName}<div className="text-xs">{person.divisionName}</div></td>
                        <td className="px-4 py-3 tabular-nums">{person.sampleCount ?? 0}</td>
                        <td className="px-4 py-3"><EmployeeLifecycleStatus status={person.lifecycleStatus} /></td>
                        <td className="px-4 py-3"><div className="flex gap-2"><Button onClick={() => setEditingEmployee(person)} variant="secondary">{person.lifecycleStatus === 'pending' ? 'Review' : 'Manage'}</Button>{person.lifecycleStatus === 'active' ? <Button onClick={() => setDeletingEmployee(person)} variant="destructive">Deactivate</Button> : null}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableFrame>
            </div>
          </>
        )}
      </div>

      <Pagination current={employeePage} onNext={employeeHasMore ? handleNextPage : undefined} onPrevious={employeeHistoryLength > 0 ? handlePreviousPage : undefined} total={employeePageCount} />
    </section>
  )
}

export const EmployeesPanel = memo(EmployeesPanelInner)

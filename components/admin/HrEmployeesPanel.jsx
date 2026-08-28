'use client'

import { memo, startTransition, useEffect } from 'react'
import { useHrEmployees } from '@/lib/hr/hooks'
import { useAdminStore } from '@/lib/admin/store'
import {
  Button,
  EmptyState,
  Field,
  FilterBar,
  Input,
  LoadingState,
  PageHeader,
  Pagination,
  ResponsiveRecordList,
  Select,
  Surface,
  TableFrame,
} from '@/components/ui'
import EmployeeAccessCodeExportActions from './EmployeeAccessCodeExportActions'
import EmployeeLifecycleStatus from './EmployeeLifecycleStatus'

function HrEmployeesPanelInner() {
  const employeeRefreshKey = useAdminStore((state) => state.employeeRefreshKey)
  const setEditingEmployee = useAdminStore((state) => state.setEditingEmployee)
  const setDeletingEmployee = useAdminStore((state) => state.setDeletingEmployee)
  const {
    employees, employeesLoaded, employeeTotal,
    employeeQuery, setEmployeeQuery,
    employeeStatusFilter, setEmployeeStatusFilter,
    employeePage, employeeHasMore,
    handlePreviousPage, handleNextPage, fetchEmployees, loading,
  } = useHrEmployees()

  useEffect(() => { fetchEmployees() }, [fetchEmployees, employeeRefreshKey])

  const totalPages = Math.max(employeePage, Math.ceil(employeeTotal / 24), employeeHasMore ? employeePage + 1 : 1)
  const records = employees.map((person) => ({
    id: person.id,
    person,
    fields: [
      { label: 'Employee', value: <><span className="font-semibold">{person.name}</span>{person.employeeId ? <span className="ml-2 text-secondary">{person.employeeId}</span> : null}</> },
      { label: 'Office', value: person.officeName },
      { label: 'Lifecycle', value: <EmployeeLifecycleStatus status={person.lifecycleStatus} /> },
    ],
  }))

  return (
    <section className="flex min-h-0 flex-col gap-3 p-3 sm:p-4 md:h-full md:overflow-hidden">
      <PageHeader description="Review and maintain employees assigned to your authorized office." title="Office HR employees" />

      <FilterBar search={(
        <Field htmlFor="hr-employee-search" label="Search employees">
          <Input id="hr-employee-search" onChange={(event) => startTransition(() => setEmployeeQuery(event.target.value))} placeholder="Name or employee ID" value={employeeQuery} />
        </Field>
      )}>
        <Field htmlFor="hr-employee-status" label="Status">
          <Select id="hr-employee-status" onChange={(event) => setEmployeeStatusFilter(event.target.value)} value={employeeStatusFilter}>
            <option value="">All status</option><option value="pending">Pending review</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="rejected">Rejected</option>
          </Select>
        </Field>
      </FilterBar>

      <Surface className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="text-sm font-semibold">Employee access-code list</div><div className="text-xs text-secondary">{employeesLoaded ? `${employeeTotal} employees in your scope` : 'Loading employees…'}</div></div>
        <div className="flex flex-wrap gap-2"><Button onClick={fetchEmployees} variant="quiet">Refresh</Button><EmployeeAccessCodeExportActions endpoint="/api/hr/employees?mode=access-codes" resultKey="employees" /></div>
      </Surface>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && !employeesLoaded ? <LoadingState className="justify-center py-16" label="Loading employees…" /> : employees.length === 0 ? (
          <EmptyState description="Change the current search or status filter." title="No employees found" />
        ) : (
          <>
            <div className="md:hidden"><ResponsiveRecordList records={records} renderActions={(record) => <><Button onClick={() => setEditingEmployee(record.person)} variant="secondary">Edit</Button>{record.person.lifecycleStatus === 'active' ? <Button onClick={() => setDeletingEmployee(record.person)} variant="destructive">Deactivate</Button> : null}</>} /></div>
            <div className="hidden md:block">
              <TableFrame>
                <table aria-label="Office HR employee directory" className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-canvas text-xs text-secondary"><tr><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Office</th><th className="px-4 py-3">Lifecycle</th><th className="px-4 py-3">Actions</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {employees.map((person) => <tr key={person.id}><td className="px-4 py-3"><div className="font-medium">{person.name}</div><div className="text-xs text-secondary">{person.employeeId || 'No employee ID'}</div></td><td className="px-4 py-3 text-secondary">{person.officeName}</td><td className="px-4 py-3"><EmployeeLifecycleStatus status={person.lifecycleStatus} /></td><td className="px-4 py-3"><div className="flex gap-2"><Button onClick={() => setEditingEmployee(person)} variant="secondary">Edit</Button>{person.lifecycleStatus === 'active' ? <Button onClick={() => setDeletingEmployee(person)} variant="destructive">Deactivate</Button> : null}</div></td></tr>)}
                  </tbody>
                </table>
              </TableFrame>
            </div>
          </>
        )}
      </div>

      <Pagination current={employeePage} onNext={employeeHasMore ? handleNextPage : undefined} onPrevious={employeePage > 1 ? handlePreviousPage : undefined} total={totalPages} />
    </section>
  )
}

export const HrEmployeesPanel = memo(HrEmployeesPanelInner)

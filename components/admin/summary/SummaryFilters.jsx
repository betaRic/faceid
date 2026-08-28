import { Button, Field, FilterBar, Icon, Input, Select } from '@/components/ui'

export default function SummaryFilters({
  summaryDate,
  summaryEmployeeFilter,
  summaryEmployeeOptions,
  summaryLoading,
  summaryQuery,
  summaryOfficeFilter,
  summaryDivisionFilter = 'all',
  summaryDivisionOptions = [],
  showDivisionFilter = false,
  visibleOffices,
  onOpenDtr,
  onSetSummaryDate,
  onSetSummaryEmployeeFilter,
  onSetSummaryQuery,
  onSetSummaryOfficeFilter,
  onSetSummaryDivisionFilter = () => {},
}) {
  return (
    <FilterBar
      actions={<Button disabled={summaryLoading} onClick={onOpenDtr} variant="secondary"><Icon name="report" />Generate DTR</Button>}
      search={(
        <Field label="Search attendance">
          <Input onChange={event => onSetSummaryQuery(event.target.value)} placeholder="Name, Employee ID, or office" type="search" value={summaryQuery} />
        </Field>
      )}
    >
      <Field label="Date">
        <Input onChange={event => onSetSummaryDate(event.target.value)} type="date" value={summaryDate} />
      </Field>
      <Field label="Office">
        <Select onChange={event => onSetSummaryOfficeFilter(event.target.value)} value={summaryOfficeFilter}>
          <option value="all">All offices</option>
          {visibleOffices.map(office => <option key={office.id} value={office.id}>{office.name}</option>)}
        </Select>
      </Field>
      {showDivisionFilter ? (
        <Field label="Division">
          <Select onChange={event => onSetSummaryDivisionFilter(event.target.value)} value={summaryDivisionFilter}>
            <option value="all">All divisions</option>
            {summaryDivisionOptions.map(division => <option key={division.id} value={division.id}>{division.name}</option>)}
          </Select>
        </Field>
      ) : null}
      <Field label="Employee">
        <Select disabled={summaryLoading} onChange={event => onSetSummaryEmployeeFilter(event.target.value)} value={summaryEmployeeFilter}>
          <option value="all">All employees</option>
          {summaryEmployeeOptions.map(person => <option key={person.employeeId} value={person.employeeId}>{person.name} ({person.employeeId})</option>)}
        </Select>
      </Field>
    </FilterBar>
  )
}

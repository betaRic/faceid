'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Button, Dialog, EmptyState, Field, Icon, IconButton, Input, Select, Status, Surface, Textarea,
} from '@/components/ui'

const LEAVE_LABELS = {
  VL: 'Vacation Leave',
  SL: 'Sick Leave',
  CTO: 'Compensatory Time Off',
  WL: 'Wellness Leave',
}

function employeeMatches(person, search) {
  return [person.name, person.employeeId, person.officeName, person.divisionName]
    .filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase())
}

export default function WorkforceRecordModal({
  tab, editing, employees, form, onClose, onSubmit, saving = false, update,
}) {
  const [search, setSearch] = useState('')

  useEffect(() => setSearch(''), [editing, tab])

  const isOrder = tab === 'order'
  const selectedIds = useMemo(
    () => (isOrder ? form.personIds || [] : form.personId ? [form.personId] : []),
    [form.personId, form.personIds, isOrder],
  )
  const visibleEmployees = useMemo(
    () => employees.filter(person => employeeMatches(person, search)),
    [employees, search],
  )
  const selectedEmployees = employees.filter(person => selectedIds.includes(person.id))

  const toggleEmployee = personId => {
    if (!isOrder) {
      if (editing !== 'new') return
      update('personId', personId)
      return
    }
    update('personIds', selectedIds.includes(personId)
      ? selectedIds.filter(id => id !== personId)
      : [...selectedIds, personId])
  }

  const title = `${editing === 'new' ? 'New' : 'Edit'} ${isOrder ? 'Official Order' : 'Leave'}`

  return (
    <Dialog
      footer={(
        <>
          <Button disabled={saving} onClick={onClose} variant="secondary">Cancel</Button>
          <Button disabled={saving || selectedIds.length === 0} form="workforce-record-form" type="submit">
            {saving ? 'Saving…' : `Save ${isOrder ? 'Official Order' : 'Leave'}`}
          </Button>
        </>
      )}
      onClose={onClose}
      open
      title={title}
    >
      <form className="grid gap-5" id="workforce-record-form" onSubmit={onSubmit}>
        <p className="text-sm leading-6 text-secondary">
          {isOrder
            ? 'One Official Order may cover any number of employees within your authorized scope.'
            : 'Record an employee leave period without changing attendance punches.'}
        </p>

        <div className="grid gap-4">
          {isOrder ? (
            <>
              <Field label="Order type"><Input onChange={event => update('orderType', event.target.value)} required value={form.orderType || ''} /></Field>
              <Field label="Order number"><Input onChange={event => update('orderNumber', event.target.value)} value={form.orderNumber || ''} /></Field>
            </>
          ) : (
            <Field label="Leave type">
              <Select onChange={event => update('leaveType', event.target.value)} value={form.leaveType || 'VL'}>
                {Object.entries(LEAVE_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </Select>
            </Field>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Start date"><Input onChange={event => update('startDate', event.target.value)} required type="date" value={form.startDate || ''} /></Field>
            <Field label="End date"><Input onChange={event => update('endDate', event.target.value)} required type="date" value={form.endDate || ''} /></Field>
          </div>
          <Field label="Remarks"><Textarea onChange={event => update('remarks', event.target.value)} value={form.remarks || ''} /></Field>
        </div>

        <Surface className="grid min-h-0 gap-3 bg-canvas p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="font-semibold text-foreground">{isOrder ? 'Employees covered' : 'Employee on leave'}</h3>
              <p className="mt-1 text-xs text-secondary">{isOrder ? `${selectedIds.length} selected` : editing === 'new' ? 'Select one employee' : 'The employee cannot be changed after saving.'}</p>
            </div>
            <Field className="w-full sm:w-64" label="Search employees">
              <Input onChange={event => setSearch(event.target.value)} placeholder="Name, ID, office" value={search} />
            </Field>
          </div>

          {selectedEmployees.length ? (
            <div className="flex flex-wrap gap-2">
              {selectedEmployees.map(person => (
                <Status key={person.id}>
                  {person.name}
                  {isOrder ? (
                    <IconButton aria-label={`Remove ${person.name}`} className="-my-2 -mr-2" onClick={() => toggleEmployee(person.id)}>
                      <Icon name="close" size={15} />
                    </IconButton>
                  ) : null}
                </Status>
              ))}
            </div>
          ) : null}

          <div className="max-h-72 overflow-y-auto rounded-control border border-line bg-surface">
            {visibleEmployees.length ? visibleEmployees.map(person => {
              const selected = selectedIds.includes(person.id)
              return (
                <button
                  aria-pressed={selected}
                  className={`flex min-h-11 w-full items-center gap-3 border-b border-line px-3 py-3 text-left last:border-b-0 ${selected ? 'bg-primary/5' : 'hover:bg-canvas'} ${!isOrder && editing !== 'new' ? 'cursor-not-allowed opacity-60' : ''}`}
                  disabled={!isOrder && editing !== 'new'}
                  key={person.id}
                  onClick={() => toggleEmployee(person.id)}
                  type="button"
                >
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center border ${isOrder ? 'rounded' : 'rounded-full'} ${selected ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-surface'}`}>
                    {selected ? <Icon name="check" size={14} /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-foreground">{person.name}</span>
                    <span className="block text-xs text-secondary">{[person.employeeId, person.officeName, person.divisionName].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
              )
            }) : <EmptyState className="m-3" description="Change the search or verify your authorized office scope." title="No matching employees" />}
          </div>
        </Surface>
      </form>
    </Dialog>
  )
}

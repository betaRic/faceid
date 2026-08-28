'use client'

import { useOffices } from '@/lib/admin/hooks/useOffices'
import OfficeEditorModal from '@/components/admin/OfficeEditorModal'
import {
  Button, EmptyState, Icon, LoadingState, PageHeader,
  ResponsiveRecordList, Status, TableFrame,
} from '@/components/ui'

const DAY_LABELS = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' }

function formatDays(values = []) {
  return values.length ? values.map(value => DAY_LABELS[value] || String(value)).join(', ') : 'None'
}

function officeView(office) {
  return {
    code: office.code || office.shortName || office.id,
    place: office.provinceOrCity || office.location || 'No city set',
    radius: Number.isFinite(office?.gps?.radiusMeters) ? `${office.gps.radiusMeters} m` : 'Not set',
    schedule: office?.workPolicy?.schedule || 'No schedule set',
    wfhDays: formatDays(office?.workPolicy?.wfhDays || []),
    status: (office.status || 'active') === 'active' ? 'Active' : 'Inactive',
  }
}

export default function OfficePanel() {
  const {
    officesLoaded, visibleOffices, selectedOfficeId, setSelectedOfficeId,
    activeOffice, draftOffice, officeDraftWarning, officeDraftDirty,
    locationLoading, locationNotice, highlightLocationPin, savePending, deletePending,
    updateDraft, toggleDay, addDivision, updateDivision, removeDivision,
    handleSaveOffice, handleStartCreateOffice, handleStartEditOffice,
    handleCancelOfficeEditor, handleDeleteOffice, handleUseMyLocation,
  } = useOffices()

  const handleEditOffice = officeId => {
    setSelectedOfficeId(officeId)
    handleStartEditOffice(officeId)
  }

  const handleDelete = office => {
    const confirmed = window.confirm(`Delete ${office.name}? This only works when the office has no linked employees, admins, or attendance history.`)
    if (confirmed) handleDeleteOffice(office.id)
  }

  if (!officesLoaded) {
    return <section className="flex items-center justify-center py-20"><LoadingState label="Loading offices…" /></section>
  }

  if (draftOffice) {
    return (
      <OfficeEditorModal
        activeOffice={activeOffice} addDivision={addDivision}
        handleCancel={handleCancelOfficeEditor} handleSaveOffice={handleSaveOffice}
        handleUseMyLocation={handleUseMyLocation} highlightLocationPin={highlightLocationPin}
        locationLoading={locationLoading} locationNotice={locationNotice}
        officeDraftDirty={officeDraftDirty} officeDraftWarning={officeDraftWarning}
        removeDivision={removeDivision}
        saveLabel={activeOffice?.id && visibleOffices.some(office => office.id === activeOffice.id) ? 'Save changes' : 'Create office'}
        savePending={savePending} toggleDay={toggleDay}
        updateDivision={updateDivision} updateDraft={updateDraft}
      />
    )
  }

  const records = visibleOffices.map(office => {
    const view = officeView(office)
    return {
      id: office.id, office,
      fields: [
        { label: 'Office', value: <div><strong className="font-semibold">{office.name}</strong><div className="mt-1 text-xs text-secondary">{view.code} · {office.shortName || 'No short name'}</div></div> },
        { label: 'Type', value: office.officeType || '—' },
        { label: 'Location', value: <div>{view.place}<div className="mt-1 text-xs text-secondary">Geofence radius {view.radius}</div></div> },
        { label: 'Schedule', value: <div>{view.schedule}<div className="mt-1 text-xs text-secondary">WFH: {view.wfhDays}</div></div> },
        { label: 'Employees', value: office.employees || 0 },
        { label: 'Status', value: <Status tone={view.status === 'Active' ? 'active' : 'neutral'}>{view.status}</Status> },
      ],
    }
  })

  const actionsFor = record => (
    <>
      <Button onClick={() => handleEditOffice(record.office.id)} variant="secondary"><Icon name="edit" />Edit</Button>
      <Button disabled={deletePending} onClick={() => handleDelete(record.office)} variant="quiet">Delete</Button>
    </>
  )

  return (
    <section className="grid min-h-0 gap-4 md:h-full md:grid-rows-[auto_minmax(0,1fr)]">
      <PageHeader
        actions={<Button onClick={handleStartCreateOffice}><Icon name="add" />Add office</Button>}
        description="Manage Regional, Provincial, and HUC office structure, schedules, and authorized geofences."
        title="Offices"
      />

      {records.length === 0 ? (
        <EmptyState
          action={<Button onClick={handleStartCreateOffice}>Add office</Button>}
          description="Create the first office before assigning employees."
          title="No offices configured"
        />
      ) : (
        <div className="min-h-0 overflow-y-auto pb-2">
          <ResponsiveRecordList className="lg:hidden" records={records} renderActions={actionsFor} />
          <TableFrame className="hidden lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-canvas text-xs font-medium text-secondary">
                <tr>
                  <th className="px-4 py-3">Office</th><th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Location</th><th className="px-4 py-3">Schedule</th>
                  <th className="px-4 py-3">Employees</th><th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visibleOffices.map(office => {
                  const view = officeView(office)
                  return (
                    <tr className={office.id === selectedOfficeId ? 'bg-primary/5' : 'hover:bg-canvas'} key={office.id}>
                      <td className="px-4 py-3"><div className="font-semibold text-foreground">{office.name}</div><div className="mt-1 text-xs text-secondary">{view.code} · {office.shortName || 'No short name'}</div></td>
                      <td className="px-4 py-3 text-secondary">{office.officeType || '—'}</td>
                      <td className="px-4 py-3 text-secondary"><div>{view.place}</div><div className="mt-1 text-xs">Radius {view.radius}</div></td>
                      <td className="px-4 py-3 text-secondary"><div>{view.schedule}</div><div className="mt-1 text-xs">WFH: {view.wfhDays}</div></td>
                      <td className="px-4 py-3 tabular-nums text-secondary">{office.employees || 0}</td>
                      <td className="px-4 py-3"><Status tone={view.status === 'Active' ? 'active' : 'neutral'}>{view.status}</Status></td>
                      <td className="px-4 py-3"><div className="flex flex-wrap gap-2">{actionsFor({ office })}</div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableFrame>
        </div>
      )}
    </section>
  )
}

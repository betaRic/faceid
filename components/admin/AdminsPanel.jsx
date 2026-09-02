'use client'

import { memo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAdmins, useHrUsers } from '@/lib/admin/hooks'
import { useAdminStore } from '@/lib/admin/store'
import { Button, EmptyState, LoadingState, PageHeader, ResponsiveRecordList, Select, Status, TableFrame } from '@/components/ui'
import { AddRoleModal } from './AddRoleModal'

function AdminsPanelInner() {
  const { roleScope, offices, addToast } = useAdminStore(useShallow((state) => ({ roleScope: state.roleScope, offices: state.offices || [], addToast: state.addToast })))
  const { admins, adminsLoaded, handleCreateAdmin, handleUpdateAdmin, handleDeleteAdmin, isPending } = useAdmins()
  const { hrUsers, hrUsersLoaded, createHrUser, updateHrUser, deleteHrUser, isPending: isHrPending } = useHrUsers()
  const [showAddModal, setShowAddModal] = useState(false)
  const [filterRole, setFilterRole] = useState('all')

  if (roleScope !== 'regional') {
    return <EmptyState className="my-auto" description="Only Regional administrators can create, disable, or remove administrator and HR accounts." title="Regional access required" />
  }

  const allUsers = [
    ...admins.map((user) => ({ ...user, userType: 'admin' })),
    ...hrUsers.map((user) => ({ ...user, userType: 'hr', role: 'hr' })),
  ]
  const filteredUsers = filterRole === 'all'
    ? allUsers
    : allUsers.filter((user) => filterRole === 'hr' ? user.userType === 'hr' : user.userType === 'admin')
  const loaded = adminsLoaded && hrUsersLoaded
  const officeName = (officeId) => offices.find((office) => office.id === officeId)?.name || (officeId ? 'Assigned office' : '—')

  const handleAddRole = async (data) => {
    if (data.type === 'admin') {
      await handleCreateAdmin({ email: data.email, displayName: data.displayName, scope: data.scope, officeId: data.officeId, pin: data.pin, role: 'admin' })
    } else {
      await createHrUser({ displayName: data.displayName, officeId: data.officeId, pin: data.pin, scope: data.scope })
    }
    setShowAddModal(false)
  }

  const handleUpdate = (user, updates) => user.userType === 'hr' ? updateHrUser(user, updates) : handleUpdateAdmin(user, updates)
  const handleHrOfficeChange = async (user, officeId) => {
    const result = await updateHrUser(user, { scope: user.scope, officeId })
    if (!result?.ok) addToast(result?.message || 'Failed to update HR office. Please try again.', 'error')
  }
  const handleDelete = (user) => user.userType === 'hr' ? deleteHrUser(user) : handleDeleteAdmin(user)
  const roleName = (user) => user.userType === 'hr' ? (user.scope === 'regional' ? 'Regional HR' : 'Office HR') : 'Administrator'
  const renderOffice = (user, view) => user.userType === 'hr' ? (
    <div className="grid gap-1.5">
      <Select
        aria-label={`Office for ${user.displayName || user.email}`}
        aria-describedby={!user.officeId ? `hr-office-warning-${view}-${user.id}` : undefined}
        className="min-w-40"
        disabled={isHrPending(`hr-user-update-${user.id}`)}
        value={user.officeId || ''}
        onChange={(event) => handleHrOfficeChange(user, event.target.value)}
      >
        <option value="">Select office</option>
        {offices.filter(office => user.scope === 'regional' ? office.officeType === 'Regional Office' : office.officeType !== 'Regional Office')
          .map(office => <option key={office.id} value={office.id}>{office.name}</option>)}
      </Select>
      {!user.officeId ? <p className="text-xs text-destructive" id={`hr-office-warning-${view}-${user.id}`}>Office assignment required</p> : null}
    </div>
  ) : (user.scope === 'regional' ? 'All offices' : officeName(user.officeId))
  const renderActions = (user) => (
    <>
      <Button onClick={() => handleUpdate(user, { active: user.active === false })} variant="secondary">{user.active === false ? 'Enable' : 'Disable'}</Button>
      <Button onClick={() => handleDelete(user)} variant="destructive">Delete</Button>
    </>
  )
  const mobileRecords = filteredUsers.map((user) => ({
    ...user,
    id: `${user.userType}-${user.id}`,
    fields: [
      { label: 'Account', value: <><strong className="block">{user.displayName || user.email}</strong><span className="text-xs text-secondary">{user.email || 'PIN sign-in'}</span></> },
      { label: 'Role', value: roleName(user) },
      { label: 'Scope', value: user.scope === 'regional' ? 'Regional' : 'Office' },
      { label: 'Office', value: renderOffice(user, 'mobile') },
      { label: 'Status', value: <Status tone={user.active === false ? 'neutral' : 'success'}>{user.active === false ? 'Disabled' : 'Active'}</Status> },
    ],
  }))

  return (
    <section className="flex min-h-0 flex-col gap-4 md:h-full">
      <PageHeader title="Roles and access" description="Regional control of administrator and HR accounts. PIN values are never shown after creation." actions={<Button onClick={() => setShowAddModal(true)}>Add role</Button>} />

      <nav aria-label="Role filters" className="flex flex-wrap gap-2">
        {[
          ['all', 'All'],
          ['admin', 'Administrators'],
          ['hr', 'HR'],
        ].map(([value, label]) => (
          <Button aria-pressed={filterRole === value} key={value} onClick={() => setFilterRole(value)} variant={filterRole === value ? 'primary' : 'secondary'}>{label}</Button>
        ))}
      </nav>

      {!loaded ? <LoadingState>Loading accounts…</LoadingState> : null}
      {loaded && filteredUsers.length === 0 ? <EmptyState title="No matching accounts" /> : null}
      {loaded && filteredUsers.length > 0 ? (
        <>
          <ResponsiveRecordList className="lg:hidden" records={mobileRecords} renderActions={renderActions} />
          <TableFrame className="hidden lg:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-canvas text-secondary">
                <tr>
                  <th className="px-4 py-3 font-medium">Account</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Scope</th>
                  <th className="px-4 py-3 font-medium">Office</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredUsers.map((user) => (
                  <tr key={`${user.userType}-${user.id}`}>
                    <td className="px-4 py-3"><strong className="block text-foreground">{user.displayName || user.email}</strong><span className="text-xs text-secondary">{user.email || 'PIN sign-in'}</span></td>
                    <td className="px-4 py-3">{roleName(user)}</td>
                    <td className="px-4 py-3">
                      {user.userType === 'hr' ? (user.scope === 'regional' ? 'Regional' : 'Office') : (
                        <Select aria-label={`Scope for ${user.displayName || user.email}`} className="min-w-32" value={user.scope} onChange={(event) => handleUpdate(user, { scope: event.target.value, officeId: event.target.value === 'office' ? (user.officeId || '') : '' })}>
                          <option value="office">Office</option>
                          <option value="regional">Regional</option>
                        </Select>
                      )}
                    </td>
                    <td className="px-4 py-3">{renderOffice(user, 'desktop')}</td>
                    <td className="px-4 py-3"><Status tone={user.active === false ? 'neutral' : 'success'}>{user.active === false ? 'Disabled' : 'Active'}</Status></td>
                    <td className="px-4 py-3"><div className="flex flex-wrap gap-2">{renderActions(user)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>
        </>
      ) : null}

      <AddRoleModal adminPending={isPending('admin-create')} hrPending={isHrPending('hr-user-create')} isOpen={showAddModal} onClose={() => setShowAddModal(false)} onSubmit={handleAddRole} />
    </section>
  )
}

export const AdminsPanel = memo(AdminsPanelInner)

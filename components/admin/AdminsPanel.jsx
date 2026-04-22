'use client'

import { memo, useState } from 'react'
import { useAdmins, useHrUsers } from '@/lib/admin/hooks'
import { useAdminStore } from '@/lib/admin/store'
import { StatusBadge } from '@/components/shared/ui'
import { AddRoleModal } from './AddRoleModal'

function AdminsPanelInner() {
  const roleScope = useAdminStore((state) => state.roleScope)
  const { admins, adminsLoaded, handleCreateAdmin, handleUpdateAdmin, handleDeleteAdmin, isPending } = useAdmins()
  const { hrUsers, hrUsersLoaded, createHrUser, updateHrUser, deleteHrUser, isPending: isHrPending } = useHrUsers()
  const [showAddModal, setShowAddModal] = useState(false)
  const [filterRole, setFilterRole] = useState('all')

  if (roleScope !== 'regional') {
    return (
      <section className="flex h-full items-center justify-center rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
        <div className="rounded-xl border border-dashed border-black/10 bg-stone-50 px-8 py-6 text-center text-sm text-muted">
          Only regional admins can manage admin accounts.
        </div>
      </section>
    )
  }

  const allUsers = [
    ...admins.map(a => ({ ...a, userType: 'admin' })),
    ...hrUsers.map(h => ({ ...h, userType: 'hr', role: 'hr', scope: 'office' })),
  ]

  const filteredUsers = filterRole === 'all'
    ? allUsers
    : filterRole === 'hr'
      ? allUsers.filter(u => u.userType === 'hr')
      : allUsers.filter(u => u.userType === 'admin' && u.role === filterRole)

  const handleAddRole = async (data) => {
    if (data.type === 'admin') {
      await handleCreateAdmin({
        email: data.email,
        displayName: data.displayName,
        scope: data.scope,
        officeId: data.officeId,
        role: 'admin',
      })
    } else if (data.type === 'hr') {
      await createHrUser({
        displayName: data.displayName,
        officeId: data.officeId,
        pin: data.pin,
        scope: 'office',
      })
    }
    setShowAddModal(false)
  }

  const handleUpdate = async (user, updates, userType) => {
    if (userType === 'hr') {
      await updateHrUser(user, updates)
    } else {
      await handleUpdateAdmin(user, updates)
    }
  }

  const handleDelete = async (user, userType) => {
    if (userType === 'hr') {
      await deleteHrUser(user)
    } else {
      await handleDeleteAdmin(user)
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-5 overflow-hidden rounded-[2rem] border border-black/5 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-navy-dark">Roles</div>
          <h2 className="mt-1 font-display text-3xl font-bold text-ink">Manage Roles</h2>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="w-full rounded-xl bg-navy px-5 py-3 text-sm font-semibold text-white transition hover:bg-navy-dark sm:w-auto sm:py-2.5"
        >
          + Add Role
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterRole('all')}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
            filterRole === 'all' ? 'bg-navy text-white' : 'bg-stone-100 text-muted hover:bg-stone-200'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilterRole('admin')}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
            filterRole === 'admin' ? 'bg-navy text-white' : 'bg-stone-100 text-muted hover:bg-stone-200'
          }`}
        >
          Admins
        </button>
        <button
          onClick={() => setFilterRole('hr')}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
            filterRole === 'hr' ? 'bg-navy text-white' : 'bg-stone-100 text-muted hover:bg-stone-200'
          }`}
        >
          HR
        </button>
        
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-black/5">
        <div className="divide-y divide-black/5 bg-white lg:hidden">
          {(!adminsLoaded || !hrUsersLoaded) ? (
            <div className="px-4 py-8 text-center text-sm text-muted">Loading...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted">No records found.</div>
          ) : (
            filteredUsers.map((user) => (
              <div key={user.id} className="grid gap-3 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-ink">{user.displayName || user.email}</div>
                    <div className="mt-1 text-xs text-muted">{user.email || 'No email'}</div>
                  </div>
                  <StatusBadge active={user.active !== false} />
                </div>

                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <div className="rounded-xl bg-stone-50 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-widest text-muted">Role</div>
                    <div className="mt-1">
                      {user.userType === 'hr' ? (
                        <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">HR</span>
                      ) : (
                        <select
                          className="w-full rounded-xl border border-black/10 bg-white px-2 py-2 text-xs outline-none transition focus:border-navy capitalize"
                          onChange={(e) => handleUpdate(user, { role: e.target.value }, user.userType)}
                          value={user.role || 'admin'}
                        >
                          <option value="admin">Admin</option>
                          <option value="hr">HR</option>
                        </select>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl bg-stone-50 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-widest text-muted">Scope</div>
                    <div className="mt-1">
                      {user.userType === 'hr' ? (
                        <span className="text-sm text-ink">Office</span>
                      ) : (
                        <select
                          className="w-full rounded-xl border border-black/10 bg-white px-2 py-2 text-xs outline-none transition focus:border-navy"
                          onChange={(e) => handleUpdate(user, { scope: e.target.value, officeId: e.target.value === 'office' ? (user.officeId || '') : '' }, user.userType)}
                          value={user.scope}
                        >
                          <option value="office">Office</option>
                          <option value="regional">Regional</option>
                        </select>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs text-muted">
                  <span>{user.officeId ? 'Assigned office' : 'No office assigned'}</span>
                  <span>{user.userType === 'hr' ? 'HR user' : 'Admin user'}</span>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    className={`rounded-full border px-4 py-2 text-sm font-semibold ${user.active !== false ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                    onClick={() => handleUpdate(user, { active: !user.active }, user.userType)}
                    type="button"
                  >
                    {user.active !== false ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-stone-100"
                    onClick={() => handleDelete(user, user.userType)}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <table className="hidden w-full text-left text-sm lg:table">
          <thead className="sticky top-0 bg-stone-100 text-xs uppercase tracking-widest text-muted">
            <tr>
              <th className="px-5 py-3">User</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Scope</th>
              <th className="px-5 py-3">Office</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 bg-white">
            {(!adminsLoaded || !hrUsersLoaded) ? (
              <tr><td className="px-5 py-8 text-center text-muted" colSpan={6}>Loading...</td></tr>
            ) : filteredUsers.length === 0 ? (
              <tr><td className="px-5 py-8 text-center text-muted" colSpan={6}>No records found.</td></tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user.id} className="bg-white">
                  <td className="px-5 py-3">
                    <div className="font-medium text-ink">{user.displayName || user.email}</div>
                    <div className="text-xs text-muted">{user.email || 'No email'}</div>
                  </td>
                  <td className="px-5 py-3">
                    {user.userType === 'hr' ? (
                      <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">HR</span>
                    ) : (
                      <select
                        className="w-full rounded-xl border border-black/10 bg-white px-2 py-1 text-xs outline-none transition focus:border-navy capitalize"
                        onChange={(e) => handleUpdate(user, { role: e.target.value }, user.userType)}
                        value={user.role || 'admin'}
                      >
                        <option value="admin">Admin</option>
                        <option value="hr">HR</option>
                      </select>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {user.userType === 'hr' ? (
                      <span className="text-xs text-muted">Office</span>
                    ) : (
                      <select
                        className="w-full rounded-xl border border-black/10 bg-white px-2 py-1 text-xs outline-none transition focus:border-navy"
                        onChange={(e) => handleUpdate(user, { scope: e.target.value, officeId: e.target.value === 'office' ? (user.officeId || '') : '' }, user.userType)}
                        value={user.scope}
                      >
                        <option value="office">Office</option>
                        <option value="regional">Regional</option>
                      </select>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-xs text-muted">{user.officeId ? 'Assigned' : '-'}</span>
                  </td>
                  <td className="px-5 py-3"><StatusBadge active={user.active !== false} /></td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${user.active !== false ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                        onClick={() => handleUpdate(user, { active: !user.active }, user.userType)}
                        type="button"
                      >
                        {user.active !== false ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-ink hover:bg-stone-100"
                        onClick={() => handleDelete(user, user.userType)}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AddRoleModal
        adminPending={isPending('admin-create')}
        hrPending={isHrPending('hr-user-create')}
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddRole}
      />
    </section>
  )
}

export const AdminsPanel = memo(AdminsPanelInner)

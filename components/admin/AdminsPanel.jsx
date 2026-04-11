'use client'

import { memo, useState } from 'react'
import { motion } from 'framer-motion'
import { useAdmins, useOffices } from '@/lib/admin/hooks'
import { useAdminStore } from '@/lib/admin/store'
import { Field, Badge, StatusBadge } from '@/components/shared/ui'

function AdminsPanelInner() {
  const { roleScope } = useAdminStore()
  const { admins, adminsLoaded, handleCreateAdmin, handleUpdateAdmin, handleDeleteAdmin, isPending } = useAdmins()
  const { offices } = useOffices()
  const [adminEmail, setAdminEmail] = useState('')
  const [adminDisplayName, setAdminDisplayName] = useState('')
  const [adminScope, setAdminScope] = useState('office')
  const [adminOfficeId, setAdminOfficeId] = useState('')

  if (roleScope !== 'regional') {
    return (
      <motion.section
        animate={{ opacity: 1, y: 0 }}
        className="flex h-full items-center justify-center rounded-[2rem] border border-black/5 bg-white/80 p-6 shadow-glow backdrop-blur"
        initial={{ opacity: 0, y: 18 }}
        transition={{ duration: 0.35 }}
      >
        <div className="rounded-xl border border-dashed border-black/10 bg-stone-50 px-8 py-6 text-center text-sm text-muted">
          Only regional admins can manage admin accounts.
        </div>
      </motion.section>
    )
  }

  const onCreate = () => {
    if (!adminEmail) return
    handleCreateAdmin({ email: adminEmail, displayName: adminDisplayName, scope: adminScope, officeId: adminOfficeId })
    setAdminEmail('')
    setAdminDisplayName('')
    setAdminScope('office')
    setAdminOfficeId('')
  }

  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full flex-col gap-5 rounded-[2rem] border border-black/5 bg-white/80 p-6 shadow-glow backdrop-blur"
      initial={{ opacity: 0, y: 18 }}
      transition={{ duration: 0.35 }}
    >
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-navy-dark">Admins</div>
        <h2 className="mt-1 font-display text-3xl font-bold text-ink">Manage Admins</h2>
      </div>

      <div className="grid gap-3 rounded-xl border border-black/5 bg-stone-50 p-4 lg:grid-cols-2 xl:grid-cols-4">
        <input className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy" onChange={(e) => setAdminEmail(e.target.value)} placeholder="Email" type="email" value={adminEmail} />
        <input className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy" onChange={(e) => setAdminDisplayName(e.target.value)} placeholder="Display name" value={adminDisplayName} />
        <select className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy" onChange={(e) => setAdminScope(e.target.value)} value={adminScope}>
          <option value="office">Office admin</option>
          <option value="regional">Regional admin</option>
        </select>
        <select className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy" disabled={adminScope !== 'office'} onChange={(e) => setAdminOfficeId(e.target.value)} value={adminOfficeId}>
          <option value="">Select office</option>
          {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <div className="lg:col-span-2 xl:col-span-4">
          <button
            className={`rounded-xl bg-navy px-6 py-2 text-sm font-semibold text-white transition hover:bg-navy-dark ${isPending('admin-create') ? 'opacity-50' : ''}`}
            disabled={isPending('admin-create') || !adminEmail}
            onClick={onCreate}
            type="button"
          >
            {isPending('admin-create') ? 'Creating...' : 'Add Admin'}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-black/5">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-stone-100 text-xs uppercase tracking-widest text-muted">
            <tr>
              <th className="px-5 py-3">Admin</th>
              <th className="px-5 py-3">Scope</th>
              <th className="px-5 py-3">Office</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 bg-white">
            {!adminsLoaded ? (
              <tr><td className="px-5 py-8 text-center text-muted" colSpan={5}>Loading...</td></tr>
            ) : admins.length === 0 ? (
              <tr><td className="px-5 py-8 text-center text-muted" colSpan={5}>No admin records yet.</td></tr>
            ) : (
              admins.map((admin) => (
                <tr key={admin.id} className="bg-white">
                  <td className="px-5 py-3">
                    <div className="font-medium text-ink">{admin.displayName || admin.email}</div>
                    <div className="text-xs text-muted">{admin.email}</div>
                  </td>
                  <td className="px-5 py-3">
                    <select
                      className="w-full rounded-xl border border-black/10 bg-white px-2 py-1 text-xs outline-none transition focus:border-navy"
                      onChange={(e) => handleUpdateAdmin(admin, { scope: e.target.value, officeId: e.target.value === 'office' ? (admin.officeId || offices[0]?.id || '') : '' })}
                      value={admin.scope}
                    >
                      <option value="office">Office</option>
                      <option value="regional">Regional</option>
                    </select>
                  </td>
                  <td className="px-5 py-3">
                    <select
                      className="w-full rounded-xl border border-black/10 bg-white px-2 py-1 text-xs outline-none transition focus:border-navy"
                      disabled={admin.scope !== 'office'}
                      onChange={(e) => handleUpdateAdmin(admin, { officeId: e.target.value })}
                      value={admin.scope === 'office' ? admin.officeId : ''}
                    >
                      <option value="">Select</option>
                      {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </td>
                  <td className="px-5 py-3"><StatusBadge active={admin.active} /></td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${admin.active ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'} ${isPending(`admin-update-${admin.id}`) ? 'opacity-50' : ''}`}
                        disabled={isPending(`admin-update-${admin.id}`)}
                        onClick={() => handleUpdateAdmin(admin, { active: !admin.active })}
                        type="button"
                      >
                        {admin.active ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        className={`rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-ink hover:bg-stone-100 ${isPending(`admin-delete-${admin.id}`) ? 'opacity-50' : ''}`}
                        disabled={isPending(`admin-delete-${admin.id}`)}
                        onClick={() => handleDeleteAdmin(admin)}
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
    </motion.section>
  )
}

export const AdminsPanel = memo(AdminsPanelInner)

'use client'

import { motion } from 'framer-motion'
import { useState } from 'react'
import ActionButton from './ActionButton'
import LoadingPanel from './LoadingPanel'

export default function AdminsPanel({
  roleScope,
  offices,
  admins,
  adminsLoaded,
  isPending,
  handleCreateAdmin,
  handleUpdateAdmin,
  handleDeleteAdmin,
}) {
  const [adminEmail, setAdminEmail] = useState('')
  const [adminDisplayName, setAdminDisplayName] = useState('')
  const [adminScope, setAdminScope] = useState('office')
  const [adminOfficeId, setAdminOfficeId] = useState('')

  if (roleScope !== 'regional') {
    return (
      <motion.section
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[2rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur sm:p-6 xl:flex xl:h-full xl:min-h-0 xl:flex-col"
        initial={{ opacity: 0, y: 18 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        <div className="rounded-2xl border border-dashed border-black/10 bg-stone-50 px-4 py-8 text-center text-sm text-muted">
          Only regional admins can manage other admin accounts.
        </div>
      </motion.section>
    )
  }

  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[2rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur sm:p-6 xl:flex xl:h-full xl:min-h-0 xl:flex-col"
      initial={{ opacity: 0, y: 18 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-dark">Admins</div>
        <h2 className="mt-2 font-display text-3xl text-ink">Regional and office admins</h2>
      </div>

      <div className="mt-6 grid gap-4 rounded-[1.5rem] border border-black/5 bg-stone-50 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px_220px]">
        <input
          className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
          onChange={event => setAdminEmail(event.target.value)}
          placeholder="Admin email"
          type="email"
          value={adminEmail}
        />
        <input
          className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
          onChange={event => setAdminDisplayName(event.target.value)}
          placeholder="Display name"
          type="text"
          value={adminDisplayName}
        />
        <select
          className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
          onChange={event => setAdminScope(event.target.value)}
          value={adminScope}
        >
          <option value="office">Office admin</option>
          <option value="regional">Regional admin</option>
        </select>
        <select
          className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
          disabled={adminScope !== 'office'}
          onChange={event => setAdminOfficeId(event.target.value)}
          value={adminOfficeId}
        >
          <option value="">Select office</option>
          {offices.map(office => (
            <option key={`admin-office-create-${office.id}`} value={office.id}>{office.name}</option>
          ))}
        </select>
        <div className="lg:col-span-4">
          <ActionButton
            busy={isPending('admin-create')}
            busyLabel="Creating..."
            className="bg-brand text-white hover:bg-brand-dark"
            label="Add admin"
            onClick={() => {
              handleCreateAdmin({ email: adminEmail, displayName: adminDisplayName, scope: adminScope, officeId: adminOfficeId })
              setAdminEmail('')
              setAdminDisplayName('')
              setAdminScope('office')
              setAdminOfficeId('')
            }}
          />
        </div>
      </div>

      <div className="mt-6 overflow-x-auto xl:min-h-0 xl:flex-1 xl:overflow-auto">
        {!adminsLoaded ? (
          <LoadingPanel
            body="Loading current admin accounts and scopes."
            title="Loading admins"
          />
        ) : (
          <table className="min-w-[1080px] text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-[0.16em] text-muted">
              <tr>
                <th className="px-5 py-4">Admin</th>
                <th className="px-5 py-4">Scope</th>
                <th className="px-5 py-4">Office</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {admins.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-center text-sm text-muted" colSpan={5}>
                    No admin records yet.
                  </td>
                </tr>
              ) : (
                admins.map(admin => (
                  <tr key={admin.id} className="bg-white">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-ink">{admin.displayName || admin.email}</div>
                      <div className="text-sm text-muted">{admin.email}</div>
                    </td>
                    <td className="px-5 py-4">
                      <select
                        className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                        onChange={event => {
                          const nextScope = event.target.value
                          handleUpdateAdmin(admin, {
                            scope: nextScope,
                            officeId: nextScope === 'office' ? (admin.officeId || offices[0]?.id || '') : '',
                          })
                        }}
                        value={admin.scope}
                      >
                        <option value="office">Office admin</option>
                        <option value="regional">Regional admin</option>
                      </select>
                    </td>
                    <td className="px-5 py-4">
                      <select
                        className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
                        disabled={admin.scope !== 'office'}
                        onChange={event => handleUpdateAdmin(admin, { officeId: event.target.value })}
                        value={admin.scope === 'office' ? admin.officeId : ''}
                      >
                        <option value="">Select office</option>
                        {offices.map(office => (
                          <option key={`admin-office-${office.id}`} value={office.id}>{office.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${admin.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                        {admin.active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <ActionButton
                          busy={isPending(`admin-update-${admin.id}`)}
                          busyLabel="Updating..."
                          className={admin.active ? 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100' : 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'}
                        label={admin.active ? 'Disable' : 'Enable'}
                        onClick={() => handleUpdateAdmin(admin, { active: !admin.active })}
                        />
                        <ActionButton
                          busy={isPending(`admin-delete-${admin.id}`)}
                          busyLabel="Deleting..."
                          className="border border-black/10 bg-white text-ink hover:bg-stone-100"
                          label="Delete"
                          onClick={() => handleDeleteAdmin(admin)}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </motion.section>
  )
}




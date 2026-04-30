'use client'

import { memo, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useHrUsers } from '@/lib/admin/hooks/useHrUsers'
import { useOffices } from '@/lib/admin/hooks'
import { useAdminStore } from '@/lib/admin/store'
import { StatusBadge } from '@/components/shared/ui'

function HrUsersPanelInner() {
  const { roleScope } = useAdminStore()
  const { hrUsers, hrUsersLoaded, fetchHrUsers, createHrUser, updateHrUser, deleteHrUser, isPending } = useHrUsers()
  const { offices } = useOffices()
  const [hrEmail, setHrEmail] = useState('')
  const [hrDisplayName, setHrDisplayName] = useState('')
  const [hrScope, setHrScope] = useState('office')
  const [hrOfficeId, setHrOfficeId] = useState('')
  const [hrPin, setHrPin] = useState('')

  useEffect(() => {
    if (roleScope === 'regional') {
      fetchHrUsers()
    }
  }, [roleScope, fetchHrUsers])

  if (roleScope !== 'regional') {
    return (
      <motion.section
        animate={{ opacity: 1, y: 0 }}
        className="flex min-h-64 items-center justify-center bg-white p-6 md:h-full"
        initial={{ opacity: 0, y: 18 }}
        transition={{ duration: 0.35 }}
      >
        <div className="rounded-xl border border-dashed border-black/10 bg-stone-50 px-8 py-6 text-center text-sm text-muted">
          Only regional admins can manage HR user accounts.
        </div>
      </motion.section>
    )
  }

  const onCreate = async () => {
    if (!hrEmail || !hrDisplayName) return
    const result = await createHrUser({
      email: hrEmail,
      displayName: hrDisplayName,
      scope: hrScope,
      officeId: hrOfficeId,
      pin: hrPin,
    })
    if (result.ok) {
      setHrEmail('')
      setHrDisplayName('')
      setHrScope('office')
      setHrOfficeId('')
      setHrPin('')
    }
  }

  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="flex min-h-0 flex-col gap-3 bg-white p-3 sm:gap-5 sm:p-6 md:h-full md:overflow-hidden"
      initial={{ opacity: 0, y: 18 }}
      transition={{ duration: 0.35 }}
    >
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-navy-dark">HR Users</div>
        <h2 className="mt-1 font-display text-2xl font-bold text-ink sm:text-3xl">Manage HR</h2>
      </div>

      <div className="grid gap-3 rounded-xl border border-black/5 bg-stone-50 p-3 sm:p-4 lg:grid-cols-2 xl:grid-cols-4">
        <input className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy" onChange={(e) => setHrEmail(e.target.value)} placeholder="Email" type="email" value={hrEmail} />
        <input className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy" onChange={(e) => setHrDisplayName(e.target.value)} placeholder="Display name" value={hrDisplayName} />
        <select className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy" onChange={(e) => setHrScope(e.target.value)} value={hrScope}>
          <option value="office">Office HR</option>
          <option value="regional">Regional HR</option>
        </select>
        <select className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy" disabled={hrScope !== 'office'} onChange={(e) => setHrOfficeId(e.target.value)} value={hrOfficeId}>
          <option value="">Select office</option>
          {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <input autoComplete="new-password" className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy" onChange={(e) => setHrPin(e.target.value)} placeholder="PIN (optional)" type="password" value={hrPin} maxLength={8} />
        <div className="lg:col-span-2 xl:col-span-3">
          <button
            className={`rounded-xl bg-navy px-6 py-2 text-sm font-semibold text-white transition hover:bg-navy-dark ${isPending('hr-user-create') ? 'opacity-50' : ''}`}
            disabled={isPending('hr-user-create') || !hrEmail || !hrDisplayName}
            onClick={onCreate}
            type="button"
          >
            {isPending('hr-user-create') ? 'Creating...' : 'Add HR User'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-black/5 md:min-h-0 md:flex-1 md:overflow-auto">
        {!hrUsersLoaded ? (
          <div className="px-4 py-8 text-center text-sm text-muted">Loading...</div>
        ) : hrUsers.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted">No HR user records yet.</div>
        ) : (
          <>
            <div className="divide-y divide-black/5 bg-white lg:hidden">
              {hrUsers.map((hr) => (
                <div key={hr.id} className="grid gap-3 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-base font-semibold text-ink">{hr.displayName || hr.email}</div>
                      <div className="mt-1 text-xs text-muted">{hr.email}</div>
                    </div>
                    <StatusBadge active={hr.active} />
                  </div>
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <div className="rounded-xl bg-stone-50 px-3 py-2">
                      <div className="text-[11px] uppercase tracking-widest text-muted">Scope</div>
                      <div className="mt-1">
                        <select
                          className="w-full rounded-xl border border-black/10 bg-white px-2 py-2 text-xs outline-none transition focus:border-navy"
                          onChange={(e) => updateHrUser(hr, { scope: e.target.value, officeId: e.target.value === 'office' ? (hr.officeId || offices[0]?.id || '') : '' })}
                          value={hr.scope}
                        >
                          <option value="office">Office</option>
                          <option value="regional">Regional</option>
                        </select>
                      </div>
                    </div>
                    <div className="rounded-xl bg-stone-50 px-3 py-2">
                      <div className="text-[11px] uppercase tracking-widest text-muted">Office</div>
                      <div className="mt-1">
                        <select
                          className="w-full rounded-xl border border-black/10 bg-white px-2 py-2 text-xs outline-none transition focus:border-navy"
                          disabled={hr.scope !== 'office'}
                          onChange={(e) => updateHrUser(hr, { officeId: e.target.value })}
                          value={hr.scope === 'office' ? hr.officeId : ''}
                        >
                          <option value="">Select</option>
                          {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      className={`rounded-full border px-4 py-2 text-sm font-semibold ${hr.active ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'} ${isPending(`hr-user-update-${hr.id}`) ? 'opacity-50' : ''}`}
                      disabled={isPending(`hr-user-update-${hr.id}`)}
                      onClick={() => updateHrUser(hr, { active: !hr.active })}
                      type="button"
                    >
                      {hr.active ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      className={`rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-stone-100 ${isPending(`hr-user-delete-${hr.id}`) ? 'opacity-50' : ''}`}
                      disabled={isPending(`hr-user-delete-${hr.id}`)}
                      onClick={() => deleteHrUser(hr)}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <table className="hidden w-full text-left text-sm lg:table">
              <thead className="sticky top-0 bg-stone-100 text-xs uppercase tracking-widest text-muted">
                <tr>
                  <th className="px-5 py-3">HR User</th>
                  <th className="px-5 py-3">Scope</th>
                  <th className="px-5 py-3">Office</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 bg-white">
                {hrUsers.map((hr) => (
                  <tr key={hr.id} className="bg-white">
                    <td className="px-5 py-3">
                      <div className="font-medium text-ink">{hr.displayName || hr.email}</div>
                      <div className="text-xs text-muted">{hr.email}</div>
                    </td>
                    <td className="px-5 py-3">
                      <select
                        className="w-full rounded-xl border border-black/10 bg-white px-2 py-1 text-xs outline-none transition focus:border-navy"
                        onChange={(e) => updateHrUser(hr, { scope: e.target.value, officeId: e.target.value === 'office' ? (hr.officeId || offices[0]?.id || '') : '' })}
                        value={hr.scope}
                      >
                        <option value="office">Office</option>
                        <option value="regional">Regional</option>
                      </select>
                    </td>
                    <td className="px-5 py-3">
                      <select
                        className="w-full rounded-xl border border-black/10 bg-white px-2 py-1 text-xs outline-none transition focus:border-navy"
                        disabled={hr.scope !== 'office'}
                        onChange={(e) => updateHrUser(hr, { officeId: e.target.value })}
                        value={hr.scope === 'office' ? hr.officeId : ''}
                      >
                        <option value="">Select</option>
                        {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    </td>
                    <td className="px-5 py-3"><StatusBadge active={hr.active} /></td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${hr.active ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'} ${isPending(`hr-user-update-${hr.id}`) ? 'opacity-50' : ''}`}
                          disabled={isPending(`hr-user-update-${hr.id}`)}
                          onClick={() => updateHrUser(hr, { active: !hr.active })}
                          type="button"
                        >
                          {hr.active ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          className={`rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-ink hover:bg-stone-100 ${isPending(`hr-user-delete-${hr.id}`) ? 'opacity-50' : ''}`}
                          disabled={isPending(`hr-user-delete-${hr.id}`)}
                          onClick={() => deleteHrUser(hr)}
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </motion.section>
  )
}

export const HrUsersPanel = memo(HrUsersPanelInner)

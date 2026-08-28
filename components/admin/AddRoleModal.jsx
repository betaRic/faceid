'use client'

import { useMemo, useState } from 'react'
import { useAdminStore } from '@/lib/admin/store'
import { Button, Dialog, Field, Input, Select } from '@/components/ui'

function AddRoleModal({ isOpen, onClose, onSubmit, adminPending = false, hrPending = false }) {
  const offices = useAdminStore((state) => state.offices)
  const [roleType, setRoleType] = useState('admin')
  const [errors, setErrors] = useState({})

  const [adminEmail, setAdminEmail] = useState('')
  const [adminDisplayName, setAdminDisplayName] = useState('')
  const [adminScope, setAdminScope] = useState('office')
  const [adminOfficeId, setAdminOfficeId] = useState('')
  const [adminPin, setAdminPin] = useState('')

  const [hrDisplayName, setHrDisplayName] = useState('')
  const [hrOfficeId, setHrOfficeId] = useState('')
  const [hrPin, setHrPin] = useState('')
  const isPending = roleType === 'admin' ? adminPending : hrPending

  const validation = useMemo(() => {
    if (roleType === 'admin') {
      return {
        adminDisplayName: !adminDisplayName.trim() ? 'Display name is required.' : '',
        adminOfficeId: adminScope === 'office' && !adminOfficeId ? 'Choose an office.' : '',
        adminPin: !/^\d{4,8}$/.test(adminPin) ? 'PIN must be 4 to 8 digits.' : '',
      }
    }

    return {
      hrDisplayName: !hrDisplayName.trim() ? 'Display name is required.' : '',
      hrOfficeId: !hrOfficeId ? 'Choose an office.' : '',
      hrPin: !/^\d{4,8}$/.test(hrPin)
        ? 'PIN must be 4 to 8 digits.'
        : '',
    }
  }, [
    adminDisplayName,
    adminEmail,
    adminOfficeId,
    adminPin,
    adminScope,
    hrDisplayName,
    hrOfficeId,
    hrPin,
    roleType,
  ])

  const handleSubmit = (event) => {
    event?.preventDefault?.()
    const nextErrors = Object.fromEntries(
      Object.entries(validation).filter(([, value]) => value),
    )
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    if (roleType === 'admin') {
      onSubmit({
        type: 'admin',
        email: adminEmail.trim(),
        displayName: adminDisplayName.trim(),
        scope: adminScope,
        officeId: adminScope === 'office' ? adminOfficeId : '',
        pin: adminPin,
      })
    } else {
      onSubmit({
        type: 'hr',
        displayName: hrDisplayName.trim(),
        scope: 'office',
        officeId: hrOfficeId,
        pin: hrPin,
      })
    }
    resetForm()
  }

  const resetForm = () => {
    setAdminEmail('')
    setAdminDisplayName('')
    setAdminScope('office')
    setAdminOfficeId('')
    setAdminPin('')
    setHrDisplayName('')
    setHrOfficeId('')
    setHrPin('')
    setErrors({})
    setRoleType('admin')
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  if (!isOpen) return null

  return (
    <Dialog
      open={isOpen}
      title="Add role"
      onClose={handleClose}
      footer={(
        <>
          <Button onClick={handleClose} variant="secondary">Cancel</Button>
          <Button disabled={isPending} form="add-role-form" type="submit">
            {isPending ? 'Creating…' : 'Create role'}
          </Button>
        </>
      )}
    >
      <form className="grid gap-5" id="add-role-form" onSubmit={handleSubmit}>
        <p className="text-sm leading-6 text-secondary">Create an administrator or Office HR account. PIN values are accepted here but are never displayed after creation.</p>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-foreground">Account type</legend>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['admin', 'Administrator'],
              ['hr', 'Office HR'],
            ].map(([value, label]) => (
              <Button
                aria-pressed={roleType === value}
                key={value}
                onClick={() => { setRoleType(value); setErrors({}) }}
                variant={roleType === value ? 'primary' : 'secondary'}
              >
                {label}
              </Button>
            ))}
          </div>
        </fieldset>

        {roleType === 'admin' ? (
          <>
            <Field label="Email (optional)" hint="PIN can be used to sign in when no email is supplied.">
              <Input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
            </Field>
            <Field error={errors.adminDisplayName} label="Display name" required>
              <Input value={adminDisplayName} onChange={(e) => { setAdminDisplayName(e.target.value); setErrors((current) => ({ ...current, adminDisplayName: '' })) }} />
            </Field>
            <Field label="Scope" required>
              <Select value={adminScope} onChange={(e) => { setAdminScope(e.target.value); if (e.target.value === 'regional') setAdminOfficeId('') }}>
                <option value="office">Office — assigned office only</option>
                <option value="regional">Regional — all offices</option>
              </Select>
            </Field>
            {adminScope === 'office' ? (
              <Field error={errors.adminOfficeId} label="Office" required>
                <Select value={adminOfficeId} onChange={(e) => { setAdminOfficeId(e.target.value); setErrors((current) => ({ ...current, adminOfficeId: '' })) }}>
                  <option value="">Select office</option>
                  {offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
                </Select>
              </Field>
            ) : null}
            <Field error={errors.adminPin} label="PIN" hint="Use 4 to 8 digits." required>
              <Input autoComplete="new-password" inputMode="numeric" maxLength={8} type="password" value={adminPin} onChange={(e) => { setAdminPin(e.target.value.replace(/\D/g, '')); setErrors((current) => ({ ...current, adminPin: '' })) }} />
            </Field>
          </>
        ) : (
          <>
            <Field error={errors.hrDisplayName} label="Display name" required>
              <Input value={hrDisplayName} onChange={(e) => { setHrDisplayName(e.target.value); setErrors((current) => ({ ...current, hrDisplayName: '' })) }} />
            </Field>
            <Field error={errors.hrOfficeId} label="Office" hint="Office HR remains restricted to this office." required>
              <Select value={hrOfficeId} onChange={(e) => { setHrOfficeId(e.target.value); setErrors((current) => ({ ...current, hrOfficeId: '' })) }}>
                <option value="">Select office</option>
                {offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
              </Select>
            </Field>
            <Field error={errors.hrPin} label="PIN" hint="Use 4 to 8 digits." required>
              <Input autoComplete="new-password" inputMode="numeric" maxLength={8} type="password" value={hrPin} onChange={(e) => { setHrPin(e.target.value.replace(/\D/g, '')); setErrors((current) => ({ ...current, hrPin: '' })) }} />
            </Field>
          </>
        )}
      </form>
    </Dialog>
  )
}

export { AddRoleModal }

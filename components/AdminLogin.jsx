'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import AppShell from './AppShell'
import BrandMark from './BrandMark'
import { Button, Field, Input, Surface } from './ui'

export default function AdminLogin() {
  const router = useRouter()
  const [status, setStatus] = useState('')
  const [pin, setPin] = useState('')
  const [pinSubmitting, setPinSubmitting] = useState(false)

  async function handlePinLogin() {
    if (!pin.trim()) { setStatus('Enter your PIN.'); return }
    setPinSubmitting(true)
    setStatus('')
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginType: 'pin', pin: pin.trim() }),
      })
      const data = await response.json().catch(() => ({ ok: false, message: 'PIN login failed.' }))
      if (!response.ok || !data.ok) {
        setStatus(data.message || 'PIN login failed.')
        setPinSubmitting(false)
        return
      }
      setPin('')
      router.push('/admin')
      router.refresh()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to complete regional PIN login.')
      setPinSubmitting(false)
    }
  }

  return (
    <AppShell showNavigation={false}>
      <section className="container-fluid flex flex-1 items-center py-10">
        <Surface className="mx-auto w-full max-w-md p-6 sm:p-8">
          <BrandMark />
          <h1 className="mt-6 text-2xl font-semibold text-primary">Staff sign in</h1>
          <p className="mt-2 text-sm leading-6 text-secondary">Use your regional administrator or Office HR PIN.</p>

          <form
            className="mt-6 grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              handlePinLogin()
            }}
          >
            <Field htmlFor="staff-pin" label="PIN">
              <Input
                autoComplete="current-password"
                id="staff-pin"
                onChange={(event) => setPin(event.target.value)}
                placeholder="Enter PIN"
                type="password"
                value={pin}
              />
            </Field>
            <Button disabled={pinSubmitting} type="submit">
              {pinSubmitting ? 'Signing in…' : 'Continue'}
            </Button>
          </form>

          {status ? <div className="mt-4 rounded-control border border-destructive-line bg-destructive-surface px-4 py-3 text-sm text-destructive" role="alert">{status}</div> : null}

          <Link className="mt-6 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline" href="/">
            Back to home
          </Link>
        </Surface>
      </section>
    </AppShell>
  )
}

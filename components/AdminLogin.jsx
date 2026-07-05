'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import BrandMark from './BrandMark'
import AppShell from './AppShell'

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
    <AppShell>
      {/* Hero band */}
      <section className="w-full bg-hero-gradient py-14">
        <div className="container-fluid">
          <BrandMark inverted />
<motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="mt-5 text-3xl font-bold text-white sm:text-4xl"
          >
            Login Portal
          </motion.h1>
          <p className="mt-2 text-sm text-sky/70">Admin and HR access.</p>
        </div>
      </section>

      {/* Login card */}
      <section className="w-full bg-off-white py-10">
        <div className="container-fluid">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.15 }}
            className="mx-auto max-w-lg"
          >
            <div className="card p-7">
              <h2 className="text-xl font-bold text-navy">Sign in to your account</h2>
              <p className="mt-1 text-sm text-slate-light">
                Use a local admin or HR PIN.
              </p>

              <div className="mt-6 space-y-4">
                {/* PIN login */}
                <form
                  className="rounded-xl border border-navy/8 bg-sky-light/40 p-5"
                  onSubmit={(event) => {
                    event.preventDefault()
                    handlePinLogin()
                  }}
                >
                  <label className="field-label">PIN</label>
                  <div className="mt-1 flex gap-2">
                    <input
                      autoComplete="current-password"
                      className="input flex-1"
                      type="password"
                      placeholder="Enter PIN"
                      value={pin}
                      onChange={e => setPin(e.target.value)}
                    />
                    <button
                      className="btn btn-primary shrink-0 px-5"
                      disabled={pinSubmitting}
                      type="submit"
                    >
                      {pinSubmitting ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : 'Continue'}
                    </button>
                  </div>
                </form>

              </div>

              {/* Error */}
              {status && (
                <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {status}
                </div>
              )}

              {/* Notice */}
              <div className="mt-5 rounded-xl bg-sky-light/50 px-4 py-3 text-xs leading-relaxed text-slate">
                The bootstrap regional PIN grants regional admin access. Admin and HR user PINs are managed locally.
              </div>

              <div className="mt-5">
                <Link href="/" className="text-xs text-slate-light hover:text-navy transition-colors">
                  ← Back to home
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </AppShell>
  )
}

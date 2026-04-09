'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'
import BrandMark from './BrandMark'
import AppShell from './AppShell'
import { auth } from '../lib/firebase'

export default function AdminLogin() {
  const router = useRouter()
  const [status, setStatus] = useState('')
  const [googleSubmitting, setGoogleSubmitting] = useState(false)
  const [pin, setPin] = useState('')
  const [pinSubmitting, setPinSubmitting] = useState(false)

  async function handleGoogleLogin() {
    if (!auth) {
      setStatus('Firebase Auth is not configured in this deployment.')
      return
    }

    setGoogleSubmitting(true)
    setStatus('')

    try {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      const credential = await signInWithPopup(auth, provider)
      const idToken = await credential.user.getIdToken(true)

      const response = await fetch('/api/admin/firebase-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      })

      const data = await response.json().catch(() => ({ ok: false, message: 'Google admin login failed.' }))
      if (!response.ok || !data.ok) {
        setStatus(data.message || 'Google admin login failed.')
        await signOut(auth).catch(() => {})
        setGoogleSubmitting(false)
        return
      }

      await signOut(auth).catch(() => {})
      router.push('/admin')
      router.refresh()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to complete Google admin login.')
      setGoogleSubmitting(false)
    }
  }

  async function handlePinLogin() {
    if (!pin.trim()) {
      setStatus('Enter the regional PIN.')
      return
    }

    setPinSubmitting(true)
    setStatus('')

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin.trim() }),
      })

      const data = await response.json().catch(() => ({ ok: false, message: 'Regional PIN login failed.' }))
      if (!response.ok || !data.ok) {
        setStatus(data.message || 'Regional PIN login failed.')
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
    <AppShell contentClassName="px-4 py-6 sm:px-6 lg:px-8">
      <div className="page-frame flex flex-col gap-4">
        <section className="grid gap-4 rounded-[1.6rem] border border-black/5 bg-white/70 p-5 shadow-glow backdrop-blur xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,460px)]">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <BrandMark />
            <h1 className="mt-3 font-display text-3xl leading-tight text-ink sm:text-4xl">
              Admin login
            </h1>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex items-center justify-center rounded-[1rem] border border-black/10 bg-white/80 px-5 py-3 text-sm font-semibold text-ink transition hover:bg-white sm:rounded-full"
                href="/"
              >
                Back to navigation
              </Link>
            </div>
          </motion.div>

          <motion.div
            animate={{ opacity: 1, x: 0 }}
            className="rounded-[1.5rem] border border-black/5 bg-white/90 p-5 shadow-glow"
            initial={{ opacity: 0, x: 18 }}
            transition={{ duration: 0.4, ease: 'easeOut', delay: 0.08 }}
          >
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">Admin Login</span>
            <h2 className="mt-2 font-display text-3xl text-ink">Login</h2>

            <div className="mt-6 grid gap-3">
              <div className="rounded-[1.25rem] border border-black/5 bg-stone-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">Regional access</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <input
                    className="w-full rounded-[1rem] border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand sm:rounded-full"
                    onChange={event => setPin(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') handlePinLogin()
                    }}
                    placeholder="Enter regional PIN"
                    type="password"
                    value={pin}
                  />
                  <button
                    className="inline-flex min-h-12 items-center justify-center rounded-[1rem] bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50 sm:rounded-full"
                    disabled={pinSubmitting}
                    onClick={handlePinLogin}
                    type="button"
                  >
                    {pinSubmitting ? 'Signing in...' : 'Continue with PIN'}
                  </button>
                </div>
              </div>

              <button
                className="inline-flex min-h-12 w-full items-center justify-center rounded-[1rem] border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50 sm:rounded-full"
                disabled={googleSubmitting}
                onClick={handleGoogleLogin}
                type="button"
              >
                {googleSubmitting ? 'Signing in with Google...' : 'Continue with Google'}
              </button>
            </div>

            {status ? (
              <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm leading-7 text-warn">{status}</div>
            ) : null}

            <div className="mt-5 rounded-2xl border border-black/5 bg-stone-50 px-4 py-4 text-sm leading-7 text-muted">
              Regional PIN login is regional-only. Google login still uses approved admin records.
            </div>
          </motion.div>
        </section>
      </div>
    </AppShell>
  )
}

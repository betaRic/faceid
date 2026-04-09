'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'
import BrandMark from './BrandMark'
import AppShell from './AppShell'
import { auth } from '../lib/firebase/client'

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
    if (!pin.trim()) { setStatus('Enter the regional PIN.'); return }
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
            Admin Portal
          </motion.h1>
          <p className="mt-2 text-sm text-sky/70">Regional and office administrator access.</p>
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
                Use your regional PIN or a Google account linked to an admin record.
              </p>

              <div className="mt-6 space-y-4">
                {/* PIN login */}
                <div className="rounded-xl border border-navy/8 bg-sky-light/40 p-5">
                  <label className="field-label">Regional PIN</label>
                  <div className="mt-1 flex gap-2">
                    <input
                      className="input flex-1"
                      type="password"
                      placeholder="Enter regional PIN"
                      value={pin}
                      onChange={e => setPin(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handlePinLogin() }}
                    />
                    <button
                      className="btn btn-primary shrink-0 px-5"
                      disabled={pinSubmitting}
                      onClick={handlePinLogin}
                      type="button"
                    >
                      {pinSubmitting ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : 'Continue'}
                    </button>
                  </div>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-navy/8" />
                  <span className="text-xs font-medium text-slate-light">or</span>
                  <div className="h-px flex-1 bg-navy/8" />
                </div>

                {/* Google login */}
                <button
                  className="btn btn-ghost w-full py-3 text-sm"
                  disabled={googleSubmitting}
                  onClick={handleGoogleLogin}
                  type="button"
                >
                  {googleSubmitting ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-navy border-t-transparent" />
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                  )}
                  Continue with Google
                </button>
              </div>

              {/* Error */}
              {status && (
                <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {status}
                </div>
              )}

              {/* Notice */}
              <div className="mt-5 rounded-xl bg-sky-light/50 px-4 py-3 text-xs leading-relaxed text-slate">
                Regional PIN login grants regional admin access. Google login is validated against admin records in Firestore.
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

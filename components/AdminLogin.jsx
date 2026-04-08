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

  return (
    <AppShell contentClassName="px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <section className="grid gap-4 rounded-[1.6rem] border border-black/5 bg-white/70 p-5 shadow-glow backdrop-blur xl:grid-cols-[1.1fr_.75fr]">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <BrandMark />
            <h1 className="mt-3 font-display text-3xl leading-tight text-ink sm:text-4xl">
              Admin access should be server-validated, not hidden by client state.
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted sm:text-base">
              Shared PIN login was weak and has been removed. Google sign-in plus server-managed admin records is the
              correct model for a shared Vercel deployment.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white/80 px-5 py-3 text-sm font-semibold text-ink transition hover:bg-white"
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
            <p className="mt-3 text-sm leading-7 text-muted">
              Use Google for named admin access. The first regional admin can be bootstrapped from the server allowlist,
              then all later admin roles should be managed from the admin workspace itself.
            </p>

            <button
              className="mt-6 inline-flex w-full items-center justify-center rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={googleSubmitting}
              onClick={handleGoogleLogin}
              type="button"
            >
              {googleSubmitting ? 'Signing in with Google...' : 'Continue with Google'}
            </button>

            {status ? (
              <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm leading-7 text-warn">{status}</div>
            ) : null}

            <div className="mt-5 rounded-2xl border border-black/5 bg-stone-50 px-4 py-4 text-sm leading-7 text-muted">
              If a Google account is verified but does not have an admin record yet, access stays blocked until a
              regional admin adds that person in the Admins panel.
            </div>
          </motion.div>
        </section>
      </div>
    </AppShell>
  )
}

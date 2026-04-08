'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import BrandMark from './BrandMark'

export default function AdminLogin() {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [status, setStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setStatus('')

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })

      const data = await response.json().catch(() => ({ ok: false, message: 'Login failed.' }))
      if (!response.ok || !data.ok) {
        setStatus(data.message || 'Login failed.')
        setSubmitting(false)
        return
      }

      router.push('/admin')
      router.refresh()
    } catch {
      setStatus('Unable to reach the login endpoint.')
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-hero-wash px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="grid gap-5 rounded-[2rem] border border-black/5 bg-white/70 p-6 shadow-glow backdrop-blur xl:grid-cols-[1.15fr_.85fr] xl:p-8">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <BrandMark />
            <h1 className="mt-4 font-display text-4xl leading-none text-ink sm:text-5xl">
              Admin access should be server-validated, not hidden by client state.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-muted">
              This login issues a server-side session cookie after verifying the configured PIN. It is a real step up
              from the previous fake client unlock, but it still depends on proper environment configuration and
              Firestore security rules to be production-ready.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white/80 px-5 py-3 text-sm font-semibold text-ink transition hover:bg-white"
                href="/"
              >
                Back to navigation
              </Link>
            </div>
          </motion.div>

          <motion.form
            animate={{ opacity: 1, x: 0 }}
            className="rounded-[1.75rem] border border-black/5 bg-white/90 p-6 shadow-glow"
            initial={{ opacity: 0, x: 18 }}
            onSubmit={handleSubmit}
            transition={{ duration: 0.4, ease: 'easeOut', delay: 0.08 }}
          >
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-dark">Admin PIN</span>
            <h2 className="mt-2 font-display text-3xl text-ink">Login</h2>
            <p className="mt-3 text-sm leading-7 text-muted">
              Requires `ADMIN_PIN_HASH` or `ADMIN_PIN` plus `ADMIN_SESSION_SECRET` on the server.
            </p>

            <input
              className="mt-6 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-brand"
              onChange={event => setPin(event.target.value)}
              placeholder="Enter admin PIN"
              type="password"
              value={pin}
            />

            {status ? (
              <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-warn">{status}</div>
            ) : null}

            <button
              className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
              disabled={submitting || !pin.trim()}
              type="submit"
            >
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </motion.form>
        </section>
      </div>
    </main>
  )
}

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
  const [submitting, setSubmitting] = useState(false)

  async function handleGoogleLogin() {
    if (!auth) {
      setStatus('Firebase Auth is not configured in this deployment.')
      return
    }
    setSubmitting(true)
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
      const data = await response.json().catch(() => ({ ok: false, message: 'Login failed.' }))

      if (!response.ok || !data.ok) {
        setStatus(data.message || 'Google admin login failed.')
        await signOut(auth).catch(() => {})
        setSubmitting(false)
        return
      }

      await signOut(auth).catch(() => {})
      router.push('/admin')
      router.refresh()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to complete Google login.')
      setSubmitting(false)
    }
  }

  return (
    <AppShell contentClassName="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-md flex-col items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full"
        >
          {/* Card */}
          <div className="rounded-3xl border border-black/[0.06] bg-white/80 p-8 shadow-sm backdrop-blur-sm">
            <div className="mb-8 flex justify-center">
              <BrandMark />
            </div>

            <div className="mb-6 text-center">
              <h1 className="font-display text-2xl text-ink">Admin Portal</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Sign in with your authorized Google account to access the admin workspace.
              </p>
            </div>

            <button
              onClick={handleGoogleLogin}
              disabled={submitting}
              type="button"
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-black/10 bg-white px-5 py-3.5 text-sm font-semibold text-ink shadow-sm transition-all duration-200 hover:bg-stone-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              {!submitting && (
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              )}
              {submitting ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in…
                </span>
              ) : (
                'Continue with Google'
              )}
            </button>

            {status && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {status}
              </motion.div>
            )}

            <div className="mt-6 rounded-xl bg-stone-50 px-4 py-3 text-xs leading-relaxed text-muted">
              Access is granted only to accounts with an active admin record in the system. Contact a regional admin to request access.
            </div>
          </div>

          <div className="mt-4 text-center">
            <Link href="/" className="text-sm text-muted transition-colors hover:text-ink">
              ← Back to home
            </Link>
          </div>
        </motion.div>
      </div>
    </AppShell>
  )
}

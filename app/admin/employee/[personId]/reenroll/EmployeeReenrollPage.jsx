'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'

const EmployeeReenrollPanel = dynamic(
  () => import('@/components/admin/EmployeeReenrollPanel'),
  { ssr: false, loading: () => <LoadingState /> }
)

function LoadingState() {
  return (
    <div className="flex min-h-[40rem] items-center justify-center">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-navy border-t-transparent" />
        <p className="mt-4 text-sm font-medium text-ink">Loading re-enrollment...</p>
      </div>
    </div>
  )
}

export default function EmployeeReenrollPage({ person }) {
  const router = useRouter()

  const handleComplete = async ({ sampleCount, message }) => {
    // Navigate back to admin employees with success message
    router.push('/admin?reenroll=success')
  }

  const handleBack = () => {
    router.push('/admin')
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="container mx-auto flex items-center gap-4 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2 text-sm font-medium text-navy hover:text-navy-dark">
            ← Back to Dashboard
          </Link>
          <div className="h-4 w-px bg-black/10" />
          <div className="text-sm text-muted">
            Live Re-enrollment
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm font-medium text-ink">{person.name}</span>
            <span className="text-xs text-muted">({person.employeeId})</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <EmployeeReenrollPanel
          person={person}
          onBack={handleBack}
          onComplete={handleComplete}
        />
      </main>
    </div>
  )
}
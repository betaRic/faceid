'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useAdminStore } from '@/lib/admin/store'

const EmployeeReenrollPanel = dynamic(
  () => import('@/components/admin/EmployeeReenrollPanel'),
  { ssr: false, loading: () => <LoadingState /> }
)

function LoadingState() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-navy border-t-transparent" />
        <p className="mt-4 text-sm font-medium text-ink">Loading re-enrollment...</p>
      </div>
    </div>
  )
}

export default function EmployeeReenrollPage({ person }) {
  const router = useRouter()
  const addToast = useAdminStore((state) => state.addToast)

  const handleComplete = async ({ sampleCount, message }) => {
    addToast(
      message || `Live re-enrollment saved for ${person.name} with ${sampleCount} sample(s).`,
      'success',
      4500,
    )
    router.push('/admin')
  }

  const handleBack = () => {
    router.push('/admin')
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-stone-50">
      <header className="shrink-0 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="flex items-center gap-2 text-sm font-medium text-navy hover:text-navy-dark">
              ← Back
            </Link>
            <div className="hidden h-4 w-px bg-black/10 sm:block" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-ink">Live Re-enrollment</div>
            <div className="truncate text-xs text-muted">{person.name} · {person.employeeId} · {person.officeName}</div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl min-h-0 flex-1 overflow-hidden px-4 py-4 sm:px-6 sm:py-6">
        <EmployeeReenrollPanel
          person={person}
          onBack={handleBack}
          onComplete={handleComplete}
        />
      </main>
    </div>
  )
}

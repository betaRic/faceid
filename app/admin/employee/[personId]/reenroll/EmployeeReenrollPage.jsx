'use client'

import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useAdminStore } from '@/lib/admin/store'
import { Button, Icon, LoadingState as SharedLoadingState, PageHeader, Status } from '@/components/ui'

const EmployeeReenrollPanel = dynamic(
  () => import('@/components/admin/EmployeeReenrollPanel'),
  { ssr: false, loading: () => <LoadingState /> }
)

function LoadingState() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <SharedLoadingState>Loading profile refresh…</SharedLoadingState>
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
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-canvas">
      <header className="shrink-0 border-b border-line bg-surface">
        <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6">
          <PageHeader
            title={person.name}
            description={[person.employeeId ? `Employee ID ${person.employeeId}` : 'No Employee ID assigned', person.officeName || 'Office not assigned'].join(' · ')}
            actions={<Button aria-label="Back to admin" onClick={handleBack} variant="secondary"><Icon name="arrow-left" />Back to admin</Button>}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Status tone="review">Authorized profile refresh</Status>
            <p className="text-sm text-secondary">Existing attendance and identity records remain intact.</p>
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

'use client'

import dynamic from 'next/dynamic'
import { ErrorBoundary } from '@/components/ErrorBoundary'

const AdminDashboard = dynamic(() => import('@/components/AdminDashboard'), { ssr: false })

export default function DynamicAdminDashboard(props) {
  return (
    <ErrorBoundary>
      <AdminDashboard {...props} />
    </ErrorBoundary>
  )
}

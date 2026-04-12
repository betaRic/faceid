'use client'

import dynamic from 'next/dynamic'

const AdminDashboard = dynamic(() => import('@/components/AdminDashboard'), { 
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-navy border-t-transparent" />
        <span className="text-sm text-muted">Loading workspace...</span>
      </div>
    </div>
  )
})

export default function DynamicAdminDashboard(props) {
  return <AdminDashboard {...props} />
}

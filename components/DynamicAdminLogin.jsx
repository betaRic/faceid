'use client'
import dynamic from 'next/dynamic'

const AdminLogin = dynamic(() => import('./AdminLogin'), { ssr: false })

export default function DynamicAdminLogin() {
  return <AdminLogin />
}

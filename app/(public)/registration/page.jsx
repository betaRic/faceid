'use client'

import dynamic from 'next/dynamic'

const RegisterRuntimeApp = dynamic(() => import('@/components/RegisterRuntimeApp'), { ssr: false })

export default function RegistrationPage() {
  return <RegisterRuntimeApp />
}

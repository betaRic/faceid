'use client'

import dynamic from 'next/dynamic'

const ScanRuntimeApp = dynamic(() => import('@/components/ScanRuntimeApp'), { ssr: false })

export default function ScanPage() {
  return <ScanRuntimeApp />
}

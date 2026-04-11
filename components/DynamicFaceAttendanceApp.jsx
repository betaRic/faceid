'use client'

import dynamic from 'next/dynamic'

const FaceAttendanceApp = dynamic(() => import('@/components/FaceAttendanceApp'), { ssr: false })

export default function DynamicFaceAttendanceApp(props) {
  return <FaceAttendanceApp {...props} />
}

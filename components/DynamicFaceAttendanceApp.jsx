'use client'
import dynamic from 'next/dynamic'

const FaceAttendanceApp = dynamic(() => import('./FaceAttendanceApp'), { ssr: false })

export default function DynamicFaceAttendanceApp(props) {
  return <FaceAttendanceApp {...props} />
}


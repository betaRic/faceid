import dynamic from 'next/dynamic'

const FaceAttendanceApp = dynamic(() => import('../../components/FaceAttendanceApp'), {
  ssr: false,
})

export default function KioskPage() {
  return <FaceAttendanceApp initialPage="kiosk" />
}

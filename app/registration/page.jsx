import dynamic from 'next/dynamic'

const FaceAttendanceApp = dynamic(() => import('../../components/FaceAttendanceApp'), {
  ssr: false,
})

export default function RegistrationPage() {
  return <FaceAttendanceApp initialPage="register" />
}

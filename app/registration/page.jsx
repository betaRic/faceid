import DynamicFaceAttendanceApp from '@/components/DynamicFaceAttendanceApp.jsx'

export default function RegistrationPage() {
  return <DynamicFaceAttendanceApp initialPage='register' loadPersons={false} loadAttendance={false} showRegistrationAction={false} />
}


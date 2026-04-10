import DynamicFaceAttendanceApp from '@/components/DynamicFaceAttendanceApp.jsx'

export default function KioskPage() {
  return <DynamicFaceAttendanceApp initialPage='kiosk' loadPersons={false} loadAttendance={false} />
}


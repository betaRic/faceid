import dynamic from 'next/dynamic'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAdminSessionCookieName, parseAdminSessionCookieValue } from '../../lib/admin-auth'

const AdminDashboard = dynamic(() => import('../../components/AdminDashboard'), {
  ssr: false,
})

export default function AdminPage() {
  const cookieStore = cookies()
  const session = cookieStore.get(getAdminSessionCookieName())?.value
  const adminSession = parseAdminSessionCookieValue(session)

  if (!adminSession) {
    redirect('/admin/login')
  }

  return <AdminDashboard initialOfficeId={adminSession.officeId} initialRoleScope={adminSession.scope} />
}

import dynamic from 'next/dynamic'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAdminSessionCookieName, parseAdminSessionCookieValue, resolveAdminSession } from '../../lib/admin-auth'
import { getAdminDb } from '../../lib/firebase-admin'

const AdminDashboard = dynamic(() => import('../../components/AdminDashboard'), {
  ssr: false,
})

export default async function AdminPage() {
  const cookieStore = cookies()
  const session = cookieStore.get(getAdminSessionCookieName())?.value
  const adminSession = parseAdminSessionCookieValue(session)

  if (!adminSession) {
    redirect('/admin/login')
  }

  const db = getAdminDb()
  const resolvedSession = await resolveAdminSession(db, adminSession)
  if (!resolvedSession) {
    redirect('/admin/login')
  }

  return <AdminDashboard initialOfficeId={resolvedSession.officeId} initialRoleScope={resolvedSession.scope} />
}

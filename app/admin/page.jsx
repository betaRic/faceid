import DynamicAdminDashboard from '@/components/DynamicAdminDashboard'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAdminSessionCookieName, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'
import { getAdminDb } from '@/lib/firebase-admin'

export default async function AdminPage() {
  const cookieStore = await cookies()
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

  return <DynamicAdminDashboard initialOfficeId={resolvedSession.officeId} initialRoleScope={resolvedSession.scope} />
}

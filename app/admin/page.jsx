import AdminDashboard from '@/components/AdminDashboard'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAdminSessionCookieName, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'
import { getHrSessionCookieName, parseHrSessionCookieValue, resolveHrSession } from '@/lib/hr-auth'
import { getAdminDb } from '@/lib/firebase-admin'

export default async function AdminPage() {
  const cookieStore = await cookies()
  const db = getAdminDb()

  // Check admin session first
  const adminSession = parseAdminSessionCookieValue(cookieStore.get(getAdminSessionCookieName())?.value)
  if (adminSession) {
    const resolvedSession = await resolveAdminSession(db, adminSession)
    if (resolvedSession) {
      return <AdminDashboard
        initialOfficeId={resolvedSession.officeId} 
        initialRoleScope={resolvedSession.scope}
        permissions={resolvedSession.permissions || ['dashboard', 'office', 'employees', 'summary', 'settings', 'roles']}
      />
    }
  }

  // Check HR session
  const hrSession = parseHrSessionCookieValue(cookieStore.get(getHrSessionCookieName())?.value)
  if (hrSession) {
    const resolvedSession = await resolveHrSession(db, hrSession)
    if (resolvedSession) {
      return <AdminDashboard
        initialOfficeId={resolvedSession.officeId}
        initialRoleScope={resolvedSession.scope}
        permissions={resolvedSession.permissions || ['employees', 'summary']}
      />
    }
  }

  // No valid session
  redirect('/admin/login')
}

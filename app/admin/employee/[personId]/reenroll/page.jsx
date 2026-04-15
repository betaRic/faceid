import { getAdminDb } from '@/lib/firebase-admin'
import { getAdminSessionCookieName, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'
import { getHrSessionCookieName, parseHrSessionCookieValue, resolveHrSession } from '@/lib/hr-auth'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

function serializePerson(doc) {
  const data = doc.data()
  const obj = { id: doc.id }
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && '_seconds' in value) {
      obj[key] = new Date(value._seconds * 1000).toISOString()
    } else {
      obj[key] = value
    }
  }
  return obj
}

async function getPersonData(personId) {
  const db = getAdminDb()
  const doc = await db.collection('persons').doc(personId).get()
  if (!doc.exists) return null
  return serializePerson(doc)
}

export default async function ReenrollPage({ params, searchParams }) {
  const { personId } = await params

  // Auth check first
  const cookieStore = await cookies()
  const db = getAdminDb()

  const adminSession = parseAdminSessionCookieValue(cookieStore.get(getAdminSessionCookieName())?.value)
  let resolvedSession = null
  if (adminSession) {
    resolvedSession = await resolveAdminSession(db, adminSession)
  }

  if (!resolvedSession) {
    const hrSession = parseHrSessionCookieValue(cookieStore.get(getHrSessionCookieName())?.value)
    if (hrSession) {
      resolvedSession = await resolveHrSession(db, hrSession)
    }
  }

  if (!resolvedSession) {
    redirect('/admin/login')
  }

  // Fetch person data from Firestore (always, not from URL param)
  const person = await getPersonData(personId)

  if (!person) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Employee Not Found</h1>
          <p className="mt-2 text-muted">The employee record could not be found.</p>
        </div>
      </div>
    )
  }

  // Pass only needed fields to client component (no Firestore objects)
  const clientPerson = {
    id: person.id,
    name: person.name || '',
    employeeId: person.employeeId || '',
    officeId: person.officeId || '',
    officeName: person.officeName || '',
  }

  const EmployeeReenrollPage = (await import('./EmployeeReenrollPage')).default

  return <EmployeeReenrollPage person={clientPerson} />
}
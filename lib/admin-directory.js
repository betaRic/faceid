import 'server-only'

export async function getAdminProfileByEmail(db, email) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail) return null

  const snapshot = await db
    .collection('admins')
    .where('email', '==', normalizedEmail)
    .where('active', '==', true)
    .limit(1)
    .get()

  if (snapshot.empty) return null

  const record = snapshot.docs[0]
  const data = record.data()

  return {
    id: record.id,
    email: normalizedEmail,
    role: 'admin',
    scope: data.scope === 'office' ? 'office' : 'regional',
    officeId: data.scope === 'office' ? String(data.officeId || '') : '',
    active: data.active !== false,
    displayName: String(data.displayName || ''),
  }
}

export async function listAdminProfiles(db) {
  const snapshot = await db.collection('admins').orderBy('email').get()
  return snapshot.docs.map(record => {
    const data = record.data()
    return {
      id: record.id,
      email: String(data.email || '').trim().toLowerCase(),
      role: 'admin',
      scope: data.scope === 'office' ? 'office' : 'regional',
      officeId: data.scope === 'office' ? String(data.officeId || '') : '',
      active: data.active !== false,
      displayName: String(data.displayName || ''),
      createdAt: data.createdAt || null,
      updatedAt: data.updatedAt || null,
    }
  })
}

export async function getAdminCount(db) {
  const snapshot = await db.collection('admins').limit(1).get()
  return snapshot.size
}

export async function getActiveRegionalAdminCount(db, excludeId = '') {
  const snapshot = await db.collection('admins').get()

  return snapshot.docs.filter(record => {
    if (excludeId && record.id === excludeId) return false

    const data = record.data()
    return data.active !== false && String(data.scope || 'regional') !== 'office'
  }).length
}


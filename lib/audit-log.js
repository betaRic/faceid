import 'server-only'

import { FieldValue } from 'firebase-admin/firestore'

export async function writeAuditLog(db, entry) {
  await db.collection('audit_logs').add({
    actorRole: entry.actorRole || 'admin',
    actorScope: entry.actorScope || 'regional',
    actorOfficeId: entry.actorOfficeId || '',
    action: entry.action || 'unknown',
    targetType: entry.targetType || '',
    targetId: entry.targetId || '',
    officeId: entry.officeId || '',
    summary: entry.summary || '',
    metadata: entry.metadata || {},
    createdAt: FieldValue.serverTimestamp(),
  })
}

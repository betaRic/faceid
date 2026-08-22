import 'server-only'

import { writeLocalAuditLog } from './postgres/audit-store'

export function auditActorFromSession(session = {}) {
  return {
    actorId: String(session.adminId || session.hrUserId || session.uid || '').trim(),
    actorName: String(session.displayName || '').trim(),
    actorEmail: String(session.email || '').trim().toLowerCase(),
  }
}

export async function writeAuditLog(db, entry, options = {}) {
  await writeLocalAuditLog(entry, options)
}


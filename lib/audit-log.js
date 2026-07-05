import 'server-only'

import { writeLocalAuditLog } from './postgres/audit-store'

export async function writeAuditLog(db, entry) {
  await writeLocalAuditLog(entry)
}


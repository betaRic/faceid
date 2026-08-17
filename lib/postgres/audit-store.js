import { queryPostgres } from './client'

export async function writeLocalAuditLog(entry = {}) {
  await queryPostgres(
    `
      INSERT INTO audit_logs (
        actor_role, actor_scope, actor_office_id, actor_id, actor_name, actor_email, action, target_type,
        target_id, office_id, summary, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
    `,
    [
      entry.actorRole || 'admin',
      entry.actorScope || 'regional',
      entry.actorOfficeId || '',
      entry.actorId || '',
      entry.actorName || '',
      entry.actorEmail || '',
      entry.action || 'unknown',
      entry.targetType || '',
      entry.targetId || '',
      entry.officeId || '',
      entry.summary || '',
      JSON.stringify(entry.metadata || {}),
    ],
  )
}

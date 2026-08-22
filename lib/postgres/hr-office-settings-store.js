import { writeLocalAuditLog } from './audit-store'
import { withPostgresTransaction } from './client'

export async function updateLocalHrOfficeWorkPolicy({
  officeId,
  workPolicy,
  auditEntry,
} = {}) {
  const normalizedOfficeId = String(officeId || '').trim()
  if (!normalizedOfficeId) return null

  return withPostgresTransaction(async client => {
    const serializedWorkPolicy = JSON.stringify(workPolicy || {})
    const currentResult = await client.query(
      `
        SELECT id, name, work_policy,
               work_policy IS DISTINCT FROM $2::jsonb AS work_policy_changed
        FROM offices
        WHERE id = $1
        FOR UPDATE
      `,
      [normalizedOfficeId, serializedWorkPolicy],
    )
    if (currentResult.rowCount !== 1) return null
    const current = currentResult.rows[0]
    const updated = await client.query(
      `
        UPDATE offices
        SET work_policy = $2::jsonb,
            data = jsonb_set(COALESCE(data, '{}'::jsonb), '{workPolicy}', $2::jsonb, true),
            updated_at = now()
        WHERE id = $1
        RETURNING id, name, work_policy
      `,
      [normalizedOfficeId, serializedWorkPolicy],
    )
    if (updated.rowCount !== 1) throw new Error('Office work policy update lost its locked row.')

    const row = updated.rows[0]
    await writeLocalAuditLog({
      ...(auditEntry || {}),
      targetType: 'office',
      targetId: row.id,
      officeId: row.id,
      summary: `Office HR updated allowed settings for ${current.name || current.id}`,
      metadata: {
        ...(auditEntry?.metadata || {}),
        workPolicyChanged: current.work_policy_changed === true,
      },
    }, { client })

    return {
      id: row.id,
      name: row.name || '',
      workPolicy: row.work_policy || {},
    }
  })
}

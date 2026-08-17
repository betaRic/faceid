-- Repair the lifecycle values introduced as 'pending' by migration 0010's
-- ADD COLUMN default. The source legacy fields remain the authoritative
-- historical evidence for this one-time reconciliation.
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS actor_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS actor_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS actor_email text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS audit_logs_actor_created_idx
  ON audit_logs (actor_id, created_at DESC)
  WHERE actor_id <> '';

WITH changes AS (
  SELECT
    id,
    lifecycle_status AS before_lifecycle_status,
    active AS before_active,
    approval_status AS before_approval_status,
    CASE
      WHEN approval_status = 'pending' THEN 'pending'
      WHEN active = true AND approval_status = 'approved' THEN 'active'
      ELSE 'inactive'
    END AS after_lifecycle_status
  FROM persons
  WHERE lifecycle_status IS DISTINCT FROM CASE
    WHEN approval_status = 'pending' THEN 'pending'
    WHEN active = true AND approval_status = 'approved' THEN 'active'
    ELSE 'inactive'
  END
), repaired AS (
  UPDATE persons person
  SET lifecycle_status = changes.after_lifecycle_status,
      updated_at = now()
  FROM changes
  WHERE person.id = changes.id
  RETURNING person.id, person.lifecycle_status
)
INSERT INTO audit_logs (
  actor_role, actor_scope, actor_office_id, actor_id, actor_name, actor_email,
  action, target_type, target_id, office_id, summary, metadata
)
SELECT
  'system', 'migration', '', 'migration:0013', 'System migration', '',
  'person_lifecycle_repaired', 'person', repaired.id, '',
  'Repaired employee lifecycle from preserved legacy status fields.',
  jsonb_build_object(
    'migration', '0013_repair_employee_lifecycle_and_audit_actor.sql',
    'before', jsonb_build_object(
      'lifecycleStatus', changes.before_lifecycle_status,
      'active', changes.before_active,
      'approvalStatus', changes.before_approval_status
    ),
    'after', jsonb_build_object('lifecycleStatus', repaired.lifecycle_status)
  )
FROM repaired
JOIN changes ON changes.id = repaired.id;

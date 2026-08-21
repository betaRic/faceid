-- Keep application rejection distinct from later employee deactivation.
-- Existing rows are preserved; this migration only expands the allowed values.
ALTER TABLE persons
  DROP CONSTRAINT IF EXISTS persons_lifecycle_status_check;

ALTER TABLE persons
  ADD CONSTRAINT persons_lifecycle_status_check
  CHECK (lifecycle_status IN ('pending', 'active', 'inactive', 'rejected'));

-- Rollback requires an explicit data decision first:
-- UPDATE persons SET lifecycle_status = 'inactive' WHERE lifecycle_status = 'rejected';
-- Then restore the previous three-value check constraint.

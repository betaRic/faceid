-- One authoritative employee lifecycle.  The legacy columns remain temporarily
-- synchronized so pre-existing audit/history queries and a rolling deployment do
-- not reinterpret old records or make enrolled employees disappear.
ALTER TABLE persons
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'pending';

UPDATE persons
SET lifecycle_status = CASE
  WHEN approval_status = 'pending' THEN 'pending'
  WHEN active = true AND approval_status = 'approved' THEN 'active'
  ELSE 'inactive'
END,
updated_at = now()
WHERE lifecycle_status IS NULL
   OR lifecycle_status NOT IN ('pending', 'active', 'inactive');

ALTER TABLE persons
  DROP CONSTRAINT IF EXISTS persons_lifecycle_status_check;
ALTER TABLE persons
  ADD CONSTRAINT persons_lifecycle_status_check
  CHECK (lifecycle_status IN ('pending', 'active', 'inactive'));

CREATE INDEX IF NOT EXISTS persons_lifecycle_status_idx
  ON persons (lifecycle_status);
CREATE INDEX IF NOT EXISTS persons_office_division_lifecycle_idx
  ON persons (office_id, division_id, lifecycle_status, name_lower);

-- Keep historic columns coherent during the transition.  New application code
-- writes lifecycle_status only; a later release may remove these columns after
-- all reporting history has been migrated.
CREATE OR REPLACE FUNCTION persons_sync_lifecycle_compatibility()
RETURNS trigger AS $$
BEGIN
  IF NEW.lifecycle_status = 'active' THEN
    NEW.active := true;
    NEW.approval_status := 'approved';
  ELSIF NEW.lifecycle_status = 'pending' THEN
    NEW.active := false;
    NEW.approval_status := 'pending';
  ELSE
    NEW.active := false;
    NEW.approval_status := 'rejected';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS persons_sync_lifecycle_compatibility_trigger ON persons;
CREATE TRIGGER persons_sync_lifecycle_compatibility_trigger
BEFORE INSERT OR UPDATE OF lifecycle_status ON persons
FOR EACH ROW EXECUTE FUNCTION persons_sync_lifecycle_compatibility();

-- Date-range lookups are the hot path for DTR generation and the workforce
-- calendar.  These indexes keep the system responsive as records accumulate.
CREATE INDEX IF NOT EXISTS employee_leaves_person_range_idx
  ON employee_leaves (person_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS official_orders_person_range_idx
  ON official_orders (person_id, start_date, end_date);

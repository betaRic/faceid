-- Plantilla and COS personnel can share an Employee ID.  Keep that field as a
-- reference, while person_id is the identity used for attendance ownership.
ALTER TABLE persons DROP CONSTRAINT IF EXISTS persons_employee_id_unique;

ALTER TABLE attendance_daily
  ADD COLUMN IF NOT EXISTS person_id text;

-- Existing data predates person_id on the daily cache.  Resolve rows only
-- where their employee ID identifies exactly one person; remaining legacy
-- rows keep a stable, isolated legacy key rather than being attached to an
-- arbitrary employee.
UPDATE attendance_daily daily
SET person_id = person.id
FROM persons person
WHERE (daily.person_id IS NULL OR daily.person_id = '')
  AND daily.employee_id = person.employee_id
  AND 1 = (SELECT count(*) FROM persons same_id WHERE same_id.employee_id = daily.employee_id);

UPDATE attendance_daily
SET person_id = 'legacy:' || id
WHERE person_id IS NULL OR person_id = '';

ALTER TABLE attendance_daily
  ALTER COLUMN person_id SET NOT NULL;

ALTER TABLE attendance_daily
  DROP CONSTRAINT IF EXISTS attendance_daily_employee_date_unique;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_daily_person_date_unique_idx
  ON attendance_daily (person_id, date_key);

CREATE INDEX IF NOT EXISTS attendance_daily_person_idx
  ON attendance_daily (person_id);

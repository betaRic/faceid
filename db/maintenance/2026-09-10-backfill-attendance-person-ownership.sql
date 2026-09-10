-- Historical attendance ownership repair (run once, inside a reviewed change window).
-- This script is idempotent and does not delete or change attendance values.
-- Rollback before commit: ROLLBACK;
-- Before running live, record the counts from the two SELECT statements below.

BEGIN;

-- The owner supplied this explicit mapping: every old 12170 row belongs to Michael.
DO $$
DECLARE
  michael_id text;
BEGIN
  SELECT id INTO michael_id
  FROM persons
  WHERE employee_id = '12170'
    AND name = 'Dedase, Michael James Muyco'
    AND active = true
    AND approval_status = 'approved'
  LIMIT 1;

  IF michael_id IS NULL THEN
    RAISE EXCEPTION 'Expected active approved Michael Dedase record for employee_id 12170 was not found';
  END IF;

  UPDATE attendance
  SET person_id = michael_id
  WHERE (person_id IS NULL OR person_id = '')
    AND employee_id = '12170';
END $$;

-- Repair other old rows only when the employee number belongs to one person.
WITH unique_people AS (
  SELECT employee_id, min(id) AS person_id
  FROM persons
  WHERE employee_id <> ''
  GROUP BY employee_id
  HAVING count(*) = 1
)
UPDATE attendance AS a
SET person_id = u.person_id
FROM unique_people AS u
WHERE (a.person_id IS NULL OR a.person_id = '')
  AND a.employee_id = u.employee_id;

-- Review these before COMMIT. Shared and blank employee numbers must remain unresolved.
SELECT employee_id, count(*) AS unresolved_rows
FROM attendance
WHERE person_id IS NULL OR person_id = ''
GROUP BY employee_id
ORDER BY unresolved_rows DESC, employee_id;

COMMIT;

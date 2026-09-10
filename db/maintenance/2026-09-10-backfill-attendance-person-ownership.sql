-- Historical attendance ownership repair (run once, inside a reviewed change window).
-- This script is idempotent and does not delete or change attendance values.
-- Rollback before commit: ROLLBACK;
-- Before running live, record the counts from the two SELECT statements below.

BEGIN;
SET LOCAL search_path TO public;

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

-- These older rows carry a complete name but no employee number. The current
-- directory has exactly one approved person for each name, so this is safe and
-- repeatable. Do not broaden this rule to partial or duplicate names.
DO $$
DECLARE
  person_record record;
  matching_people integer;
BEGIN
  FOR person_record IN
    SELECT DISTINCT name
    FROM attendance
    WHERE (person_id IS NULL OR person_id = '')
      AND name IN ('Pama, Michael John', 'Borra, Rico Ceazar A')
  LOOP
    SELECT count(*)::integer INTO matching_people
    FROM persons
    WHERE name = person_record.name
      AND active = true
      AND approval_status = 'approved';

    IF matching_people <> 1 THEN
      RAISE EXCEPTION 'Expected exactly one active approved person for legacy name %; found %', person_record.name, matching_people;
    END IF;

    UPDATE attendance AS a
    SET person_id = p.id
    FROM persons AS p
    WHERE (a.person_id IS NULL OR a.person_id = '')
      AND a.name = person_record.name
      AND p.name = person_record.name
      AND p.active = true
      AND p.approval_status = 'approved';
  END LOOP;
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

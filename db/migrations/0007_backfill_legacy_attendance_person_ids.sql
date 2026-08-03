-- Attendance written before person_id became the ownership key can be safely
-- linked only when its Employee ID resolves to exactly one employee record.
-- Shared plantilla/COS IDs are intentionally left untouched for manual review.
UPDATE attendance attendance_row
SET person_id = person.id
FROM persons person
WHERE (attendance_row.person_id IS NULL OR attendance_row.person_id = '')
  AND attendance_row.employee_id = person.employee_id
  AND NOT EXISTS (
    SELECT 1
    FROM persons same_employee_id
    WHERE same_employee_id.employee_id = attendance_row.employee_id
      AND same_employee_id.id <> person.id
  );

UPDATE attendance_daily daily_row
SET
  person_id = person.id,
  data = jsonb_set(COALESCE(daily_row.data, '{}'::jsonb), '{personId}', to_jsonb(person.id), true),
  updated_at = now()
FROM persons person
WHERE (daily_row.person_id IS NULL OR daily_row.person_id = '' OR daily_row.person_id LIKE 'legacy:%')
  AND daily_row.employee_id = person.employee_id
  AND NOT EXISTS (
    SELECT 1
    FROM persons same_employee_id
    WHERE same_employee_id.employee_id = daily_row.employee_id
      AND same_employee_id.id <> person.id
  );

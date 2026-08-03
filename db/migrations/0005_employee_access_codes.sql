-- A separate VeriFace access code avoids using plantilla/COS employee IDs as login keys.
ALTER TABLE persons ADD COLUMN IF NOT EXISTS access_code text;

DO $$
DECLARE
  person_record record;
  candidate text;
BEGIN
  FOR person_record IN SELECT id FROM persons WHERE access_code IS NULL OR access_code !~ '^[0-9]{4}$' LOOP
    LOOP
      candidate := lpad(floor(random() * 10000)::integer::text, 4, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM persons WHERE access_code = candidate);
    END LOOP;
    UPDATE persons SET access_code = candidate WHERE id = person_record.id;
  END LOOP;
END $$;

ALTER TABLE persons ALTER COLUMN access_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS persons_access_code_unique_idx ON persons (access_code);

-- Normalize the existing employee-directory display casing while preserving name parts.
UPDATE persons
SET
  last_name = initcap(lower(last_name)),
  first_name = initcap(lower(first_name)),
  middle_name = initcap(lower(middle_name)),
  name = CASE
    WHEN trim(last_name) <> '' AND trim(first_name) <> ''
      THEN initcap(lower(last_name)) || ', ' || initcap(lower(first_name))
        || CASE WHEN trim(middle_name) <> '' THEN ' ' || initcap(lower(middle_name)) ELSE '' END
    ELSE name
  END,
  name_lower = lower(CASE
    WHEN trim(last_name) <> '' AND trim(first_name) <> ''
      THEN initcap(lower(last_name)) || ', ' || initcap(lower(first_name))
        || CASE WHEN trim(middle_name) <> '' THEN ' ' || initcap(lower(middle_name)) ELSE '' END
    ELSE name
  END),
  updated_at = now();

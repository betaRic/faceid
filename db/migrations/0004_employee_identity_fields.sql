-- Split employee identity fields for new local employee records.

ALTER TABLE persons
  ADD COLUMN IF NOT EXISTS last_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS first_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS middle_name text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS persons_last_name_lower_idx ON persons (lower(last_name));
CREATE INDEX IF NOT EXISTS persons_first_name_lower_idx ON persons (lower(first_name));

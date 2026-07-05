-- Local runtime cutover fields and indexes.

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS pin_hash text,
  ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '';

UPDATE admin_users
SET display_name = name
WHERE display_name = '' AND name <> '';

ALTER TABLE hr_users
  ADD COLUMN IF NOT EXISTS pin_hash text,
  ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'office';

UPDATE hr_users
SET display_name = name
WHERE display_name = '' AND name <> '';

ALTER TABLE persons
  ADD COLUMN IF NOT EXISTS photo_content_type text,
  ADD COLUMN IF NOT EXISTS approval_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_updated_by_email text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS admin_users_active_idx ON admin_users (active);
CREATE INDEX IF NOT EXISTS admin_users_scope_idx ON admin_users (scope);
CREATE INDEX IF NOT EXISTS hr_users_active_idx ON hr_users (active);
CREATE INDEX IF NOT EXISTS hr_users_scope_idx ON hr_users (scope);
CREATE INDEX IF NOT EXISTS attendance_employee_timestamp_idx ON attendance (employee_id, timestamp_ms);
CREATE INDEX IF NOT EXISTS attendance_office_timestamp_idx ON attendance (office_id, timestamp_ms);
CREATE INDEX IF NOT EXISTS persons_employee_id_lower_idx ON persons (employee_id_lower);

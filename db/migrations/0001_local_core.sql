-- FaceAttend local Postgres core schema.
-- Keep frequently queried fields as columns and preserve source-shaped payloads in jsonb.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS offices (
  id text PRIMARY KEY,
  name text NOT NULL,
  name_lower text NOT NULL DEFAULT '',
  office_type text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  latitude double precision,
  longitude double precision,
  radius_meters integer,
  work_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  divisions jsonb NOT NULL DEFAULT '[]'::jsonb,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offices_name_lower_idx ON offices (name_lower);
CREATE INDEX IF NOT EXISTS offices_active_idx ON offices (active);

CREATE TABLE IF NOT EXISTS persons (
  id text PRIMARY KEY,
  employee_id text NOT NULL,
  employee_id_lower text NOT NULL,
  name text NOT NULL,
  name_lower text NOT NULL DEFAULT '',
  position text NOT NULL DEFAULT '',
  office_id text NOT NULL DEFAULT '',
  office_name text NOT NULL DEFAULT '',
  division_id text NOT NULL DEFAULT '',
  division_name text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  approval_status text NOT NULL DEFAULT 'pending',
  descriptors jsonb NOT NULL DEFAULT '[]'::jsonb,
  sample_count integer NOT NULL DEFAULT 0,
  duplicate_review_status text NOT NULL DEFAULT 'clear',
  duplicate_review_required boolean NOT NULL DEFAULT false,
  duplicate_review_candidate_name text NOT NULL DEFAULT '',
  duplicate_review_candidate_employee_id text NOT NULL DEFAULT '',
  duplicate_review_distance double precision,
  duplicate_review_reason_code text NOT NULL DEFAULT '',
  photo_path text,
  photo_url text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT persons_employee_id_unique UNIQUE (employee_id_lower)
);

CREATE INDEX IF NOT EXISTS persons_name_lower_idx ON persons (name_lower);
CREATE INDEX IF NOT EXISTS persons_office_id_idx ON persons (office_id);
CREATE INDEX IF NOT EXISTS persons_active_idx ON persons (active);
CREATE INDEX IF NOT EXISTS persons_approval_status_idx ON persons (approval_status);

CREATE TABLE IF NOT EXISTS biometric_index (
  id text PRIMARY KEY,
  person_id text NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  sample_index integer NOT NULL,
  employee_id text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  office_id text NOT NULL DEFAULT '',
  office_name text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  biometric_enabled boolean NOT NULL DEFAULT false,
  approval_status text NOT NULL DEFAULT 'pending',
  descriptor jsonb NOT NULL DEFAULT '[]'::jsonb,
  normalized_descriptor jsonb NOT NULL DEFAULT '[]'::jsonb,
  bucket_a text NOT NULL DEFAULT '',
  bucket_b text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS biometric_index_person_id_idx ON biometric_index (person_id);
CREATE INDEX IF NOT EXISTS biometric_index_employee_id_idx ON biometric_index (employee_id);
CREATE INDEX IF NOT EXISTS biometric_index_office_bucket_a_idx ON biometric_index (office_id, bucket_a) WHERE active = true AND approval_status = 'approved';
CREATE INDEX IF NOT EXISTS biometric_index_office_bucket_b_idx ON biometric_index (office_id, bucket_b) WHERE active = true AND approval_status = 'approved';

CREATE TABLE IF NOT EXISTS attendance (
  id text PRIMARY KEY,
  employee_id text NOT NULL,
  person_id text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  action text NOT NULL DEFAULT '',
  timestamp_ms bigint NOT NULL,
  date_key text NOT NULL,
  date_label text NOT NULL DEFAULT '',
  time_label text NOT NULL DEFAULT '',
  office_id text NOT NULL DEFAULT '',
  office_name text NOT NULL DEFAULT '',
  attendance_mode text NOT NULL DEFAULT '',
  geofence_status text NOT NULL DEFAULT '',
  decision_code text NOT NULL DEFAULT '',
  confidence double precision,
  latitude double precision,
  longitude double precision,
  risk_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  capture_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  scan_diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_employee_date_idx ON attendance (employee_id, date_key, timestamp_ms);
CREATE INDEX IF NOT EXISTS attendance_date_idx ON attendance (date_key, timestamp_ms);
CREATE INDEX IF NOT EXISTS attendance_office_date_idx ON attendance (office_id, date_key, timestamp_ms);

CREATE TABLE IF NOT EXISTS attendance_locks (
  employee_id text PRIMARY KEY,
  office_id text NOT NULL DEFAULT '',
  last_timestamp_ms bigint NOT NULL DEFAULT 0,
  last_attendance_id text NOT NULL DEFAULT '',
  last_action text NOT NULL DEFAULT '',
  last_entry_preview jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance_daily (
  id text PRIMARY KEY,
  employee_id text NOT NULL,
  date_key text NOT NULL,
  name text NOT NULL DEFAULT '',
  office_id text NOT NULL DEFAULT '',
  office_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '',
  log_count integer NOT NULL DEFAULT 0,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_daily_employee_date_unique UNIQUE (employee_id, date_key)
);

CREATE INDEX IF NOT EXISTS attendance_daily_date_idx ON attendance_daily (date_key);
CREATE INDEX IF NOT EXISTS attendance_daily_employee_idx ON attendance_daily (employee_id);

CREATE TABLE IF NOT EXISTS attendance_challenges (
  token text PRIMARY KEY,
  challenge_id text NOT NULL,
  employee_id text NOT NULL DEFAULT '',
  kiosk_id text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT '',
  client_ip text NOT NULL DEFAULT '',
  client_key text NOT NULL DEFAULT '',
  user_agent text NOT NULL DEFAULT '',
  mode text NOT NULL DEFAULT 'passive',
  motion_type text NOT NULL DEFAULT '',
  verification_stage text NOT NULL DEFAULT 'passive',
  capture_policy_version text NOT NULL DEFAULT '',
  risk_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  issued_at_ms bigint NOT NULL,
  expires_at_ms bigint NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_challenges_expires_idx ON attendance_challenges (expires_at);
CREATE INDEX IF NOT EXISTS attendance_challenges_employee_idx ON attendance_challenges (employee_id);

CREATE TABLE IF NOT EXISTS scan_events (
  id bigserial PRIMARY KEY,
  status text NOT NULL,
  decision_code text NOT NULL,
  reason text NOT NULL DEFAULT '',
  timestamp_ms bigint NOT NULL,
  employee_id text NOT NULL DEFAULT '',
  person_id text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  office_id text NOT NULL DEFAULT '',
  office_name text NOT NULL DEFAULT '',
  attendance_mode text NOT NULL DEFAULT '',
  geofence_status text NOT NULL DEFAULT '',
  location jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  capture_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  scan_diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb,
  performance jsonb NOT NULL DEFAULT '{}'::jsonb,
  match_debug jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scan_events_created_idx ON scan_events (created_at DESC);
CREATE INDEX IF NOT EXISTS scan_events_employee_idx ON scan_events (employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS scan_events_decision_idx ON scan_events (decision_code, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  actor_role text NOT NULL DEFAULT '',
  actor_scope text NOT NULL DEFAULT '',
  actor_office_id text NOT NULL DEFAULT '',
  action text NOT NULL,
  target_type text NOT NULL DEFAULT '',
  target_id text NOT NULL DEFAULT '',
  office_id text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs (action, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_users (
  id text PRIMARY KEY,
  email text NOT NULL,
  email_lower text NOT NULL,
  name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'admin',
  scope text NOT NULL DEFAULT 'global',
  office_id text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  password_hash text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_users_email_unique UNIQUE (email_lower)
);

CREATE TABLE IF NOT EXISTS hr_users (
  id text PRIMARY KEY,
  email text NOT NULL,
  email_lower text NOT NULL,
  name text NOT NULL DEFAULT '',
  office_id text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  password_hash text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_users_email_unique UNIQUE (email_lower)
);

CREATE TABLE IF NOT EXISTS app_sessions (
  id text PRIMARY KEY,
  subject_id text NOT NULL,
  subject_type text NOT NULL,
  token_hash text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);

CREATE INDEX IF NOT EXISTS app_sessions_subject_idx ON app_sessions (subject_type, subject_id);
CREATE INDEX IF NOT EXISTS app_sessions_expires_idx ON app_sessions (expires_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_limits_expires_idx ON rate_limits (expires_at);


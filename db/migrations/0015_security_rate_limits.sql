-- Durable request throttling shared by every application process.
-- Store only SHA-256 identities so IP addresses, emails, and access codes are
-- not written in plaintext to the rate-limit table.
CREATE TABLE IF NOT EXISTS request_rate_limits (
  key_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (key_hash, window_start)
);

CREATE INDEX IF NOT EXISTS request_rate_limits_expires_idx
  ON request_rate_limits (expires_at);

-- Filesystem deletion cannot participate in the person transaction. Queue the
-- exact locked photo path before deleting the row so cleanup is durable and a
-- concurrent re-enrollment cannot leave an untracked image behind.
CREATE TABLE IF NOT EXISTS enrollment_photo_deletion_jobs (
  id bigserial PRIMARY KEY,
  person_id text NOT NULL,
  photo_path text NOT NULL,
  claim_token text NOT NULL DEFAULT '',
  claimed_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_attempt_at timestamptz,
  last_error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, photo_path)
);

CREATE INDEX IF NOT EXISTS enrollment_photo_deletion_jobs_created_idx
  ON enrollment_photo_deletion_jobs (created_at, id);

-- New attendance/history writes must reference a real employee. NOT VALID
-- preserves intentionally isolated legacy rows while still enforcing every
-- new insert/update and preventing person deletion races.
ALTER TABLE scan_events
  ALTER COLUMN person_id DROP NOT NULL,
  ALTER COLUMN person_id DROP DEFAULT;

UPDATE scan_events
SET person_id = NULL
WHERE person_id = '';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_person_fk') THEN
    ALTER TABLE attendance
      ADD CONSTRAINT attendance_person_fk
      FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_daily_person_fk') THEN
    ALTER TABLE attendance_daily
      ADD CONSTRAINT attendance_daily_person_fk
      FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scan_events_person_fk') THEN
    ALTER TABLE scan_events
      ADD CONSTRAINT scan_events_person_fk
      FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE RESTRICT NOT VALID;
  END IF;
END
$$;

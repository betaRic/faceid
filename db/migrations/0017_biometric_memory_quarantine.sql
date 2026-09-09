-- Additional examples are quarantined only; original enrollment is untouched.
CREATE TABLE IF NOT EXISTS biometric_memory_candidates (
  id text PRIMARY KEY,
  person_id text NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  source_attendance_id text NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
  captured_day date NOT NULL,
  enrollment_fingerprint text NOT NULL,
  pipeline_fingerprint text NOT NULL,
  gallery_fingerprint text NOT NULL,
  policy_version text NOT NULL,
  descriptor jsonb NOT NULL CHECK (jsonb_typeof(descriptor) = 'array' AND jsonb_array_length(descriptor) = 1024),
  evidence jsonb NOT NULL,
  state text NOT NULL DEFAULT 'quarantined' CHECK (state IN ('quarantined', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (source_attendance_id),
  UNIQUE (person_id, captured_day)
);
CREATE INDEX IF NOT EXISTS biometric_memory_person_expiry_idx
  ON biometric_memory_candidates (person_id, expires_at);

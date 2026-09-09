-- Unverified phone observations: never used to decide or update attendance.
CREATE TABLE IF NOT EXISTS phone_scan_reports (
  id uuid PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object')
);
CREATE INDEX IF NOT EXISTS phone_scan_reports_received_idx ON phone_scan_reports(received_at);

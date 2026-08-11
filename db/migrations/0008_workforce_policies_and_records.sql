-- Workforce scheduling and DTR exception records.
-- Existing approval values are deliberately retained for audit compatibility,
-- but eligibility is now represented by the persons.active flag.

UPDATE persons
SET active = (active = true AND approval_status = 'approved'),
    updated_at = now()
WHERE approval_status IS DISTINCT FROM 'approved';

ALTER TABLE persons
  ADD COLUMN IF NOT EXISTS weekly_schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS flexitime jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS workforce_policies (
  id text PRIMARY KEY,
  scope_type text NOT NULL CHECK (scope_type IN ('organization', 'office', 'division')),
  scope_id text NOT NULL DEFAULT '',
  flexitime jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_type, scope_id)
);

CREATE TABLE IF NOT EXISTS holidays (
  id text PRIMARY KEY,
  holiday_date date NOT NULL,
  name text NOT NULL,
  scope_type text NOT NULL DEFAULT 'national' CHECK (scope_type IN ('national', 'office', 'division')),
  office_id text NOT NULL DEFAULT '',
  division_id text NOT NULL DEFAULT '',
  remarks text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (holiday_date, scope_type, office_id, division_id)
);
CREATE INDEX IF NOT EXISTS holidays_date_idx ON holidays (holiday_date);

CREATE TABLE IF NOT EXISTS employee_leaves (
  id text PRIMARY KEY,
  person_id text NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  leave_type text NOT NULL CHECK (leave_type IN ('VL', 'SL', 'CTO', 'WL')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  remarks text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS employee_leaves_person_dates_idx ON employee_leaves (person_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS official_orders (
  id text PRIMARY KEY,
  person_id text NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  order_type text NOT NULL DEFAULT 'Regional Order',
  order_number text NOT NULL DEFAULT '',
  start_date date NOT NULL,
  end_date date NOT NULL,
  remarks text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS official_orders_person_dates_idx ON official_orders (person_id, start_date, end_date);

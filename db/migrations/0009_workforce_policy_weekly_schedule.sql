ALTER TABLE workforce_policies
  ADD COLUMN IF NOT EXISTS weekly_schedule jsonb NOT NULL DEFAULT '{}'::jsonb;

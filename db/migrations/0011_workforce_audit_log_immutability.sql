-- Workforce record history is evidentiary data. Application routes only insert
-- audit rows; this trigger also prevents accidental UPDATE/DELETE statements.
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_immutable ON audit_logs;
CREATE TRIGGER audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

CREATE INDEX IF NOT EXISTS audit_logs_workforce_target_idx
  ON audit_logs (target_type, target_id, created_at DESC);

-- Preserve the existing explicitly configured Regional PIN path during the
-- move to a fail-closed database control. An existing disabled state wins.
-- Without ADMIN_REGIONAL_PIN this row cannot authenticate anyone.
INSERT INTO system_config (key, value, updated_at)
VALUES ('regional_pin_access', '{"enabled":true}'::jsonb, now())
ON CONFLICT (key) DO NOTHING;

// Bundled with the application; production does not need SQL source files.
// Keep this list in sync when adding a migration (covered by a regression test).
export const REQUIRED_DATABASE_UPDATES = Object.freeze([
  '0001_local_core.sql',
  '0002_local_runtime.sql',
  '0003_local_system_config.sql',
  '0004_employee_identity_fields.sql',
  '0005_employee_access_codes.sql',
  '0006_allow_duplicate_employee_ids.sql',
  '0007_backfill_legacy_attendance_person_ids.sql',
  '0008_workforce_policies_and_records.sql',
  '0009_workforce_policy_weekly_schedule.sql',
  '0010_employee_lifecycle_and_workforce_hardening.sql',
  '0011_workforce_audit_log_immutability.sql',
  '0012_official_order_members.sql',
  '0013_repair_employee_lifecycle_and_audit_actor.sql',
  '0014_add_rejected_employee_lifecycle.sql',
  '0015_security_rate_limits.sql',
  '0016_initialize_regional_pin_access.sql',
  '0017_biometric_memory_quarantine.sql',
  '0018_phone_scan_reports.sql',
])

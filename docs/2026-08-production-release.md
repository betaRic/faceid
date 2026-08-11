# FaceAttend Workforce and DTR Release — August 2026

This release upgrades the regional attendance system from basic attendance and employee administration to a workforce-records and CSC Form 48 DTR workflow. It is a **database and application release**: uploading only the Excel template or only `.next` is insufficient.

## What is included

### Employee and administration

- A single employee lifecycle: **Pending review**, **Active**, or **Inactive**. Public registration remains available, but HR reviews a registration before the employee can scan attendance.
- Duplicate-registration protection: an existing employee’s biometric templates, profile photo, attendance, and employment record are not overwritten by a new public registration.
- Faster paginated employee directory with server-side office, division, lifecycle, employee-ID, and name filtering.
- Compact administration shell with a collapsible sidebar, DILG header mark, clear Scan/Logout actions, mobile navigation, and reduced header/page chrome.
- Admin and HR scope enforcement remains server-side; office-scoped HR cannot alter geofence/location data.

### Schedules, flexitime, and workforce records

- Office/default work policy remains the fallback schedule.
- Per-employee weekly schedule supports working-day flags and AM/PM time ranges. An empty employee schedule correctly inherits the office/division/default policy.
- Employee flexitime supports different daily AM/PM times and required daily minutes, including ten-hour four-day schedules. Required work minutes—not a fixed arrival deadline—determine completion for flexitime employees.
- Holiday calendar: seed/edit annual Philippine holiday records.
- Manual Leave records: VL, SL (Sick Leave), CTO, and WL (Wellness Leave).
- Official Orders, including multiple employees across offices/divisions.
- Immutable audit entries for workforce record changes.

### Attendance, summary, and DTR

- Office and division filters apply to the employee directory, daily summary, DTR selection, generation, print, and Excel APIs.
- Manual attendance correction uses separate AM In, AM Out, PM In, and PM Out values, requires a reason, preserves audit history, and confirms server success before showing a toast.
- Special-day precedence is Holiday → Leave/CTO/WL → Official Order. Existing raw punches remain available in audit details.
- CSC Form 48 DTR output includes effective AM/PM schedule labels, uppercase employee/signatory names, status labels, CTO in AM Arrival, and separate Under Time Hours/Minutes columns.
- Workbook/print styles: OB green, Absent red, WL blue, VL white, with distinct Holiday, SL, and CTO treatment. Generated time cells have explicit borders, alignment, and readable gray Arial type.

### Scan and loading experience

- DILG-branded loading indicator and non-functional visual scan feedback; neither changes face matching or attendance writes.
- Camera and location are requested from an explicit user action when required by Safari/iOS. If both browser permissions are already granted, the scan workspace starts directly.
- Attendance recognition remains server-authoritative: a submitted still capture is checked server-side before an attendance write is accepted.

## Required database migrations

Run migrations against the **production PostgreSQL database before uploading the new app**. Do not run them against an unknown database and do not mark a migration as complete manually.

Preferred method, from a controlled machine with the production `DATABASE_URL` and Node 22:

```powershell
npm run postgres:migrate
```

The migration runner records each completed script in `schema_migrations` and safely skips scripts already applied. This release requires these migrations, in order:

1. `0008_workforce_policies_and_records.sql`
2. `0009_workforce_policy_weekly_schedule.sql`
3. `0010_employee_lifecycle_and_workforce_hardening.sql`
4. `0011_workforce_audit_log_immutability.sql`
5. `0012_official_order_members.sql`

If the hosting environment cannot run Node commands, use an approved PostgreSQL administration tool to execute the missing scripts in the same order, one transaction at a time, then insert no manual `schema_migrations` rows unless the SQL transaction completed successfully.

## FileZilla deployment checklist

### Before upload

1. Back up the remote site files and export/backup the production PostgreSQL database.
2. Confirm the production hostname has valid HTTPS. Camera and GPS access on iPhone will not work correctly from a raw HTTP IP address or `localhost`.
3. Set the remote `.env` value `NEXT_PUBLIC_SITE_URL` to the exact production origin, for example `https://attendance.example.gov.ph`. Do **not** upload the local `.env` file or disclose its secrets.
4. Run `npm test` and `npm run build:hosting` locally. The latter rebuilds the production `.next` output.
5. Run the production database migrations above.

### Upload to the remote site root

Upload/replace these built application paths:

- `.next/`
- `app/`
- `components/`
- `config/`
- `db/`
- `hooks/`
- `lib/`
- `public/`
- `scripts/`
- `app.js`
- `next.config.mjs`
- `package.json`
- `package-lock.json`
- `postcss.config.cjs`
- `tailwind.config.cjs`
- `jsconfig.json`
- `web.config`

If the provider has no server-side `npm ci` capability, upload a `node_modules/` directory produced with the exact supported Windows/Node 22 runtime. If it supports installation, use `npm ci --omit=dev` there instead; that is safer and considerably smaller than copying a local `node_modules` tree.

### Preserve — do not replace or delete

- Remote `.env` (production secrets and production site URL)
- `App_Data/veriface-files/` (existing local profile-photo files)
- Any hosting-owned `logs/` folder unless you have already copied its diagnostic logs
- The existing database and all attendance/biometric data

Do not upload `app.zip`, local temporary inspection folders, `.git/`, development logs, or the local `.env`.

### After upload

1. Restart the application from the hosting control panel so `httpPlatformHandler` starts the new `app.js`/`.next` build.
2. Check `/api/health` and open the home, admin, HR, scan, registration, daily summary, and DTR pages.
3. On a real iPhone over the production HTTPS hostname, verify camera/location permission, scan, and a successful attendance write.
4. Create one holiday, leave, and multi-employee Official Order in a safe test scope; confirm the audit log entry.
5. Generate a 30-day and a 31-day DTR and inspect Excel/print for names, signatory, colors, borders, schedule labels, CTO, and Under Time columns.

## Release risks to check honestly

- This release cannot make an iPhone prompt for permissions when iOS has already denied them at browser/device level. The user must re-enable Camera/Location for the site in Safari Settings.
- A successful local build does not prove the hosting provider has a supported Node 22 runtime, access to the PostgreSQL endpoint, writable `App_Data`, or the required biometric model files. Verify each after upload.
- Never test unreleased code against production attendance data unless the production database backup and rollback plan are ready.

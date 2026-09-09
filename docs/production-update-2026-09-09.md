# Production database updated; application upload prepared

The operator explicitly confirmed no one was using the live app and authorized
updating its database before replacing the application. The hosted app was not
stopped by this task. The older app must be replaced before attendance resumes:
its recent entries lack the employee reference required by the new write rules.

## Database completion

PostgreSQL 18 custom-format backup created immediately before migration:
`D:/faceattend-test-data/backups/2026-09-09T12-53-48-624Z-live-migration`.
The private folder contains the dump, SHA-256 manifest and migration evidence.
Archive listing passed. This fresh archive was not separately restored; the
earlier same-day live archive was successfully restored and rehearsed locally.

Applied 0014–0018 in one repeatable-read transaction with a 5-second lock timeout
and a 60-second statement timeout. The transaction committed successfully.
All pre-existing public-table counts and row hashes matched, excluding ledger
additions, the new regional PIN setting, and the specified empty-to-NULL scan
reference normalization. Employees: 73; attendance: 362; scan events: 917.
Employee enrollment and attendance records were preserved. No ambiguous legacy
attendance references were reassigned. A separate read-only connection confirmed
the committed ledger through 0018 and the same counts.

## Startup settings

`app.js` now requires the site-root `.env` and refuses `.env.local`,
`.env.production`, or `.env.production.local` before importing Next. It forces
production mode and the site-root working directory, so development settings
are not selected. Host-provided process variables retain their normal priority,
including the hosting-assigned PORT. This is a restriction on settings files,
not removal of the host's process environment. Startup must use `app.js`;
direct `next start` bypasses this guard.

Neither the local nor remote `.env` or `web.config` was edited. The build runs
without application settings; the live `.env` is loaded at runtime. Eight focused
build/startup checks passed. The hosting build passed under Node 22; build ID:
`hjjWkLjH4p-B_KzpcVwQq`. External runtime packages were materialized and the
build contained no filesystem links.

## Upload

Prepared folder:
`D:/faceattend-test-data/releases/2026-09-09-hjjWkLjH4p-B_KzpcVwQq`.

Upload its contents into the existing website root:

- Replace `.next` with the complete prepared `.next` folder.
- Replace `app.js` with the prepared startup file.
- Copy `db/migrations/*.sql` into the existing migration folder. Preserve any
  historical SQL files already on the host, including the office seed if present.
  These files document changes already applied; do not rerun them manually.

The prepared folder contains no `.env` files, development output or build cache.
Preserve the working `web.config`, `.env`, `App_Data`, `public`, and root
`node_modules`. Compared with local main d4f8977, the dependency lockfile,
next.config.mjs and active public model files are unchanged. The actual remote
dependency versions have not been independently inventoried. Removed iris and
liveness assets may remain unused on the server; no model-file deletion is
needed for this upload. The database is updated, but no application files were
transferred remotely by this task: no saved FileZilla site profile was available.

Restart the hosted app after transfer and verify login, a correct employee scan,
attendance/DTR display, and phone-report delivery. Keep 1:1 and anti-spoofing;
face-memory collection remains disabled. Begin the seven-day observation after
the updated app is confirmed running. The old daily-summary comparison warning
still needs a separate code correction; it is not evidence of lost attendance.

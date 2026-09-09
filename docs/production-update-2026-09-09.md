# Production database updated; application upload prepared

## September 10 scanning visual restored

Latest hosting build: `rPEcVXpgtvIJk9YYEhI6B`, including the location improvement
below. Use the complete worktree `.next` folder, not the older `current-upload`.
A CSS-only sweep and faint grid now appear inside the face oval during scanning
and verification. Result states and camera-off states hide the effect; reduced
motion uses a static line. The decoration does not enter the video capture canvas
or change matching, anti-spoofing, or attendance recording. Eight existing scan UI
tests and the Node 22 hosting build passed. Real-device appearance and frame-rate
impact have not been measured. No live upload was performed.

## September 10 desktop location improvement

Location startup now watches for improving device readings within one deadline
(default 30 seconds), stops early at the requested accuracy, and keeps the best
real reading. Invalid or stale readings are ignored. Permission denial and page
exit stop tracking; background refreshes cannot overlap. A location retry reuses
an already-running camera. The screen shows progress and explains coarse desktop
location separately from face verification failures.

The maximum accepted accuracy and server office boundary checks are unchanged.
A desktop that continues reporting +/-323 m still cannot pass a 250 m requirement.
Real-device improvement has not yet been measured. No database, environment,
startup-file, dependency, or face-matching change is included.

Verification: 11 focused location/UI tests, 37 contract checks, and 118 existing
pure-function checks passed. The initial test attempt failed to start a worker;
the successful focused rerun used one thread. These tests simulate device readings;
they do not prove that the reported desktop will provide a better location.

For this revision use the complete `.next` from
`D:/projects/faceid/.worktrees/codex-release-1-hardening/.next`. The Node 22 hosting
build passed with ID `a0ylj2CpntXDmHazbOUhX`; the settings check confirmed local
development settings were excluded. `D:/faceattend-test-data/releases/current-upload` still contains
the preceding build and does not include this location change. No duplicate upload
folder was created. Keep the already-updated live `app.js`, `.env`, and `web.config`.
After upload and restart, check the reported desktop and one phone at the office:
progress, permission denial/retry, location acceptance, and a recorded 1:1 scan.

## September 10 application revision

Current upload: `D:/faceattend-test-data/releases/current-upload`.
Build ID: `YSw2CBost0SmszdoTHTgv`. Use this folder instead of the September 9
package below. The older package remains because automated approval review
blocked its replacement/cleanup; this revision used a new folder without deletion.

The revised maintenance check bundles its required update list into the app and
compares it to the installed database history. Extra historical entries no longer
trigger warnings. Missing required updates still fail; unavailable history remains
unknown. SQL files are no longer read by this dashboard check and are not needed
in the upload. Source migrations remain in Git for development and recovery.

The home header now has a visible Login link beside the theme selector, leading
to `/login`. The revised upload consists of `.next` and `app.js` only; this
supersedes the earlier instruction below to upload `db/migrations`. No new database
change is required for this revision. The existing daily-summary warning is a
separate check and is not suppressed by the update-status change.

Verification: new database-status regression checks passed, including absent
server SQL files, historical seed entries, missing updates and unavailable
history. All non-UI npm test stages passed. The full UI run passed 79 tests but
could not start the admin test worker; rerunning that file separately passed all
25 tests. Browser inspection confirmed Login beside the theme selector and
successful navigation to `/login`. A read-only check of the local database
returned healthy updates, zero pending updates, no migration action, 73 employees
and 362 attendance entries. The Node 22 hosting build passed. No database updates
or production application uploads were performed for this revision.

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

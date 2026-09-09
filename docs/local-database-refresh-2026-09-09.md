# Live backup restored and migrations rehearsed locally — 2026-09-09

## Scope and destination

User authorized a fresh live database backup, replacement of the existing local
copy, and local testing of missing migrations. Production was not migrated.
The local app was stopped before restore. Destination was verified as
`127.0.0.1:55432/faceid_rc_prod_baseline_20260823_122018`, PostgreSQL 18.4,
data directory `D:/faceattend-test-data/postgres-18`.

An initial guard rejected PostgreSQL's address text `127.0.0.1/32` before any
restore ran. Using PostgreSQL `host(inet_server_addr())` returned the exact
loopback address; database, port and data-directory checks also passed.

## Backups and restore proof

Private backup folder, outside Git:
`D:/faceattend-test-data/backups/2026-09-09-live-refresh`.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| local-before-refresh.dump | 10,202,622 | 88102e4d06171011e094e8cdaab1ae58d145ec58dbce360ab6333fba25dbb2b2 |
| live-latest.dump | 10,467,296 | 6c13c72a036b65f51068aa0c3e311e97bd0d1c0fda0f3110322e5a68702f14a8 |

Both custom-format archives passed listing and hash verification. PostgreSQL 18
restored `live-latest.dump` into the existing local database with clean,
if-exists, no-owner, no-privileges, exit-on-error and single-transaction options.
Restore exited 0. No additional database was created. The prior local backup
remains available. Photo files are separate from these database backups;
server `App_Data` was not copied or changed.

## Migration and preservation results

Applied only 0014–0018, each in its own transaction with 5-second lock and
60-second statement timeouts. All succeeded; no pending file remains through
0018. SQL hashes and verification results are saved in
`migration-verification.json` in the private backup folder.

- All 73 persons and 362 attendance rows preserved, including all person
  columns containing enrollment data, access codes and photo references.
- All 917 scan events preserved. Exactly 565 empty employee references are now
  NULL, as specified by 0015; no scan-history rows were deleted.
- Before/after counts and order-independent row hashes matched for every
  pre-existing public table except the expected migration ledger additions.
  Scan-event hashes normalized only the expected empty-to-NULL conversion.
  System-config comparisons excluded the new `regional_pin_access` key.
- Regional PIN control inserted as enabled; no existing setting overwritten.
- Four new tables exist and are empty: request limits, photo deletion jobs,
  biometric memory candidates and phone scan reports.
- Historical `0005_seed_dilg_r12_offices.sql` ledger entry preserved. Migration
  source files and prior history were retained.
- Lifecycle check includes rejected. Three employee foreign keys enforce new
  writes and remain NOT VALID by design; this does not certify all legacy
  references as valid.

Six rollback-only probes passed: rejected lifecycle accepted; unknown employee
references rejected by attendance, daily attendance and scan history; phone
report objects accepted; phone report arrays rejected. Every probe was rolled
back. Results are in `migration-probes.json`.

## Remaining release checks

The updated local application is started from
`D:/projects/faceid/.worktrees/codex-release-1-hardening`, using Node 22 and the
explicit local database connection. The main checkout remains a separate,
older application source. Do not upload files from it as this release.
The restarted app returned HTTP 200 with HTML at `http://localhost:3000/login`.
This is a page-response check, not a completed login or camera test.

Database rehearsal does not establish phone-camera accuracy, complete browser
workflows, production phone-report delivery, filesystem-photo backup readiness,
or old-application compatibility with the new reference rules. Keep 1:1 and
anti-spoofing; face-memory collection remains disabled. Coordinate live database
updates with the matching app upload after hours. Refresh the live backup at
deployment time because attendance continues to change.

This report completes the local backup/restore/migration stage of
`live-database-check-2026-09-09.md`; it does not authorize or record live deployment.

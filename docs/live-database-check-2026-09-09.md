# Live database read-only check — 2026-09-09

Source: remote DATABASE_URL explicitly loaded from the main checkout `.env`.
No credential values are reproduced. The user identified this as the live
database connection. PostgreSQL reported version 18.4. Every inspection query
ran inside `BEGIN READ ONLY`, verified `transaction_read_only=on`, then rolled
back. No migrations, table creation, record deletion or live writes were performed.

## Update history and actual structure

The ledger records current migrations 0001 through 0013. It also records
`0005_seed_dilg_r12_offices.sql`, which is not in the current migration folder.
Keep that historical ledger entry; do not delete it or rerun an invented seed.
The ledger stores names and dates, not file hashes. Recorded completion alone
does not establish byte-for-byte identity or correctness of every older update.
The audit actor columns introduced by 0013 are present. This inspection is not
a complete semantic audit of all changes made by 0001–0013.

| Update | Verified live state | Intended effect |
| --- | --- | --- |
| 0014 | Not in ledger; lifecycle check still allows only pending/active/inactive | Permit rejected status |
| 0015 | Not in ledger; new rate-limit/deletion-job tables and three person foreign keys absent; scan person reference still non-null with empty-string default | Shared request limits, durable photo deletion queue, employee reference rules |
| 0016 | Not in ledger; regional_pin_access control absent | Initialize control without overriding an existing setting |
| 0017 | Not in ledger; biometric_memory_candidates table absent | Separate inactive face-memory store |
| 0018 | Not in ledger; phone_scan_reports table absent | Separate phone failure report store |

Snapshot counts: 73 employees, 362 attendance rows, 565 scan-history entries
whose person reference is an empty string, zero unsupported lifecycle values.
Counts can change during normal use and must be refreshed before an update.
No employee names, face vectors, photos or access codes were retrieved.

## Do not delete completed migrations

The migration runner skips filenames present in schema_migrations. Keep both
the source SQL and ledger as the reproducible history. Removing ledger entries
can rerun old changes; removing SQL loses the ability to verify/rebuild a database
and creates unexpected-version reports. The extra historical office seed needs
provenance recovery, not deletion.

## Coordinated application/database update

1. Preserve the current live application package, `.env`, `web.config` and
   persistent `App_Data` photo files. The supplied remote listing confirms those
   entries exist; it does not establish their contents or backup readiness.
2. Take a fresh database backup, record its hash, and verify it can be restored
   to an isolated local database. This has not been done in this check.
3. Rehearse 0014–0018 against that restored copy with old/new compatibility and
   preservation checks. Existing synthetic migration tests are not a restore test
   of the actual live data. In particular, 0015 converts empty scan references to
   NULL without deleting rows, and new foreign keys affect subsequent writes.
4. During the after-hours update, coordinate migrations with the matching built
   application so the old writer does not run against incompatible new rules.
   Use bounded lock/statement timeouts; abort on unexpected lock contention.
5. Verify employee/face/photo preservation, ledger and table structure, login,
   accepted/rejected scan behavior, attendance/DTR agreement, and phone report
   delivery. Face-memory collection remains off.

The existing `postgres:migrate` loader reads `.env`, `.env.local`, then
`.env.development.local`. Because the last file can override earlier values,
do not run that command blindly from the main checkout to update production.
A production operation needs an explicitly selected connection and target proof.

Execution remains pending backup/restore proof and coordination with the live
application upload. This is a concrete missing-update list, not a claim that
the existing attendance system is broken.

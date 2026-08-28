# Database and Local Testing

## Database roles

| Database | Purpose | Automated reset allowed |
|---|---|---|
| SmartASP production | Live system of record | Never |
| Restored production baseline | Local reference and production-shaped study | No |
| Disposable clone of baseline | Migration rehearsal and carefully scoped manual tests | Yes, when deliberately recreated |
| Test-owned `faceid_rc_*` database | Automated route tests | Yes |

Production is a backup source and later release target, not a development environment. During development, production access is limited to separately authorized read-only inventory and `pg_dump`.

## Local application configuration

Use `.env.development.local`. `DATABASE_URL` must resolve to loopback for local work. Keep production connection material outside the repository because Next.js loads `.env` as a fallback when higher-priority values are absent.

Before any migration or destructive test, verify the target without printing credentials:

```powershell
$database = [Uri]$env:DATABASE_URL
$database.Host
$database.Port
$database.AbsolutePath
```

Stop unless the host is `127.0.0.1` or `localhost` and the database is the intended local target.

## Migration policy

`scripts/postgres-migrate.mjs` loads local configuration, creates `schema_migrations` when needed, sorts `.sql` filenames, wraps each migration in a transaction, and records the complete filename in `schema_migrations.version`.

Rules:

- Keep migrations `0001` through `0016` unchanged.
- Add a new numbered migration for every schema change.
- Test the complete chain on an isolated database.
- Test upgrades from a disposable production-shaped clone.
- Do not insert migration-history rows manually.
- Do not run production migrations until the application and final migration set pass all local gates and a separate production approval is given.

## Automated route-test database

The route harness resets and seeds data. It therefore requires a separate test-owned PostgreSQL 18 cluster and a database named with the `faceid_rc_` prefix.

Required process variables:

```powershell
$env:FACEID_TEST_DATABASE_URL = 'postgres://postgres@127.0.0.1:55432/faceid_rc_local'
$env:FACEID_TEST_PG_DATA = 'D:\path\to\test-owned-postgres-data'
$env:FACEID_TEST_PG_BIN = 'D:\path\to\postgresql-18\bin'
```

The cluster directory must contain the test ownership marker created by `npm run postgres:test:init`. The harness rejects remote hosts, wrong database prefixes, mismatched data directories, mismatched ports, and non-PostgreSQL-18 clusters.

```powershell
npm run postgres:test:start
npm run test:routes
npm run postgres:test:stop
```

Never substitute the restored production baseline for this reset harness.

## Backup and release rehearsal

A usable production backup is PostgreSQL custom format, hash-recorded, listable by PostgreSQL 18 `pg_restore --list`, and restorable to a new local database. Counts alone are insufficient; preservation proof must cover person IDs, biometric/sample counts, photo paths, lifecycle totals, attendance, daily records, scan events, audit records, and migration versions.

After all code is frozen, capture a fresh production backup and repeat the complete migration/application rehearsal on a disposable clone. The earlier development backup is not final release evidence because production changes over time.

# Database Migrations

`migrations/` is the append-only PostgreSQL schema history for VeriFace.

Rules:

1. Never edit, rename, renumber, squash, or delete an applied migration.
2. Add a new zero-padded migration for every schema or data transition.
3. Make transitions transactional and compatible with existing production data.
4. Reconcile legacy/default values explicitly; do not assume a new default describes existing rows.
5. Test the full chain on an isolated database and the upgrade path on a disposable clone of the production backup.
6. Never point automated reset/seed tests at production or the restored production baseline.
7. Apply production migrations only after a fresh validated backup, completed rehearsal, and separate approval.

`scripts/postgres-migrate.mjs` sorts `.sql` filenames and records the full filename in `schema_migrations.version`. The current chain is `0001` through `0016` and must remain intact.

# PostgreSQL Route Harness and Identity Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fail-closed local PostgreSQL 18 route-test harness, then repair registration, lifecycle, photo, re-enrollment, kiosk identity, deletion, and public error contracts.

**Architecture:** Tests run only against a loopback database whose name starts with `faceid_rc_`; the runner maps that verified URL into `DATABASE_URL` for the child test process and never falls back to production. Route wrappers stay thin while PostgreSQL services own canonical identity and transactions. Untrusted images are decoded and re-encoded before storage, and matched attendance identity always replaces client claims.

**Tech Stack:** Node.js 22 test runner, Next.js 16 Route Handlers, PostgreSQL 18, `pg`, `sharp`, React 18.

---

## File Structure

- Create `tests/postgres/test-database.mjs`: validate test URLs, reset schema, migrate, seed, and close clients.
- Create `tests/postgres/route-loader.mjs`: resolve `@/` imports and neutralize `server-only` for direct Node route tests.
- Create `tests/postgres/route-request.mjs`: build same-origin `NextRequest` objects and capture cookies.
- Create `tests/postgres/identity.routes.test.mjs`: real PostgreSQL registration, lifecycle, re-enrollment, kiosk, and deletion regressions.
- Create `tests/run-contract-tests.mjs`: discover and run top-level non-PostgreSQL contract tests on Windows without shell globs.
- Create `scripts/postgres-test.mjs`: initialize/start/stop/reset the isolated PostgreSQL 18 cluster.
- Create `.env.test.example`: non-secret loopback test configuration.
- Modify `.gitignore`: ignore local test-cluster/runtime output, not test source.
- Modify `package.json`: expose deterministic `postgres:test:*` and `test:routes` commands.
- Modify `lib/postgres/client.js`: pool error handling and explicit pool shutdown for tests.
- Create `lib/images/safe-data-image.js`: decode limits, metadata validation, and server-selected JPEG re-encoding.
- Modify `lib/postgres/photo-store.js`: persist only normalized image bytes and support a supplied transaction client.
- Modify `app/api/persons/route.js`: safe response contract and no false failure after commit.
- Create `lib/routes/persons-route.js`: dependency-injected registration handler used by the real Route Handler and direct route tests.
- Modify `lib/postgres/person-store.js`: canonical registration/lifecycle rules and unambiguous deletion.
- Modify `app/api/persons/[personId]/route.js`: explicit lifecycle commands and server-derived identity fields.
- Modify `app/api/persons/[personId]/reenroll/route.js`: exact person-token ownership and no lifecycle mutation.
- Modify `lib/attendance/process.js`: assign canonical matched `personId` before attendance reads/writes.
- Modify `app/api/attendance/v2/route.js`: expose a thin dependency-injected POST factory for route tests while production uses real services.
- Modify `lib/data-store.js` and `lib/employee-access.js`: stop accepting Employee ID as re-enrollment ownership proof.
- Modify `lib/csrf.js`, `lib/rate-limit.js`, and `next.config.mjs`: trusted proxy/origin boundary, safe defaults, CSP/security regression coverage.
- Create `db/migrations/0014_add_rejected_employee_lifecycle.sql`: preserve rejected registration as a lifecycle distinct from inactive employment.
- Create `db/migrations/0015_security_rate_limits.sql` and `lib/postgres/rate-limit-store.js`: durable shared rate-limit buckets.
- Create `lib/offices/hr-office-settings.js` and modify `app/api/hr/office-settings/route.js`: allowlisted Office HR DTO and mutations.
- Create `lib/staff-session-cookie.js` and modify PIN/authentication, threshold, Regional PIN, and session routes: retain both explicitly required PIN paths while centralizing cookie security, durable throttling, atomic audit, and Regional-Admin-only configuration.

### Task 1: Fail-closed test database URL

**Files:**
- Create: `tests/postgres/test-database.mjs`
- Create: `tests/postgres/test-database.test.mjs`

- [ ] **Step 1: Write the failing URL-safety tests**

```javascript
import test from 'node:test'
import assert from 'node:assert/strict'
import { assertSafeTestDatabaseUrl } from './test-database.mjs'

test('accepts only loopback faceid_rc databases', () => {
  const url = assertSafeTestDatabaseUrl('postgres://postgres@127.0.0.1:55432/faceid_rc_local')
  assert.equal(url.hostname, '127.0.0.1')
  assert.equal(url.pathname, '/faceid_rc_local')
})

for (const unsafe of [
  '',
  'postgres://postgres@db.example.com/faceid_rc_local',
  'postgres://postgres@127.0.0.1:55432/faceid',
  'postgres://user@example.site4now.net/faceid_rc_remote',
]) {
  test(`rejects unsafe test URL ${unsafe || '<empty>'}`, () => {
    assert.throws(() => assertSafeTestDatabaseUrl(unsafe), /FACEID_TEST_DATABASE_URL|loopback|faceid_rc_/)
  })
}
```

- [ ] **Step 2: Run the test and confirm the missing-module failure**

Run: `node --test tests/postgres/test-database.test.mjs`
Expected: FAIL because `tests/postgres/test-database.mjs` does not exist.

- [ ] **Step 3: Implement the safety boundary and migration helper**

```javascript
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const { Client } = pg
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

export function assertSafeTestDatabaseUrl(value = process.env.FACEID_TEST_DATABASE_URL) {
  if (!value) throw new Error('FACEID_TEST_DATABASE_URL is required; DATABASE_URL fallback is forbidden.')
  const url = new URL(value)
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('FACEID_TEST_DATABASE_URL must use PostgreSQL.')
  if (!LOOPBACK_HOSTS.has(url.hostname)) throw new Error('FACEID_TEST_DATABASE_URL must use a loopback host.')
  if (!url.pathname.slice(1).startsWith('faceid_rc_')) throw new Error('FACEID_TEST_DATABASE_URL database must start with faceid_rc_.')
  return url
}

export async function migrateTestDatabase({ projectRoot = process.cwd() } = {}) {
  const url = assertSafeTestDatabaseUrl()
  const adminUrl = new URL(url)
  adminUrl.pathname = '/postgres'
  const admin = new Client({ connectionString: adminUrl.href })
  await admin.connect()
  try {
    const databaseName = url.pathname.slice(1)
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName])
    if (!exists.rows[0]) await admin.query(`CREATE DATABASE "${databaseName.replaceAll('"', '""')}"`)
  } finally {
    await admin.end()
  }
  const client = new Client({ connectionString: url.href })
  await client.connect()
  try {
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    await client.query('CREATE TABLE schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
    const directory = path.join(projectRoot, 'db', 'migrations')
    const files = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()
    for (const file of files) {
      await client.query('BEGIN')
      try {
        await client.query(await readFile(path.join(directory, file), 'utf8'))
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file])
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  } finally {
    await client.end()
  }
}
```

- [ ] **Step 4: Re-run the safety tests**

Run: `node --test tests/postgres/test-database.test.mjs`
Expected: PASS, including rejection of the current production `DATABASE_URL` when present.

- [ ] **Step 5: Commit the safety helper**

```powershell
git add tests/postgres/test-database.mjs tests/postgres/test-database.test.mjs
git commit -m "test: guard PostgreSQL route database"
```

### Task 2: Isolated PostgreSQL 18 cluster and route runner

**Files:**
- Create: `scripts/postgres-test.mjs`
- Create: `.env.test.example`
- Create: `tests/postgres/route-loader.mjs`
- Create: `tests/postgres/route-request.mjs`
- Create: `tests/run-contract-tests.mjs`
- Modify: `.gitignore`
- Modify: `package.json`

- [ ] **Step 1: Write a command-level fail-closed test**

Add to `tests/postgres/test-database.test.mjs`:

```javascript
import { spawnSync } from 'node:child_process'

test('route runner refuses to start without FACEID_TEST_DATABASE_URL', () => {
  const env = { ...process.env }
  delete env.FACEID_TEST_DATABASE_URL
  const result = spawnSync(process.execPath, ['scripts/postgres-test.mjs', 'verify'], {
    cwd: process.cwd(), env, encoding: 'utf8', shell: false,
  })
  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /FACEID_TEST_DATABASE_URL/)
})
```

- [ ] **Step 2: Implement the test-cluster controller**

`scripts/postgres-test.mjs` must:

```javascript
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { assertSafeTestDatabaseUrl, migrateTestDatabase } from '../tests/postgres/test-database.mjs'

const command = String(process.argv[2] || 'verify').toLowerCase()
const bin = String(process.env.FACEID_TEST_PG_BIN || 'C:\\Program Files\\PostgreSQL\\18\\bin')
const data = String(process.env.FACEID_TEST_PG_DATA || 'D:\\faceattend-test-data\\postgres-18')
const url = assertSafeTestDatabaseUrl()
const port = url.port || '55432'
const exe = name => path.join(bin, `${name}.exe`)
const run = (file, args) => {
  const result = spawnSync(file, args, { stdio: 'inherit', shell: false })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}

if (command === 'verify') process.exit(0)
if (command === 'init' && !existsSync(path.join(data, 'PG_VERSION'))) {
  mkdirSync(data, { recursive: true })
  run(exe('initdb'), ['-D', data, '--username=postgres', '--auth-local=trust', '--auth-host=trust', '--encoding=UTF8'])
}
if (command === 'start') run(exe('pg_ctl'), ['-D', data, '-o', `-p ${port} -h 127.0.0.1`, '-w', 'start'])
if (command === 'stop') run(exe('pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'])
if (command === 'reset') await migrateTestDatabase()
```

- [ ] **Step 3: Add non-secret example configuration and scripts**

`.env.test.example`:

```dotenv
FACEID_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/faceid_rc_local
FACEID_TEST_PG_BIN=C:\Program Files\PostgreSQL\18\bin
FACEID_TEST_PG_DATA=D:\faceattend-test-data\postgres-18
```

Add these `package.json` scripts:

```json
"postgres:test:init": "node scripts/postgres-test.mjs init",
"postgres:test:start": "node scripts/postgres-test.mjs start",
"postgres:test:stop": "node scripts/postgres-test.mjs stop",
"postgres:test:reset": "node scripts/postgres-test.mjs reset",
"test:contracts": "node tests/run-contract-tests.mjs",
"test:routes": "node tests/postgres/run-route-tests.mjs",
"test": "node tests/run-tests.mjs && node tests/run-contract-tests.mjs"
```

Add to `.gitignore`:

```gitignore
.env.test.local
.faceattend-test-runtime/
```

- [ ] **Step 4: Add the alias loader and request helper**

`tests/postgres/route-loader.mjs` resolves `@/x` to the repository file URL and resolves `server-only` to a no-op data module. `tests/postgres/route-request.mjs` exports `sameOriginRequest(path, init)` using `NextRequest`, defaults `origin` to the request origin, serializes JSON, and accepts a cookie string.

Route tests must not add `NODE_ENV=test` bypasses to production handlers. Instead, `lib/routes/persons-route.js` exports `createPersonsPostHandler(dependencies)` and `app/api/attendance/v2/route.js` exports `createAttendanceV2PostHandler(dependencies)`. Real exported `POST` handlers are constructed with real embedding/matching functions; tests provide deterministic embedding/matching services while still using real authorization, validation, PostgreSQL writes, and response code.

- [ ] **Step 5: Add the route runner**

Create `tests/run-contract-tests.mjs` and `tests/postgres/run-route-tests.mjs` using `readdir` to build exact test-file arrays. The route runner calls `assertSafeTestDatabaseUrl`, sets child `DATABASE_URL` to that exact verified URL, sets `DATA_BACKEND=postgres` and `NODE_ENV=test`, runs `migrateTestDatabase`, and forwards `process.argv.slice(2)` before exact test files. It then spawns:

```javascript
spawnSync(process.execPath, [
  '--experimental-loader', './tests/postgres/route-loader.mjs',
  '--test',
  ...process.argv.slice(2),
  ...routeTestFiles,
], { cwd: process.cwd(), env: testEnv, stdio: 'inherit', shell: false })
```

- [ ] **Step 6: Verify cluster and empty migrated schema**

Run:

```powershell
$env:FACEID_TEST_DATABASE_URL='postgres://postgres@127.0.0.1:55432/faceid_rc_local'
npm run postgres:test:init
npm run postgres:test:start
npm run postgres:test:reset
```

Expected: PostgreSQL 18 starts on loopback, all migrations apply, and no production host appears in output.

- [ ] **Step 7: Commit the harness**

```powershell
git add scripts/postgres-test.mjs .env.test.example .gitignore package.json tests/run-contract-tests.mjs tests/postgres/route-loader.mjs tests/postgres/route-request.mjs tests/postgres/run-route-tests.mjs
git commit -m "test: add isolated PostgreSQL route harness"
```

### Task 3: PostgreSQL pool lifecycle

**Files:**
- Modify: `lib/postgres/client.js`
- Test: `tests/postgres/database-client.routes.test.mjs`

- [ ] **Step 1: Write a pool shutdown regression**

Test that `queryPostgres('SELECT current_database() AS name')` returns `faceid_rc_local`, then call `closePostgresPool()` and verify a later query creates a fresh usable pool.

- [ ] **Step 2: Run and confirm the missing-export failure**

Run: `npm run test:routes -- --test-name-pattern="pool shutdown"`
Expected: FAIL because `closePostgresPool` is not exported.

- [ ] **Step 3: Add pool error handling and shutdown**

```javascript
pool = new Pool({
  connectionString: getDatabaseUrl(),
  max: Number(process.env.POSTGRES_POOL_MAX || 10),
  idleTimeoutMillis: Number(process.env.POSTGRES_IDLE_TIMEOUT_MS || 30_000),
  connectionTimeoutMillis: Number(process.env.POSTGRES_CONNECT_TIMEOUT_MS || 5_000),
})
pool.on('error', error => console.error('[postgres] idle client error', { message: error.message, code: error.code }))

export async function closePostgresPool() {
  const current = pool
  pool = null
  if (current) await current.end()
}
```

- [ ] **Step 4: Re-run the route test and commit**

Run: `npm run test:routes -- --test-name-pattern="pool shutdown"`
Expected: PASS.

```powershell
git add lib/postgres/client.js tests/postgres/database-client.routes.test.mjs
git commit -m "fix: make PostgreSQL pool testable"
```

### Task 4: Safe enrollment photos and non-leaking public errors

**Files:**
- Create: `lib/images/safe-data-image.js`
- Create: `lib/routes/persons-route.js`
- Modify: `lib/postgres/photo-store.js`
- Modify: `app/api/persons/route.js`
- Modify: `app/api/persons/[personId]/photo/route.js`
- Modify: `app/api/persons/[personId]/reenroll/route.js`
- Test: `tests/postgres/identity.routes.test.mjs`

- [ ] **Step 1: Write failing route tests**

Cover:

```javascript
test('registration rejects SVG and malformed image data', async () => {
  const response = await register({ photoDataUrl: 'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+' })
  assert.equal(response.status, 400)
  assert.doesNotMatch((await response.json()).message, /sharp|SQL|bind|D:\\|node_modules/i)
})

test('saved profile photo is server-encoded JPEG', async () => {
  const result = await register(validRegistrationFixture())
  assert.equal(result.status, 200)
  const person = await loadInsertedPerson()
  assert.match(person.photo_path, /\.jpg$/)
})
```

Construct the registration handler with a deterministic `buildAuthoritativeEnrollmentPayload` fixture service. Do not bypass validation/photo/PostgreSQL logic and do not add an environment-based test branch.

- [ ] **Step 2: Implement bounded decode and re-encoding**

`normalizeDataImage(value, { maxBytes = 7 * 1024 * 1024, maxPixels = 20_000_000 } = {})` must accept only JPEG/PNG/WebP data URLs, reject decoded size above `maxBytes`, use `sharp(buffer).metadata()` to reject zero/oversized dimensions, auto-rotate, strip metadata, and return `{ buffer: await image.jpeg({ quality: 88 }).toBuffer(), extension: '.jpg', mimeType: 'image/jpeg' }`.

- [ ] **Step 3: Make photo persistence accept normalized bytes**

Split `saveLocalEnrollmentPhoto` into normalization plus `saveNormalizedEnrollmentPhoto(personId, normalized, { client } = {})`. The latter writes only `.jpg`, updates `persons.photo_path` with the supplied client when present, and removes a newly written file if the database update fails.

Normalize the photo before opening the enrollment transaction. Inside `enrollLocalPerson`, insert the person, write the normalized file, update `photo_path` with the same transaction client, and insert the required audit row. Return a cleanup callback for the newly written file and invoke it if COMMIT fails. After COMMIT, cache/index/telemetry work is best-effort and can add a warning, but cannot change the successful response into a 500.

- [ ] **Step 4: Replace raw exception responses**

In the public registration catch block, log structured `{ code, message }` server-side and return only stable messages:

```javascript
const status = duplicateFace?.duplicate || error?.code === 'duplicate_person_registration' ? 409 : toHttpStatus(error?.status)
const publicMessage = status === 409
  ? 'This registration matches an existing employee record and cannot be submitted again.'
  : 'Registration could not be completed. Please try again or contact HR.'
return NextResponse.json({ ok: false, code: error?.code || 'registration_failed', message: publicMessage }, { status })
```

Move POST orchestration into `createPersonsPostHandler(dependencies)` in `lib/routes/persons-route.js`; `app/api/persons/route.js` exports the handler created with real services.

- [ ] **Step 5: Run focused tests and commit**

Run: `npm run test:routes -- --test-name-pattern="photo|public error"`
Expected: PASS.

```powershell
git add lib/images/safe-data-image.js lib/routes/persons-route.js lib/postgres/photo-store.js app/api/persons/route.js app/api/persons/[personId]/photo/route.js app/api/persons/[personId]/reenroll/route.js tests/postgres/identity.routes.test.mjs
git commit -m "fix: normalize stored enrollment photos"
```

### Task 5: Registration visibility and lifecycle commands

**Files:**
- Create: `db/migrations/0014_add_rejected_employee_lifecycle.sql`
- Modify: `lib/postgres/person-store.js`
- Modify: `lib/postgres/attendance-store.js`
- Modify: `lib/postgres/photo-store.js`
- Modify: `app/api/persons/route.js`
- Modify: `lib/routes/persons-route.js`
- Modify: `app/api/persons/[personId]/route.js`
- Modify: `lib/person-approval.js`
- Modify: `lib/data-store.js`
- Modify: `lib/admin/hooks/useEmployees.js`
- Modify: `components/admin/EmployeeEditorModal.jsx`
- Modify: `components/admin/EmployeesPanel.jsx`
- Modify: `components/admin/HrEmployeesPanel.jsx`
- Test: `tests/run-tests.mjs`
- Test: `tests/postgres/identity.routes.test.mjs`

- [ ] **Step 1: Write failing real-database tests**

Test successful registration returns `lifecycleStatus: 'pending'`; `GET /api/persons?mode=directory&approval=pending` includes the new `personId`; approval changes it to active; only a pending application may be rejected; rejected records must return to pending review before activation; an invalid transition returns 409; every transition writes actor/prior/new state to `audit_logs`; duplicate Employee ID absence does not hide a face duplicate.

- [ ] **Step 2: Verify failures are behavioral, not fixture failures**

Run: `npm run test:routes -- --test-name-pattern="registration|lifecycle"`
Expected: at least one assertion fails against current behavior; database safety and fixture setup pass.

- [ ] **Step 3: Introduce explicit lifecycle transition input**

Route input becomes:

```javascript
{
  command: 'transitionLifecycle',
  lifecycleStatus: 'active' | 'inactive' | 'pending' | 'rejected',
  reason: 'Required non-empty audit reason'
}
```

The server loads the current row `FOR UPDATE`, validates the transition with `resolvePersonLifecycleTransition`, derives `active` and `approval_status`, and inserts the audit row using the same transaction client.

Add `rejected` to the lifecycle constraint without rewriting existing rows. Profile Save must not carry lifecycle state; admin status controls call the explicit command with a meaningful audit reason. Rejected and inactive remain visibly and filterably distinct.

Move the current POST orchestration into `createPersonsPostHandler({ buildAuthoritativeEnrollmentPayload, enrollLocalPerson, normalizeDataImage, writeTelemetry })`. `app/api/persons/route.js` constructs and exports the real handler. Tests construct the same handler with only `buildAuthoritativeEnrollmentPayload` replaced by a deterministic fixture service; duplicate checks and PostgreSQL persistence remain real.

- [ ] **Step 4: Keep registration write and required audit in one transaction**

Move required audit insertion into `enrollLocalPerson`'s existing `withPostgresTransaction` callback. Return committed state from that transaction. Cache/index refresh remains post-commit and is reported as `warnings`, never by converting the committed result into a 500.

- [ ] **Step 5: Re-run focused tests and commit**

Run: `npm run test:routes -- --test-name-pattern="registration|lifecycle"`
Expected: PASS.

```powershell
git add db/migrations/0014_add_rejected_employee_lifecycle.sql lib/routes/persons-route.js lib/postgres/person-store.js lib/person-approval.js lib/data-store.js lib/admin/hooks/useEmployees.js app/api/persons/route.js app/api/persons/[personId]/route.js components/admin/EmployeeEditorModal.jsx components/admin/EmployeesPanel.jsx components/admin/HrEmployeesPanel.jsx tests/run-tests.mjs tests/postgres/identity.routes.test.mjs
git commit -m "fix: make employee lifecycle transactional"
```

### Task 6: Exact-person re-enrollment and preserved lifecycle

**Files:**
- Modify: `app/api/persons/[personId]/reenroll/route.js`
- Modify: `lib/employee-access.js`
- Modify: `lib/employee-view-auth.js`
- Modify: `lib/attendance-match.js`
- Modify: `lib/postgres/attendance-store.js`
- Modify: `lib/postgres/person-store.js`
- Modify: `hooks/useKioskLoop.js`
- Modify: `components/KioskView.jsx`
- Modify: `components/kiosk/AttendanceTableView.jsx`
- Modify: `components/kiosk/KioskSuccessScreen.jsx`
- Modify: `app/(public)/summary/page.jsx`
- Modify: `app/api/attendance/{table,monthly,me,dtr}/route.js`
- Test: `tests/postgres/identity.routes.test.mjs`
- Test: `tests/run-tests.mjs`

- [x] **Step 1: Write failing ownership and preservation tests**

Seed two people with the same legacy Employee ID. Verify a token for person A cannot re-enroll person B and returns the same forbidden response for a nonexistent foreign ID. Verify public/employee re-enrollment cannot change `lifecycle_status`, `approval_status`, `active`, `office_id`, `organization_unit_id`, access code, attendance, or audit history; only descriptors/model/photo fields change. Force a late transaction failure and prove person data, biometric index, old photo bytes, audit rows, and directory contents all roll back.

- [x] **Step 2: Replace OR ownership checks**

The employee token payload requires canonical `personId`; Employee ID remains optional display/reference data. Route authorization compares canonical IDs only:

```javascript
if (!session?.personId || session.personId !== personId) {
  return NextResponse.json({ ok: false, code: 'reenrollment_forbidden', message: 'This re-enrollment link is not valid for this employee.' }, { status: 403 })
}
```

- [x] **Step 3: Restrict the PostgreSQL update set**

Create `refreshLocalPersonBiometrics(personId, { descriptors, biometricModelVersion, photo })` whose SQL updates only biometric/photo columns and `updated_at`. Do not route employee self-service through general profile/lifecycle update code.

Carry canonical `personId` through kiosk result state and browser storage. Employee attendance/table/monthly/DTR routes resolve a signed employee session by person ID, so the optional Employee ID can remain blank; staff lookup continues to require Employee ID.

- [x] **Step 4: Run tests and commit**

Run: `npm run test:routes -- --test-name-pattern="re-enrollment"`
Expected: PASS.

```powershell
git add app/api/persons/[personId]/reenroll/route.js app/api/attendance app/(public)/summary/page.jsx components/KioskView.jsx components/kiosk/AttendanceTableView.jsx components/kiosk/KioskSuccessScreen.jsx hooks/useKioskLoop.js lib/attendance-match.js lib/employee-access.js lib/employee-view-auth.js lib/postgres/attendance-store.js lib/postgres/person-store.js tests/postgres/identity.routes.test.mjs tests/run-tests.mjs
git commit -m "fix: bind reenrollment to canonical person"
```

### Task 7: Canonical kiosk person identity

**Files:**
- Modify: `lib/attendance/process.js`
- Modify: `lib/attendance/write.js`
- Modify: `lib/attendance/logs.js`
- Modify: `lib/attendance/match.js`
- Modify: `lib/daily-attendance.js`
- Modify: `lib/postgres/attendance-store.js`
- Modify: `lib/scan-events.js`
- Modify: `app/api/attendance/v2/route.js`
- Test: `tests/postgres/identity.routes.test.mjs`

- [x] **Step 1: Write accept/reject identity tests**

Seed person A and person B with null/duplicate Employee IDs. Construct `createAttendanceV2PostHandler` with deterministic authoritative embedding/match services while leaving challenge consumption, validation, authorization, office policy, and persistence real. Assert an accepted scan matched to person A writes person A's canonical ID through raw attendance, daily projection, lock, scan event, response, and employee session; uses person A's office/unit; and never persists a claimed person B identity. Assert missing canonical ID, inactive, pending, invalid-liveness, geofence, cooldown, and wrong-access-code cases write no accepted attendance row and return stable decision codes. Exercise the production matcher for pending lifecycle behavior.

- [x] **Step 2: Verify the current missing-person assignment fails**

Run: `npm run test:routes -- --test-name-pattern="kiosk"`
Expected: FAIL because `entry.personId` is not replaced after `const person = personMatch.person`.

- [x] **Step 3: Assign authoritative identity before all downstream work**

Immediately after the matched person is accepted:

```javascript
entry = {
  ...entry,
  personId: person.id,
  employeeId: person.employeeId || '',
  name: person.name,
  officeId: person.officeId,
  officeName: office.name,
  organizationUnitId: person.organizationUnitId || '',
  confidence: personMatch.confidence ?? entry.confidence,
}
entry.id = `${entry.personId}_${entry.timestamp}`
```

Pass `entry.personId` to daily-log queries, locks, attendance insert, daily projection, scan events, and employee-view sessions. Use `personId` in lock keys; Employee ID is display data.

PostgreSQL office/person mappers keep normalized columns authoritative over legacy JSON. Map SQL latitude, longitude, and radius into `office.gps`, which is the shape consumed by geofence checks.

`processAttendanceSubmission` accepts an optional `services` object whose default is a frozen production service map. `createAttendanceV2PostHandler` passes the supplied map. Tests replace only `buildAuthoritativeAttendancePayload` and `findClaimedEmployeeMatch`; the route has no environment-variable bypass and cannot activate test behavior in production.

- [x] **Step 4: Run kiosk tests and commit**

Run: `npm run test:routes -- --test-name-pattern="kiosk"`
Expected: PASS.

```powershell
git add lib/attendance/process.js lib/attendance/write.js lib/attendance/logs.js lib/attendance/match.js lib/daily-attendance.js lib/postgres/attendance-store.js lib/scan-events.js app/api/attendance/v2/route.js tests/postgres/identity.routes.test.mjs
git commit -m "fix: persist matched kiosk person identity"
```

### Task 8: Unambiguous soft deletion and platform guards

**Files:**
- Modify: `.env.example`
- Modify: `lib/postgres/person-store.js`
- Modify: `lib/postgres/attendance-store.js`
- Modify: `lib/postgres/photo-store.js`
- Create: `lib/postgres/rate-limit-store.js`
- Create: `db/migrations/0015_security_rate_limits.sql`
- Modify: `app/api/persons/[personId]/route.js`
- Modify: `lib/data-store.js`
- Modify: `components/admin/EmployeeDeleteModal.jsx`
- Modify: `components/admin/EmployeesPanel.jsx`
- Modify: `components/admin/HrEmployeesPanel.jsx`
- Modify: `lib/csrf.js`
- Modify: `lib/rate-limit.js`
- Modify: `next.config.mjs`
- Test: `tests/postgres/identity.routes.test.mjs`
- Test: `tests/run-tests.mjs`

- [x] **Step 1: Write failing deletion/security tests**

Assert normal deletion changes lifecycle to inactive and preserves person, biometric, photo, attendance, and daily rows. Assert only an explicit Regional Admin hard-delete command with typed confirmation can physically delete, and referenced history blocks it. Assert spoofed forwarding headers do not bypass origin/rate identity. Assert security headers include a reviewed CSP and no raw server error is returned.

- [x] **Step 2: Split deactivate and hard delete APIs**

Rename current behavior into:

```javascript
export async function deactivateLocalPerson(personId, actor, reason) {
  return transitionLocalPersonLifecycle(personId, { lifecycleStatus: 'inactive', reason }, actor)
}

export async function hardDeleteLocalPerson(personId, actor, confirmation) {
  if (actor.scope !== 'regional') throw Object.assign(new Error('Regional Admin access is required.'), { status: 403 })
  return deleteUnreferencedLocalPerson(personId, { expectedName: confirmation, actor })
}
```

The route defaults to deactivation. Hard deletion requires `{ command: 'hardDelete', confirmation: person.name }`, Regional Admin scope, and zero protected references.

The Admin and HR directory UIs offer deactivation only for active employees and keep invalid lifecycle actions disabled. The exceptional hard-delete command is not exposed as a routine employee-table action. Its audit insert and durable photo-deletion job use the locked person snapshot and are part of the same PostgreSQL transaction as the person deletion. Restrictive PostgreSQL references prevent concurrent attendance/daily/scan writes from becoming orphaned. Filesystem cleanup consumes the durable job after commit; a Regional Admin can retry the same hard-delete request after the person row is gone, so a failed unlink remains recoverable instead of becoming an invisible orphan.

- [x] **Step 3: Add durable rate-limit buckets**

Create `0015_security_rate_limits.sql` with `request_rate_limits(key_hash text, window_start timestamptz, request_count integer, expires_at timestamptz)`, a composite primary key on `(key_hash, window_start)`, and an expiry index. `consumePostgresRateLimit` hashes keys before storage, increments through `INSERT ... ON CONFLICT ... DO UPDATE`, opportunistically removes a bounded batch of globally expired identities, and returns remaining/reset data. In-memory limiting may remain only as an explicitly labeled local fallback when PostgreSQL is unavailable; security-sensitive public routes fail conservatively instead of silently becoming unlimited.

- [x] **Step 4: Make proxy/origin handling explicit**

Only honor forwarded client IP when `TRUST_SMARTASP_PROXY=true`; otherwise use a verified direct request identity. Production requests with neither a trusted proxy nor a server-provided peer address fail closed before touching rate-limit storage instead of collapsing into a shared global bucket. Origin validation is never inferred from forwarded host/protocol headers and uses only the explicit `NEXT_PUBLIC_SITE_URL` allowlist. Document the disabled-by-default proxy setting in `.env.example`, without adding secrets.

- [x] **Step 5: Add reviewed CSP**

Add a CSP compatible with Next.js, camera, same-origin models, images, and required workers. Start with report-only locally if current runtime needs inline script adjustments; do not claim enforcement until browser checks show no blocked essential assets.

- [x] **Step 6: Run all Phase 1 gates**

Run:

```powershell
npm run test:routes
npm test
git diff --check
```

Expected: all pass; the test logs name only `faceid_rc_` databases.

- [x] **Step 7: Commit Phase 1 guards**

```powershell
git add db/migrations/0015_security_rate_limits.sql lib/postgres/rate-limit-store.js lib/postgres/person-store.js app/api/persons/[personId]/route.js lib/csrf.js lib/rate-limit.js next.config.mjs tests/postgres/identity.routes.test.mjs tests/run-tests.mjs
git commit -m "fix: preserve employee records and harden guards"
```

### Task 9: Enforce Office HR DTO and mutation scope

**Files:**
- Create: `lib/offices/hr-office-settings.js`
- Create: `lib/postgres/hr-office-settings-store.js`
- Modify: `lib/postgres/audit-store.js`
- Modify: `app/api/hr/office-settings/route.js`
- Test: `tests/postgres/identity.routes.test.mjs`

- [x] **Step 1: Write failing Office HR scope tests**

Assert GET contains only office ID/name plus allowlisted work-policy fields and never `gps`, latitude, longitude, radius, map/location, Wi-Fi, or another office. Assert PUT ignores/rejects forged Admin-only fields, updates only the session office policy, and writes an audit record. Assert Regional/Office session boundaries and origin guard.

- [x] **Step 2: Implement an explicit allowlist DTO**

```javascript
const HR_POLICY_FIELDS = [
  'schedule', 'workingDays', 'wfhDays', 'morningIn', 'morningOut',
  'afternoonIn', 'afternoonOut', 'gracePeriodMinutes',
  'checkInCooldownMinutes', 'checkOutCooldownMinutes',
]

export function toHrOfficeSettings(office) {
  return {
    id: office.id,
    name: office.name,
    workPolicy: Object.fromEntries(HR_POLICY_FIELDS.map(key => [key, office.workPolicy?.[key]])),
  }
}

export function pickHrWorkPolicy(value) {
  return Object.fromEntries(HR_POLICY_FIELDS.filter(key => Object.hasOwn(value || {}, key)).map(key => [key, value[key]]))
}
```

- [x] **Step 3: Apply scope on both read and write**

Resolve the HR session first, load only `session.officeId`, project GET through `toHrOfficeSettings`, and merge PUT through `pickHrWorkPolicy`. Do not serialize the full office and remove fields afterward.

- [x] **Step 4: Run and commit**

Run: `npm run test:routes -- --test-name-pattern="Office HR settings"`
Expected: PASS.

```powershell
git add lib/offices/hr-office-settings.js app/api/hr/office-settings/route.js tests/postgres/identity.routes.test.mjs
git commit -m "fix: restrict Office HR settings scope"
```

### Task 10: Retained PIN paths, session cookies, and threshold authority

**Files:**
- Create: `lib/staff-session-cookie.js`
- Create: `lib/login-security.js`
- Create: `db/migrations/0016_initialize_regional_pin_access.sql`
- Modify: `lib/bootstrap-pin.js`
- Modify: `lib/admin-auth.js`
- Modify: `lib/hr-auth.js`
- Modify: `lib/audit-log.js`
- Modify: `lib/thresholds.js`
- Modify: `lib/postgres/audit-store.js`
- Modify: `lib/postgres/user-store.js`
- Modify: `lib/postgres/rate-limit-store.js`
- Modify: `lib/rate-limit.js`
- Modify: `app/api/login/route.js`
- Modify: `app/api/admin/regional-pin/route.js`
- Modify: `app/api/admin/thresholds/route.js`
- Modify: `app/api/admin/session/route.js`
- Modify: `app/api/admin/logout/route.js`
- Modify: `app/api/hr/session/route.js`
- Modify: `app/api/hr/logout/route.js`
- Modify: `.env.example`
- Test: `tests/postgres/identity.routes.test.mjs`
- Test: `tests/staff-session-cookie.test.mjs`

- [x] **Step 1: Write failing shared-cookie contract tests**

Create `tests/staff-session-cookie.test.mjs` and assert the wished-for helper contract directly:

```javascript
import test from 'node:test'
import assert from 'node:assert/strict'
import { staffSessionCookieOptions } from '../lib/staff-session-cookie.js'

test('staff session cookie options are secure and bounded', () => {
  const previous = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    assert.deepEqual(staffSessionCookieOptions({ maxAge: 28_800 }), {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 28_800,
    })
    assert.equal(staffSessionCookieOptions({ maxAge: 0 }).maxAge, 0)
    assert.throws(() => staffSessionCookieOptions({ maxAge: -1 }), /maxAge/)
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous
  }
})
```

Run: `node --test tests/staff-session-cookie.test.mjs`
Expected: FAIL because `lib/staff-session-cookie.js` does not exist.

- [x] **Step 2: Centralize cookie options**

Create `lib/staff-session-cookie.js` with one exported helper:

```javascript
export function staffSessionCookieOptions({ maxAge }) {
  if (!Number.isSafeInteger(maxAge) || maxAge < 0) {
    throw new TypeError('Staff session cookie maxAge must be a non-negative integer.')
  }
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  }
}
```

Use it in `app/api/login/route.js`, both session refresh routes, and both logout routes. The login/session routes pass their existing eight-hour TTL. Logout passes `0` with the same cookie names and attributes. Do not retain independent cookie option object literals.

Run: `node --test tests/staff-session-cookie.test.mjs`
Expected: PASS.

- [x] **Step 3: Write failing retained-PIN and durable-login-limit route tests**

Extend the isolated PostgreSQL fixture with explicit named Admin and Office HR PIN hashes. Import `POST as login`, `GET/POST as regionalPin`, the session-cookie parsers, and `hashLocalPin`. Add separate tests proving:

```javascript
test('shared Regional PIN remains usable while a named Regional Admin exists', async () => {
  process.env.ADMIN_REGIONAL_PIN = '8042'
  await queryPostgres(`
    INSERT INTO system_config (key, value, updated_at)
    VALUES ('regional_pin_access', '{"enabled":true}'::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `)
  const response = await login(sameOriginRequest('/api/login', {
    method: 'POST', body: { loginType: 'pin', pin: '8042' },
  }))
  assert.equal(response.status, 200)
  const cookie = response.cookies.get(getAdminSessionCookieName())
  assert.equal(parseAdminSessionCookieValue(cookie.value).authMethod, 'shared_regional_pin')
})
```

Also prove named Admin and Office HR PIN success, shared-PIN disable without named-account impact, absent shared-PIN configuration failure, distinct network and credential buckets, sanitized invalid-PIN auditing, and non-enumerating invalid-credential responses. Use unique test PINs/keys so durable counters cannot leak between cases.

Run: `npm run test:routes -- --test-name-pattern="shared Regional PIN|named Admin PIN|Office HR PIN|login rate limit|invalid PIN audit"`
Expected: FAIL because `authMethod`, credential throttling, and failure audit behavior do not yet exist.

- [x] **Step 4: Implement retained shared-PIN verification and login security**

Create `lib/login-security.js` with fixed-length timing-safe Regional PIN verification and a keyed credential fingerprint. The fingerprint key is `LOGIN_RATE_LIMIT_SECRET`, falling back only to an already-required staff session secret; production fails closed when no key is available. Export `enforceLoginRateLimits(request, pin)` to consume these durable PostgreSQL buckets before lookup:

```javascript
const LOGIN_LIMITS = [
  { prefix: 'login-network-short', identity: requestIp, limit: 15, windowMs: 10 * 60_000 },
  { prefix: 'login-credential-short', identity: credentialDigest, limit: 5, windowMs: 10 * 60_000 },
  { prefix: 'login-credential-day', identity: credentialDigest, limit: 30, windowMs: 24 * 60 * 60_000 },
]
```

The route must never place the raw PIN in a limiter key, log, response, or audit entry. It checks an explicitly configured and PostgreSQL-enabled shared Regional PIN without querying named-admin count, then checks named Admin and Office HR hashes. Successful sessions set `authMethod: 'shared_regional_pin'` or `authMethod: 'named_pin'`; parsers preserve the field and treat compatible pre-change named sessions as `named_pin`. Invalid credentials return one safe `401` contract. Internal failures return a generic `500` message rather than the raw exception.

Shared Regional, named Admin, and Office HR matches are resolved together. More than one match fails closed with a non-enumerating response and safe collision audit, preventing a shared/named PIN collision from escalating an office-scoped user. Lockout audits are emitted only on the first blocked attempt for a durable bucket/window.

`lib/bootstrap-pin.js` remains the enabled-state authority; no named-account count participates. Remove only hardcoded/default PIN values, not the required configured PIN path. Document optional `LOGIN_RATE_LIMIT_SECRET` in `.env.example` without a value.

Run: `npm run test:routes -- --test-name-pattern="shared Regional PIN|named Admin PIN|Office HR PIN|login rate limit|invalid PIN audit"`
Expected: PASS.

- [x] **Step 5: Write failing Regional PIN control transaction tests**

Add route tests proving Office HR and office-scoped Admin receive `403`, enabling fails with `400` when `ADMIN_REGIONAL_PIN` is absent, and a successful enable/disable writes both `system_config` and `audit_logs`. Inject a controlled audit failure and assert the configuration row rolls back.

Run: `npm run test:routes -- --test-name-pattern="Regional PIN control"`
Expected: FAIL because the current configuration update and audit use separate commits and enabling does not check configuration.

- [x] **Step 6: Make Regional PIN control atomic**

Allow `isRegionalPinEnabled({ client })` and `setRegionalPinEnabled(enabled, { client })` to use a supplied transaction client. Extend `writeAuditLog(db, entry, { client } = {})` to pass the client to `writeLocalAuditLog`. In `app/api/admin/regional-pin/route.js`, require `isRegionalAdminSession`, reject enable when `isRegionalPinConfigured()` is false, and wrap state plus audit in `withPostgresTransaction`:

```javascript
await withPostgresTransaction(async client => {
  await setRegionalPinEnabled(body.enabled, { client })
  await writeAuditLog(null, auditEntry, { client })
})
```

Use “Regional PIN” rather than obsolete “bootstrap PIN” language in summaries and responses.

Migration `0016_initialize_regional_pin_access.sql` inserts an explicit enabled row only when no control row exists, preserving the retained production path while allowing `isRegionalPinEnabled` to fail closed on missing/malformed state. Existing disabled state is never overwritten.

Run: `npm run test:routes -- --test-name-pattern="Regional PIN control"`
Expected: PASS.

- [x] **Step 7: Write failing global-threshold authority and atomicity tests**

Add tests for both `GET` and `POST`: unauthenticated is `401`; Office HR and office-scoped Admin are `403`; Regional Admin succeeds. For updates, assert unknown fields, numeric strings, `NaN`/infinite values, and any out-of-range field reject the entire payload without a partial write. Assert a valid update records prior/new values. Force audit failure and prove the `system_config` update rolls back. Cover reset with the same atomic rule.

Run: `npm run test:routes -- --test-name-pattern="global thresholds"`
Expected: FAIL because GET currently accepts HR/office Admin, invalid fields are silently skipped, and mutation/audit are separate commits.

- [x] **Step 8: Restrict and atomically persist global thresholds**

In `lib/thresholds.js`, remove the Firestore document fallback and require PostgreSQL for reads/writes. Export `validateThresholdUpdate(values)`, which builds an allowlist from `THRESHOLD_META` and rejects the complete request on the first unknown, non-number, non-finite, or out-of-range value. Add transaction-client options to threshold reads/writes and an explicit `invalidateThresholdCache()` called only after transaction commit.

In `app/api/admin/thresholds/route.js`, resolve only an Admin session, require `isRegionalAdminSession` for GET and POST, then use `withPostgresTransaction` for the configuration mutation and `writeAuditLog(..., { client })`. Read prior values through the same client, record only changed numeric fields, commit, and invalidate the cache. Reset deletes the PostgreSQL row and writes its audit in the same transaction.

Acquire a transaction-level PostgreSQL advisory lock before the prior-value read so concurrent updates/resets produce a truthful audit chain even when the configuration row is absent. Persist only supplied fields so unrelated customized thresholds are not reset to defaults.

Run: `npm run test:routes -- --test-name-pattern="global thresholds"`
Expected: PASS.

- [x] **Step 9: Run focused security regression and source-contract checks**

Run:

```powershell
node --test tests/staff-session-cookie.test.mjs
npm run test:routes -- --test-name-pattern="shared Regional PIN|named Admin PIN|Office HR PIN|login rate limit|invalid PIN audit|Regional PIN control|global thresholds"
rg -n "bootstrap PIN|db\.doc\(THRESHOLD_DOC\)|response\.cookies\.set\([^\n]*\{" app/api lib
git diff --check
```

Expected: tests PASS; searches return no obsolete bootstrap wording, Firestore threshold persistence, or independent staff-cookie option blocks; diff check exits 0.

- [x] **Step 10: Run final Phase 1 security gates and commit**

Run:

```powershell
npm run test:routes
npm test
npm run build:hosting
Test-Path .next/BUILD_ID
git diff --check
```

Expected: route suite and full suite PASS, hosting build exits 0, `.next/BUILD_ID` exists, and diff check exits 0.

```powershell
git add .env.example db/migrations/0016_initialize_regional_pin_access.sql lib/staff-session-cookie.js lib/login-security.js lib/bootstrap-pin.js lib/admin-auth.js lib/hr-auth.js lib/audit-log.js lib/thresholds.js lib/postgres/audit-store.js lib/postgres/user-store.js lib/postgres/rate-limit-store.js lib/rate-limit.js app/api/login/route.js app/api/admin/regional-pin app/api/admin/thresholds app/api/admin/session app/api/admin/logout app/api/hr/session app/api/hr/logout tests/postgres/identity.routes.test.mjs tests/staff-session-cookie.test.mjs docs/superpowers/plans/2026-08-20-postgres-route-harness-and-identity-hardening.md
git commit -m "fix(security): harden retained PIN access"
```

## Phase Stop Gate

Do not begin attendance/report refactoring unless registration, pending visibility, lifecycle, re-enrollment, kiosk identity, deletion preservation, Office HR field scope, durable rate limiting, session/threshold authority, route isolation, `npm test`, and `git diff --check` all pass. Stop if any test process connects to a non-loopback host or a database without the `faceid_rc_` prefix.

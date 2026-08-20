# Canonical Attendance, Corrections, DTR, and Cron Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one daily-attendance derivation authoritative across correction, display, export, DTR, and rebuild cron while enforcing server-derived person and office scope.

**Architecture:** Raw attendance and correction events remain authoritative. A new daily-record service loads canonical person/office/policy context and calls `deriveDailyAttendanceRecord`; `attendance_daily` is only a materialized projection. Routes consume the service rather than maintaining private fallback formulas, and correction writes plus projection refresh share one transaction boundary where required.

**Tech Stack:** Next.js Route Handlers, PostgreSQL 18, Node.js 22 tests, existing DTR/Excel utilities.

---

## File Structure

- Create `lib/attendance/daily-record-service.js`: one server-side load/derive/upsert interface.
- Create `lib/cron-auth.js`: fail-closed cron authorization.
- Create `tests/postgres/attendance.routes.test.mjs`: correction, daily/table/monthly/me/public route proofs.
- Create `tests/postgres/dtr.routes.test.mjs`: DTR and workbook parity proofs.
- Create `tests/postgres/cron.routes.test.mjs`: cron secret and rebuild proofs.
- Modify `lib/attendance-daily-store.js`: projection reads return null/miss explicitly.
- Modify `lib/postgres/attendance-store.js`: accept transaction clients for projection writes.
- Modify `lib/postgres/report-store.js`: query raw logs by canonical person ID.
- Modify `lib/postgres/person-store.js`, `lib/office-directory.js`, and `lib/workforce-policy.js`: accept the same optional transaction client for canonical context reads.
- Modify `app/api/admin/attendance/route.js`: personId-based correction and audit.
- Modify `app/api/admin/attendance/[attendanceId]/route.js`: shared refresh service.
- Modify `app/api/attendance/{daily,table,monthly,me,public,recent,dtr}/route.js`: canonical fallback.
- Modify `lib/dtr-server.js`, `lib/dtr.js`, `lib/dtr-excel.js`, `lib/raw-attendance-workbook.js`: consume canonical records.
- Modify `app/api/hr/dtr/{route,workbook/route}.js`: canonical server records.
- Modify `app/api/cron/rebuild-daily-summary/route.js`: shared authorization and derivation service.
- Modify `components/admin/AttendanceOverrideModal.jsx`: send `personId`, date, correction, and reason only.

### Task 1: Characterize the canonical daily contract

**Files:**
- Modify: `tests/run-tests.mjs`
- Modify: `lib/daily-attendance.js`

- [ ] **Step 1: Add missing pure regression cases**

Add table-driven cases for event ordering, duplicate scans, incomplete morning/afternoon pairs, approved correction precedence, leave, holiday, rest day, WFH, field duty, flexitime, timezone boundary, null Employee ID, and exact rounding. Each case calls only `deriveDailyAttendanceRecord` and asserts the full normalized output fields used by routes/DTR.

- [ ] **Step 2: Run the pure suite**

Run: `npm test`
Expected: new cases reveal any current contract gaps; existing cases remain green.

- [ ] **Step 3: Repair only documented derivation gaps**

Keep this signature stable:

```javascript
deriveDailyAttendanceRecord({
  logs,
  person,
  office,
  targetDateKey,
  policyOverride,
})
```

Normalize output to always include `personId`, optional `employeeId`, organization fields, four scan slots, worked/late/undertime/overtime minutes, status flags, policy snapshot, and derivation version. Do not add route-specific branches.

- [ ] **Step 4: Re-run and commit**

Run: `npm test`
Expected: PASS.

```powershell
git add lib/daily-attendance.js tests/run-tests.mjs
git commit -m "test: lock canonical attendance derivation"
```

### Task 2: Shared daily-record service

**Files:**
- Create: `lib/attendance/daily-record-service.js`
- Modify: `lib/postgres/attendance-store.js`
- Modify: `lib/postgres/report-store.js`
- Test: `tests/postgres/attendance.routes.test.mjs`

- [ ] **Step 1: Write failing service tests**

Seed raw events and a stale `attendance_daily` row. Assert `derivePersonDailyRecord({ personId, dateKey })` ignores stale projection data, loads person/office/policy, derives from raw events, and returns the same object that `rebuildPersonDailyRecord` upserts. Assert missing person/office produces typed not-found/configuration errors.

- [ ] **Step 2: Implement the service boundary**

```javascript
export async function derivePersonDailyRecord({ personId, dateKey, client = null }) {
  const person = await getLocalPersonById(personId, { client })
  if (!person) throw Object.assign(new Error('Employee not found.'), { code: 'person_not_found', status: 404 })
  const office = await getOfficeRecord(null, person.officeId, { client })
  if (!office) throw Object.assign(new Error('Office configuration unavailable.'), { code: 'office_not_found', status: 409 })
  const [logs, policyOverride] = await Promise.all([
    listLocalAttendanceLogs({ personId, dateKey, direction: 'asc', limit: 500 }, { client }),
    resolveWorkforcePolicyForDate({ person, office, dateKey, client }),
  ])
  return deriveDailyAttendanceRecord({ logs, person, office, targetDateKey: dateKey, policyOverride })
}

export async function rebuildPersonDailyRecord(input) {
  const record = await derivePersonDailyRecord(input)
  await upsertLocalDailyAttendanceRecord(record, { client: input.client || null })
  return record
}
```

- [ ] **Step 3: Add optional client parameters to stores**

Use `const executor = client || getPostgresPool()` in attendance, person, office, report, and workforce-policy read/write functions so correction transactions can derive and upsert on the same checked-out client.

- [ ] **Step 4: Run service tests and commit**

Run: `npm run test:routes -- --test-name-pattern="daily-record service"`
Expected: PASS.

```powershell
git add lib/attendance/daily-record-service.js lib/postgres/attendance-store.js lib/postgres/report-store.js lib/postgres/person-store.js lib/office-directory.js lib/workforce-policy.js tests/postgres/attendance.routes.test.mjs
git commit -m "refactor: centralize daily attendance projection"
```

### Task 3: Server-derived manual correction

**Files:**
- Modify: `app/api/admin/attendance/route.js`
- Modify: `components/admin/AttendanceOverrideModal.jsx`
- Modify: `lib/postgres/report-store.js`
- Test: `tests/postgres/attendance.routes.test.mjs`

- [ ] **Step 1: Write failing correction route tests**

Assert:

- request accepts `{ personId, dateKey, action, timestamp, reason }` without Employee ID;
- server ignores forged name, Employee ID, office, and organization fields;
- Regional Admin may correct allowed persons;
- Office HR may correct only a person in its assigned office;
- invalid attendance date/timestamp mismatch is rejected;
- correction and immutable audit row are committed together;
- the returned record equals a fresh call to `derivePersonDailyRecord`.

- [ ] **Step 2: Replace the client payload**

`AttendanceOverrideModal` sends:

```javascript
{
  personId: selectedPerson.id,
  dateKey,
  action,
  timestamp: new Date(localDateTime).toISOString(),
  reason: reason.trim(),
}
```

- [ ] **Step 3: Implement a transactional correction command**

Inside `withPostgresTransaction`, load the person `FOR UPDATE`, validate `sessionAllowsOffice(session, person.officeId)`, verify `dateKey === formatAttendanceDateKey(timestamp)` using the existing `ATTENDANCE_TIME_ZONE`, insert the manual correction using canonical person/office/unit fields, insert audit data, then call `rebuildPersonDailyRecord({ personId, dateKey, client })`.

- [ ] **Step 4: Run correction tests and commit**

Run: `npm run test:routes -- --test-name-pattern="attendance correction"`
Expected: PASS.

```powershell
git add app/api/admin/attendance/route.js components/admin/AttendanceOverrideModal.jsx lib/postgres/report-store.js tests/postgres/attendance.routes.test.mjs
git commit -m "fix: derive attendance correction identity"
```

### Task 4: Route every display fallback through the service

**Files:**
- Modify: `app/api/attendance/daily/route.js`
- Modify: `app/api/attendance/table/route.js`
- Modify: `app/api/attendance/monthly/route.js`
- Modify: `app/api/attendance/me/route.js`
- Modify: `app/api/attendance/public/route.js`
- Modify: `app/api/attendance/recent/route.js`
- Modify: `lib/attendance-daily-store.js`
- Test: `tests/postgres/attendance.routes.test.mjs`

- [ ] **Step 1: Add route parity tests**

For one fixture day, delete `attendance_daily`, call every route, and assert its normalized daily record equals `derivePersonDailyRecord`. Repeat with a deliberately stale projection and verify routes either rebuild it or use fresh derivation according to the explicit cache policy. Verify null Employee ID remains valid.

- [ ] **Step 2: Make projection misses explicit**

`getEmployeeDailyAttendanceRecord` and list helpers return `null`/missing keys rather than synthesizing business fields. They may deserialize stored canonical records but may not calculate attendance.

- [ ] **Step 3: Replace private fallbacks**

Every route uses one of:

```javascript
const record = storedRecord ?? await derivePersonDailyRecord({ personId, dateKey })
```

or, when freshness is required:

```javascript
const record = await rebuildPersonDailyRecord({ personId, dateKey })
```

Delete local scan-slot/status calculations after parity tests pass.

- [ ] **Step 4: Run parity tests and commit**

Run: `npm run test:routes -- --test-name-pattern="daily route parity"`
Expected: PASS for daily, table, monthly, me, public, and recent routes.

```powershell
git add app/api/attendance/daily/route.js app/api/attendance/table/route.js app/api/attendance/monthly/route.js app/api/attendance/me/route.js app/api/attendance/public/route.js app/api/attendance/recent/route.js lib/attendance-daily-store.js tests/postgres/attendance.routes.test.mjs
git commit -m "fix: unify attendance route fallbacks"
```

### Task 5: DTR and export parity

**Files:**
- Modify: `lib/dtr-server.js`
- Modify: `lib/dtr.js`
- Modify: `lib/dtr-excel.js`
- Modify: `lib/raw-attendance-workbook.js`
- Modify: `app/api/attendance/dtr/route.js`
- Modify: `app/api/hr/dtr/route.js`
- Modify: `app/api/hr/dtr/workbook/route.js`
- Test: `tests/postgres/dtr.routes.test.mjs`

- [ ] **Step 1: Write failing DTR/output tests**

Seed a month containing normal, incomplete, corrected, holiday, leave, WFH, and field-duty days. Remove projections. Assert JSON DTR, employee DTR, HR DTR, generated workbook cells, and raw export use the same canonical scan slots/minutes/status. Assert Office HR cannot request another office/person.

- [ ] **Step 2: Make DTR server accept canonical records**

`buildLocalDtr` loads the person once, resolves the requested date range, obtains canonical records through `derivePersonDailyRecord`/stored canonical projections, and passes those records into pure formatting. `lib/dtr.js` no longer derives attendance from raw logs.

- [ ] **Step 3: Keep workbook formatting presentation-only**

`dtr-excel.js` and `raw-attendance-workbook.js` map canonical fields to cells. They do not recalculate worked time, lateness, or scan selection.

- [ ] **Step 4: Run DTR tests and commit**

Run: `npm run test:routes -- --test-name-pattern="DTR|workbook|export"`
Expected: PASS and workbook unzip assertions match canonical values.

```powershell
git add lib/dtr-server.js lib/dtr.js lib/dtr-excel.js lib/raw-attendance-workbook.js app/api/attendance/dtr/route.js app/api/hr/dtr/route.js app/api/hr/dtr/workbook/route.js tests/postgres/dtr.routes.test.mjs
git commit -m "fix: make DTR consume canonical attendance"
```

### Task 6: Fail-closed cron authorization and daily rebuild

**Files:**
- Create: `lib/cron-auth.js`
- Modify: `app/api/cron/rebuild-daily-summary/route.js`
- Test: `tests/postgres/cron.routes.test.mjs`

- [ ] **Step 1: Write failing cron tests**

Assert missing `CRON_SECRET` returns 503, missing/invalid bearer returns 401, exact bearer succeeds, a rebuild derives through the shared service, and a work failure returns 500 with a safe code but no SQL/path details.

- [ ] **Step 2: Implement shared authorization**

```javascript
import crypto from 'node:crypto'

export function authorizeCron(request) {
  const secret = String(process.env.CRON_SECRET || '')
  if (!secret) return { ok: false, status: 503, code: 'cron_not_configured' }
  const supplied = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const expectedBuffer = Buffer.from(secret)
  const suppliedBuffer = Buffer.from(supplied)
  const equal = expectedBuffer.length === suppliedBuffer.length && crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)
  return equal ? { ok: true } : { ok: false, status: 401, code: 'cron_unauthorized' }
}
```

- [ ] **Step 3: Use canonical rebuilds only**

The cron selects canonical `{ personId, dateKey }` targets, calls `rebuildPersonDailyRecord` for each with bounded concurrency, and returns counts for rebuilt/failed rows. It must not contain a second attendance formula.

- [ ] **Step 4: Run cron and full Phase 2 gates**

Run:

```powershell
npm run test:routes -- --test-name-pattern="cron|daily|DTR|correction"
npm test
git diff --check
```

Expected: PASS.

- [ ] **Step 5: Commit cron hardening**

```powershell
git add lib/cron-auth.js app/api/cron/rebuild-daily-summary/route.js tests/postgres/cron.routes.test.mjs
git commit -m "fix: harden daily rebuild cron"
```

## Phase Stop Gate

Do not start Firebase removal until every attendance screen/export/DTR route passes missing/stale-projection parity tests and corrections prove server-derived person/office scope. `rg -n "deriveDailyAttendanceRecord" app lib` must show the pure function owned by the daily-record service and approved low-level write paths only; route-level private formulas are blockers.

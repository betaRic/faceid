# Maintenance Evidence v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pilot biometric benchmark with an honest, read-only maintenance report covering telemetry integrity, 1:1 verification, capture, performance, employee coverage, runtime health, and daily-summary freshness.

**Architecture:** Keep the authenticated `/api/admin/biometric-benchmark` URL, but return a versioned Maintenance Evidence v2 contract. Split pure event classification/reporting from regional runtime checks, repair scan-event attribution at the persistence boundary, scope SQL before limits, and render one compact maintenance panel. No schema migration, threshold change, biometric update, cron invocation, or production write is allowed.

**Tech Stack:** Next.js 16.3 App Router Route Handlers, React 18, PostgreSQL through `pg`, Vitest/React Testing Library, Node test runner, Tailwind CSS.

---

## File Structure

- Create `lib/maintenance/event-evidence.js`: normalize scan-event identity, classify outcomes, calculate explicit-denominator metrics, statuses, and actions.
- Create `lib/maintenance/system-evidence.js`: regional-only read-only database, migration, storage, runtime, model-file, build, and daily-summary checks.
- Delete `lib/biometric-benchmark.js`: remove obsolete pilot report after all imports move to the maintenance module.
- Modify `lib/scan-events.js`: persist resolved identity from match diagnostics for future failed 1:1 events.
- Modify `app/api/admin/biometric-benchmark/route.js`: authenticated/scoped event collection, total count, truncation, regional checks, v2 response.
- Modify `app/api/admin/reenrollment-candidates/route.js`: separate approval queue from true biometric follow-up and count attributed claimed mismatches.
- Modify `app/api/health/route.js`: label public output as shallow process liveness.
- Delete `app/api/system/status/route.js`: remove redundant hidden status endpoint after replacement coverage exists.
- Create `components/admin/MaintenanceEvidencePanel.jsx`: compact, responsive, actionable maintenance UI.
- Delete `components/admin/BiometricBenchmarkPanel.jsx`: remove obsolete pilot UI.
- Modify `components/admin/DashboardPanel.jsx`: render the new panel and consume separated follow-up results.
- Modify `tests/run-tests.mjs`: pure event-report and attribution regression tests.
- Modify `tests/postgres/identity.routes.test.mjs`: scoped route, no-write, runtime, and follow-up contract tests.
- Modify `tests/postgres/test-database.test.mjs`: update route-loader coverage after hidden route deletion.
- Modify `tests/ui/admin-operations.test.jsx`: maintenance hierarchy, stale refresh, regional visibility, and removed-metric tests.

### Task 1: Build Pure Event Evidence Model

**Files:**
- Create: `lib/maintenance/event-evidence.js`
- Modify: `tests/run-tests.mjs`

- [ ] **Step 1: Write failing taxonomy and report-contract tests**

Add imports and tests proving mismatch classification, identity fallback, explicit denominator, truncation, unknown telemetry, match modes, and unavailable calibration:

```javascript
const maintenanceEvidenceModule = await importLocalModule('../lib/maintenance/event-evidence.js')
const { buildMaintenanceEvidenceReport, classifyScanEvent, normalizeScanEventIdentity } = maintenanceEvidenceModule

await run('maintenance evidence treats claimed identity mismatch as biometric failure', () => {
  const event = {
    status: 'blocked',
    decisionCode: 'blocked_claimed_employee_mismatch',
    employeeId: '1234',
    matchDebug: { resolvedPersonId: 'person-1', resolvedEmployeeId: 'EMP-1', bestDistance: 0.82, threshold: 0.8 },
  }
  assert.equal(classifyScanEvent(event), 'claimed_identity_mismatch')
  assert.deepEqual(normalizeScanEventIdentity(event), { personId: 'person-1', employeeId: 'EMP-1', officeId: '' })
})

await run('maintenance evidence cannot report stable verification from high mismatch evidence', () => {
  const events = [
    ...Array.from({ length: 20 }, () => ({ status: 'accepted', decisionCode: 'accepted_onsite', personId: 'p1', employeeId: 'E1', matchDebug: { bestDistance: 0.61, threshold: 0.8 } })),
    ...Array.from({ length: 10 }, () => ({ status: 'blocked', decisionCode: 'blocked_claimed_employee_mismatch', matchDebug: { resolvedPersonId: 'p1', resolvedEmployeeId: 'E1', bestDistance: 0.84, threshold: 0.8 } })),
  ]
  const report = buildMaintenanceEvidenceReport(events, { totalWindowEvents: 30, currentEmployees: [{ personId: 'p1', employeeId: 'E1' }] })
  assert.equal(report.version, 2)
  assert.equal(report.verification1to1.denominator, 30)
  assert.equal(report.verification1to1.claimedMismatchCount, 10)
  assert.equal(report.statuses.verification1to1.status, 'failing')
  assert.equal(report.calibration.status, 'unavailable')
  assert.equal(report.calibration.thresholdRecommendation, null)
})

await run('maintenance evidence marks truncated and unknown evidence unsafe', () => {
  const report = buildMaintenanceEvidenceReport([{ status: 'blocked', decisionCode: 'legacy_unknown' }], { totalWindowEvents: 5, currentEmployees: [] })
  assert.equal(report.evidence.truncated, true)
  assert.equal(report.evidence.unknownOutcomeCount, 1)
  assert.notEqual(report.statuses.telemetry.status, 'sufficient')
  assert.notEqual(report.statuses.verification1to1.status, 'stable')
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node tests/run-tests.mjs`

Expected: FAIL because `lib/maintenance/event-evidence.js` does not exist.

- [ ] **Step 3: Implement normalization, exhaustive taxonomy, metrics, and statuses**

Create constants and exported functions with one classification result per event:

```javascript
const CATEGORY_ORDER = Object.freeze([
  'attendance_written',
  'identity_resolved_operational_block',
  'claimed_identity_mismatch',
  'other_biometric_failure',
  'capture_quality_failure',
  'liveness_observation_block',
  'credential_failure',
  'location_or_policy_block',
  'system_or_rate_limit_failure',
  'unknown',
])

const DECISION_CATEGORY = new Map([
  ['blocked_claimed_employee_mismatch', 'claimed_identity_mismatch'],
  ['blocked_no_reliable_match', 'other_biometric_failure'],
  ['blocked_ambiguous_match', 'other_biometric_failure'],
  ['blocked_unstable_descriptor_burst', 'other_biometric_failure'],
  ['blocked_multiple_faces', 'other_biometric_failure'],
  ['blocked_no_biometrics', 'other_biometric_failure'],
  ['blocked_missing_scan_frames', 'capture_quality_failure'],
  ['blocked_invalid_face_size', 'capture_quality_failure'],
  ['blocked_face_too_small', 'capture_quality_failure'],
  ['blocked_face_too_close', 'capture_quality_failure'],
  ['blocked_face_off_center', 'capture_quality_failure'],
  ['blocked_pose', 'capture_quality_failure'],
  ['blocked_liveness', 'liveness_observation_block'],
  ['blocked_antispoof', 'liveness_observation_block'],
  ['blocked_missing_liveness', 'liveness_observation_block'],
  ['blocked_missing_access_code', 'credential_failure'],
  ['blocked_invalid_access_code', 'credential_failure'],
  ['blocked_unknown_access_code', 'credential_failure'],
  ['blocked_missing_gps', 'location_or_policy_block'],
  ['blocked_geofence', 'identity_resolved_operational_block'],
  ['blocked_recent_duplicate', 'identity_resolved_operational_block'],
  ['blocked_day_complete', 'identity_resolved_operational_block'],
  ['blocked_pending_approval', 'identity_resolved_operational_block'],
  ['blocked_inactive', 'identity_resolved_operational_block'],
  ['blocked_missing_office_config', 'identity_resolved_operational_block'],
  ['blocked_workforce_policy_unavailable', 'identity_resolved_operational_block'],
  ['blocked_rate_limited', 'system_or_rate_limit_failure'],
])

export function normalizeScanEventIdentity(event = {}) {
  const debug = event.matchDebug || {}
  return {
    personId: String(event.personId || debug.resolvedPersonId || '').trim(),
    employeeId: String(debug.resolvedEmployeeId || event.employeeId || '').trim(),
    officeId: String(event.officeId || debug.officeId || '').trim(),
  }
}

export function classifyScanEvent(event = {}) {
  if (event.status === 'accepted') return 'attendance_written'
  return DECISION_CATEGORY.get(String(event.decisionCode || '')) || 'unknown'
}
```

Implement `buildMaintenanceEvidenceReport(events, options)` with:

- `version: 2`;
- exact `totalWindowEvents`, `loadedEvents`, `coverageRate`, `truncated`, and completeness rates;
- category counts whose sum equals loaded events;
- verification denominator limited to attendance written, identity-resolved operational blocks, claimed mismatch, and other biometric failure;
- distance percentiles for verified and mismatch events;
- match-mode counts with denominators;
- repeated attributed mismatch candidates grouped by canonical person ID;
- active-employee representation and coverage;
- independent telemetry, verification, capture, performance, population, and calibration statuses;
- action items generated only for non-healthy states;
- `calibration: { status: 'unavailable', reason: 'Labeled genuine and impostor evidence is not available.', thresholdRecommendation: null }`.

Use a named frozen `MAINTENANCE_EVIDENCE_POLICY` for minimum coverage and warning/failure limits. Do not reuse attendance match thresholds as report-health thresholds.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node tests/run-tests.mjs`

Expected: all existing and new pure tests PASS.

- [ ] **Step 5: Commit isolated task**

```powershell
git commit --only -m "feat: add maintenance evidence model" -- lib/maintenance/event-evidence.js tests/run-tests.mjs
```

### Task 2: Repair Future Scan-Event Attribution

**Files:**
- Modify: `lib/maintenance/event-evidence.js`
- Modify: `lib/scan-events.js`
- Modify: `tests/run-tests.mjs`

- [ ] **Step 1: Write failing persistence-boundary regression test**

Extract and export a pure helper so the persistence choice is testable without PostgreSQL:

```javascript
const { resolvePersistedScanIdentity } = maintenanceEvidenceModule

await run('scan telemetry persists resolved 1:1 identity before claimed access code', () => {
  assert.deepEqual(resolvePersistedScanIdentity({
    entry: { employeeId: '1234' },
    debug: { resolvedPersonId: 'person-1', resolvedEmployeeId: 'EMP-1', officeId: 'office-1' },
  }), {
    personId: 'person-1',
    employeeId: 'EMP-1',
    officeId: 'office-1',
  })
})
```

- [ ] **Step 2: Run test and verify RED**

Run: `node tests/run-tests.mjs`

Expected: FAIL because `resolveScanEventIdentity` is not exported.

- [ ] **Step 3: Implement minimal canonical identity selection**

```javascript
export function resolvePersistedScanIdentity({ entry = {}, person = null, debug = null, requestMeta = null } = {}) {
  const matchDebug = debug && typeof debug === 'object' ? debug : {}
  return {
    personId: String(person?.id || matchDebug.resolvedPersonId || requestMeta?.personId || entry?.personId || '').slice(0, 128),
    employeeId: String(person?.employeeId || matchDebug.resolvedEmployeeId || entry?.employeeId || '').slice(0, 64),
    officeId: String(person?.officeId || matchDebug.officeId || entry?.officeId || requestMeta?.officeId || '').slice(0, 64),
  }
}
```

Define this pure helper in `lib/maintenance/event-evidence.js`. Import and call it once inside `writeScanEvent`, then use its fields for persisted columns. Preserve claimed access code only inside restricted match diagnostics.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node tests/run-tests.mjs`

Expected: PASS.

- [ ] **Step 5: Commit isolated task**

```powershell
git commit --only -m "fix: attribute failed one-to-one scans" -- lib/maintenance/event-evidence.js lib/scan-events.js tests/run-tests.mjs
```

### Task 3: Add Read-Only Regional System Evidence

**Files:**
- Create: `lib/maintenance/system-evidence.js`
- Modify: `tests/postgres/identity.routes.test.mjs`

- [ ] **Step 1: Write failing read-only system-evidence tests**

Import `buildSystemEvidence` through the existing route loader, seed attendance and daily rows, call the helper with the test database query function and injected filesystem dependencies, and assert:

```javascript
const system = await buildSystemEvidence({ query: testQuery, now: fixedNow, env: safeEnv, cwd: projectRoot, access: injectedAccess, readFile, readdir })
assert.equal(system.database.connected, true)
assert.equal(Number.isFinite(system.database.latencyMs), true)
assert.equal(Array.isArray(system.migrations.pending), true)
assert.equal(typeof system.storage.configured, 'boolean')
assert.equal(typeof system.storage.directoryExists, 'boolean')
assert.equal('root' in system.storage, false)
assert.equal(JSON.stringify(system).includes('databaseUrl'), false)
assert.equal(system.dailySummary.dateKey, expectedYesterday)
assert.equal(system.dailySummary.rawPersonCount, system.dailySummary.summaryPersonCount)
```

Take before/after counts for `attendance`, `attendance_daily`, `persons`, and `scan_events`; assert they are unchanged by report loading.

- [ ] **Step 2: Run isolated route tests and verify RED**

Run: `npm run test:routes`

Expected: FAIL because `lib/maintenance/system-evidence.js` does not exist.

- [ ] **Step 3: Implement system evidence with dependency injection**

Create `buildSystemEvidence({ query, now, env, cwd, access, readFile, readdir })`. Required behavior:

```javascript
const startedAt = performance.now()
const versionResult = await query('SHOW server_version')
const latencyMs = Math.max(0, Math.round(performance.now() - startedAt))
const appliedResult = await query('SELECT version FROM schema_migrations ORDER BY version')
const rawResult = await query('SELECT count(DISTINCT person_id)::integer AS count FROM attendance WHERE date_key = $1 AND person_id IS NOT NULL', [dateKey])
const dailyResult = await query('SELECT count(DISTINCT person_id)::integer AS count, max(updated_at) AS newest FROM attendance_daily WHERE date_key = $1', [dateKey])
```

Compare `db/migrations/*.sql` names with applied versions. Use `fs/promises.access` with `constants.R_OK` and `constants.W_OK`; never create or write a probe file. Check required Human JSON/bin pairs and `getMissingOpenVinoRetailModelFiles()`. Return only booleans, counts, basenames, safe version strings, build ID, uptime, and status explanations.

Optional check failures return `{ status: 'unknown', message }` for that check; they do not erase biometric evidence.

- [ ] **Step 4: Run isolated route tests and verify GREEN**

Run: `npm run test:routes`

Expected: PASS with unchanged row counts.

- [ ] **Step 5: Commit isolated task**

```powershell
git commit --only -m "feat: add read-only system evidence" -- lib/maintenance/system-evidence.js tests/postgres/identity.routes.test.mjs
```

### Task 4: Replace Benchmark Route Contract and Fix SQL Scope

**Files:**
- Modify: `app/api/admin/biometric-benchmark/route.js`
- Delete: `lib/biometric-benchmark.js`
- Modify: `tests/postgres/identity.routes.test.mjs`
- Modify: `tests/run-tests.mjs`

- [ ] **Step 1: Write failing office-scope, truncation, and response tests**

Seed more recent regional rows than the requested detail cap, place office-scoped rows behind them by timestamp, authenticate as office admin, then assert:

```javascript
assert.equal(payload.version, 2)
assert.equal(payload.scope.officeId, officeId)
assert.equal(payload.evidence.totalWindowEvents, officeEventCount)
assert.equal(payload.evidence.loadedEvents, expectedLoadedOfficeCount)
assert.equal(payload.system, null)
assert.equal(payload.breakdowns.categories.reduce((sum, item) => sum + item.count, 0), payload.evidence.loadedEvents)
```

Add a regional capped-window case asserting `truncated === true` and telemetry/verification status cannot be healthy.

- [ ] **Step 2: Run route tests and verify RED**

Run: `npm run test:routes`

Expected: FAIL because current SQL filters office rows after `LIMIT` and returns pilot contract.

- [ ] **Step 3: Implement scoped explicit queries and v2 composition**

Build SQL parameters so office scope appears in both count and detail queries:

```javascript
const officeId = resolvedSession.scope === 'office' ? String(resolvedSession.officeId || '') : ''
const whereSql = `timestamp_ms >= $1 AND timestamp_ms < $2 AND ($3 = '' OR office_id = $3 OR match_debug->>'officeId' = $3)`
const params = [window.startMs, window.endMs, officeId]

const countPromise = queryPostgres(`SELECT count(*)::integer AS count FROM scan_events WHERE ${whereSql}`, params)
const eventPromise = queryPostgres(`
  SELECT status, decision_code, timestamp_ms, employee_id, person_id, office_id,
         attendance_mode, risk_flags, capture_context, scan_diagnostics,
         performance, match_debug, data
  FROM scan_events
  WHERE ${whereSql}
  ORDER BY timestamp_ms DESC
  LIMIT $4
`, [...params, detailLimit])
```

Load only `id`, `employee_id`, and `office_id` for active approved employees. Normalize rows, call `buildMaintenanceEvidenceReport`, and attach `buildSystemEvidence` only for regional scope. Remove client-controlled `limit`; use one server constant so callers cannot manufacture a pass by changing sample size.

Delete obsolete pilot report and its imports after all tests move to the new module.

- [ ] **Step 4: Run pure and route tests and verify GREEN**

Run: `node tests/run-tests.mjs`

Expected: PASS.

Run: `npm run test:routes`

Expected: PASS.

- [ ] **Step 5: Commit isolated task**

```powershell
git commit --only -m "feat: serve maintenance evidence v2" -- app/api/admin/biometric-benchmark/route.js lib/biometric-benchmark.js lib/maintenance/event-evidence.js lib/maintenance/system-evidence.js tests/run-tests.mjs tests/postgres/identity.routes.test.mjs
```

### Task 5: Separate Approval Queue from Biometric Follow-Up

**Files:**
- Modify: `app/api/admin/reenrollment-candidates/route.js`
- Modify: `components/admin/DashboardPanel.jsx`
- Modify: `tests/postgres/identity.routes.test.mjs`

- [ ] **Step 1: Write failing route tests**

Seed one pending employee with valid samples, one active employee with no samples, and one active employee with repeated `blocked_claimed_employee_mismatch` events containing resolved IDs. Assert:

```javascript
assert.deepEqual(payload.pendingApproval.map(item => item.personId), [pendingPersonId])
assert.deepEqual(new Set(payload.biometricFollowUp.map(item => item.personId)), new Set([missingSamplesPersonId, mismatchPersonId]))
assert.equal(payload.biometricFollowUp.find(item => item.personId === mismatchPersonId).claimedMismatchCount, 3)
assert.equal(payload.biometricFollowUp.some(item => item.personId === pendingPersonId), false)
```

- [ ] **Step 2: Run route tests and verify RED**

Run: `npm run test:routes`

Expected: FAIL because current route mixes pending approval into reenrollment candidates and ignores claimed mismatch.

- [ ] **Step 3: Implement separate scoped queries**

Return `{ pendingApproval, biometricFollowUp }`. Pending approval query selects lifecycle-pending people. Biometric follow-up query selects active approved people with zero samples or attributed mismatch counts from either top-level identity or `match_debug.resolvedPersonId`/`resolvedEmployeeId`. Require at least two attributed mismatches before listing a sampled active person. Label reasons `missing_biometrics` or `repeated_claimed_mismatch`; never label either as mandatory reenrollment.

Update dashboard card to consume `biometricFollowUp`, display `claimedMismatchCount`, and direct review to Employees. Approval stays in the employee lifecycle workflow.

- [ ] **Step 4: Run route tests and verify GREEN**

Run: `npm run test:routes`

Expected: PASS.

- [ ] **Step 5: Commit isolated task**

```powershell
git commit --only -m "fix: separate biometric follow-up" -- app/api/admin/reenrollment-candidates/route.js components/admin/DashboardPanel.jsx tests/postgres/identity.routes.test.mjs
```

### Task 6: Build Compact Maintenance UI

**Files:**
- Create: `components/admin/MaintenanceEvidencePanel.jsx`
- Delete: `components/admin/BiometricBenchmarkPanel.jsx`
- Modify: `components/admin/DashboardPanel.jsx`
- Modify: `tests/ui/admin-operations.test.jsx`

- [ ] **Step 1: Write failing UI contract tests**

Mock a v2 payload and assert:

```javascript
render(<MaintenanceEvidencePanel />)
expect(await screen.findByRole('heading', { name: 'System maintenance' })).toBeVisible()
expect(screen.getByText('1:1 verification')).toBeVisible()
expect(screen.getByRole('heading', { name: 'Action required' })).toBeVisible()
expect(screen.getByText(/threshold calibration unavailable/i)).toBeVisible()
expect(screen.queryByText('WFH accepted')).not.toBeInTheDocument()
expect(screen.queryByText('Operational gate passed')).not.toBeInTheDocument()
expect(screen.queryByText('2-frame fallback')).not.toBeInTheDocument()
expect(screen.getByRole('button', { name: 'Export JSON' })).toBeVisible()
```

Add a refresh-failure test: first fetch succeeds, manual refresh fails, previous metric remains visible, and stale warning appears. Add office payload test with `system: null` and no regional runtime section.

- [ ] **Step 2: Run UI tests and verify RED**

Run: `npm run test:ui -- tests/ui/admin-operations.test.jsx`

Expected: FAIL because new panel does not exist.

- [ ] **Step 3: Implement Civic Operational Minimal panel**

Use existing `Button`, `ErrorState`, `LoadingState`, `Status`, and `Surface`. Render four compact status cards and only non-healthy actions before disclosures. Use native `<details>` for:

- 1:1 verification;
- event outcomes;
- telemetry completeness;
- capture and devices;
- performance;
- employee coverage;
- regional runtime and daily summaries.

Use stacked `dl` records on mobile and grids only from `md`. No fixed-width tables or decorative charts. Use `AbortController`, preserve `lastSuccessfulReport`, prevent overlapping requests, and skip interval refresh when `document.visibilityState !== 'visible'`.

Export the exact authorized payload through a Blob download named `maintenance-evidence-YYYY-MM-DD.json`; revoke the object URL after download.

Replace the old component import in `DashboardPanel` and delete the obsolete component.

- [ ] **Step 4: Run UI tests and verify GREEN**

Run: `npm run test:ui -- tests/ui/admin-operations.test.jsx`

Expected: PASS.

- [ ] **Step 5: Commit isolated task**

```powershell
git commit --only -m "feat: add maintenance evidence panel" -- components/admin/MaintenanceEvidencePanel.jsx components/admin/BiometricBenchmarkPanel.jsx components/admin/DashboardPanel.jsx tests/ui/admin-operations.test.jsx
```

### Task 7: Clarify Public Health and Remove Redundant Status Route

**Files:**
- Modify: `app/api/health/route.js`
- Delete: `app/api/system/status/route.js`
- Modify: `tests/postgres/test-database.test.mjs`
- Modify: `tests/postgres/identity.routes.test.mjs`

- [ ] **Step 1: Write failing route/security tests**

Assert public health says exactly what it proves:

```javascript
assert.deepEqual(await response.json(), {
  ok: true,
  kind: 'process-liveness',
  service: 'faceattend',
  timestamp: payload.timestamp,
})
```

Replace the extensionless route-loader import target with `@/app/api/admin/biometric-benchmark/route.js`. Add a filesystem assertion that `app/api/system/status/route.js` does not exist after replacement.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/postgres/test-database.test.mjs`

Expected: FAIL because public health lacks `kind` and redundant route still exists.

- [ ] **Step 3: Implement minimal health contract and delete redundant route**

Add `kind: 'process-liveness'` to `/api/health`. Delete `/api/system/status/route.js`; do not add a redirect or alias because the route has no UI consumer and exposed an obsolete readiness contract.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test tests/postgres/test-database.test.mjs`

Expected: PASS.

Run: `npm run test:routes`

Expected: PASS.

- [ ] **Step 5: Commit isolated task**

```powershell
git commit --only -m "chore: retire obsolete system status" -- app/api/health/route.js app/api/system/status/route.js tests/postgres/test-database.test.mjs tests/postgres/identity.routes.test.mjs
```

### Task 8: Full Verification and Evidence Review

**Files:**
- Modify only if a verification failure proves a task-scoped defect.

- [ ] **Step 1: Verify removed names and forbidden claims**

Run:

```powershell
rg -n "Operational gate passed|WFH accepted|2-frame fallback|buildBiometricBenchmarkReport|BiometricBenchmarkPanel" app components lib tests
```

Expected: no active-source matches. Test descriptions may mention removed wording only when asserting absence.

- [ ] **Step 2: Run focused pure, route, and UI suites**

Run: `node tests/run-tests.mjs`

Expected: PASS, zero failures.

Run: `npm run test:routes`

Expected: PASS, zero failures.

Run: `npm run test:ui -- tests/ui/admin-operations.test.jsx`

Expected: PASS, zero failures.

- [ ] **Step 3: Run full repository tests**

Run: `npm test`

Expected: exit code 0, zero failed tests.

- [ ] **Step 4: Check patch integrity**

Run: `git diff --check`

Expected: no whitespace errors.

Inspect: `git diff -- app/api/admin/biometric-benchmark/route.js lib/maintenance lib/scan-events.js app/api/admin/reenrollment-candidates/route.js components/admin/MaintenanceEvidencePanel.jsx components/admin/DashboardPanel.jsx app/api/health/route.js app/api/system/status/route.js tests/run-tests.mjs tests/postgres/identity.routes.test.mjs tests/postgres/test-database.test.mjs tests/ui/admin-operations.test.jsx`

Expected: only Maintenance Evidence v2 behavior and tests; no threshold, descriptor, migration, cron, or production configuration changes.

- [ ] **Step 5: Build SmartASP hosting artifact**

Run: `npm run build:hosting`

Expected: exit code 0 and `.next/BUILD_ID` exists. This proves local artifact creation only, not deployment.

- [ ] **Step 6: Confirm task files are committed without absorbing unrelated work**

Run: `git status --short`

Expected: no uncommitted Maintenance Evidence v2 files. Pre-existing unrelated modifications and deletions may remain and must not be staged or committed by this plan.

# Biometric Math Extraction and Firebase Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve and test shared biometric mathematics, move every live persistence path to PostgreSQL, repair or disable the warm-cache cron, then delete only proven-dead Firebase code.

**Architecture:** Pure descriptor validation, distance, ranking, aggregation, and duplicate classification live in persistence-free modules. PostgreSQL adapters own candidate loading and index persistence. Deletion is evidence-gated by CodeGraph/import scans plus focused and full regression tests; no useful biometric math is removed with legacy Firestore branches.

**Tech Stack:** JavaScript ES modules, PostgreSQL 18, Next.js Route Handlers, Node.js 22 tests.

---

## File Structure

- Create `lib/biometrics/vector-math.js`: validation, normalization, Euclidean/cosine helpers.
- Create `lib/biometrics/match-ranking.js`: sample aggregation, ranking, ambiguity support.
- Create `lib/postgres/biometric-index-store.js`: PostgreSQL candidate/index persistence.
- Create `tests/biometric-math.test.mjs`: direct pure-module characterization.
- Create `tests/postgres/biometric.routes.test.mjs`: duplicate/debug/cache PostgreSQL integration.
- Create `tests/no-firebase-runtime.test.mjs`: static runtime boundary after deletion.
- Modify `lib/persons/duplicate-face.js`: import pure math only.
- Modify `lib/attendance/match.js`, `lib/attendance-match.js`, `lib/person-biometrics.js`: use pure math/PostgreSQL adapter.
- Modify `lib/biometric-index.js`: reduce to a compatibility facade, then delete when callers are gone.
- Modify `lib/postgres/person-store.js`: use the PostgreSQL index adapter.
- Modify `app/api/cron/warm-biometric-cache/route.js`: PostgreSQL warm path or explicit disabled response.
- Modify `app/api/admin/{debug-biometric,biometric-benchmark,reenrollment-candidates}/route.js`: PostgreSQL queries and safe scope.
- Modify `app/api/debug/{match-test,latest-fail,attendance-failures}/route.js`: PostgreSQL rewrite or route removal.
- Delete verified-dead `lib/persons/enrollment.js` and Firestore portions of `lib/persons/directory.js`, `lib/attendance/context.js`, and `lib/biometric-index.js` only after caller proof.

### Task 1: Characterize biometric mathematics before extraction

**Files:**
- Create: `tests/biometric-math.test.mjs`
- Modify: `tests/run-tests.mjs`

- [ ] **Step 1: Add deterministic fixture vectors**

Use fixed small arrays for identical, near, far, invalid-length, NaN, multi-sample, ambiguous-neighbor, review-required, and hard-duplicate cases. Assert exact distances/tolerances, stable ranking order, and the distinction between `review_required` and `hard_duplicate`.

```javascript
const A = [0, 0, 0, 0]
const NEAR = [0.1, 0.1, 0.1, 0.1]
const FAR = [1, 1, 1, 1]
assert.equal(euclideanDistance(A, A), 0)
assert.ok(euclideanDistance(A, NEAR) < euclideanDistance(A, FAR))
assert.equal(classifyDuplicateDistance(0.48).status, 'hard_duplicate')
assert.equal(classifyDuplicateDistance(0.68).status, 'review_required')
```

- [ ] **Step 2: Run characterization before moving code**

Run: `npm test`
Expected: existing math passes or exposes a real discrepancy to resolve before extraction.

- [ ] **Step 3: Commit characterization tests**

```powershell
git add tests/biometric-math.test.mjs tests/run-tests.mjs
git commit -m "test: characterize biometric matching math"
```

### Task 2: Extract pure vector and ranking modules

**Files:**
- Create: `lib/biometrics/vector-math.js`
- Create: `lib/biometrics/match-ranking.js`
- Modify: `lib/persons/duplicate-face.js`
- Modify: `lib/attendance/match.js`
- Modify: `lib/attendance-match.js`
- Modify: `lib/person-biometrics.js`
- Test: `tests/biometric-math.test.mjs`

- [ ] **Step 1: Point tests at the new missing modules**

Change imports in `tests/biometric-math.test.mjs` to the planned pure modules.

- [ ] **Step 2: Run and confirm module-not-found**

Run: `node --test tests/biometric-math.test.mjs`
Expected: FAIL because the pure modules do not exist.

- [ ] **Step 3: Move math without behavior changes**

`vector-math.js` exports `isValidDescriptor`, `normalizeDescriptor`, `euclideanDistance`, and `meanDescriptor`. `match-ranking.js` exports `rankBiometricCandidates`, `buildDistanceSnapshot`, and threshold classification support. These files may import only other pure biometric/config modules; they may not import PostgreSQL, Firebase, Next.js, filesystem, or environment-specific stores.

- [ ] **Step 4: Replace math imports in live callers**

Move implementations, do not duplicate them. Keep old named exports as temporary re-exports only where needed:

```javascript
export { euclideanDistance, normalizeDescriptor } from './biometrics/vector-math'
export { rankBiometricCandidates } from './biometrics/match-ranking'
```

- [ ] **Step 5: Run pure/full tests and commit**

Run:

```powershell
node --test tests/biometric-math.test.mjs
npm test
```

Expected: PASS with unchanged decisions.

```powershell
git add lib/biometrics/vector-math.js lib/biometrics/match-ranking.js lib/persons/duplicate-face.js lib/attendance/match.js lib/attendance-match.js lib/person-biometrics.js tests/biometric-math.test.mjs tests/run-tests.mjs
git commit -m "refactor: separate biometric match math"
```

### Task 3: PostgreSQL biometric index adapter

**Files:**
- Create: `lib/postgres/biometric-index-store.js`
- Modify: `lib/postgres/person-store.js`
- Modify: `lib/attendance/context.js`
- Modify: `lib/data-store.js`
- Test: `tests/postgres/biometric.routes.test.mjs`

- [ ] **Step 1: Write failing PostgreSQL adapter tests**

Seed active, pending, rejected, and inactive people with descriptor sets. Assert candidate loading respects requested eligibility, index sync replaces only the target person's rows, cache loading returns canonical `personId`, and duplicate review includes pending candidates while kiosk matching excludes non-active/non-approved candidates.

- [ ] **Step 2: Implement explicit adapter methods**

```javascript
export async function loadBiometricCandidates({ includePending = false, officeIds = [], client = null } = {})
export async function replacePersonBiometricIndex({ personId, descriptors, modelVersion, client })
export async function removePersonBiometricIndex({ personId, client })
export async function warmBiometricIndex({ officeIds = [] } = {})
```

All SQL returns canonical person lifecycle and office fields. The adapter imports pure vector helpers only for validation; it does not own thresholds or classification.

- [ ] **Step 3: Move live callers to the adapter**

`person-store`, attendance context/matching, duplicate registration, and data-store wrappers call these four methods. Remove `db` arguments when they exist only for Firestore compatibility.

- [ ] **Step 4: Run adapter tests and commit**

Run: `npm run test:routes -- --test-name-pattern="biometric index"`
Expected: PASS.

```powershell
git add lib/postgres/biometric-index-store.js lib/postgres/person-store.js lib/attendance/context.js lib/data-store.js tests/postgres/biometric.routes.test.mjs
git commit -m "refactor: own biometric index in PostgreSQL"
```

### Task 4: Repair or explicitly disable warm-cache cron

**Files:**
- Modify: `app/api/cron/warm-biometric-cache/route.js`
- Modify: `lib/cron-auth.js`
- Test: `tests/postgres/cron.routes.test.mjs`

- [ ] **Step 1: Write failing cron behavior tests**

Assert missing/invalid secrets fail closed. With a valid secret, assert either:

- PostgreSQL warm succeeds and returns `{ ok: true, backend: 'postgres', people, samples }`; or
- cache warming is intentionally disabled and returns `503 { ok: false, code: 'biometric_cache_disabled' }`.

A null database plus HTTP 200 is never accepted.

- [ ] **Step 2: Prefer the PostgreSQL implementation**

Call `warmBiometricIndex()` and return counts. If benchmarking shows no separate warm cache is needed because candidate loading is already indexed, remove scheduled reliance and return the explicit disabled contract instead. Record the decision in `docs/2026-08-production-release.md` during cleanup.

- [ ] **Step 3: Run cron tests and commit**

Run: `npm run test:routes -- --test-name-pattern="warm biometric"`
Expected: PASS with one explicit contract.

```powershell
git add app/api/cron/warm-biometric-cache/route.js lib/cron-auth.js tests/postgres/cron.routes.test.mjs
git commit -m "fix: remove broken biometric cache cron"
```

### Task 5: Rewrite or remove diagnostic Firebase routes

**Files:**
- Modify: `app/api/admin/debug-biometric/route.js`
- Modify: `app/api/admin/biometric-benchmark/route.js`
- Modify: `app/api/admin/reenrollment-candidates/route.js`
- Modify or Delete: `app/api/debug/match-test/route.js`
- Modify or Delete: `app/api/debug/latest-fail/route.js`
- Modify or Delete: `app/api/debug/attendance-failures/route.js`
- Test: `tests/postgres/biometric.routes.test.mjs`

- [ ] **Step 1: Prove route reachability and authorization**

Use CodeGraph plus `rg` for client fetches/navigation. For each route, record one of `live-admin`, `live-debug`, or `unreferenced`. Live routes get PostgreSQL implementation and Regional Admin authorization; unreferenced debug routes are deleted rather than preserved as unauthenticated shadow behavior.

- [ ] **Step 2: Write safe diagnostic tests**

Assert anonymous/Office HR access is denied; Regional Admin results contain aggregate IDs/distances/status but never raw descriptors, photos, tokens, or SQL errors.

- [ ] **Step 3: Replace Firestore queries with PostgreSQL stores**

Use `loadBiometricCandidates`, `listLocalScanEvents`, `listLocalAuditLogs`, and duplicate evaluation. Do not add a generic storage abstraction solely to preserve Firebase-shaped calls.

- [ ] **Step 4: Delete proven-unreferenced debug routes**

Delete only routes with no UI/API caller and no documented operational need. Add their paths to the regression test and expect 404 after build/dev verification.

- [ ] **Step 5: Run diagnostics tests and commit**

Run: `npm run test:routes -- --test-name-pattern="biometric diagnostic"`
Expected: PASS.

```powershell
git add app/api/admin/debug-biometric/route.js app/api/admin/biometric-benchmark/route.js app/api/admin/reenrollment-candidates/route.js app/api/debug/match-test/route.js app/api/debug/latest-fail/route.js app/api/debug/attendance-failures/route.js tests/postgres/biometric.routes.test.mjs
git commit -m "fix: remove Firestore diagnostic paths"
```

### Task 6: Delete verified-dead Firebase trees

**Files:**
- Delete: `lib/persons/enrollment.js` if `lib/persons/index.js` no longer exports/calls it.
- Modify or Delete: `lib/persons/directory.js` after PostgreSQL callers use `lib/postgres/person-store.js`.
- Modify: `lib/attendance/context.js`
- Modify or Delete: `lib/biometric-index.js`
- Modify: `lib/persons/index.js`
- Create: `tests/no-firebase-runtime.test.mjs`
- Modify: `tests/run-tests.mjs`

- [ ] **Step 1: Capture deletion evidence**

Run:

```powershell
rg -n "from ['\"].*(persons/enrollment|persons/directory|biometric-index)|\.collection\(" app components lib tests
```

Expected before deletion: only known compatibility/debug callers. Resolve every result; do not delete with unexplained callers.

- [ ] **Step 2: Add the runtime-boundary test**

```javascript
test('runtime source contains no Firebase persistence calls', async () => {
  const offenders = await findSourceMatches(['app', 'components', 'lib'], /\.collection\(|firebase-admin|firebase\/firestore/)
  assert.deepEqual(offenders, [])
})
```

The helper recursively scans `.js`, `.jsx`, `.mjs`, and excludes documentation/generated output.

- [ ] **Step 3: Remove compatibility exports and dead files**

Delete the Firestore enrollment/directory/index implementations only after all callers use PostgreSQL. Retain `duplicate-face.js`, extracted math, capture/liveness, embedding, and PostgreSQL biometric files.

- [ ] **Step 4: Remove obsolete configuration and packages**

Run `npm ls firebase firebase-admin` and inspect `package.json`/lockfile. Remove only actual obsolete Firebase dependencies/config/environment examples; do not touch unrelated hosting variables.

- [ ] **Step 5: Run full deletion gates**

Run:

```powershell
node --test tests/no-firebase-runtime.test.mjs
npm run test:routes
npm test
npm run build:hosting
git diff --check
```

Expected: all pass; `rg -n "\.collection\(|firebase-admin|firebase/firestore" app components lib` returns no runtime matches; `.next/BUILD_ID` exists.

- [ ] **Step 6: Commit verified removal**

```powershell
git add app/api/admin/debug-biometric/route.js app/api/admin/biometric-benchmark/route.js app/api/admin/reenrollment-candidates/route.js app/api/debug/match-test/route.js app/api/debug/latest-fail/route.js app/api/debug/attendance-failures/route.js lib/persons/enrollment.js lib/persons/directory.js lib/attendance/context.js lib/biometric-index.js lib/persons/index.js tests/no-firebase-runtime.test.mjs tests/run-tests.mjs package.json package-lock.json
git commit -m "refactor: remove dead Firebase persistence"
```

## Phase Stop Gate

Do not start organization migration if any runtime `.collection(...)` path remains unexplained, any live caller imports removed compatibility code, warm-cache cron still returns a false success, or pure biometric decision tests change unexpectedly. A green build without those proofs is insufficient.

# Cleanup and Release Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove verified clutter and sensitive/generated artifacts, reconcile documentation/configuration, and produce fresh local test/build evidence without deploying.

**Architecture:** Cleanup is classification-first: every candidate is labeled live source, legacy source, generated output, local runtime data, sensitive artifact, or documentation before removal. Verification runs from the final tree and produces a local candidate report; `.next/BUILD_ID` proves a build completed, not deployability or production readiness.

**Tech Stack:** Git, Node.js 22, Next.js hosting build, PostgreSQL route tests, PowerShell inspection.

---

## File Structure

- Create `scripts/audit-repository-artifacts.mjs`: deterministic tracked/untracked artifact classification without reading secret contents into output.
- Create `docs/2026-08-20-local-hardening-verification.md`: final evidence and remaining-risk report.
- Create `docs/2026-08-20-dead-code-inventory.md`: caller/replacement evidence for every keep/merge/delete decision.
- Create `docs/2026-08-20-system-map.md`: complete file/domain/runtime path and exported-function/caller inventory with coverage limits.
- Modify `.gitignore`: ignore only verified generated/local runtime paths.
- Modify `.env.example`: PostgreSQL-only, trusted-proxy, cron, storage, and test-safe documentation without credentials.
- Modify `README.md` and `docs/2026-08-production-release.md`: remove stale Firebase/hosting claims and state production prerequisites.
- Modify `package.json` and lockfile only for verified dead dependencies/scripts.
- Remove exact generated/temp/debug files only after classification.
- Investigate `cookies.txt` by metadata/hash/reference, then remove it from tracking/worktree if it is a session artifact.

### Task 1: Establish the cleanup inventory

**Files:**
- Create: `scripts/audit-repository-artifacts.mjs`
- Test: `tests/artifact-audit.test.mjs`

- [ ] **Step 1: Write failing classifier tests**

Use synthetic paths to assert classifications for `.next`, logs, PID files, Graphify sidecars, `.superpowers` visual sessions, cookies, source, migrations, model assets, and documents. Ensure file contents are never included in the result.

```javascript
assert.equal(classifyArtifact('.next/BUILD_ID'), 'generated-build')
assert.equal(classifyArtifact('cookies.txt'), 'sensitive-review')
assert.equal(classifyArtifact('db/migrations/0016_organization_units.sql'), 'source')
assert.equal(classifyArtifact('public/models/human/models.json'), 'runtime-asset')
```

- [ ] **Step 2: Run and confirm missing-module failure**

Run: `node --test tests/artifact-audit.test.mjs`
Expected: FAIL because the classifier does not exist.

- [ ] **Step 3: Implement metadata-only inventory**

The script consumes `git status --porcelain=v1 -z`, `git ls-files -z`, and path metadata. It prints `{ path, tracked, category, reason }`; it does not read or print cookie/env/log contents. Unknown files remain `manual-review`, never auto-delete.

- [ ] **Step 4: Run inventory and save a temporary console report**

Run: `node scripts/audit-repository-artifacts.mjs`
Expected: every current dirty/untracked path receives a category; unknowns are visible.

- [ ] **Step 5: Commit the audit tool**

```powershell
git add scripts/audit-repository-artifacts.mjs tests/artifact-audit.test.mjs
git commit -m "chore: classify repository artifacts"
```

### Task 2: Investigate `cookies.txt` without exposing it

**Files:**
- Inspect: `cookies.txt`
- Modify: `.gitignore`
- Remove: `cookies.txt` only if classified as an exported session/cookie artifact.

- [ ] **Step 1: Collect metadata and references only**

Run:

```powershell
Get-Item -LiteralPath 'cookies.txt' | Select-Object FullName,Length,CreationTimeUtc,LastWriteTimeUtc
Get-FileHash -LiteralPath 'cookies.txt' -Algorithm SHA256 | Select-Object Algorithm,Hash
rg -l --fixed-strings 'cookies.txt' --glob '!cookies.txt' .
git log --all --oneline -- cookies.txt
```

Expected: no cookie values printed. Record whether application/build/test code references the file and whether Git history contains it.

- [ ] **Step 2: Determine content class privately**

Inspect only structural markers and redact values in any note: Netscape cookie header, domain count, expiry range, and whether session/auth names exist. Do not paste values into the task, logs, tests, or documentation.

- [ ] **Step 3: Remove or retain based on evidence**

If it is a browser/session export with no runtime reference, remove the exact file and add `/cookies.txt` to `.gitignore`. If application code genuinely requires a cookie fixture, replace values with synthetic fixtures under `tests/fixtures/` and still remove the real artifact.

- [ ] **Step 4: Treat exposure as credential hygiene**

If active session cookies may have been tracked/shared, report that revocation/sign-out is required. Do not rotate or contact external services without separate authorization.

- [ ] **Step 5: Commit only the cleanup result**

```powershell
git add .gitignore
git add -u -- cookies.txt
git commit -m "chore: remove local cookie artifact"
```

### Task 3: Remove generated and obsolete clutter

**Files:**
- Modify: `.gitignore`
- Remove: exact files classified `generated-build`, `local-runtime`, or verified dead legacy/debug output.

- [ ] **Step 1: Compare tracked files with runtime/build references**

For each removal candidate, use CodeGraph for source callers and `rg` for config/docs/assets. Preserve migrations, model assets, DTR template, hosting entrypoint, and useful Graphify report/output intentionally retained by the approved design.

- [ ] **Step 2: Add narrow ignore rules**

Cover verified local paths such as `.next/`, test runtime, `.superpowers/brainstorm/`, local graph sidecars, `*.pid`, and local Node logs. Do not ignore broad source/document directories or all `.json`/`.html` files.

- [ ] **Step 3: Remove exact verified artifacts**

Use `git rm -- <exact tracked paths>` for tracked artifacts and a recoverable exact-path removal for untracked generated output. Do not recursively delete the workspace, repository root, user profile, or an unresolved environment-variable path.

- [ ] **Step 4: Prove no runtime import/reference broke**

Run:

```powershell
npm test
npm run test:routes
git diff --check
```

Expected: PASS.

- [ ] **Step 5: Commit artifact cleanup**

```powershell
git add .gitignore
git commit -m "chore: remove generated repository clutter"
```

### Task 4: Produce the complete system map

**Files:**
- Create: `docs/2026-08-20-system-map.md`

- [ ] **Step 1: Freeze the final file inventory**

Run `rg --files` from the repository root after Firebase and UI work. Classify every path under runtime source, components, hooks, scripts, migrations, tests, public runtime assets, documentation, generated output, and local-only artifacts. No file is silently omitted; binary model/template assets are mapped by role and provenance rather than line-read.

- [ ] **Step 2: Query the indexed call graph by subsystem**

Use CodeGraph for registration, authentication/session, employee lifecycle, biometric embedding/matching/index, kiosk attendance, correction, daily projection, DTR/export, workforce, office/hierarchy, cron, UI state/hooks, and hosting entrypoints. Record entry → route → service → store → table/file paths, exported symbols, direct/dynamic callers, and blast radius.

- [ ] **Step 3: Reconcile Graphify and non-code material**

Query the retained Graphify architecture output for cross-code/document/schema relationships. Inspect SQL migrations, `package.json`, Next configuration, hosting entrypoints, model manifests, service worker, DTR template, and release documents separately because static JavaScript call graphs do not fully model them.

- [ ] **Step 4: Record connecting and non-connecting logic**

For each exported function/module, label `live-connected`, `compatibility`, `debug/operational`, `test-only`, `zero-caller`, or `dynamic/uncertain`. Every zero-caller/uncertain item links to the dead-code evidence decision; do not claim deletion safety for unresolved dynamic imports, framework entrypoints, or asset URLs.

- [ ] **Step 5: Document runtime work paths and failure boundaries**

The system map includes sequence tables for public registration, approval/rejection, re-enrollment, kiosk accept/reject, attendance correction, daily projection, Admin/Office HR employee filtering, DTR/workbook, cron, local PostgreSQL tests, hosting build/start, photo storage, and authentication. Each path names validation, authorization, transaction/commit, post-commit work, cache/projection, audit, response, and failure behavior.

- [ ] **Step 6: State coverage honestly**

List unreadable/binary/generated exclusions, CodeGraph/Graphify index timestamp, dynamic-dispatch uncertainty, production-data limits, and the fact that the map describes the verified checkout rather than deployed SmartASP bytes.

- [ ] **Step 7: Commit the map**

```powershell
git add docs/2026-08-20-system-map.md
git commit -m "docs: map FaceAttend runtime and files"
```

### Task 5: Remove dead code, repeated queries, and unused UI

**Files:**
- Create: `docs/2026-08-20-dead-code-inventory.md`
- Modify/Delete: candidates identified by CodeGraph/import analysis.
- Modify: relevant route/store/component tests.

- [ ] **Step 1: Produce an evidence table**

For every candidate function/file, record definition, callers, dynamic callers, test coverage, replacement owner, and decision (`keep`, `merge`, `delete`) in `docs/2026-08-20-dead-code-inventory.md`. Start with null-`db` parameters, duplicate Firestore-era façades, repeated attendance queries, unused components, old debug routes, and shadow helpers.

- [ ] **Step 2: Consolidate one responsibility at a time**

For each `merge`, add/retain characterization tests, move callers to the authoritative owner, run focused tests, then remove the duplicate. Do not perform mechanical whole-repository rewrites or mix identity/report/UI changes in one deletion commit.

- [ ] **Step 3: Delete only zero-caller code**

Run CodeGraph again after edits and wait for index synchronization. Use raw search only for stale files/config/dynamic strings CodeGraph cannot cover. Keep documented compatibility boundaries until their contract phase is separately approved.

- [ ] **Step 4: Run focused and full tests after each deletion group**

Run: `npm test`, then `npm run test:routes`.
Expected: PASS after every group; a failure restores/reworks that group before continuing.

- [ ] **Step 5: Commit grouped cleanup**

Stage each evidence-row cleanup using the exact source and test paths in that row, then run `git diff --cached --name-status` before `git commit -m "refactor: remove verified dead application code"`. Commit `docs/2026-08-20-dead-code-inventory.md` with the final group. Never use `git add -A`, `git add -u` without pathspecs, or a directory-wide add in the dirty worktree.

### Task 6: Reconcile configuration and documentation

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/2026-08-production-release.md`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Audit claims against current source**

Check backend, registration approval, optional Employee ID, photo storage, PostgreSQL migrations, cron, hierarchy, hosting build, `.next` upload boundary, OpenVINO optional runtime, and production-backup prerequisites. Delete Firebase instructions and mandatory-ID claims only when runtime searches prove them stale.

- [ ] **Step 2: Document safe environment variables**

`.env.example` names variables with empty/example values only: `DATABASE_URL`, TLS CA file option where supported, persistent file root, cron secret, trusted-proxy switch, pool limits, and public feature flags. `FACEID_TEST_DATABASE_URL` remains in `.env.test.example`, not as a fallback in production config.

- [ ] **Step 3: State release truth precisely**

Documentation must say:

- production remains on SmartASP and untouched by this project;
- a successful hosting build plus `.next/BUILD_ID` is a local candidate gate, not deployment proof;
- no production hierarchy/lifecycle migration occurs without trusted restorable backup and dry run;
- Firebase persistence is removed only after runtime proof;
- exact upload/deployment actions require separate approval.

- [ ] **Step 4: Verify package scripts/files**

Ensure every `package.json` script references a tracked file, especially `scripts/materialize-next-externals.mjs`; ensure obsolete Firebase dependencies are absent and `npm install --package-lock-only --ignore-scripts` produces no unexpected dependency changes before accepting lockfile edits.

- [ ] **Step 5: Commit documentation truth**

```powershell
git add .env.example .env.test.example README.md docs/2026-08-production-release.md package.json package-lock.json scripts
git commit -m "docs: align PostgreSQL release guidance"
```

### Task 7: Fresh final verification

**Files:**
- Create: `docs/2026-08-20-local-hardening-verification.md`

- [ ] **Step 1: Record repository state without altering user work**

Run:

```powershell
git status --short
git diff --check
git diff --stat
```

Record pre-existing/unrelated remaining changes separately. Do not stage them into verification commits.

- [ ] **Step 2: Reset only the isolated test database and run route tests**

Run:

```powershell
npm run postgres:test:reset
npm run test:routes
```

Expected: registration, lifecycle, duplicate review/block, kiosk accept/reject, Office HR scope, correction, DTR, cron, hierarchy, and post-commit cases all pass against a `faceid_rc_` database.

- [ ] **Step 3: Run the full unit/contract suite**

Run: `npm test`
Expected: PASS with the exact test count recorded.

- [ ] **Step 4: Run the hosting build from the final tree**

Run:

```powershell
npm run build:hosting
if (-not (Test-Path -LiteralPath '.next\BUILD_ID')) { throw '.next/BUILD_ID was not produced' }
Get-Content -LiteralPath '.next\BUILD_ID'
```

Expected: command exits 0, external package materialization completes, and a non-empty fresh BUILD_ID is printed.

- [ ] **Step 5: Verify runtime artifact shape**

Confirm `.next/static`, `.next/server`, required traced dependencies, `app.js`, `web.config`, public assets, and persistent `App_Data` expectations. Check for broken junction/symlink aliases after materialization. Do not upload.

- [ ] **Step 6: Run final security/hygiene checks**

Run:

```powershell
npm audit --omit=dev
rg -n "\.collection\(|firebase-admin|firebase/firestore" app components lib
git diff --check
node scripts/audit-repository-artifacts.mjs
```

Expected: audit result recorded; no Firebase runtime matches; no whitespace errors; no unexplained sensitive/generated artifact.

- [ ] **Step 7: Complete the evidence report**

The report records command, timestamp, exit status, test count, BUILD_ID, verified workflows, responsive widths, reduced-motion result, artifact decisions, remaining uncertainties, deferred production backup/migration, and explicit statement `No deployment performed`.

- [ ] **Step 8: Commit verification report**

```powershell
git add docs/2026-08-20-local-hardening-verification.md
git commit -m "docs: record local hardening verification"
```

## Final Stop Gate

Do not call the application deployable. Completion means a verified local candidate only. Stop and report failure if any route test uses production, BUILD_ID is absent/stale, runtime aliases remain broken, responsive/reduced-motion checks are incomplete, sensitive artifacts remain unexplained, or production backup/restoration is still unproven.

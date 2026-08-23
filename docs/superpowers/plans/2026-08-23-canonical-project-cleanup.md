# Canonical Project Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove repository clutter and obsolete Firebase-era runtime paths while preserving the deployed PostgreSQL application, migration history, biometric data, and SmartASP packaging contract.

**Architecture:** Work in isolated batches: hygiene, documentation, runtime ownership, dependency/assets, environment/tool relocation, then verification. Behavior-changing removal is protected by source-boundary regression tests and the existing PostgreSQL route suite. Production remains disconnected.

**Tech Stack:** Next.js 16, React 18, Node.js 22, PostgreSQL 18, Node test runner, SmartASP `httpPlatformHandler`, Git.

---

## File structure

- Keep `db/migrations/*.sql` unchanged; add `db/README.md` for ownership rules.
- Rewrite `README.md`; create four canonical operator/system documents under `docs/`.
- Keep this plan and its matching cleanup specification; remove other dated plans/specifications after extraction.
- Reduce `lib/biometric-index.js` to persistence-independent biometric math.
- Remove dead Firestore enrollment/storage modules and unsupported diagnostic routes.
- Keep `scripts/materialize-next-externals.mjs` and add it to the tracked runtime toolchain.

### Task 1: Repository hygiene

**Files:**
- Modify: `.gitignore`
- Remove: `.tmp-dtr-fix/`, `.tmp-dtr-inspect/`, `tmp-dtr-inspect/`, `tmp-dtr-template/`, `outputs/`, `graphify-out/`
- Remove: `cookies.txt`, `render.bin`, `dev-server.err.log`, `dev-server.out.log`, `node_*.log`
- Remove: `deploy/iis/web.config`, `docs/iis-windows-server-2022-deployment.md`

- [ ] Confirm each target is inside `D:\projects\faceid` and has no runtime reference.
- [ ] Patch `.gitignore` with root-scoped artifact, log, cookie, tool, and analysis patterns.
- [ ] Delete only the enumerated tracked and untracked artifacts.
- [ ] Run `git status --short` and confirm no required runtime file disappeared.

### Task 2: Canonical documentation

**Files:**
- Rewrite: `README.md`
- Create: `docs/architecture.md`
- Create: `docs/database-and-local-testing.md`
- Create: `docs/smartasp-operations.md`
- Create: `docs/security-and-release-gates.md`
- Create: `db/README.md`
- Remove: obsolete dated documents under `docs/superpowers/` except this plan/specification
- Remove: `docs/2026-08-production-release.md`, `docs/2026-08-system-analysis.md`

- [ ] Extract current PostgreSQL, SmartASP, migration, no-reenrollment, PIN, HR-scope, and release-gate decisions.
- [ ] Write canonical documents without credentials, production database values, obsolete Firebase/Vercel/Railway instructions, or claims of deployability.
- [ ] Search canonical docs for `Firebase`, `Firestore`, `Vercel`, `Railway`, and obsolete test-database variables; retain only explicit historical-removal statements.
- [ ] Verify every command maps to a current `package.json` script or an existing file.

### Task 3: PostgreSQL-only runtime contract

**Files:**
- Create: `tests/security/postgres-only-runtime.test.mjs`
- Modify: `package.json`
- Modify: `tests/run-tests.mjs`
- Modify: `lib/persons/index.js`
- Modify: `lib/biometric-index.js`
- Remove: `lib/persons/enrollment.js`
- Remove: `lib/storage.js`
- Remove: `lib/person-biometrics.js`
- Remove: `app/api/cron/warm-biometric-cache/route.js`

- [ ] Write a failing source-boundary test asserting that active source has no `db.collection(`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, Firestore biometric-cache cron, or exports from the dead enrollment module.
- [ ] Run `node --test tests/security/postgres-only-runtime.test.mjs`; require failure on the current Firestore remnants.
- [ ] Remove dead persistence functions while preserving `buildDescriptorBuckets`, `matchBiometricIndexCandidates`, and `matchBiometricIndexMultiDescriptor` public behavior.
- [ ] Remove obsolete compatibility tests and wire the new security contract into `npm test`.
- [ ] Run the focused security test and `tests/run-tests.mjs`; require both to pass.

### Task 4: Unsupported diagnostic surface

**Files:**
- Extend: `tests/security/postgres-only-runtime.test.mjs`
- Remove: `app/api/debug/attendance-failures/route.js`
- Remove: `app/api/debug/latest-fail/route.js`
- Remove: `app/api/debug/match-test/route.js`
- Remove: `app/api/admin/debug-biometric/route.js`
- Remove: `app/api/admin/maintenance/scan-events/route.js`
- Remove: `app/api/biometric/embed/route.js`

- [ ] Add failing assertions that unsupported diagnostic route files do not exist.
- [ ] Run the focused test and observe the expected failure.
- [ ] Remove the six disconnected routes; keep protected OpenVINO smoke, benchmark UI, audit log, session refresh, public feature-flag routes, and daily-summary cron.
- [ ] Run the focused test and route contract tests.

### Task 5: Dependencies and static biometric models

**Files:**
- Modify: `package.json`, `package-lock.json`
- Remove: disabled Human object/body/hand/emotion model pairs under `public/models/human/`
- Modify or remove: `public/models/human/models.json`

- [ ] Confirm no active import of `react-leaflet` or `semver` and no active Human configuration enabling body, hand, object, gesture, or emotion models.
- [ ] Remove `react-leaflet` and `semver` from package metadata and lockfile.
- [ ] Remove only `centernet`, `movenet-lightning`, `handtrack`, `handlandmark-lite`, and `emotion` JSON/BIN pairs; retain face detector, mesh, iris, FaceRes, anti-spoof, and liveness pairs.
- [ ] Run biometric unit tests and a Node 22 hosting build to prove traced assets remain sufficient.

### Task 6: Environment and portable runtime relocation

**Files:**
- Move local `.env` to a protected operator folder outside the repository.
- Move `.tools/node-v22.23.2-win-x64/` outside the repository.
- Delete redundant `.tools/node-v22.23.2-win-x64.zip` only after runtime verification.

- [ ] Resolve and verify source/destination paths before moving either item.
- [ ] Move the production connection file without printing contents; restrict it to the current Windows user.
- [ ] Keep `.env.development.local` in the repository worktree and confirm its database host is loopback.
- [ ] Move the extracted Node runtime, run its `node.exe -v`, then delete only the redundant ZIP and empty `.tools` directory.
- [ ] Confirm SmartASP's remote `.env` and production database were not accessed.

### Task 7: Database and release verification

**Files:**
- Verify: `db/migrations/0001` through `0016`
- Verify: all modified source, tests, configuration, and documentation

- [ ] Confirm migration filenames and hashes are unchanged from the cleanup start.
- [ ] Start/verify the isolated PostgreSQL 18 test runtime and run `npm run test:routes`.
- [ ] Run `npm test` using Node 22.
- [ ] Run `npm run build:hosting` using Node 22 and the local database URL only.
- [ ] Confirm `.next/BUILD_ID` exists and `.next/node_modules` contains no unresolved Windows Junction deployment aliases.
- [ ] Run `git diff --check`, source searches, and final tracked/untracked inventory.
- [ ] Run `git fsck`; report unreachable objects separately from integrity errors.
- [ ] Do not run Git garbage collection until the active secondary worktree and Codex checkpoint refs are explicitly preserved or released.

## Stop conditions

- Stop if any command resolves `DATABASE_URL` to a non-loopback host.
- Stop if a migration file changes.
- Stop if a required face model is requested but missing.
- Stop if PostgreSQL route tests, full tests, or the Node 22 hosting build fail after cleanup.
- Stop before any production migration, upload, restart, or data mutation.

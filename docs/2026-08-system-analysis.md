# FaceAttend Current-System Analysis

**Study date:** 2026-08-17  
**Scope:** Current `D:\projects\faceid` checkout, including tracked source, migrations, documents, generated DTR assets, and the current dirty worktree. This is an analysis artifact, not a change to application behavior.

## Evidence and coverage

- CodeGraph indexed **274 executable/config files**, **2,965 nodes** and **7,572 relationships**. Its source-symbol inventory contains **1,212 functions**, 895 imports, 534 constants, 27 variables, 10 route nodes, 8 components, 4 methods, and 1 class.
- Directed Graphify AST extracted **1,870 nodes** and **5,630 raw edges**, producing a directed graph of **1,870 nodes**, **5,299 edges**, and **118 communities**. It reports no import cycles.
- Graphify also inspected 8 documents and 11 visual assets. Two MP3 notification assets could not be transcribed because the optional Whisper dependency is absent; they are presentation-only sounds, not business logic.
- Graphify could not parse 13 SQL migrations (missing SQL tree-sitter dependency) or 12 biometric-model JSON files. This report treats the migrations as a separate authoritative path rather than implying they were graph-parsed.
- The working tree is not clean: nine application files are modified and migration `0013_repair_employee_lifecycle_and_audit_actor.sql` is untracked. Findings describe the code on disk now, including those changes; they are not a released baseline.

## What application this actually is

FaceAttend is a Next.js 16 / React 18 application for DILG Region XII biometric attendance. It uses a PostgreSQL persistence layer (`lib/postgres/*`), server-side Node routes, local persistent photo storage, browser camera/location capture, `@vladmandic/human` + TensorFlow WASM for facial descriptors, and a shadow OpenVINO path. Tailwind and Framer Motion provide the UI.

The root process in `app.js` initializes a production Next server and forwards all HTTP requests to it. `next.config.mjs` uses strict React mode, delivers Human/TensorFlow assets to API traces, excludes OpenVINO unless explicitly included, and sends global anti-framing, content-type, referrer, HSTS, camera, location, and microphone policies.

`README.md` is **not a current architecture source**. It still describes Firebase/Firestore and mandatory employee IDs, while package dependencies and route imports show PostgreSQL storage and current enrollment/edit logic accepts a blank employee ID. Do not use that README as deployment or security truth until rewritten.

## Runtime surface and ownership

| Layer | Current responsibility | Main paths |
|---|---|---|
| Public pages | Landing, registration, scan/kiosk, employee attendance view, public summary/login | `app/(public)/*` |
| Protected operations UI | Administrator and HR portal, workforce, DTR, employee, office, audit, benchmark controls | `app/admin/*`, `components/admin/*` |
| Browser biometric runtime | Camera ownership, model boot, location permissions, guided enrollment and verification bursts | `components/BiometricRuntimeProvider.jsx`, `hooks/*`, `components/biometrics/*`, `components/kiosk/*`, `components/register/*` |
| HTTP boundary | Next route handlers authenticate/authorize, apply origin guards where mutable, parse requests, call domain services | `app/api/**/*/route.js` |
| Domain services | Attendance decisioning, biometric validation/matching, lifecycle rules, workforce/DTR calculations, access control | `lib/attendance/*`, `lib/biometrics/*`, `lib/persons/*`, `lib/workforce-policy.js`, `lib/dtr*.js` |
| Persistence | PostgreSQL queries, person/descriptors/photos, attendance/audit/report/user data | `lib/postgres/*`, `db/migrations/*` |
| Operations | migrations, PostgreSQL start/stop/status, deployment docs, hosting build cleanup | `scripts/*`, `docs/*`, `deploy/iis/web.config`, `web.config` |

## End-to-end work paths

### 1. Public registration and approval

1. `app/(public)/registration/page.jsx` renders `RegisterRuntimeApp`, which hosts `RegisterView` and its Details, Capture, Review, and Complete steps.
2. Browser capture uses guided poses and enrollment hooks/components. The client collects guide metadata and still frames; it is not trusted as the biometric authority.
3. `POST /api/persons` validates body/identity through `lib/persons`, calls server enrollment re-embedding, duplicate-face checks, and PostgreSQL person storage.
4. `lib/biometrics/server-embedding-core.js` accepts only JPEG/PNG/WebP data URLs, limits frames to 2 MB and 512 px, requires exactly one detected face, and generates descriptors server-side. Enrollment requires guided support samples; `enrollment-burst.js` defines two captures for center, both side poses, and chin-down (eight total).
5. Public enrollment remains pending for approval. `GET /api/persons` plus `useEmployees`/`EmployeesPanel` drive review; employee edits/approval go through `PUT /api/persons/[personId]`. Current lifecycle repair migration is intended to normalize legacy state.
6. Re-enrollment is deliberately separate: `POST /api/persons/[personId]/reenroll` replaces descriptors only after authorization and duplicate checks. Photo repair uses `/photo`, not biometric re-enrollment.

### 2. Kiosk attendance decision

1. `/scan` (and kiosk compatibility route) loads `ScanRuntimeApp` / `KioskView`, browser camera, Human models, geolocation policy, verification burst, and audio cues.
2. Browser requests `POST /api/attendance/challenge`. The route calls `prepareAttendanceChallenge`; the challenge store uses PostgreSQL when enabled.
3. Browser submits the burst to `POST /api/attendance/v2`, which consumes the short-lived challenge before calling `processAttendanceSubmission`.
4. Attendance processing regenerates server descriptors from strict frames, checks capture policy/liveness evidence, narrows candidates by office when possible, performs multi-descriptor matching with ambiguity margins, applies lifecycle/office/geofence/WFH checks, then writes attendance/audit state.
5. The system explicitly treats weak temporal/liveness/PAD signals as blocks or risk flags. It is more defensible than trusting browser embeddings, but camera frames, GPS, and passive liveness still originate on an employee device. This is pilot-grade biometric assurance, not an independently calibrated identity system.

### 3. Administration, HR, and workforce policy

1. Admin and HR sessions are separate signed-cookie flows in `lib/admin-auth.js` and `lib/hr-auth.js`; pages resolve a session server-side before rendering portal data.
2. Admin UI state uses a Zustand store plus focused hooks. `useEmployees` sends cursor/filter requests to `/api/persons`; it retains query, next cursor, and history separately. `useOffices`, `useAttendance`, `useSummary`, and role hooks call their matching APIs.
3. Mutation routes normally combine session resolution with `createOriginGuard`, and office-scoped authorization checks whether the session may act on that office.
4. HR employee/DTR endpoints scope operations to the HR office. `/api/hr/office-settings` accepts work policy only; location/GPS/radius must remain admin-only on both UI and server.
5. Workforce records implement employee schedule overrides, flexitime, leave, special days/holidays, official orders, and auditable changes. `workforce-policy.js` is policy source; `dtr.js` computes documents; `dtr-excel.js` writes populated CSC Form 48-compatible workbooks plus time-log details.

### 4. Reporting and attendance correction

- `/api/attendance/daily`, `/recent`, `/monthly`, `/table`, `/me`, and `/dtr` derive user/admin views from PostgreSQL logs plus cached daily summaries.
- Admin attendance override routes create/update/delete corrections with origin/session controls. Workforce correction and audit paths are now among the modified files, so re-run verification before release.
- DTR workbook generation builds ZIP/XML directly from a template, adds one employee sheet per DTR and a `Time Log Details` sheet when needed. This preserves print/template parity but is complex and has thin direct unit coverage.

## Data and authority model

PostgreSQL is current source of truth. The migration chain is ordered `0001` through `0013`: local core/runtime/config, employee identity/access-code/duplicate-ID handling, attendance person-ID backfill, workforce policy/schedule/lifecycle hardening, audit immutability, official-order members, then lifecycle/audit-actor repair.

Core data boundaries are:

- people, offices/divisions, lifecycle/approval, descriptors, access codes, WFH/schedule overrides;
- raw attendance logs and daily summaries;
- workforce policy and records (leave, special day, official order);
- staff/HR identities and sessions;
- audit events; and
- profile photos stored through `photo-store`, outside biometric descriptor replacement.

`queryPostgres()` is the highest-connected persistence abstraction (88 graph edges). `writeAuditLog()` is another central cross-cutting authority (59 edges). Their impact radius makes ad-hoc schema/API changes high risk.

## Static-map findings

Graphify’s top hubs are `queryPostgres`, admin-session cookie parsing/name resolution, `resolveAdminSession`, `createOriginGuard`, `writeAuditLog`, `useAdminStore`, `processAttendanceSubmission`, `postgresEnabled`, and `normalizeDescriptor`. That matches the actual trust boundary: database availability, session/origin protection, server-derived biometrics, and auditability dominate every operational path.

CodeGraph traces show:

- only `/api/attendance/v2` directly calls `processAttendanceSubmission`;
- 20 mutating/privileged routes call `createOriginGuard`, including attendance, office, admin, benchmark, login-adjacent, biometric, and HR-user routes;
- direct `queryPostgres` callers include kiosk/device/benchmark/debug routes, daily attendance, challenge issuance, daily-summary access, and the large workforce-record endpoint;
- no static import cycles were detected.

## Risks and gaps — prioritized

1. **Documentation drift:** README’s Firebase and required-ID claims conflict with code. This will produce wrong operational decisions. Rewrite it from the current PostgreSQL/lifecycle model before handoff or production use.
2. **Dirty release boundary:** modified attendance, DTR, workforce, person, audit, and store files plus an untracked lifecycle migration mean there is no clean, auditable release state. Do not deploy from it without reviewing the diff, applying migration only after a verified restorable backup, and re-running tests/build.
3. **Graph coverage is not SQL coverage:** Graphify omitted all migrations because SQL parsing support is absent. Their order and constraints remain a manual-review/deployment gate.
4. **Biometric calibration gap:** server-derived descriptors and burst controls reduce spoof/mismatch risk, but no evidence here shows field calibration, false-match/false-nonmatch targets, or monitored threshold tuning across real devices/lighting. Treat OpenVINO as shadow/benchmark until measured outcomes justify authority.
5. **Thin test coverage in high-impact paths:** CodeGraph found no direct covering tests for server embedding generation and DTR workbook byte generation. `tests/run-tests.mjs` is a valuable 101-case monolith, but it is not a replacement for route-to-storage integration tests or test isolation.
6. **Analysis graph health warning:** 266 dangling AST edges and 65 directed endpoint-pair collapses exist in Graphify output. The graph remains navigable, but its edge count is a lower bound; use CodeGraph source paths for change-impact decisions.
7. **Sensitive local artifact:** `cookies.txt` was detected as a local session-cookie artifact. It is not application logic and should not be treated as safe documentation or shared in reports. Verify it is ignored and remove/revoke it under normal credential-handling process if it is real/current.

## Delivery artifacts

- `D:\projects\faceid\.codegraph\codegraph.db` — CodeGraph’s full symbol/call/reference index.
- `D:\projects\faceid\graphify-out\graph.html` — interactive directed system map.
- `D:\projects\faceid\graphify-out\graph.json` — raw graph data.
- `D:\projects\faceid\graphify-out\GRAPH_REPORT.md` — Graphify audit report, community hubs, questions, and cohesion scores.

## Next concrete action

Freeze a clean release candidate: review current dirty diff and migration `0013`, then run the focused suite, hosting build, and a seeded PostgreSQL end-to-end proof for registration approval, kiosk accept/reject, HR scope, attendance correction, and DTR workbook output. Do not start wider feature work until this release boundary is understood.

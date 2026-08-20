# FaceAttend System Hardening, PostgreSQL Isolation, and UI Renewal Design

**Date:** 2026-08-20  
**Status:** Draft for user review  
**Scope:** Local repository and isolated local PostgreSQL only. No production database mutation, SmartASP upload, or deployment.

## 1. Decision Summary

The repair will be blocker-first, not a broad rewrite. The current Next.js and PostgreSQL application remains the product. We will:

1. create an isolated PostgreSQL 18 test environment containing synthetic data only;
2. fix identity, attendance, registration, correction, authorization, cron, and error-boundary defects at their authoritative server layers;
3. make `deriveDailyAttendanceRecord` the single attendance projection used by screens, exports, DTR, and cron;
4. extract reusable biometric mathematics from persistence, move live callers to PostgreSQL, then remove only verified-dead Firebase branches;
5. introduce a normalized Regional Office organization hierarchy for Department, Division, and Section with a compatibility migration;
6. simplify the Admin and Office HR interface into a compact, responsive operational canvas;
7. add accessible, smooth navigation and limited reversible scroll motion without scroll hijacking;
8. prove behavior through isolated route tests, UI checks, the full test suite, the hosting build, and repository hygiene checks.

Production remains untouched. A local copy of production data is explicitly not part of this phase because the provider endpoint presents an untrusted self-signed TLS certificate and no trusted CA is available. Reachability is not equivalent to a safe backup path.

## 2. Evidence and Current-State Limits

### Verified facts

- PostgreSQL is the live persistence path; Firebase connection configuration is absent from the active environment.
- Firebase-era `.collection(...)` branches and `db = null` compatibility shapes remain in source even though they are not connected.
- The current organization model is effectively `Office -> divisions[]`; persons store legacy `division_id` and `division_name`. Department and Section are not modeled.
- Employee directory state and requests contain Office and Division filters, but not Department or Section.
- The repository contains fixes and other pre-existing uncommitted work. Those changes belong to the user and must not be overwritten or silently bundled.
- The production PostgreSQL endpoint is reachable, but strict TLS verification fails because the server presents a self-signed certificate. The direct default PostgreSQL port is not reachable from the current machine.
- PostgreSQL 18 client tooling is installed locally, but no suitable local PostgreSQL service is currently running.
- Prior test and build runs passed, but that does not prove the missing PostgreSQL route flows, production data correctness, or deployment readiness.

### Evidence-based risks requiring repair

- Attendance submission can retain caller-supplied identity instead of always replacing it with the matched PostgreSQL person's canonical identity.
- Registration and re-enrollment photo inputs accept unsafe MIME/data URL forms, creating a stored same-origin content risk.
- Employee self-re-enrollment authorization and lifecycle handling can be too permissive.
- Attendance correction trusts caller-supplied person/office identity instead of deriving it server-side.
- Some post-commit work can fail after the authoritative write and still return a false failure response.
- Cron authentication can behave incorrectly when its secret is absent; the biometric warm path still contains a Firebase-shaped call with a null database.
- Attendance display and export fallbacks can calculate differently from the canonical daily derivation.
- Office HR server responses can expose office location/GPS fields even where the UI intends to hide them.
- Destructive person behavior and legacy compatibility helpers have ambiguous contracts.

### Uncertainty

- No claim will be made about production employee data quality, duplicate identities, hierarchy completeness, or restorable backups until a trusted production backup path is established separately.
- No file or branch will be labeled dead solely because it looks old. Deletion requires import/call-path evidence plus tests.

## 3. Goals and Non-Goals

### Goals

- Registration succeeds atomically, creates a pending employee, and the employee appears in Admin review.
- Approval, rejection, reactivation, and other lifecycle changes use explicit authorized transitions and preserve biometric, photo, and attendance history.
- Duplicate registration decisions distinguish broad review warnings from confirmed hard duplicates.
- Kiosk attendance binds the event to the matched PostgreSQL person and rejects invalid, duplicate, spoofed, or out-of-policy submissions consistently.
- Office HR can operate only within its assigned office and allowed organizational descendants.
- Attendance correction, daily views, reports, exports, DTR, and cron share one calculation contract.
- Firebase-era persistence code is removed without deleting reusable biometric logic.
- Regional Office filters correctly support Department, Division, and Section.
- Operational pages become compact, mobile-friendly, accessible, and fluid.
- A local PostgreSQL 18 route-test environment can be recreated and destroyed without ever falling back to production credentials.

### Non-goals

- No production data export over unverified TLS.
- No production schema migration, data reconciliation, hosting upload, or deployment.
- No visual rewrite of every public page.
- No speculative framework replacement.
- No deletion of compatibility columns or old migrations during the additive phase.
- No attempt to animate every card, table row, or data refresh.

## 4. Safety Boundaries

### Database isolation

- Route tests must require `FACEID_TEST_DATABASE_URL`.
- Test setup must fail closed if the database name does not match a dedicated test prefix such as `faceid_rc_`.
- Tests must never fall back to `DATABASE_URL`.
- The test database contains synthetic fixtures only.
- Every suite owns cleanup through transactions or deterministic fixture teardown; the pool is closed at suite end.
- A pool-level error listener records unexpected idle-client failures without exposing credentials.

### Production boundary

- Production remains read-only during investigation and unused during automated tests.
- The `.env` connection string is not evidence of a valid backup, valid TLS trust, or production readiness.
- Production lifecycle reconciliation will be a separate, dry-run-first project after a verified restorable backup is available.

### Change isolation

- Existing dirty-worktree changes are preserved.
- Cleanup removes only tracked or generated artifacts whose purpose and recovery path have been verified.
- `cookies.txt` is investigated for origin, content class, references, and secret/session exposure before deletion. Its contents must not be printed into logs or committed.

## 5. Authoritative Data and Transaction Design

### Registration

1. Parse and normalize the request.
2. Validate required identity and organization inputs.
3. Decode only explicitly allowed image formats, enforce byte/dimension limits, and re-encode to a safe server-selected format.
4. Load duplicate candidates from PostgreSQL.
5. Compute similarity using pure biometric functions.
6. Classify the result as clear, `review_required`, or `hard_duplicate` using distinct thresholds and evidence.
7. For a hard duplicate, reject without creating a second person.
8. In one checked-out PostgreSQL transaction, insert the pending person, biometric template/metadata, safe photo reference, and audit record.
9. Commit authoritative state.
10. Run telemetry/cache refresh as best-effort work; failure here must not turn a committed registration into a false 500.
11. Return a stable, non-sensitive response contract. Internal SQL/bind errors are logged server-side, not shown verbatim to the public user.

Acceptance: the response and Admin pending directory agree after success; the same request cannot produce a hidden committed person plus a failure toast.

### Approval and lifecycle transitions

- Lifecycle transitions are explicit server operations, not arbitrary field patches.
- The server records actor, prior state, new state, reason, and timestamp.
- Approval preserves existing biometric, photo, and attendance rows.
- Re-enrollment refreshes allowed biometric/photo data only. It cannot approve, reactivate, transfer office, or change lifecycle status.
- Re-enrollment authorization binds to the exact canonical `personId`; legacy Employee ID is not an alternative ownership token.
- Existing registered employees are blocked from public re-registration even when Employee ID is absent.

### Kiosk attendance

1. Validate request shape, kiosk authorization, office policy, liveness, and image safety.
2. Match against eligible PostgreSQL candidates.
3. Discard caller-supplied person identity after matching.
4. Replace event identity fields with the canonical matched person ID, office, organizational unit, and policy context.
5. Within one transaction, acquire the relevant attendance lock, evaluate duplicate/sequence rules, write the event, and update the daily projection where applicable.
6. Commit before best-effort telemetry/cache work.
7. Return stable accept/reject reason codes suitable for UI messaging and route tests.

Acceptance: a caller cannot cause person A's matched biometric to create an event under person B, including when Employee IDs are null or duplicated in legacy data.

### Attendance correction

- The client sends canonical `personId`, target attendance date, requested correction, and reason.
- The server loads person, office, hierarchy, and policy context.
- The server validates that the actor can correct that person and date.
- Office HR is constrained to its own office regardless of hidden or forged request fields.
- The server writes an immutable correction/audit event and recomputes the canonical daily projection.
- The route does not require Employee ID when `personId` is valid.

### Commit boundary and error contract

- Work required for durable correctness is inside the transaction.
- Work that can be retried or rebuilt is after commit and explicitly best-effort.
- A committed operation returns success even if post-commit refresh fails, while emitting a structured operational warning.
- Public responses use stable error codes and safe messages. Raw SQL, bind counts, filesystem paths, credentials, and biometric internals remain server-only.

## 6. Canonical Attendance Projection

`deriveDailyAttendanceRecord` becomes the sole business-rule implementation for daily status and time calculations.

It must be used by:

- kiosk response summaries;
- employee self-service daily/monthly attendance;
- Admin and Office HR tables;
- attendance correction results;
- CSV/export output;
- DTR generation;
- cron rebuild/repair work;
- any fallback used when a materialized daily row is missing.

Raw attendance events and corrections are authoritative. `attendance_daily` is a rebuildable projection, not an independent source of business truth.

The derivation contract will define:

- event ordering and duplicate handling;
- morning/afternoon time-in and time-out selection;
- late, undertime, overtime, absent, incomplete, holiday, leave, and rest-day behavior;
- timezone and attendance-date boundaries;
- correction precedence;
- policy snapshot behavior;
- output fields and rounding.

No route may maintain a private fallback formula. A missing projection invokes the same derivation or a shared wrapper around it.

## 7. Biometric Logic and Firebase Removal

### Separation boundary

Biometric mathematics must be persistence-agnostic:

- descriptor normalization;
- vector validation;
- distance/similarity calculation;
- multi-sample aggregation;
- duplicate classification support;
- match ranking and thresholds.

PostgreSQL adapters own:

- candidate queries;
- template persistence;
- index/cache refresh;
- audit and queue state;
- transaction participation.

### Removal sequence

1. Characterize current biometric math with focused tests.
2. Extract pure functions without changing behavior.
3. Move every live caller to the pure module plus PostgreSQL adapter.
4. Replace weak cron behavior with a PostgreSQL implementation or explicitly disable the cron with a non-success status and operational message.
5. Use CodeGraph/import searches to prove Firebase helpers have no live callers.
6. Remove verified-dead Firestore trees, null database plumbing, obsolete packages/config, and stale documentation claims.
7. Run focused and full regression checks after each deletion group.

Firebase code is old, but age is not deletion proof. The math/persistence split prevents throwing away useful recognition logic with dead storage code.

## 8. Organization Hierarchy

### Required model

Regional Office hierarchy is:

`Regional Office -> Department -> Division -> Section`

Department, Division, and Section are optional. Non-regional offices may use no child hierarchy or only the levels relevant to them.

### Normalized schema

Add an `organization_units` table with, at minimum:

- `id`;
- `office_id`;
- `parent_id` nullable, referencing another unit in the same office;
- `unit_type` constrained to `department`, `division`, or `section`;
- `name` and optional `short_name`;
- `is_active`;
- `sort_order`;
- optional head/signatory metadata or a relation to the authoritative signatory model;
- audit timestamps.

Add `persons.organization_unit_id` as the deepest assigned active unit. Office remains explicit on the person. Department, Division, and Section names are derived through ancestry, not duplicated as independently editable text.

Database and server validation must enforce:

- parent and child belong to the same office;
- allowed parent types: Department under Office, Division under Department or Office where Department is omitted, Section under Division or the nearest allowed parent where intermediate levels are omitted;
- no cycles;
- a person's selected unit belongs to the person's office;
- inactive units cannot receive new assignments;
- deletion is blocked or converted to deactivation while referenced.

### Compatibility migration

The hierarchy change is additive and reversible:

1. Create `organization_units` and nullable `persons.organization_unit_id`.
2. Import every existing office division as a Division unit with stable legacy mapping.
3. Backfill persons from legacy `division_id` only when the mapping is unambiguous.
4. Produce an exception report for missing or conflicting mappings; do not guess.
5. During compatibility, reads expose both the normalized path and legacy Division fields where required.
6. New writes use the normalized unit ID while keeping necessary legacy compatibility synchronized at one server boundary.
7. Do not remove `division_id`, `division_name`, or old office JSON until production has a trusted backup, migration dry-run, reconciliation proof, and a separately approved contract phase.

### Cascading filter behavior

- Admin filters: Office -> Department -> Division -> Section.
- Office HR: Office is fixed to the authorized office; Department -> Division -> Section remain available within it.
- Changing Office clears Department, Division, and Section.
- Changing Department clears Division and Section.
- Changing Division clears Section.
- Each child selector contains only active descendants of the selected parent path.
- Selecting a parent includes employees assigned to that unit and all descendant units.
- The URL/query contract uses stable IDs, not names.
- The server validates the full ancestry and actor scope. A forged child ID from another office is rejected, not silently accepted.
- Non-regional or flat offices hide irrelevant empty filters.
- Search, approval status, lifecycle status, hierarchy filters, and cursor pagination compose deterministically. Any filter change resets cursor and history.

### DTR and signatory behavior

Reports derive the employee's organization path at the applicable reporting date where history is available. Signatory resolution uses the nearest configured authorized head in the ancestry, then falls back to office-level configuration. It must not infer authority from a display name.

## 9. Authorization, Cron, and Platform Security

### Office HR scope

- Server response DTOs expose only fields needed by Office HR.
- Map coordinates, GPS/location, radius, and other Admin-only configuration are excluded from Office HR GET and PUT contracts, not merely hidden in the UI.
- Office HR may change only explicitly allowed work-policy fields for its assigned office.
- Hierarchy filters and employee mutations are validated against the actor's office on every request.

### Cron

- Missing cron secret is a configuration failure, never `Bearer undefined` acceptance.
- Authentication uses a stable comparison and an explicit disabled/configuration response.
- Each cron route has an isolated route test for missing secret, invalid secret, valid invocation, and work failure.
- The biometric-cache cron must either be repaired to use PostgreSQL or disabled before any caller can rely on it. A null persistence backend may not return a misleading 200.

### Additional hardening

- Define trusted proxy/origin handling explicitly for SmartASP rather than trusting arbitrary forwarding headers.
- Treat in-memory rate limits as best-effort only; security-sensitive controls require a shared/durable design or conservative platform enforcement.
- Replace broad debug/global threshold behavior with scoped configuration and safe production defaults.
- Review PIN/session behavior and security headers, including CSP compatibility, as focused tasks with regression tests.
- Clarify deletion semantics: soft deletion/deactivation must never call a path named or implemented as physical deletion.

## 10. UI and UX Design

### Layout direction

Keep the current sidebar and familiar workflows, but use a flat operational canvas:

- edge-to-edge data tables where space matters;
- cards only for real metrics, warnings, or status groups;
- remove nested rounded containers, duplicated headers, excessive padding, decorative footers, and dead vertical space;
- use a consistent 4/8 spacing scale and restrained 8-12 px radii;
- preserve clear section titles, primary actions, feedback, and empty/error/loading states.

### Responsive hierarchy filters

- Desktop: compact cascading filters in a single toolbar where width permits.
- Tablet: wrap into two predictable rows without detached labels.
- Mobile: a clear Filter button opens a sheet/drawer containing full-width cascading controls; active filters appear as removable chips above results.
- Touch targets are at least 44 px.
- The employee list switches to a deliberate compact card/list representation or a labeled horizontal table container; the page itself must not horizontally scroll.
- Sticky action/header behavior must not cover fields or trap keyboard focus.
- Loading a child filter reserves space and communicates progress without layout jump.

### Motion and scrolling contract

Motion supports orientation; it is not decoration.

- Use CSS smooth scrolling only for explicit in-page navigation, focus-safe jumps, and the scroll-to-top action.
- Do not intercept the wheel/touch stream, force scroll positions, add parallax, or create scroll-jacking.
- Major sections and panels may use short transform/opacity transitions as they enter and leave the viewport. The behavior can respond when scrolling down or back up.
- Animate at most one or two major elements in a viewport. Do not animate each employee row, cell, metric, or paginated result.
- Prefer GPU-friendly opacity and transform; avoid animating layout dimensions, shadows, or expensive filters during scroll.
- Use the application's installed Motion library through a small shared primitive, not ad hoc animations in every panel.
- Configure `MotionConfig reducedMotion="user"` and use `useReducedMotion` where a movement needs an opacity-only alternative.
- Under reduced motion, content appears immediately or with a minimal fade; no essential information depends on animation.
- Focus management, keyboard navigation, screen-reader announcements, and browser back behavior remain correct.
- Route tabs and pagination preserve deliberate scroll position; they do not unexpectedly jump to the top during data operations.

### Feedback and accessibility

- Every mutation has disabled/pending state, success confirmation, and a useful safe error message.
- Form errors are associated with fields and summarized when necessary.
- Color is not the only status signal.
- Contrast, visible focus, keyboard order, labels, dialog focus trapping, and escape behavior meet accessible operational use.

## 11. Test and Verification Matrix

### Isolated PostgreSQL route tests

Required scenarios:

- successful public registration creates pending employee and makes it visible in the Admin directory;
- malformed/unsafe photo rejection;
- broad duplicate produces review-required behavior without being mislabeled as confirmed identity;
- confirmed hard duplicate is blocked;
- approval/rejection transitions and unauthorized transition rejection;
- re-enrollment preserves lifecycle/office and rejects wrong-person tokens;
- kiosk accepts a valid match and persists the canonical matched person ID;
- kiosk rejects invalid liveness, policy, duplicate/sequence, and identity cases;
- Office HR reads and writes only allowed office/policy fields and cannot cross office/hierarchy scope;
- attendance correction derives person/office server-side, accepts absent Employee ID, and records audit history;
- daily views, export, DTR, and fallbacks produce the same canonical derivation;
- cron missing/invalid/valid secret behavior and biometric cron repaired-or-disabled contract;
- authoritative commit remains success when explicitly best-effort post-commit work fails.

### Hierarchy migration and filtering tests

- import legacy divisions and backfill unambiguous employees;
- surface ambiguous/unmatched legacy divisions without guessing;
- prevent cycles, cross-office parents, invalid parent types, and assignment to inactive units;
- cascading query behavior for Office, Department, Division, and Section;
- parent selection includes descendants;
- forged cross-office unit IDs are rejected for Admin/Office HR as appropriate;
- filter changes reset pagination cursors and history;
- DTR/signatory ancestry fallback is deterministic.

### UI verification

Verify at 320, 375, 414, 768, 1024, and 1440 px widths:

- registration and completion;
- Admin pending employee review and status change;
- employee hierarchy filtering and pagination;
- Office HR scoped filtering/settings;
- kiosk accept/reject feedback;
- correction form;
- attendance and DTR output;
- sidebar, dialogs, filters, tables/cards, loading, empty, and error states;
- no horizontal page scroll, clipped controls, hidden actions, or footer waste;
- smooth navigation and reversible panel motion while scrolling down and up;
- reduced-motion behavior, keyboard navigation, visible focus, and screen-reader labels;
- no material layout shift or degraded large-table interaction from animation.

### Release gates

- focused tests for each changed boundary;
- isolated PostgreSQL route suite;
- full `npm test`;
- `npm run build:hosting` and fresh `.next/BUILD_ID` confirmation;
- hosting artifact/materialization checks required by the current package scripts;
- `git diff --check`;
- tracked temporary/generated artifact review;
- dependency and secret scan where supported;
- final diff review against this specification.

Passing these gates means the local candidate is verified. It does not authorize deployment or prove production data readiness.

## 12. Implementation Order and Stop Gates

1. **Harness:** establish fail-closed PostgreSQL 18 test isolation and fixture lifecycle.
2. **Identity integrity:** registration, lifecycle, re-enrollment, kiosk identity binding, photo validation, safe errors.
3. **Authorization and corrections:** Office HR DTO/scope, correction identity derivation, deletion semantics, cron authentication.
4. **Canonical reporting:** route every daily view/export/DTR/fallback through the shared derivation.
5. **Biometric separation:** characterize and extract pure math, move PostgreSQL callers, repair/disable cron, remove proven-dead Firebase code.
6. **Hierarchy expansion:** additive schema, legacy import/backfill, server queries/validation, cascading UI filters, signatory ancestry.
7. **UI renewal:** flatten operational screens, responsive behavior, accessible feedback, shared motion primitives.
8. **Cleanup:** dead imports/components/queries, generated artifacts, `cookies.txt` investigation, stale documentation.
9. **Verification:** focused tests, route suite, responsive browser checks, full tests, hosting build, diff review.

Each step stops on failing focused tests or unexplained data differences. Cleanup and animation must not proceed ahead of identity correctness and test isolation.

## 13. Acceptance Criteria

The phase is complete only when all of the following are evidenced locally:

- registration and employee status workflows pass isolated route and browser checks;
- matched biometric identity, lifecycle, office, and hierarchy cannot be overwritten by untrusted request fields;
- Office HR cannot read or mutate Admin-only location fields or other offices;
- all attendance display/export/DTR fallbacks use the canonical derivation;
- the biometric-cache cron is demonstrably PostgreSQL-backed or explicitly disabled;
- no live caller depends on removed Firebase persistence code;
- Regional Office hierarchy and cascading descendant filters work on desktop and mobile;
- motion is smooth in both scroll directions, accessible, reduced-motion aware, and does not degrade large operational lists;
- generated/tracked clutter is classified and cleaned without deleting user-owned work;
- the full test suite, isolated PostgreSQL suite, hosting build, BUILD_ID check, and diff check pass freshly;
- the final report separates verified facts, remaining uncertainty, deferred production work, and exact deployment boundaries.

## 14. Deferred Production Work

After this local phase, production work still requires separate authorization and these prerequisites:

1. obtain a provider-supported trusted TLS/backup route or create and verify a provider-side backup;
2. prove the backup can be restored into an isolated PostgreSQL 18 database;
3. run hierarchy and lifecycle migrations as dry runs against that restored copy;
4. produce reconciliation and exception reports;
5. approve a production maintenance, rollback, and deployment plan;
6. upload only after a fresh release candidate passes and the user explicitly authorizes deployment.

Until then, the correct statement is: locally designed and tested candidate, not deployable production release.

# System Hardening, Cleanup, Mapping, and Deployment Design

## Purpose

This design turns the full-system audit into four controlled releases. It fixes access boundaries, attendance and registration races, biometric trust, unsafe error responses, dead code, oversized files, and hosting waste without combining every risk into one unmanageable deployment.

The releases are intentionally separate:

1. Security and attendance correctness.
2. Dead code, unused data, and misleading names.
3. Safe file separation and complete system mapping.
4. Hosting-package and browser-security hardening.

Each release must be independently testable and reversible. A later cleanup or refactor must never be required for an earlier security fix to work.

## Locked Decisions

- Office HR can manage employees only in the office assigned to that HR account.
- Regional HR must be assigned to the Regional Office. Regional HR can manage every division within that Regional Office, but cannot manage employees assigned to Gensan, Cotabato, or any other office.
- Regional Administrator access remains system-wide.
- HR, including Regional HR, cannot view or change office maps, coordinates, radius, or other location settings.
- Location fields must be removed from server responses sent to HR. Hiding map controls in the page is not sufficient.
- Liveness, blink, and motion decisions are removed. Anti-spoofing remains and is decided by the server.
- The attendance PIN remains unchanged.
- Employee ID remains optional. Internal person ID is the required attendance-correction identity.
- Public registration remains subject to administrator approval.
- Existing employees cannot silently overwrite or re-enroll an existing record through the create path.
- PostgreSQL remains the only authoritative data store.
- Current `.next`-only SmartASP deployment method remains.

## Selected Approach

A single large release was rejected. It would mix security behavior, database changes, dependency removal, structural refactors, and hosting changes. A failure would be difficult to isolate and rollback.

Two large releases were also rejected because attendance correctness and structural cleanup would still be mixed.

Selected approach is four releases with fresh tests and a deployment gate after each. This costs more release steps but gives clear evidence, smaller failure scope, and safer rollback.

## Release 1: Security and Attendance Correctness

### HR office ownership

Every HR account has an assigned office ID, including Regional HR. The account type controls how much of that office it can use:

- Office HR can manage employees whose saved office ID equals the HR office ID.
- Regional HR can manage employees whose saved office ID equals the Regional Office ID. All divisions under that office are allowed.
- Regional HR receives no system-wide fallback.
- Regional Administrator behavior is unchanged.

All employee, attendance, DTR, workforce, correction, approval, review, and export routes must use one shared office check. Individual routes must not invent weaker versions of the rule.

Existing Regional HR accounts with no office assignment receive no employee access until a Regional Administrator assigns the Regional Office. They are not temporarily granted global access.

### HR location privacy

Only authorized administrator routes may return office latitude, longitude, radius, map configuration, or equivalent location fields.

HR-facing office responses contain only fields needed for employee and workforce work, such as office ID, name, divisions, and allowed work-policy fields. HR pages contain no map or location editor. Direct HR requests for location settings return forbidden or a response without those fields.

Public, kiosk, and HR office responses do not return raw office coordinates or radius. The kiosk sends its measured location and selected office ID; the server loads the protected office geometry and performs the distance check. An HR user cannot bypass the restriction by calling a less protected office endpoint.

### Attendance correction identity

Attendance correction requires `personId` and date. Employee ID is optional display and search data.

Before any correction, the server loads the saved person record, checks that person's saved office against the signed-in user's allowed office, and writes the saved name, office, division, and Employee ID. Browser-supplied copies of these fields are ignored.

Correction review, deletion, and approval routes must also load the existing attendance record and verify its saved office before changing it.

### Concurrent attendance and partial saves

PostgreSQL must reserve one employee for one attendance operation before reading cooldown state. The reservation must work even when that employee has no earlier lock or attendance row. Two first scans arriving together cannot both pass.

For an accepted scan, these writes occur in one database operation:

- raw attendance entry;
- daily DTR projection;
- accepted scan-history entry;
- updated cooldown state.

Either all accepted-scan writes commit or none commit. The API must not report failure after leaving a successful attendance row behind.

Rejected-scan history remains separate because no attendance is being committed. Failure to write rejected-scan history does not change the rejection result, but it is logged safely for maintenance evidence.

### Concurrent registration and create-only enrollment

Registration performs the final duplicate comparison and insert while the database allows only one biometric enrollment decision at a time. Two simultaneous requests cannot register the same face under different people.

The create path uses a plain insert. It removes `existing = null`, unreachable existing-record branches, and `ON CONFLICT(id) DO UPDATE`. A duplicate identity or duplicate face returns a clear conflict and changes no existing person, descriptor, photo, or attendance record.

### Server-controlled anti-spoofing

All liveness model loading, liveness scores, blink checks, motion checks, temporal-liveness decisions, request fields, response fields, UI messages, configuration, models, and isolated tests are removed. Enrollment and attendance must have no active liveness dependency.

Anti-spoofing remains mandatory for attendance and runs on the server. The browser may use its own anti-spoof result only for early capture feedback, but it does not send an approval score and can never approve a scan. The server always makes the final anti-spoof decision.

If the server anti-spoof model is missing, disabled, or fails to run, attendance fails safely. A separate clearly named production setting controls server anti-spoofing. It is not coupled to removed liveness behavior.

Removing liveness reduces the number of independent spoof signals. This is accepted only because server anti-spoofing becomes mandatory and replay-photo testing is a release gate.

### PIN behavior

Current attendance PIN behavior remains. No PIN format, hashing, enrollment, screen flow, or retry behavior changes in this work unless a focused test proves an existing correctness bug.

### Safe error responses

Expected user errors use explicit safe messages and correct status codes. Unexpected errors are logged on the server with a tracking ID and return a generic message containing that ID.

Database messages, SQL text, file paths, stack traces, connection details, native-module details, and internal exception text never reach public, HR, or administrator clients.

High-risk public routes receive focused tests that force an internal failure and prove that a known secret-like error string is absent from the response.

## Release 2: Dead Code, Unused Data, and Misleading Names

### KV removal

The application no longer uses external KV or Redis. The remaining `lib/kv-utils.js` implementation is only an in-process memory map used for short staff-profile caching, plus attendance invalidations for cache keys that are never written.

Remove the staff-profile cache so permission changes and account disablement take effect on the next request. Remove attendance invalidations, `lib/kv-utils.js`, its tests, and all exports and imports including `getKvClient`, `kvMget`, `kvKeys`, `kvIncr`, `kvIncrWithExpire`, and `kvExpire`.

The added database read per authenticated staff request is accepted in exchange for immediate permission correctness. Database performance must be measured in route tests before adding any replacement cache.

### `biometric_index` removal

Recognition and duplicate matching read descriptors from person records, not `biometric_index`. The extra table is maintenance overhead and misleading evidence.

Removal occurs in two deployments:

1. Stop every read, write, sync, count, report, and test dependency. Maintenance counts use the authoritative person descriptors.
2. After backup and a complete reference search, apply a database migration that removes `biometric_index`.

The table is not removed in the same deployment that first stops using it. Rollback remains possible during the proof period.

### Client data-store cleanup

`lib/data-store.js` keeps only active server API behavior. Remove unreachable `localStorage` person and attendance storage, fallback branches guarded by the hardcoded server flag, and unused subscriptions.

Delete the unused public-person subscription route after proving no page, worker, script, test, or external documented workflow calls it. Unrelated browser storage for theme, kiosk identity, sidebar state, or other active UI preferences remains.

### Maintenance evidence v2 naming

Maintenance Evidence v2 remains. It is not removed as an obsolete benchmark.

Add `/api/admin/maintenance-evidence` as the accurate route name and update the active client. Keep `/api/admin/biometric-benchmark` as a thin compatibility route for one release, with no duplicate business logic. Remove the old route in the following release after request logs and repository search show no caller.

Internal components, functions, labels, tests, and documents use “maintenance evidence,” not “biometric benchmark,” unless they describe historical compatibility.

### Holiday correction

National Heroes Day is calculated as the last Monday of August for each requested year. Tests include years where the date is and is not August 26. This change does not claim that every other movable Philippine holiday is correct; other seeded dates receive a separate evidence check before changes.

### Package and PostgreSQL cleanup

Remove `framer-motion` from runtime dependencies, lockfile, test setup, and documentation because no runtime file imports it.

Remove unused `postgresEnabled` imports immediately. Remaining active checks are reviewed against the PostgreSQL-only design; stale local-mode branches and messages are removed only after focused tests preserve the intended failure behavior.

### Unreachable module cleanup

Delete complete unused chains, including related isolated tests, mocks, exports, and stale documentation:

- `components/ErrorBoundary.jsx` and its test, because runtime never mounts it;
- `components/biometrics/GuidedCapturePanel.jsx`;
- `components/biometrics/FaceSizeGuidance.jsx`, while keeping the active face-size guidance library;
- `components/kiosk/FaceOverlayCanvas.jsx`;
- `lib/attendance/index.js`;
- `lib/biometrics/shadow-benchmark.js` and tests that only exercise that unused module;
- `lib/raw-attendance-workbook.js` and tests that only exercise that unused generator.

The active DTR workbook, active face-size rules, Maintenance Evidence v2, and production error handling remain.

After deletion, a repository-wide search must find no import, mock, package entry, documentation claim, or route reference to the deleted code.

## Release 3: Safe File Separation and Complete System Mapping

Behavior changes are completed and tested before structural file moves. Each move changes one ownership boundary at a time and runs the same tests before and after.

### Workforce records route

The route becomes a small request and response layer. Separate modules own holidays, leave, official orders, and work policy. One shared office-access module owns staff scope checks.

Database queries apply office scope before loading rows. Conflict checking and saving occur together so simultaneous requests cannot create overlapping records.

### Employee editor

Separate employee identity, schedule, photo, biometric state, access code, and employment actions into focused components. One controller owns form loading, validation, saving, and lifecycle state.

The public component interface, visible layout, keyboard behavior, validation messages, and save order remain stable unless a separately tested bug requires change.

### Kiosk loop

After liveness removal, separate camera capture, anti-spoofing, attendance submission, retry and cooldown handling, and user-visible result state. Preserve PIN flow, timeouts, retry limits, cancellation, camera cleanup, and messages.

### Registration view

Separate employee details, capture, review, completion, and shared registration state. Preserve administrator approval, optional Employee ID, duplicate blocking, photo behavior, and completion display.

### Attendance processor

Separate input checks, authoritative server capture, person matching, office and workforce checks, and accepted-attendance commit. The main processor coordinates these parts and does not contain duplicate policy decisions.

### Refactor acceptance

Success is not measured by an arbitrary line limit. Each resulting module must have one clear purpose, a narrow interface, focused tests, and no unexplained change in result ordering, errors, timing, or permissions.

### Complete system map

The final mapping covers all first-party application source, configuration, migrations, scripts, and tests. Generated output, installed dependencies, `.git`, `.next`, model binaries, and prior Graphify output are listed as exclusions rather than falsely claimed as reviewed source.

Deliverables:

- `docs/architecture/system-map.md`: human-readable screens, routes, permissions, work paths, database writes, external services, scheduled work, and failure paths.
- `docs/architecture/source-inventory.md`: every first-party file and every function-like definition, including named functions, route handlers, components, hooks, methods, and anonymous callbacks identified by file and line.
- `docs/architecture/dependency-findings.md`: connected paths, unreferenced paths, test-only paths, repeated queries, repeated logic, broad `SELECT *` use, load-all-then-filter behavior, dead branches, and uncertain dynamic references.
- Updated CodeGraph and Graphify queries after code stabilizes, with the graph date and commit recorded in the documents.

Machine inventory proves coverage; human-readable maps explain meaning. Manually explaining every anonymous callback in prose would create a large stale document without improving understanding, so the source inventory records every function while the system map explains important work paths and ownership.

Every claimed unused item requires both graph evidence and repository reference search. Dynamic imports, route conventions, scripts, tests, configuration references, and documentation contracts must be checked before deletion.

## Release 4: Deployment Hardening

### Hosting artifact

Keep the current `.next`-only SmartASP workflow.

The hosting build must:

- remove `.next/cache` after a successful build;
- conditionally treat `openvino-node` as an external server package only when `INCLUDE_OPENVINO_RUNTIME=true`;
- fail if OpenVINO files remain when that setting is false;
- fail if required OpenVINO native files are missing when that setting is true;
- scan for directory links or junctions that FileZilla cannot upload correctly;
- verify traced runtime files exist as real files;
- report total size and largest folders;
- record Node.js version and require Node.js 22 for release proof.

No arbitrary total-size target is set before the first clean build establishes an honest baseline. Acceptance is based on absence of cache, absence of disabled OpenVINO runtime, complete required files, and a recorded size comparison.

### SmartASP visitor address and request limits

SmartASP sits between the visitor and application. It forwards the visitor address in a request header. Current code ignores that header unless proxy trust is enabled; when no trusted address remains, safety logic can reject every rate-limited login, registration, attendance, or PIN flow.

Production proxy trust is enabled only after confirming that SmartASP overwrites the forwarded header and visitors cannot provide an untrusted value. Test from at least two external devices and prove that they receive separate request-limit buckets.

If SmartASP does not protect the header, do not enable blind trust. Use a server-provided connection value or another provider-supported trusted header. Local development and direct deployments do not inherit production proxy trust.

### Browser permission policy

Content Security Policy is a browser permission list. Current report-only policy blocks nothing and has no central report receiver.

Deployment occurs in two steps:

1. Correct the source list, including administrator map tiles and biometric model needs. Add a small report endpoint with a strict body limit. It accepts only required policy-report fields and stores cleaned source and page paths without query strings, face data, secrets, or the original raw request body. Run all major screens in reporting mode and review violations.
2. Change to an enforced `Content-Security-Policy` header after valid application traffic is clean. Keep only required sources and retain safe violation reporting.

Complex per-request script keys are outside this release because they can force dynamic rendering in Next.js and materially change caching and performance. They require a separate measured design if the enforced baseline is insufficient.

### Deployment order

1. Back up PostgreSQL and persistent employee photos.
2. Prove backup files are readable and record restoration steps.
3. Run focused tests and full `npm test`.
4. Run database route tests only with `FACEID_TEST_DATABASE_URL` targeting an isolated `faceid_rc_*` database. Never fall back to `DATABASE_URL`.
5. Run `git diff --check`.
6. Run `npm run build:hosting` with production-like settings.
7. Inspect hosting-package size, cache exclusion, OpenVINO exclusion or inclusion, native files, and directory-link scan.
8. Apply only backward-compatible database changes needed by that release.
9. Upload the package and production settings.
10. Restart the application.
11. Test health, administrator login, HR limits, attendance, correction, registration, DTR, photos, exports, maintenance evidence, and request limits.
12. Test a genuine face and a printed or displayed face replay against server anti-spoofing.
13. Send two attendance requests for one employee at nearly the same time and prove only one succeeds.
14. Review server logs before declaring the release healthy.

### Rollback

Keep the previous working hosting package. Database changes remain compatible with the previous application version until the new release is proven.

On critical failure, restore the previous package first. Run a database rollback only when the failed release requires it and the rollback has been tested. Destructive cleanup such as dropping `biometric_index` occurs only after a separate backup and proof window.

## Error and Failure Rules

- Missing or invalid staff session returns 401.
- Correctly signed-in staff requesting another office returns 403.
- Missing Regional HR office assignment returns no employee access and a clear administrator-facing repair message.
- Invalid user input returns a safe 400-series message.
- Duplicate attendance or cooldown returns the existing safe operational result.
- Anti-spoof model failure rejects attendance and logs a tracking ID.
- Unexpected server failure returns a generic 500 response with a tracking ID.
- Failed accepted-attendance write leaves no partial accepted record.
- Failed optional maintenance or rejected-scan logging never exposes internal details.

## Testing Strategy

Tests are written before behavior fixes where practical.

### Permission tests

- Gensan HR cannot read or change Cotabato employees.
- Cotabato HR cannot read or change Gensan employees.
- Regional HR can work across divisions inside Regional Office.
- Regional HR cannot access employees from another office.
- Office and Regional HR responses contain no coordinates, radius, map configuration, or location-setting values.
- Direct HR location-setting requests are denied.
- Existing Regional HR without an office assignment receives no employee access.

### Attendance tests

- Employee ID is optional in correction.
- Correction uses the person record's saved office and identity.
- Browser-supplied office, name, and Employee ID cannot replace saved values.
- Two simultaneous first scans produce one accepted attendance and one cooldown result.
- A forced failure in daily DTR or accepted scan history leaves no raw attendance row.
- Correction, deletion, and review cannot cross office boundaries.

### Registration and biometric tests

- Two simultaneous same-face registrations create at most one person.
- Enrollment never updates an existing person through conflict handling.
- Liveness fields and models are absent from active requests, responses, configuration, and UI.
- Client anti-spoof values cannot approve attendance.
- Missing or failing server anti-spoofing rejects attendance.
- Genuine-face and replay-photo test results are recorded for release review.

### Cleanup tests

- No active KV import or attendance cache invalidation remains.
- Recognition and duplicate matching pass after `biometric_index` reads and writes are removed.
- Active server data calls pass after local fallbacks are deleted.
- Maintenance Evidence v2 works through the new route and temporary compatibility route.
- National Heroes Day is correct for 2024, 2025, and 2026.
- Full tests and build pass without `framer-motion` and deleted modules.

### Refactor and map tests

- Same focused behavior tests pass before and after every extraction.
- Route contracts, ordering, messages, and permission results remain stable.
- Source inventory accounts for every included first-party file and function-like definition.
- Unreferenced and test-only findings include evidence and uncertainty labels.

### Deployment tests

- Hosting package contains no `.next/cache`.
- Disabled OpenVINO runtime is absent.
- Required traced files are real files, not unresolved links.
- Enforced browser policy allows all approved application paths and blocks an unapproved test source.
- Two external devices receive separate request limits in production-like testing.

## Scope Boundaries

This work does not:

- replace the attendance PIN;
- change face-match thresholds without separate labeled evidence;
- claim that anti-spoofing alone defeats every presentation attack;
- perform mass re-enrollment;
- change administrator approval requirements;
- switch away from PostgreSQL;
- switch away from the `.next`-only SmartASP workflow;
- redesign application screens during structural extraction;
- add a replacement cache without measured need;
- document installed dependencies or generated build output as if they were first-party application logic.

## Acceptance Criteria

The full program is complete only when:

1. Every HR employee and workforce path enforces the assigned-office rule on the server.
2. Regional HR can use all Regional Office divisions and no outside office.
3. No HR response or screen exposes office map, coordinates, radius, or location settings.
4. Attendance correction works without Employee ID and trusts saved person data.
5. Simultaneous first attendance requests cannot both pass cooldown.
6. Accepted attendance cannot be partially committed.
7. Simultaneous same-face registration cannot create two people.
8. Enrollment create path contains no unreachable update behavior.
9. Liveness is removed and server anti-spoofing is mandatory.
10. Unexpected internal errors do not reach clients.
11. KV leftovers, dead local storage, unused dependencies, unused imports, and approved unreachable modules are fully removed.
12. `biometric_index` first becomes unused, then is removed in a later backed-up deployment after the proof period.
13. Maintenance Evidence v2 has an accurate active name and temporary compatible route.
14. National Heroes Day is year-correct.
15. Large files are separated without changing their approved behavior.
16. System map and source inventory cover all declared first-party files and functions, with explicit exclusions and uncertainty.
17. Hosting package excludes build cache and disabled OpenVINO runtime.
18. Production request limits identify visitors safely behind SmartASP.
19. Browser permission policy is tested and enforced.
20. Focused tests, full tests, database route tests, diff check, hosting build, package inspection, and production smoke checks have fresh recorded evidence.

## Implementation Planning Boundary

This master design produces four separate implementation plans and review cycles, beginning with Release 1. Release 2 does not begin until Release 1 passes its release gates. Release 3 does not begin until behavior is stable. Release 4 uses the final stabilized dependency and runtime graph.

# Maintenance Evidence v2 Design

## Purpose

Replace the original pilot-era biometric benchmark with a production maintenance report that tells an administrator what is known, what is failing, and what cannot yet be concluded. The report must support safe improvement of the current access-code-first 1:1 attendance flow and later 1:N evaluation without overstating biometric accuracy.

This change is diagnostic and corrective. It does not change biometric thresholds, promote captured descriptors, require re-enrollment, write to the production database, or add a database migration.

## Problems Being Corrected

The current report can produce false confidence:

- `blocked_claimed_employee_mismatch`, the main 1:1 mismatch outcome, is not classified as a hard biometric block.
- Failed 1:1 matches keep resolved identity in `match_debug`, while top-level `person_id` and `employee_id` can be blank or contain the claimed four-digit access code.
- The reenrollment query counts only `blocked_no_reliable_match`, so genuine 1:1 mismatch evidence is omitted.
- Office filtering occurs after the scan-event query limit, which can under-sample an office and distort its report.
- The report does not disclose when the selected window contains more rows than were loaded.
- Acceptance rate mixes biometric success with attendance policy, location, cooldown, and completed-day outcomes.
- Zero spoof blocks is displayed without labeled spoof evidence and can be mistaken for proof of effective presentation-attack detection.
- The `twoFrameFallbackRate` label is misleading when two-frame verification is already required.
- Browser acceptance comparisons mix capture quality with operational blocks and are not recognition accuracy.
- The operational gate can pass without labeled genuine/impostor data, broad employee coverage, or a measurable false-match rate.
- `/api/health` proves only that the Node process can return JSON. `/api/system/status` is hidden, partially duplicated, and does not prove migrations, model inference, storage permissions, daily-summary freshness, or database latency.

## Selected Approach

Implement Maintenance Evidence v2 through the existing authenticated biometric benchmark endpoint to avoid unnecessary route churn. Keep `GET /api/admin/biometric-benchmark` as the stable client contract, add `version: 2`, and replace the misleading report structure.

Use three layers:

1. A pure maintenance-evidence module classifies events and calculates honest metrics.
2. The route authenticates, scopes database reads, collects runtime checks, and supplies normalized records to the pure module.
3. A compact responsive maintenance panel presents actionable status first and places detailed evidence in expandable sections.

Regional administrators receive system-wide runtime checks. Office-scoped administrators receive only their office's biometric and reporting evidence. Filesystem paths, secrets, connection strings, raw descriptors, and raw frames are never returned.

## Data Flow

1. Resolve the admin session and office scope.
2. Resolve the requested Manila calendar window.
3. Query scan events with office scope inside SQL, before ordering and limiting.
4. Query the exact scoped event count separately.
5. Load explicit scan-event columns rather than `SELECT *`.
6. Normalize historical identity from `match_debug.resolvedPersonId`, `match_debug.resolvedEmployeeId`, and `match_debug.officeId` when canonical top-level fields are missing or contain the claimed access code.
7. Load current active, approved employees within the same scope.
8. For regional administrators only, run read-only system checks.
9. Build the versioned report with explicit denominators and evidence limitations.
10. Return JSON with no cacheable or mutable biometric material.

The route will retain `dynamic = 'force-dynamic'` as an explicit diagnostic contract. Next.js 16 GET Route Handlers are uncached by default, so no additional caching layer will be introduced.

## Telemetry Attribution Repair

Future scan events must persist resolved 1:1 identity when matching reached a known access-code owner, even when the face did not match. `writeScanEvent` will prefer:

- explicit matched person fields;
- resolved identity from match debug;
- existing entry fields only as a final fallback.

The four-digit claimed access code remains in restricted match diagnostics but must not be treated as an employee ID. Historical rows are normalized at report time, so useful existing production evidence is recovered without rewriting production data.

An unattributable event stays unattributed. The report must not guess an identity.

## Outcome Taxonomy

Every event belongs to exactly one category, using ordered classification:

1. `attendance_written`: accepted attendance record.
2. `identity_resolved_operational_block`: identity verified, then blocked by duplicate timing, completed day, geofence, lifecycle, office configuration, or workforce policy.
3. `claimed_identity_mismatch`: entered access code resolved to a person, but biometric comparison failed.
4. `other_biometric_failure`: no reliable match, ambiguity, unstable descriptor burst, multiple faces, weak descriptor support, or missing active biometric samples.
5. `capture_quality_failure`: missing frames, invalid face size, pose, centering, or server embedding failure before a usable comparison.
6. `liveness_observation_block`: liveness, anti-spoof, or missing-liveness block. This is an observed block count, not a presentation-attack accuracy claim.
7. `credential_failure`: missing, invalid, or unknown access code.
8. `location_or_policy_block`: missing GPS, location policy, field-duty policy, or attendance policy failure before successful attendance writing.
9. `system_or_rate_limit_failure`: rate limit, database/runtime failure, or unknown server block.
10. `unknown`: unrecognized legacy outcome, surfaced as telemetry debt.

Decision-code counts remain available in detailed JSON, but UI uses these stable categories to avoid dozens of low-value rows.

## Metric Contracts

### Evidence completeness

- Total scoped events in the selected window.
- Loaded events used for detailed calculation.
- Evidence coverage rate.
- Truncation flag.
- Identity-attribution coverage.
- Server-authoritative embedding coverage.
- Match-distance coverage.
- timing coverage.
- capture-diagnostics coverage.
- unknown-outcome count.

If the event window is truncated or critical telemetry coverage is insufficient, the report cannot declare a healthy verification status.

### 1:1 verification evidence

The verification denominator contains only events that reached a biometric comparison or a confirmed post-match outcome. Access-code errors, capture failures, GPS failures, rate limits, and unrelated policy failures are excluded.

Report:

- verified identity count and rate;
- claimed-identity mismatch count and observed mismatch rate;
- other biometric failure count and rate;
- accepted-distance median and p95;
- mismatch-distance median and p05/p50;
- observed threshold median and range;
- threshold headroom distribution;
- repeated attributed mismatch candidates;
- current-employee population coverage.

The mismatch rate is a production retry/failure proxy, not FNMR. A mismatch can still mean a wrong access code, another person, poor capture, or a weak enrollment. The report must never label it a confirmed false rejection without supervised identity labels.

The report must not calculate or imply FAR, FMR, FNMR, or an "exact threshold" from unlabeled operational scans. `calibration.status` remains `unavailable` until labeled genuine and impostor samples exist. Threshold recommendations remain `null`.

### Capture and performance

Report capture failures, face-area distribution, burst-quality distribution, device class, browser, facing mode, and orientation. Device/browser rows show biometric failure, capture failure, telemetry coverage, and latency; they do not show generic attendance acceptance as recognition accuracy.

Report p50 and p95 for total server time, embedding, matching, database read, and database write. Report actual server match-mode distribution using names such as `two_frame_required`, `single_frame_fast`, and `two_frame_fallback`; do not display a standalone fallback percentage without its denominator.

### Population and follow-up

Report active approved employees, employees represented by verified scans, coverage percentage, attributed repeated mismatch candidates, missing-biometric employees, and unattributed failures.

Pending approval is an approval queue, not a reenrollment queue. Biometric follow-up contains only active approved employees with no biometric samples or repeated attributed biometric failures. It is a review list, never an automatic re-enrollment command.

## Maintenance Checks

Regional maintenance evidence includes read-only checks for:

- PostgreSQL connectivity and measured query latency;
- PostgreSQL server version without credentials or host disclosure;
- current runtime record counts;
- repository migration filenames compared with `schema_migrations`;
- configured storage, directory existence, and read/write permission flags without exposing the storage path;
- Human model-file readiness;
- OpenVINO configuration and required model-file readiness, clearly separated from inference verification;
- Node version, process uptime, environment name, and available Next build ID;
- required session, PIN-salt, and cron-secret presence as booleans only;
- yesterday's raw-attendance person count compared with daily-summary rows;
- newest daily-summary update time and stale/missing summary count.

Maintenance evidence must not invoke the cron route, model inference, database writes, filesystem writes, threshold updates, or biometric profile updates. Daily-summary parity measures whether the result exists; it does not claim which scheduler invocation produced it.

`/api/health` remains a shallow public process-liveness endpoint. Its response will identify itself as process liveness and must not claim database or production readiness. Useful regional checks move into the authenticated maintenance report. The redundant hidden `/api/system/status` route can be removed after the maintenance panel consumes the replacement data and route tests prove authorization boundaries.

## Status Model

There is no single generic "operational gate passed" label. Report independent statuses:

- `runtime`: healthy, warning, failing, or unknown;
- `telemetry`: sufficient, partial, insufficient, or truncated;
- `verification1to1`: stable, warning, failing, or insufficient;
- `capture`: stable, warning, failing, or insufficient;
- `performance`: stable, warning, failing, or insufficient;
- `populationCoverage`: sufficient, partial, or insufficient;
- `dailySummary`: fresh, stale, failing, or unknown;
- `calibration`: unavailable, collecting, or ready.

Every status includes the evidence value, denominator, rule, and plain-language explanation. Missing data produces `unknown` or `insufficient`, never `pass`.

Initial operational thresholds remain diagnostic rules, not biometric threshold recommendations. Their constants live in one named policy object and are covered by tests.

## User Interface

Rename the panel to **System maintenance** with subtitle **Biometric, data, and reporting evidence**.

Primary view contains:

- selected period and scoped event count;
- four compact status cards: Runtime, Telemetry, 1:1 verification, Daily summaries;
- an ordered "Action required" list containing only failing, warning, truncated, or unknown checks;
- period controls, refresh, and JSON export.

Expandable details contain:

1. 1:1 verification and distance evidence;
2. event-category breakdown;
3. telemetry completeness;
4. capture and device evidence;
5. performance timings;
6. employee coverage and biometric follow-up;
7. regional-only runtime and daily-summary checks.

Remove these current headline elements:

- WFH accepted rate;
- generic accepted-record percentage;
- no-match-only headline;
- spoof-block percentage presented as safety evidence;
- standalone two-frame fallback percentage;
- browser acceptance rate;
- full stale employee-ID list;
- pilot rollout wording;
- generic pass badge.

The panel follows the existing Civic Operational Minimal design: compact hierarchy, no decorative charts, no duplicate explanatory cards, 44-pixel minimum interactive targets, keyboard-accessible disclosure controls, visible loading/error/refresh states, horizontal overflow avoided on mobile, and dense evidence shown as stacked records below desktop breakpoints.

Automatic refresh pauses while the document is hidden, aborts stale requests when the period changes, and prevents overlapping fetches.

## API Contract

The authenticated endpoint returns:

```text
{
  ok,
  version: 2,
  generatedAt,
  window,
  scope,
  evidence,
  statuses,
  actions,
  verification1to1,
  capture,
  performance,
  population,
  breakdowns,
  calibration,
  system
}
```

`system` is `null` for office-scoped administrators. Report JSON contains aggregate data and authorized follow-up identifiers only. It contains no descriptors, frames, coordinates, secrets, connection strings, session material, or raw filesystem paths.

## Error Handling

- Authentication and scope failure return 401 or 403 without diagnostic data.
- Database failure returns a stable 500 message and logs only safe error metadata server-side.
- A failed optional regional check appears as an `unknown` check and does not erase otherwise available biometric evidence.
- Unknown legacy decision codes are counted and shown as telemetry debt.
- A truncated event window remains viewable but cannot receive a stable/pass verification status.
- Refresh failure keeps the last successful report visible and shows a non-destructive stale-data warning.

## Testing Strategy

Tests are written before production changes.

Unit regression tests prove:

- claimed-person mismatch is a biometric failure;
- resolved identity is recovered from match debug;
- a high mismatch rate cannot produce a stable verification status;
- missing, truncated, or unlabeled evidence cannot produce a calibration claim;
- event categories are mutually exclusive and exhaustive;
- each displayed rate uses the documented denominator;
- two-frame-required mode is reported accurately;
- pending approval is separate from biometric follow-up.

PostgreSQL route tests prove:

- regional and office authorization;
- office scope is applied before the event limit;
- total versus loaded event counts and truncation;
- runtime checks expose no secrets or storage path;
- the report performs no database writes;
- daily-summary parity uses scoped, read-only data.

UI tests prove:

- primary status and action-required hierarchy;
- misleading pilot metrics are absent;
- detailed evidence remains accessible through disclosures;
- office users do not receive regional runtime details;
- refresh errors retain the last successful report;
- period changes cancel stale requests;
- mobile rendering has no required horizontal table layout.

Final verification requires focused tests, full `npm test`, `git diff --check`, and `npm run build:hosting`. A successful build is local release evidence only; it does not itself prove production deployment readiness.

## Safety and Non-Goals

This phase does not:

- read from the local test database when assessing production evidence;
- write to or migrate the production database;
- change active biometric thresholds;
- modify active Human or OpenVINO descriptors;
- collect or store raw scan frames;
- automatically promote accepted scans into active profiles;
- force mass or targeted re-enrollment;
- claim 1:N readiness;
- claim 99% accuracy;
- calculate FAR/FMR/FNMR from unlabeled operational events;
- change the production scheduler's invocation method.

Adaptive biometric samples and supervised threshold calibration require a separate approved design after Maintenance Evidence v2 proves telemetry attribution, completeness, and population coverage.

## Acceptance Criteria

Maintenance Evidence v2 is accepted only when:

1. Claimed-person mismatches are visible in the correct category and denominator.
2. Historical and future attributable mismatch events resolve to the correct employee without database rewriting.
3. Office-scoped reports cannot be distorted by regional rows consumed before the limit.
4. Truncated, incomplete, or unlabeled evidence cannot display a stable/pass calibration conclusion.
5. Headline UI contains only actionable maintenance status.
6. Detailed JSON provides enough evidence to investigate capture, matching, timing, population, and reporting freshness.
7. Regional runtime checks are read-only and disclose no secrets, connection details, raw paths, descriptors, frames, or coordinates.
8. Pending approval and biometric follow-up are separate concepts.
9. No production database write, migration, biometric update, threshold update, or cron invocation occurs while loading the report.
10. Focused tests, full tests, diff checks, and hosting build complete with fresh evidence.

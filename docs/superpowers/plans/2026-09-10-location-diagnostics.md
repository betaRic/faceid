# Automatic location diagnostics implementation plan

Approved scope: automatic reporting only. No Test this device control or employee
questionnaires. Unknown connection details stay unknown; administrator-only review.

Goal: compare observed startup accuracy and wait times by device/browser/connection.
Architecture: bounded client observations through existing scan-report endpoint and
JSON storage; separate Regional Admin aggregation and dashboard/export section.
Stack: current Next.js, React, PostgreSQL, existing browser geolocation APIs.
Execution workflow: executing-plans, in the existing release worktree.

- [x] Add strict location-report policy and browser metadata with tests for unknown
  APIs, removed private fields, and browser/OS distinctions.
- [x] Instrument location completion with first/best reading, timing, age, result,
  retry and policy metadata; isolate nonblocking reporter from face failure throttling.
- [x] Reuse JSON report table; separate existing phone failures; load bounded location
  rows with explicit truncation, no recommendations from incomplete windows.
- [x] Add Regional Admin dashboard comparison, filters and existing JSON export;
  Today/7 days/14 days. No extra employee controls.
- [x] Test collection, sanitization, aggregation, authorization integration and UI;
  build hosting, review diff and document evidence. No production migration or automatic commit.

Implementation adjustment: bounded 10,000-row diagnostic load rather than unbounded
aggregation. If truncated, suppress rankings and clearly mark incomplete evidence.
Existing 14-day retention and ingestion rate limits remain. Initial observations are
descriptive only, not proof of browser superiority or physical-device identity.

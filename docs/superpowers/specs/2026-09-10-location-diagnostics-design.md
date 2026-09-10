# Automatic location and device maintenance

Status: approved September 10, 2026. Automatic collection only, as clarified by
user. No Test this device button, manual tests, or employee questionnaires.

## Collection

Record one bounded observation for each scan-workspace location startup/retry,
including ready, imprecise, timeout, denied permission, unavailable, unsupported,
and cancelled outcomes. Background refreshes do not inflate startup counts.
Capture first/best accuracy, first-reading and within-limit times, total wait,
reading age, number of readings, attempt number and the applied accuracy/cache
policy. Observe permission opportunistically without awaiting it.

Collect browser family/major version, OS family, inferred device category and
browser-exposed connection details. LAN/Wi-Fi/mobile data stays unknown when the
browser does not expose it. Effective network quality such as 4g never establishes
physical connection type. No automatic hotspot, VPN, GPS-hardware or exact model
identification is claimed. iPad desktop-style user agents are handled separately.

No coordinates, names, employee codes, images, face vectors, network names or
hardware identifiers are included. Random browser-session identifiers are not
physical-device counts. Reported accuracy is uncertainty reported by the device,
not independently measured location error. Permission prompts can add waiting time.

## Storage and delivery

Reuse the existing scan-report JSON table, endpoint, bounded retries, origin and
rate limits, duplicate-ID handling and 14-day cleanup. No new schema migration.
Use separate client queues for location and face-failure observations. Diagnostic
exceptions are isolated and sending is never awaited by location startup.
Existing failure reports remain separate from new location observations.

Regional Admin receives location evidence; office-scoped sessions do not. Report
rows are validated again on read. Query limit is 10,000 reports per selected window,
with explicit incomplete status when exceeded; no claim of full-period coverage
from a truncated result. JSON details are limited to 500 newest rows; aggregates
cover all validated rows loaded. Storage availability failures are displayed as
unavailable rather than zero checks. Offline/closed pages can lose reports.

## Dashboard and export

Extend System maintenance with Location and devices. Add Today/7 days/14 days
choices, retaining the existing month choice with a clear 14-day diagnostics limit.
Filter displayed comparisons by device, OS, browser, connection and app build.
Existing Export JSON exports all groups for the selected period, explicitly stated
in the UI; display filters do not silently change the maintenance export scope.
Show success counts/rates, median and slow-case wait, reported accuracy, separate
failure reasons, and up to 20 matching recent check details.

Keep separate groups for app build and accuracy/cache/timeout policy. A group is
Ready for review only at 30 completed checks over 3 days and 5 browser sessions,
with a known build and complete loaded window. Otherwise show Not enough data or
Incomplete window. Cancelled checks are excluded from completed-check rates and
shown separately; missing numeric values never become zero.

Do not name a universally best browser or connection automatically. Descriptive
comparisons support administrator advice, but equipment and conditions can differ.
Location success does not establish face-recognition accuracy or successful
attendance. No employee controls or changes to attendance decisions are included.

## Verification

Exercise metadata parsing, redaction, outcomes and timing, old-report compatibility,
bounded storage reading, access restrictions, null measurements, policy/build
separation, filter rendering, and nonblocking diagnostic errors. Run focused UI
and contract suites, existing pure checks and hosting build. Device/browser and
production delivery observations remain distinct from mocked test evidence.

## References

https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation/type
https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation/effectiveType
https://developer.mozilla.org/en-US/docs/Web/API/GeolocationPosition

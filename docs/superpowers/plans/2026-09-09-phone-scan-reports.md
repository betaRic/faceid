# Phone scan failure reporting implementation plan

User approved automatic failure recording with attendance rules unchanged.

Goal: capture failures before attendance submission and include them in the
existing Regional Admin report download. No photos, vectors, codes or GPS.

Design: optional fire-and-forget client reporter, strict small-body public
same-origin endpoint, separate 14-day table, bounded regional export. Reports
are explicitly unverified phone observations and never affect attendance or
the existing server-success denominators. No employee attribution from a code.
Session references last only for the page lifetime. Offline/closed-page losses
remain possible; one bounded retry does not guarantee complete delivery.

Alternatives rejected: mixing observations into confirmed scan events would
misrepresent success rates; retaining photos or a persistent offline queue is
unnecessary for this slice. Reuse the existing download rather than another UI.

- [x] Add failing policy, sender, route and capture tests.
- [x] Implement bounded sender and endpoint, separate additive migration 0018,
  retention and regional-only read/export with explicit unavailable/truncated status.
- [x] Connect burst failures and processing errors without changing outcomes.
- [x] Verify tests, isolated database migration/storage and hosting build.
- [x] Update sharing instructions and save a separate Git commit. No upload.

Acceptance: missing/weak captures produce one sanitized report per attempt;
reporter exceptions cannot escape; duplicate retries create one row; excessive
requests/body sizes rejected; exports cannot expose unknown fields or affect
office scopes; missing table reports unavailable rather than empty success.

Verification checkpoint: full `npm test` passed (42 safety, 118 pure checks,
25 contracts, 104 UI checks). Guarded routes passed 109/109 against the separate
test-owned database `faceid_rc_phone_reports_20260909`; existing local employee
test records were not reset. Focused UI checks passed 30/30. Tests cover sender
retry isolation, capture callback failure isolation, privacy allowlists, origin/
size/rate rejection, regional export, duplicate inserts, retention and unchanged
attendance row count. The separate reviewer found no critical/important issue.

Review limits: preview exceptions can lack browser/device context, and body-read
duration relies on the hosting request timeout. Real-phone delivery through the
deployed proxy remains to be checked after upload. No production data was touched.

Hosting build passed under Node 22 with BUILD_ID `Mj0aGPOTMzJhsgmAzgdds`;
the `/api/scan-reports` route is included and native runtime packages materialized.
The changes are saved on `codex/release-1-hardening`; main and production remain
unchanged. The production migration/phone-delivery checks are not claimed complete.

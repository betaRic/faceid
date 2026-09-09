# Scan reliability and separate face memory

## Accepted constraints

Regional Office attendance remains access-code 1:1. No blink, iris-motion,
temporal movement or liveness-model requirement. Server anti-spoofing remains
mandatory. Preserve enrollment, employee identity, photos and attendance.
Deploy only after local verification, after hours on the existing site.

## Implementation sequence

- [x] Reverify the existing Release 1 candidate (attendance transactions,
  office access, safe errors, anti-spoof-only verification) under Node 22.
- [x] Fix verification capture to crop before downscaling; preserve enrollment
  capture behavior and add geometry/call-site regression coverage.
- [x] Preserve server-measured quality metadata and add a separate bounded
  FaceRes candidate store. Collection is disabled by default, best effort after
  successful attendance, and cannot affect attendance acceptance.
- [x] Admit only two-frame original-enrollment successes with strict measured
  quality/anti-spoof evidence, original-reference support and a real comparison
  against other eligible originals. Reject absent evidence. Store no raw photos.
- [x] Bind candidates to enrollment fingerprints, source attendance, pipeline
  fingerprint and collection policy; deduplicate by source/day, cap at 12 and
  expire after 30 days. No promotion or adaptive recognition in this release.
- [x] Provide reproducible offline chronological comparison of original-only
  matching and proposed additional examples; record regressions and improvements
  on the same independently labelled attempts. Never train on a test attempt.
- [ ] Review specification, quality and security; run relevant unit, UI,
  guarded PostgreSQL route and hosting-build checks. Prepare release instructions.

2026-09-09 checkpoint: automated checks and hosting build pass; release guide
is in `docs/scan-memory-release.md`. Capture reviews completed. Final independent
memory review and real-device/security acceptance remain open. The offline tool
is implemented and tested with synthetic data; no real-employee effectiveness
claim is made. Collection remains disabled. Nothing has been deployed.

## Evidence gates, not omitted implementation

No experimental threshold is a validated security threshold. Production
collection remains off until real-device anti-spoof and collection-quality
checks pass. Additional examples must not approve attendance until labelled
later-session evidence establishes benefit and acceptable wrong-person risk.
1:N remains disabled and is a separate later release. No promise of automatic
repair for employees who never match their original enrollment.

## Follow-on work

After the scan release stabilizes: remove confirmed unreachable data-store
branches and unused helpers, measure duplicate-query cost, and record threshold
versions. Do not remove actively referenced modules or mix cleanup with model
changes. Compare enrollment/attendance processing on identical inputs before
changing model configuration; original profiles contain both processing modes.

## Initial experimental limits

One candidate per employee per Manila date, maximum 12 unexpired candidates,
30-day expiry. Candidate store is quarantine only. Sample quality, distance and
competitor margin are experimental selection controls, not proof of identity.
Optional collection failure must never turn accepted attendance into an error.

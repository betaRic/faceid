# Scan reliability candidate: implementation and release gates

Updated 2026-09-09. Worktree: `.worktrees/codex-release-1-hardening`, branch
`codex/release-1-hardening`, based on `edc9b4e`. The scan changes are saved on
this branch; the main checkout is a different version. Nothing in this document
authorizes a production upload. See `scan-report-sharing.md` for the existing
report download and its coverage limits.

## Implemented now

1. Verification crops the original camera frame before resizing. A 1280x720
   landscape frame produces a 436x640 centered face crop instead of approximately
   245x360. Enrollment capture is unchanged. Each burst frame owns its canvas.
   This preserves more image detail; field accuracy improvement is not yet proven.
2. Optional collection runs after a committed, original-enrollment 1:1 success.
   Two server-generated frames must pass experimental quality, original-reference
   support, competitor separation and anti-spoof checks. Missing evidence rejects
   collection. Collection failure does not reverse attendance.
3. Migration `0017_biometric_memory_quarantine.sql` creates a separate table.
   No original enrollment is replaced. Candidates have source attendance,
   enrollment, pipeline and gallery fingerprints and a policy version. No raw
   photos are stored in this table. Numerical vectors are still sensitive data.
4. Maximum one candidate per employee per Manila date, 12 per employee, with
   30-day expiry. Cleanup runs at startup and hourly even when collection is off;
   each pass deletes at most 500 expired or revoked rows. Cleanup is eventual:
   a suspended site waits for restart and a large backlog needs multiple passes.
5. An offline comparison tool measures original-only matching against an
   experimental union of originals and additional examples. It reports both
   improvements and regressions. It does not train a model or change the database.

`BIOMETRIC_MEMORY_COLLECT_ENABLED=false` is the required initial setting.
There is no live candidate reader, promotion, adaptive acceptance or 1:N switch
in this implementation. Access-code 1:1 remains authoritative. Liveness stays
disabled; server anti-spoof stays required.

## Limits that affect the next decision

- A vendor static sample image produced an anti-spoof score of 0.87 in a local
  raw-model smoke check. This was not an end-to-end attendance bypass test.
  It does show that a high model score alone cannot justify trusting a learning
  sample. Do not enable production collection based on unit tests or that score.
- Successful attendance is not an independently confirmed identity label. A
  mistaken acceptance could otherwise teach the same mistake repeatedly.
- Employees who cannot match their original enrollment cannot benefit from a
  policy that learns only from strong original matches. Diagnose those profiles
  separately; this release does not promise to reconstruct missing face detail.
- Pipeline identity is established at model initialization. If enrollment or
  another WASM runtime initializes first, optional collection fails closed for
  that process. Attendance still works. This conservative behavior may reduce
  collection coverage and must be measured before a pilot.
- Collection is best effort, limited to two pending jobs per process. Restarts
  may lose candidates. Gallery comparisons add database/CPU work when enabled;
  they need load measurement before activation.
- The offline tool measures biometric matching only. It does not simulate the
  challenge, camera authenticity, anti-spoof, location or payroll workflow, and
  its naive union is not an approved production recognition policy.

## Local verification

Use Node 22. Test databases must be loopback, test-owned `faceid_rc_*` databases.
Never substitute the application's `DATABASE_URL` for a missing test URL.

```powershell
$env:PATH = 'D:\faceattend-test-data\node-v22.23.2-win-x64;' + $env:PATH
$env:FACEID_TEST_DATABASE_URL = 'postgresql://postgres@127.0.0.1:55432/faceid_rc_scan_memory'
$env:FACEID_TEST_PG_DATA = 'D:\faceattend-test-data\postgres-18'
$env:FACEID_TEST_PG_BIN = 'D:\faceattend-test-data\postgresql-18.4-portable\pgsql\bin'
npm test
npm run test:memory
npm run test:routes
npm run build:hosting
git diff --check
```

The route runner resets only its guarded test database. Files run sequentially
because they share a gallery; concurrency tests inside a file still exercise
simultaneous writes. Run the hosting build after tests to avoid competing for
resources. See the verification record below for actual results, not assumptions.

## Offline comparison input

Run locally with an independently labelled JSON dataset:

```powershell
node --experimental-loader ./tests/postgres/route-loader.mjs scripts/evaluate-biometric-memory.mjs <local-labelled-dataset.json>
```

Required top-level fields:

| Field | Required content |
| --- | --- |
| `pipelineFingerprint` | Same processing fingerprint for examples and probes |
| `thresholds` | Explicit `kioskMatchDistance` and `ambiguousMargin` |
| `cutoff` | Integer epoch milliseconds separating examples from probes |
| `persons` | `id`, at least two original `descriptors`, `biometricModelVersion` |
| `supplements` | `personId`, `sessionId`, `capturedAt`, `pipelineFingerprint`, `enrollmentFingerprint`, `descriptor` |
| `attempts` | Unique `id`, `sessionId`, `timestamp`, `pipelineFingerprint`, `claimedPersonId`, independently established `truePersonId`, `independentlyVerified: true`, exactly two `descriptors` |

Each descriptor must contain 1024 finite numbers with unit norm. An unknown
impostor has `truePersonId: null`. Enrollment fingerprints use the same helper as
the collector. Examples precede the cutoff; probes follow it; training and probe
sessions cannot overlap. Selection requires three distinct Manila days, keeps
the newest example per day and at most four days, and excludes expired examples
from each probe. Input files stay local; output contains aggregate counters and
`productionApproval: false`. No real employee dataset was exported or evaluated
by this implementation.

## Ordered production gates

1. **Establish the actual deployed baseline.** Record deployed build, migration
   ledger and persistent storage paths without exposing secrets. Compare this
   candidate with that version, including the prior Release 1 changes. The live
   version has not been verified, so an exact FileZilla upload manifest is pending.
2. **Complete local/device acceptance with collection off.** On the actual phones
   and intended Android tablet/browser, compare old/new capture using the same
   consenting employees and lighting conditions. Record first-attempt success,
   retries, each failure code and median/p95 time. Include employees with weak
   enrollments, glasses, portrait/landscape, poor lighting, interrupted requests
   and repeated taps. Verify that display, summary, export and DTR agree.
3. **Exercise rejection and continuity.** Confirm wrong access code/face,
   deactivated/pending employees, expired/replayed challenges, printed photos and
   screen replay do not create attendance. Any wrong-person acceptance blocks
   release; zero observed errors alone does not establish a population error rate.
   Preserve the existing authorized attendance-correction fallback.
4. **Prepare the after-hours release.** Take and restore-test a fresh database
   backup; inventory/hash the persistent photos and biometric records; retain
   the previous application package and configuration. Produce an exact package
   and migration list against the verified deployed baseline. Do not upload
   development env files, test data or replace persistent storage.
5. **Apply only the reviewed package and migrations.** Migration 0017 is additive,
   but earlier migrations may also be needed depending on the deployed ledger.
   Never use the test reset script on production. Keep collection false, preserve
   production secrets and storage configuration, restart, then perform authorized
   attendance and DTR smoke checks before staff return.
6. **Rollback on critical failure.** Restore the previous application package
   and its configuration first. The unused additive candidate table can remain.
   Do not restore an old database over newly recorded attendance; reconcile any
   schema problem using the tested rollback procedure and current records.
7. **Consider a separate collection pilot only after evidence.** Agree on
   independently confirmed labels, privacy/retention handling, device anti-spoof
   tests and acceptable latency before enabling it. Compare later sessions
   offline, review errors per employee/device, and report uncertainty. Adaptive
   acceptance and then 1:N need separate designs and acceptance evidence.

After hours reduces disruption; it does not replace backup, rollback or morning
attendance checks. No cleanup/refactor, threshold relaxation, mass reenrollment
or model switch is bundled into this candidate.

## Verification record

- Node v22.23.2: 42 safety and 118 unit checks passed.
- Contract suite: 22/22 passed, including two added evaluator regressions;
  focused memory suite: 19/19 passed (a subset, not additional distinct checks).
- Guarded PostgreSQL routes: 108/108 passed; migration exercised only on test data.
- Capture-focused UI tests: 17/17 passed. Full UI rerun: 99/99 passed across 18
  files. The first full run found a source-comment hygiene failure and a worker
  startup timeout; the comment was corrected and the full rerun passed.
- Hosting build passed; BUILD_ID `aCfULaqrxbpJd4D3BqJQ0`; native runtime packages
  materialized. Subsequent application change only corrected a source comment.
- Real model smoke: descriptor generation, runtime fingerprint and image quality
  returned successfully. The anti-spoof limitation is recorded above.
- Capture spec and quality reviews completed. Memory review found issues fixed
  during implementation; its final independent pass was interrupted by reviewer
  usage limits. Do not label the whole candidate independently approved.
- Real-device acceptance, production backup/restore, exact deployment manifest,
  real employee comparison and production activation remain open.

# VeriFace System Architecture

This document describes the active PostgreSQL application. Historical Firebase and Firestore implementations are not architecture sources.

## Runtime boundary

SmartASP starts `app.js`. The process prepares Next.js in production mode, listens on `process.env.PORT`, and forwards requests to the Next handler. Root `web.config` supplies the hosting port, production mode, public origin, and persistent photo directory.

The browser owns camera preview, capture guidance, location collection, and interaction state. The server owns identity decisions, authorization, biometric embedding, matching, workforce rules, persistence, and audit records.

## Public registration

1. `/registration` renders `RegisterRuntimeApp` and `RegisterView`.
2. Enrollment capture collects guided still frames and capture metadata.
3. `POST /api/persons` validates origin, privacy consent, employee fields, office/division ownership, and rate limits.
4. `buildAuthoritativeEnrollmentPayload` regenerates FaceRes descriptors on the server.
5. `enrollLocalPerson` performs duplicate identity/face checks and writes the person, biometric index, photo metadata, lifecycle state, and audit data transactionally in PostgreSQL.
6. Public submissions are `pending`. Pending, rejected, or inactive people cannot record attendance.
7. Admin/HR directory queries expose pending records according to server-side scope; lifecycle transitions activate, reject, return to review, or deactivate records.

An existing employee registration is blocked. It must not overwrite stored identity, descriptors, photo, or attendance history.

## Attendance

1. `/scan` initializes camera, Human/TensorFlow WASM, location, and verification capture.
2. The browser requests `POST /api/attendance/challenge`.
3. The browser submits the challenge, access code, still frames, location, capture telemetry, and liveness evidence to `POST /api/attendance/v2`.
4. `processAttendanceSubmission` consumes the challenge, regenerates server descriptors, validates capture/PAD/liveness policy, and verifies the face against the person identified by the four-digit access code.
5. The service enforces employee lifecycle, office, geofence/WFH, workforce policy, duplicate-punch, and ambiguity rules.
6. Accepted or rejected outcomes write scan/audit telemetry; accepted outcomes write attendance and update the canonical daily projection.

Recognition and anti-spoofing are separate controls. Server-generated descriptors prevent trusting browser embeddings, but frames, GPS, and temporal liveness evidence still originate from the employee device.

## Employee and biometric maintenance

- `GET /api/persons?mode=directory` provides scoped cursor pagination and lifecycle counts.
- `PUT /api/persons/[personId]` handles authorized identity, assignment, policy, and lifecycle changes.
- `/photo` changes the profile photo without changing biometrics.
- `/access-code` rotates the attendance access code.
- `/reenroll` replaces biometric descriptors only after authorization and duplicate checks.
- Hard deletion is a separate regional-admin command; ordinary deletion deactivates the employee and preserves history.

There is no biometric-reset maintenance route. Existing enrollment remains valid unless controlled re-enrollment is explicitly performed.

## Admin and HR authorization

Shared Regional Admin PIN, named Admin PIN, and named HR PIN authentication converge on signed staff sessions. Login rate limits and audit events are server-side. Regional scope can cross offices; office scope cannot.

Office HR may manage its employees, work policy, workforce records, attendance corrections, and DTR workflows. Office HR must not receive or mutate latitude, longitude, map location, or geofence radius. That boundary exists in both UI and API payloads.

The current persisted organization model supports office and division assignments. The requested regional department/division/section hierarchy is not present in migrations `0001` through `0016`; it remains unfinished work and must not be represented as implemented. Current division filters still validate that the selected division belongs to the selected office.

## Attendance reporting and DTR

`deriveDailyAttendanceRecord` is the canonical daily projection. Daily, table, employee, correction, export, and DTR fallbacks must use the same derivation rules so displayed and exported results agree.

Workforce resolution combines office defaults, employee schedule overrides, flexitime, holidays, leave/CTO/WL, and official orders. `dtr.js` computes the record; `dtr-excel.js` produces the CSC Form 48-compatible workbook from the tracked template.

## Persistence ownership

- `lib/postgres/client.js`: pool and transaction boundary
- `lib/postgres/person-store.js`: employee, biometric index, lifecycle, access code, photo metadata
- `lib/postgres/attendance-store.js`: challenges, attendance writes, daily records
- `lib/postgres/report-store.js`: scoped attendance, audit, and reporting queries
- `lib/postgres/photo-store.js`: atomic persistent-file photo storage and cleanup queue
- `db/migrations`: append-only schema history

Profile-photo bytes live outside `.next` under `App_Data/veriface-files`. Deployments must never replace that directory.

## Optional and operational paths

OpenVINO remains benchmark/shadow-only unless a separately tested migration changes the active model authority. `/api/openvino/smoke` is secret-protected. The PostgreSQL daily-summary cron is secret-protected. Neither path authorizes production changes by itself.

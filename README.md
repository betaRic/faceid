# FaceAttend

FaceAttend is a mobile-first face attendance system for DILG Region XII built with Next.js, React, Tailwind CSS, Framer Motion, Firebase, and protected server routes.

It supports:
- anonymous open-and-scan attendance
- employee enrollment
- public enrollment approval workflow
- office and GPS management
- office schedules and WFH rules
- employee transfer and active/inactive status
- daily attendance summary and CSV export

This repository is the live Next.js implementation. It is no longer the older ASP.NET MVC system.

## Current Scope

The system is designed around these rules:
- one employee belongs to one office at a time
- admin can transfer an employee to another office
- outside-office attendance is blocked unless the assigned office is on WFH for that day
- office schedules default to `8:00 AM - 12:00 PM` and `1:00 PM - 5:00 PM`
- schedules, working days, and WFH days are editable by admin

Supported office structure:
- regional office
- provincial office
- HUC office

## Product Modules

### 1. Navigation
`/`

Main entry page for:
- scan
- registration
- admin login
- system blueprint

### 2. Public Scan Attendance
`/scan`
Compatibility alias: `/kiosk`

Phone-first anonymous attendance mode with:
- one-time biometric runtime boot before camera is shown
- client-side burst capture with server-generated attendance descriptors
- challenge-protected submission to the server
- passive liveness and anti-spoof checks from the verification burst
- server-side identity decision
- server-side GPS / WFH / employee status validation
- office-first candidate narrowing before global fallback

### 3. Registration Wizard
`/registration`

Wizard-based enrollment flow:
1. enter employee details
2. capture face
3. review preview
4. submit enrollment for admin review

Features:
- automatic capture
- employee ID required
- duplicate employee ID blocking
- duplicate face blocking
- guided still frames are re-embedded on the server before biometrics are stored
- pending approval status for public submissions

### 4. Admin
`/admin/login`
`/admin`

Admin features:
- office GPS management
- office schedule and WFH management
- employee CRUD
- employee approval / rejection
- employee activate / deactivate
- attendance summary
- CSV export

## Tech Stack

- Next.js 16
- React
- Tailwind CSS
- Framer Motion
- Firebase Firestore
- Firebase Admin SDK
- `@vladmandic/human` (biometric detection)

## Architecture

The system is intentionally kept lean.

### Client

The client is responsible for:
- camera preview
- live face detection
- capture guidance
- wizard flow and scan UX

### Server

The server is responsible for:
- admin session validation
- office configuration writes
- employee enrollment writes
- employee updates and deletes
- final attendance decision
- geofence validation
- office assignment validation
- active/inactive employee enforcement

### Important Trust Boundary

Current attendance flow:
1. the client detects a face locally
2. the client requests a short-lived attendance challenge
3. the client sends two strict still frames, capture telemetry, PAD scores, and passive burst liveness evidence
4. the server regenerates descriptors from those still frames
5. the server matches identity and decides whether attendance is accepted

This is stronger than trusting browser-generated descriptors. It is still not court-grade assurance because the camera frames, GPS, and passive liveness evidence originate from the employee device.

Current enrollment flow:
1. the client captures guided still frames locally
2. the client submits those frames with capture metadata
3. the server regenerates descriptors from the submitted frames before biometric storage

## Biometric Status

Bluntly:
- this system is much more defensible than the old version
- it is not biometric-industry “fully hardened”
- it is suitable for controlled rollout and pilot use

What is already improved:
- matching no longer relies on name
- inactive employees are excluded
- pending / rejected enrollments are excluded from attendance matching
- ambiguous matches are blocked
- weak captures are rejected
- public scans require verified GPS
- risky scans fail closed through passive liveness, capture quality, and match ambiguity gates
- final attendance identity is now decided by the server

What is still true:
- live detection still happens on the client
- attendance still relies on browser-originated frames, GPS, and passive liveness evidence
- approval and policy controls mitigate risk, but they do not cryptographically prove camera or location authenticity

## Public Enrollment Control

Public enrollment is intentionally allowed, but it is no longer immediately trusted.

- public submissions land as `pending`
- pending and rejected records are excluded from biometric attendance matching
- office admins can review their office submissions
- regional admins can review all submissions
- approval, rejection, and review changes are audit logged

This is the correct compromise for the current browser + Vercel + Firebase architecture.

## Project Structure

```text
app/
  (public)/
    page.jsx
    scan/
    registration/
    login/
    attendance/
    summary/
    kiosk/        # compatibility redirect to /scan
  admin/
  api/
  favicon.ico

components/
  AdminDashboard.jsx
  AdminLogin.jsx
  BrandMark.jsx
  KioskView.jsx
  PlatformNavigator.jsx
  ScanRuntimeApp.jsx
  RegisterRuntimeApp.jsx
  RegisterView.jsx

hooks/
  useAudioCue.js
  useCamera.js

lib/
  admin-auth.js
  admin-directory.js
  attendance-summary.js
  attendance-time.js
  audit-log.js
  biometric-index.js
  client-polling.js
  biometrics/
    enrollment-burst.js
    face-api.js
    oval-capture.js
  biometric-quality.js
  config.js
  data-store.js
  firebase-admin.js
  firebase/
    client.js
  firestore-index-admin.js
  liveness.js
  office-admin-store.js
  office-directory.js
  office-store.js
  offices.js
  person-approval.js
  person-directory.js
  rate-limit.js
  runtime-readiness.js

public/
  audio/
  brand/
  models/
```

## Branding and Assets

Shared branding assets:
- logo: `public/brand/dilg-logo.svg`
- favicon: `app/favicon.ico`
- notification sound: `public/audio/notif.mp3`
- success sound: `public/audio/success.mp3`

## Local Development

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Check deployment environment:

```bash
npm run check:env
```

## Deployment

### 1. Deploy Firestore rules and indexes

This repo now includes `firebase.json`, `firestore.rules`, and `firestore.indexes.json`.

Deploy Firestore configuration with the Firebase CLI:

```bash
firebase deploy --only firestore --project YOUR_FIREBASE_PROJECT_ID
```

Preferred headless path for indexes:

```bash
npm run sync:firestore-indexes
```

Fallback Firebase CLI path:

```bash
firebase deploy --only firestore:indexes --project YOUR_FIREBASE_PROJECT_ID
```

### 2. Backfill biometric index records after schema changes

```bash
npm run backfill:biometric-index
```

Warm the biometric cache after index or enrollment changes:

```bash
npm run warm:biometric-cache
```

### 3. Deploy the Next.js app to Vercel

Required steps:

1. create or link the Vercel project
2. set the Firebase public env vars
3. set `ADMIN_SESSION_SECRET`
4. set `ADMIN_REGIONAL_PIN` if regional PIN login is required
5. set `FIREBASE_SERVICE_ACCOUNT_JSON`
6. deploy

Production deploy command:

```bash
vercel --prod
```

## Environment Variables

Public Firebase config:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

Server secrets:

```env
ADMIN_SESSION_SECRET=
ADMIN_REGIONAL_PIN=
FIREBASE_SERVICE_ACCOUNT_JSON=
ADMIN_ALLOWED_EMAILS=
```

Notes:
- `FIREBASE_SERVICE_ACCOUNT_JSON` should be stored as a secret, not as a file in the repo
- `ADMIN_REGIONAL_PIN` enables regional-only PIN login on `/admin/login`
- set `ADMIN_ALLOWED_EMAILS` to a comma-separated list of Google emails allowed to bootstrap the first regional admin
- use `ADMIN_ALLOWED_EMAILS` only to bootstrap the first regional admin
- use Firestore `admins` records for all ongoing per-user admin access in a shared deployment
- `NEXT_PUBLIC_ALLOW_LOCAL_BIOMETRIC_FALLBACK=true` is an opt-in development flag only; leave it unset for normal use

## Admin Auth Model

The correct model on a shared Vercel deployment is:
- Google login identifies the person
- Firestore `admins` records decide whether that person is a regional admin or office admin
- users do not choose their office at login
- regional admins can change another admin's office or elevate them to regional access inside the app

Bootstrap flow:
1. set `ADMIN_ALLOWED_EMAILS=ericjanlonario.jr@gmail.com` in Vercel
2. sign in with Google on `/admin/login`
3. if the `admins` collection is empty, the first allowed email is auto-created as a regional admin
4. after that, admin access comes from Firestore `admins` records, not from the env list

`admins` collection example:

```json
{
  "email": "ericjanlonario.jr@gmail.com",
  "displayName": "Eric Jan Lonario Jr.",
  "scope": "regional",
  "officeId": "",
  "active": true
}
```

Office admin example:

```json
{
  "email": "office.admin@example.com",
  "displayName": "Office Admin",
  "scope": "office",
  "officeId": "south-cotabato-provincial-office",
  "active": true
}
```

## Deployment

Primary deployment target:
- Vercel

Temporary one-month bridge target:
- Railway web service using `railway.json`
- Use only while the NAS migration and OpenVINO benchmark are being tested
- Build command downloads OpenVINO retail face models before `next build`
- Keep Firestore as the database during this bridge; do not move data into Railway's ephemeral filesystem
- Set `NEXT_PUBLIC_SITE_URL` to the final Railway URL before testing CSRF-protected writes
- Set `OPENVINO_BENCHMARK_SECRET` before using `/api/openvino/smoke`
- Keep `OPENVINO_BENCHMARK_RETURN_DESCRIPTOR=false` unless you are running a controlled descriptor benchmark
- If Railway still selects Node 18, set `NIXPACKS_NODE_VERSION=22` in Railway Variables and redeploy

Before deploying:
1. set all required environment variables in Vercel
2. deploy the Firestore rules from `firestore.rules`
3. deploy the Firestore indexes from `firestore.indexes.json`
4. run `npm run backfill:biometric-index` if person biometrics already exist
5. run `npm run warm:biometric-cache`
6. redeploy
7. test `/admin/login`
8. test `/admin`
9. test `/registration`
10. test `/scan`
11. test `/api/system/status`

Railway OpenVINO smoke check:

```bash
curl -H "Authorization: Bearer <OPENVINO_BENCHMARK_SECRET>" https://<railway-domain>/api/openvino/smoke
```

OpenVINO shadow benchmark with a private manifest URL:

```bash
npm run biometric:shadow-benchmark -- --dataset https://example.com/private-manifest.json --engines human,openvino --out /tmp/openvino-shadow-report.json
```

Railway-generated OpenVINO descriptor benchmark:

```bash
OPENVINO_REMOTE_URL=https://<railway-domain> OPENVINO_BENCHMARK_SECRET=<secret> npm run biometric:shadow-benchmark -- --dataset https://example.com/private-manifest.json --engines human,openvino-remote --out /tmp/openvino-railway-report.json
```

For this benchmark only, set `OPENVINO_BENCHMARK_RETURN_DESCRIPTOR=true` on Railway, run the benchmark, then set it back to `false`.

Production note:
- this app must not silently fall back to browser local storage in production
- if Firebase client env vars are incomplete, kiosk/registration now block instead of pretending to work
- biometric local fallback is now disabled by default even in development unless explicitly enabled for isolated test data

Biometric index note:
- the attendance matcher now uses a derived `biometric_index` collection for bucketed candidate narrowing before exact distance checks
- after deploying this upgrade against an existing Firebase project, run:

```bash
npm run backfill:biometric-index
```

- deploy updated Firestore indexes again after this change

## Operational Testing

Before calling the system trusted, test:
- successful attendance with enrolled staff
- similar-looking employees
- low-light rejection
- weak framing rejection
- inactive employee blocking
- office-edge GPS blocking
- WFH day acceptance
- office transfer behavior

## Known Limitations

- `@vladmandic/face-api` still emits a Next.js build warning about dynamic `require`
- biometric accuracy still depends heavily on enrollment quality and real device conditions
- descriptors are still stored server-side in reusable form
- attendance no longer trusts client-submitted descriptors, but it still trusts browser-originated frames and GPS input

## Design Direction

The app intentionally avoids the old all-in-one architecture.

Principles:
- mobile first
- simple module separation
- server validation where it matters
- no unnecessary runtime tuning UI
- no visitor workflow
- no device registration workflow
- no frame-by-frame server streaming

## Status

Current status:
- actively implemented
- deployable to Vercel for dry run / pilot
- not yet proven by broad field testing

If you are evaluating this for production use, treat it as a controlled rollout candidate, not a finished biometric platform.

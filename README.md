# FaceAttend

FaceAttend is a mobile-first face attendance system for DILG Region XII built with Next.js, React, Tailwind CSS, Framer Motion, Firebase, and protected server routes.

It supports:
- kiosk attendance
- employee enrollment
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
- kiosk
- registration
- admin login
- system blueprint

### 2. Kiosk Attendance
`/kiosk`

Shared camera attendance mode with:
- local live face detection
- local liveness prompt
- one final descriptor submission to the server
- server-side identity decision
- server-side GPS / WFH / employee status validation

### 3. Registration Wizard
`/registration`

Wizard-based enrollment flow:
1. capture face
2. review preview
3. enter employee details
4. save enrollment

Features:
- automatic capture
- employee ID required
- duplicate employee ID blocking
- duplicate face blocking
- weak capture rejection
- roster drawer for existing employees

### 4. Admin
`/admin/login`
`/admin`

Admin features:
- office GPS management
- office schedule and WFH management
- employee transfer between offices
- employee activate / deactivate
- attendance summary
- CSV export

## Tech Stack

- Next.js 14
- React 18
- Tailwind CSS
- Framer Motion
- Firebase Firestore
- Firebase Admin SDK
- `@vladmandic/face-api`

## Architecture

The system is intentionally kept lean.

### Client

The client is responsible for:
- camera preview
- live face detection
- liveness prompt
- capture guidance
- wizard flow and kiosk UX

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

The kiosk no longer streams frames to the server.

Instead:
1. the client detects a face locally
2. the client passes the liveness step locally
3. the client sends one final descriptor for attendance
4. the server matches the identity and decides whether attendance is accepted

This avoids the old overcomplicated streaming approach that caused stuck kiosks and unstable behavior.

## Biometric Status

Bluntly:
- this system is much more defensible than the old version
- it is not biometric-industry “fully hardened”
- it is suitable for controlled rollout and pilot use

What is already improved:
- matching no longer relies on name
- inactive employees are excluded
- ambiguous matches are blocked
- weak captures are rejected
- final attendance identity is now decided by the server

What is still true:
- live detection still happens on the client
- liveness is heuristic, not enterprise anti-spoof
- real trust still depends on field testing with actual employees and devices

## Project Structure

```text
app/
  admin/
  api/
  attendance/
  blueprint/
  kiosk/
  registration/
  favicon.ico

components/
  AdminDashboard.jsx
  AdminLogin.jsx
  BrandMark.jsx
  FaceAttendanceApp.jsx
  KioskView.jsx
  PlatformNavigator.jsx
  RegisterView.jsx

hooks/
  useAudioCue.js
  useCamera.js

lib/
  admin-auth.js
  attendance-summary.js
  biometric-quality.js
  config.js
  data-store.js
  face-api.js
  firebase.js
  firebase-admin.js
  liveness.js
  office-admin-store.js
  offices.js
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
ADMIN_PIN=
ADMIN_PIN_HASH=
ADMIN_SESSION_SECRET=
FIREBASE_SERVICE_ACCOUNT_JSON=
```

Notes:
- use `ADMIN_PIN_HASH` in production if possible
- `FIREBASE_SERVICE_ACCOUNT_JSON` should be stored as a secret, not as a file in the repo

## Deployment

Primary deployment target:
- Vercel

Before deploying:
1. set all required environment variables in Vercel
2. redeploy
3. test `/admin/login`
4. test `/admin`
5. test `/registration`
6. test `/kiosk`
7. test `/api/system/status`

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
- liveness is heuristic only
- biometric accuracy still depends heavily on enrollment quality and real device conditions
- this project avoids frame streaming to the server on purpose

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

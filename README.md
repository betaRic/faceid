# VeriFace / FaceAttend

VeriFace is DILG Region XII's browser-based biometric attendance application. The current application is a dynamic Next.js 16 service backed by PostgreSQL. Profile-photo bytes are stored in persistent local hosting storage; PostgreSQL stores their metadata.

This repository does **not** use Firebase or Firestore at runtime. Older documentation describing Firebase, Vercel, Railway, or static IIS hosting is obsolete.

## Current capabilities

- Public employee registration with privacy consent and pending-review status
- Server-generated FaceRes enrollment and attendance descriptors
- Duplicate-registration blocking and similarity review
- Four-digit VeriFace access code plus face verification for attendance
- Employee activation, rejection, deactivation, transfer, photo repair, and controlled re-enrollment
- Regional and office-scoped Admin/HR access
- Office, division, schedule, flexitime, leave, holiday, and official-order management
- Attendance correction, daily summaries, CSV/report views, and CSC Form 48 DTR workbooks
- SmartASP Node.js hosting through `app.js` and `httpPlatformHandler`

Existing employees are not expected to register or enroll again. Biometrics are replaced only through the explicit, authorized re-enrollment workflow.

## Runtime

- Node.js 22
- Next.js 16 and React 18
- PostgreSQL 18-compatible schema
- `@vladmandic/human` with TensorFlow WASM for the active FaceRes path
- Optional OpenVINO benchmark/shadow runtime
- Tailwind CSS and Framer Motion

## Primary workflows

| Workflow | Entry | Authority |
|---|---|---|
| Registration | `/registration` → `POST /api/persons` | Server embedding, duplicate checks, PostgreSQL transaction |
| Attendance | `/scan` → challenge → `POST /api/attendance/v2` | Server embedding, liveness/PAD policy, access-code identity, workforce/geofence checks |
| Employee review | `/admin` | Admin/HR session and office scope |
| Workforce and DTR | `/admin` and HR APIs | PostgreSQL policy, attendance, correction, and audit records |
| Hosting | root `app.js` + `web.config` | SmartASP `httpPlatformHandler` |

See [System architecture](docs/architecture.md) for the complete active-path map.

## Local development

Requirements:

- Node.js 22
- A local PostgreSQL database restored or created for development
- `.env.development.local` containing local-only values

Minimum local configuration:

```env
DATA_BACKEND=postgres
DATABASE_URL=postgres://postgres@127.0.0.1:55432/your_local_database
NEXT_PUBLIC_SITE_URL=http://localhost:3000
LOCAL_FILE_STORAGE_DIR=.\App_Data\veriface-files
```

Do not place a production database URL in this repository. Do not commit any `.env` file.

Install and run:

```powershell
npm ci
npm run dev
```

The generic PostgreSQL control scripts require `POSTGRES_BIN_DIR` and `POSTGRES_DATA_DIR`. The isolated route-test runtime instead requires the guarded `FACEID_TEST_*` variables described in [Database and local testing](docs/database-and-local-testing.md).

## Verification

```powershell
npm test
npm run test:routes
npm run build:hosting
git diff --check
```

`test:routes` is destructive to its isolated `faceid_rc_*` database. Never point it at production or the restored production baseline.

The hosting build is complete only when the command exits successfully, `.next/BUILD_ID` exists, and runtime external packages have been materialized for FileZilla upload.

## Database migrations

Migration files in `db/migrations` are append-only deployed history. Never edit, renumber, squash, or delete an applied migration. Run new migrations locally against disposable clones before requesting separate production approval.

See [Database and local testing](docs/database-and-local-testing.md) and [db migration policy](db/README.md).

## SmartASP

The root [app.js](app.js) and [web.config](web.config) are the authoritative hosting bootstrap. Normal application updates use the verified `.next` hosting artifact. Preserve the remote `.env`, `App_Data/veriface-files`, `node_modules`, and hosting logs.

See [SmartASP operations](docs/smartasp-operations.md). A successful local build is not permission to deploy or migrate production.

## Security and release status

Regional and named Admin/HR PIN access is intentionally retained. Authentication must remain rate-limited, audited, signed-cookie based, and server-authorized. Office HR must not read or change geofence coordinates or radius.

The current working tree is a development candidate until all gates in [Security and release gates](docs/security-and-release-gates.md) pass. Production changes require separate approval after a fresh restorable backup and local rehearsal.

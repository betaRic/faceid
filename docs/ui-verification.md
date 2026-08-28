# Civic Operational Minimal UI verification

Date: 2026-08-28 (Asia/Manila)
Baseline commit: `ab6a369`
Tested state: approved UI working tree after the baseline commit

## Scope and safety boundary

Verification used the local Next.js development server with explicit test-only overrides targeting `faceid_rc_local`. No production database, restored production baseline, production hosting files, deployment directory, or SmartASP process was changed. No production migration was run.

The configured local PostgreSQL endpoint was `127.0.0.1:55432`. The installed runtime under `C:\Program Files\PostgreSQL\18` was incomplete, but a complete existing portable PostgreSQL 18.4 runtime was found at `D:\faceattend-test-data\postgresql-18.4-portable\pgsql`. The test-owned cluster was started with that runtime. The application did not fall back to a production connection.

## Responsive route matrix

The in-app browser inspected these widths: 320x800, 375x812, 768x1024, 1024x768, and 1440x900.

| Route | Result | Limitation |
| --- | --- | --- |
| `/` | Passed at all widths; no page-level horizontal overflow; 44px brand-home target | None observed |
| `/login` | Passed at all widths; labels and invalid-PIN feedback visible; test Regional Admin and Office HR sign-in succeeded | Local test accounts only |
| `/registration` | Shell/error state passed; no overflow; page-level heading present | Local database outage prevented office loading and enrollment workflow |
| `/scan` | Permission gate passed; no overflow; action and status visible | Camera/location permission and biometric hardware flow not granted or exercised |
| `/attendance` | Access-required state passed; no overflow; page-level heading present | No verified kiosk session existed in this browser |
| `/summary` | Access-required state passed; no overflow and correct heading | No verified kiosk session existed in this browser |
| `/admin/login` | Redirected to canonical `/login`; passed | Authentication not attempted without an authorized PIN |
| `/admin` | Correct unauthenticated redirect; authenticated Regional Admin employee directory and Office HR personnel/work-policy/DTR paths passed | Local test accounts and test database only |
| `/admin/employee/{personId}/reenroll` | Automated component/authorization coverage only | No authorized local employee session was available for live browser verification |

At every live width tested, the inspected routes had no document-level horizontal overflow. The smallest-width recheck confirmed a 44px brand-home target and an `h1` on home, registration failure, attendance access, and staff login screens.

## Interaction and accessibility evidence

- Mobile navigation opens with an explicit accessible name, closes with Escape, and restores focus to its trigger. This was verified both in the browser and by an automated regression test.
- Empty and error states can render page-level headings without forcing nested component headings to become `h1`.
- Empty PIN submission exposes the visible alert `Enter your PIN.` without sending a credential.
- Shared dialogs have accessible names, close controls, Escape behavior, and focus restoration under automated UI coverage.
- Form fields expose visible labels and connected descriptions; status content is textual rather than color-only.
- Tables retain semantic headers on desktop and equivalent labeled records on small screens.
- `prefers-reduced-motion: reduce` disables smooth scrolling and reduces transition/animation duration in the global stylesheet. Source coverage verifies the media rule; this browser capability did not expose media-feature emulation for a separate visual run.
- Critical axe checks run in the representative component suite. Browser contrast and layout inspection found no clipped page-level controls in the unauthenticated routes that could be reached locally.

## Workflow evidence and limitations

Automated UI and contract tests cover registration validation and pending completion, kiosk validation and outcome presentation, employee lifecycle controls, Office HR scope, correction presentation, DTR selection/output UI, and retained administrator PIN behavior.

The isolated PostgreSQL route suite exercised registration approval, duplicate rejection, employee lifecycle persistence, kiosk acceptance/rejection safety, Office HR work-policy scope, attendance correction, daily-summary cron behavior, and administrator/Office HR PIN behavior. All 49 route tests passed.

Camera-dependent registration capture and kiosk recognition were not exercised manually in the live browser. The authenticated Office HR DTR selector was opened and populated with the three active in-scope employees, but the workbook download itself was not triggered. Those remaining hardware/download checks are not considered manually passed; their route, component, and contract coverage is recorded separately.

Authenticated browser verification exposed and repaired a role-routing defect: a permission-limited Regional Admin with only the `employees` permission was incorrectly inferred to be Office HR. The server page now passes the authenticated role explicitly; permissions only control navigation. A focused regression test proves that limited Regional Admin sessions use the Regional employee workflow while explicit Office HR sessions use the HR workflow. The browser then confirmed 14 Regional employee records, including nine pending approvals, without an Office HR endpoint error.

The Office HR browser and automated regression checks confirm that map, GPS, location, radius, geofence, and office-location controls are absent while schedule, working-day, WFH-day, grace-period, and cooldown controls remain available.

## Screenshots

Responsive pages were inspected in the in-app browser. No screenshot or generated artifact was added to the repository.

## Remaining manual evidence

1. Exercise camera/location-dependent capture on a suitable local or trusted-HTTPS device.
2. Trigger and inspect one Office HR DTR workbook download using the local test account and test database.

## Final gate snapshot

- `npm run test:ui`: passed through `npm test`, 13 files and 58 tests.
- `npm test`: passed, including 36 safety tests, functional tests, one contract test, and 58 UI tests.
- `npm run test:contracts`: passed, one test.
- `npm run test:routes`: passed, 49 isolated PostgreSQL route tests. The command used explicit loopback-only test variables and the existing portable PostgreSQL 18.4 runtime.
- `npm run postgres:test:start`: passed with the portable PostgreSQL 18.4 runtime. The incomplete global runtime was not modified.
- `npm run build:hosting`: passed. `.next/BUILD_ID` exists with identifier `x3ynYEPLPrJMoXbMON9Os`.
- `git diff --check`: passed; Git emitted line-ending conversion warnings but no whitespace errors.

The successful hosting build is packaging evidence only. No upload or deployment was performed. Hardware-dependent and DTR-download evidence remains separate from the passing automated gates.

Production was not modified.

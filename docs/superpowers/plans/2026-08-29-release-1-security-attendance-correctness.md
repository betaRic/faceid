# Release 1 Security and Attendance Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce HR office ownership, hide protected office location data, make attendance and enrollment concurrency-safe, remove biometric liveness, require server anti-spoofing, make attendance correction use saved person identity, and stop raw internal errors from reaching clients.

**Architecture:** Keep PostgreSQL authoritative. One shared HR-scope rule protects every employee and attendance path. Accepted attendance becomes one PostgreSQL transaction per person, including cooldown, daily DTR, and accepted scan history. Registration performs its final duplicate check under one database enrollment lock. Browser liveness is removed; the server supplies the only anti-spoof score used for acceptance. A shared error-response helper separates safe user errors from unexpected internal failures.

**Tech Stack:** Next.js 16.3 Route Handlers, React 18, PostgreSQL 18, Node.js 22, `node:test`, Vitest, `@vladmandic/human`, TensorFlow.js WASM.

---

## Scope and execution rules

This plan implements Release 1 only from `docs/superpowers/specs/2026-08-29-system-hardening-cleanup-deployment-design.md`.

- Keep attendance PIN behavior unchanged.
- Do not remove KV helpers, `biometric_index`, `framer-motion`, or the other Release 2 dead-code targets here, except stop using the HR profile cache where immediate authorization correctness requires it.
- Do not split the five large production files here beyond the narrow helpers required for correctness. Release 3 owns structural refactoring.
- Never run route tests against `DATABASE_URL`. `npm run test:routes` must receive the isolated `FACEID_TEST_DATABASE_URL` and `FACEID_TEST_PG_DATA` settings enforced by the route-test runner.
- Run release proof under Node.js 22. A Node.js 24 result is useful development evidence but is not final release proof.

## Planned file ownership

**New files**

- `lib/hr-scope.js` — pure HR scope and office-type rules.
- `lib/biometrics/antispoof-policy.js` — pure server anti-spoof acceptance rule.
- `lib/http/server-error.js` — safe expected and unexpected HTTP error responses.
- `tests/server-error.test.mjs` — runtime proof that internal error text is not returned.
- `tests/security/server-error-responses.test.mjs` — source guard against reintroducing raw caught-error messages in API responses.

**Main modified files**

- `lib/hr-auth.js`, `lib/employee-access.js`, `lib/postgres/user-store.js` — assigned-office authority for both Office HR and Regional HR.
- `app/api/hr-users/route.js`, `app/api/hr-users/[hrUserId]/route.js`, `components/admin/AddRoleModal.jsx`, `components/admin/AdminsPanel.jsx` — create, repair, and display assigned Regional HR accounts.
- `app/api/offices/route.js`, `lib/offices/hr-office-settings.js`, `app/api/hr/office-settings/route.js` — HR-safe office data and Regional HR work-policy access without location data.
- Employee, DTR, attendance, and workforce routes listed in Task 3 — use the same office filter for every HR scope.
- `app/api/admin/attendance/route.js`, `components/admin/AttendanceOverrideModal.jsx` — correction by `personId`, with saved identity and office.
- `lib/attendance/write.js`, `lib/postgres/attendance-store.js`, `lib/scan-events.js`, `lib/attendance/process.js` — one accepted-attendance transaction.
- `lib/postgres/person-store.js`, `lib/routes/persons-route.js` — serialized duplicate check and create-only enrollment.
- Biometric, kiosk, maintenance, configuration, documentation, and test files listed in Tasks 7 and 8 — remove liveness and require server anti-spoofing.
- API routes listed in Tasks 9–11 — safe unexpected-error responses.

## Task 1: Make HR scope mean one assigned office

**Files:**

- Create: `lib/hr-scope.js`
- Modify: `lib/hr-auth.js`
- Modify: `lib/employee-access.js`
- Modify: `lib/postgres/user-store.js`
- Modify: `tests/run-tests.mjs`
- Modify: `tests/postgres/identity.routes.test.mjs`

- [x] **Step 1: Write failing pure scope tests**

Add `lib/hr-scope.js` to the `importLocalModule` imports in `tests/run-tests.mjs`, then add these cases:

```javascript
const hrScopeModule = await importLocalModule('../lib/hr-scope.js')
const {
  hrScopeAllowsOffice,
  validateHrOfficeAssignment,
} = hrScopeModule

await run('all HR scopes are limited to their assigned office', () => {
  assert.equal(hrScopeAllowsOffice({ role: 'hr', scope: 'office', officeId: 'gensan' }, 'gensan'), true)
  assert.equal(hrScopeAllowsOffice({ role: 'hr', scope: 'office', officeId: 'gensan' }, 'cotabato'), false)
  assert.equal(hrScopeAllowsOffice({ role: 'hr', scope: 'regional', officeId: 'regional-12' }, 'regional-12'), true)
  assert.equal(hrScopeAllowsOffice({ role: 'hr', scope: 'regional', officeId: 'regional-12' }, 'gensan'), false)
  assert.equal(hrScopeAllowsOffice({ role: 'hr', scope: 'regional', officeId: '' }, 'regional-12'), false)
})

await run('HR scope must match assigned office type', () => {
  const regionalOffice = { id: 'regional-12', officeType: 'Regional Office' }
  const fieldOffice = { id: 'gensan', officeType: 'HUC Office' }
  assert.equal(validateHrOfficeAssignment('regional', regionalOffice), null)
  assert.match(validateHrOfficeAssignment('regional', fieldOffice), /Regional Office/i)
  assert.equal(validateHrOfficeAssignment('office', fieldOffice), null)
  assert.match(validateHrOfficeAssignment('office', regionalOffice), /Regional HR/i)
  assert.match(validateHrOfficeAssignment('office', null), /required/i)
})
```

- [x] **Step 2: Run the unit suite and confirm the new import fails**

Run: `node tests/run-tests.mjs`

Expected: FAIL because `lib/hr-scope.js` does not exist.

- [x] **Step 3: Implement the pure HR rule**

Create `lib/hr-scope.js`:

```javascript
import { isRegionalOffice } from './offices.js'

export function normalizeHrScope(value) {
  return String(value || '').trim().toLowerCase() === 'regional' ? 'regional' : 'office'
}

export function hrScopeAllowsOffice(session, targetOfficeId) {
  if (session?.role !== 'hr') return false
  const assignedOfficeId = String(session.officeId || '').trim()
  const requestedOfficeId = String(targetOfficeId || '').trim()
  return Boolean(assignedOfficeId && requestedOfficeId && assignedOfficeId === requestedOfficeId)
}

export function validateHrOfficeAssignment(scopeValue, office) {
  const scope = normalizeHrScope(scopeValue)
  if (!office?.id) return 'An assigned office is required for every HR account.'
  if (scope === 'regional' && !isRegionalOffice(office)) {
    return 'Regional HR must be assigned to a Regional Office.'
  }
  if (scope === 'office' && isRegionalOffice(office)) {
    return 'A Regional Office must be assigned to Regional HR.'
  }
  return null
}
```

- [x] **Step 4: Preserve `officeId` in every HR session and database profile**

In `lib/hr-auth.js`:

```javascript
import { hrScopeAllowsOffice, normalizeHrScope, validateHrOfficeAssignment } from './hr-scope'
import { getOfficeRecord } from './office-directory'

// createHrSessionCookieValue
const scope = normalizeHrScope(session.scope)
const officeId = String(session.officeId || '').trim()

// parseHrSessionCookieValue
const scope = normalizeHrScope(payload.scope)
officeId: String(payload.officeId || '').trim(),

export function hrSessionAllowsOffice(session, officeId) {
  return hrScopeAllowsOffice(session, officeId)
}
```

Remove `kvGet`, `kvSet`, `SESSION_CACHE_TTL_SECONDS`, and both cache branches from `resolveHrSession`. Resolve the current database profile every request, then reject an invalid or missing assignment:

```javascript
const profile = await getHrProfileByEmail(db, session.email)
if (!profile?.active || !profile.officeId) return null
const office = await getOfficeRecord(db, profile.officeId)
if (validateHrOfficeAssignment(profile.scope, office)) return null

return {
  ...session,
  scope: profile.scope,
  officeId: profile.officeId,
  email: profile.email,
  role: profile.role,
  permissions: profile.permissions || ['employees', 'dtr'],
  active: profile.active,
  hrUserId: profile.id,
  displayName: profile.displayName,
}
```

Keep the existing special HR PIN session office-scoped.

In `lib/postgres/user-store.js`, change `mapHr`, `createLocalHrProfile`, and `updateLocalHrProfile` to preserve `office_id` for both scopes:

```javascript
officeId: String(row.office_id || ''),
```

```javascript
const officeId = String(body.officeId || '').trim()
```

- [x] **Step 5: Add route-level session regression cases**

In `tests/postgres/identity.routes.test.mjs`, add a Regional Office fixture with at least two divisions and assign `route-test-regional-hr` to it instead of `''`. Add assertions that a created and parsed Regional HR cookie retains `officeId`, that `resolveHrSession` returns that office, and that `hrSessionAllowsOffice` allows only that office.

Use these core assertions:

```javascript
const regionalSession = await resolveHrSession(null, parseHrSessionCookieValue(regionalCookie))
assert.equal(regionalSession.officeId, regionalOffice.id)
assert.equal(hrSessionAllowsOffice(regionalSession, regionalOffice.id), true)
assert.equal(hrSessionAllowsOffice(regionalSession, office.id), false)
assert.equal(hrSessionAllowsOffice(regionalSession, otherOffice.id), false)
```

Also insert one active Regional HR with blank `office_id` and assert `resolveHrSession` returns `null`.

- [x] **Step 6: Run focused tests**

Run: `node tests/run-tests.mjs`

Expected: PASS.

Run: `npm run test:routes -- --test-name-pattern="HR scope|Regional HR|Office HR"`

Expected: PASS against the isolated PostgreSQL 18 route-test database.

- [x] **Step 7: Commit**

```bash
git add lib/hr-scope.js lib/hr-auth.js lib/employee-access.js lib/postgres/user-store.js tests/run-tests.mjs tests/postgres/identity.routes.test.mjs
git commit -m "fix: bind regional HR to one office"
```

## Task 2: Repair HR account management and hide office location data

**Files:**

- Modify: `lib/hr-auth.js`
- Modify: `app/api/hr-users/route.js`
- Modify: `app/api/hr-users/[hrUserId]/route.js`
- Modify: `components/admin/AddRoleModal.jsx`
- Modify: `components/admin/AdminsPanel.jsx`
- Modify: `components/AdminDashboard.jsx`
- Verify: `components/admin/HrOfficeSettingsPanel.jsx`
- Modify: `lib/offices/hr-office-settings.js`
- Modify: `app/api/offices/route.js`
- Modify: `app/api/hr/office-settings/route.js`
- Modify: `tests/ui/admin-operations.test.jsx`
- Modify: `tests/ui/admin-role-routing.test.jsx`
- Modify: `tests/postgres/identity.routes.test.mjs`

- [x] **Step 1: Write failing HR account and location-privacy route tests**

Add route imports for HR-user create/update and `/api/offices`. Add tests proving:

```javascript
// Regional HR requires the Regional Office.
assert.equal((await createHrUser(requestWith({ scope: 'regional', officeId: '' }))).status, 400)
assert.equal((await createHrUser(requestWith({ scope: 'regional', officeId: fieldOffice.id }))).status, 400)
assert.equal((await createHrUser(requestWith({ scope: 'regional', officeId: regionalOffice.id }))).status, 200)

// Office HR cannot be assigned the Regional Office.
assert.equal((await createHrUser(requestWith({ scope: 'office', officeId: regionalOffice.id }))).status, 400)

// Regional HR sees only a safe Regional Office summary.
const response = await getOffices(requestWithCookie(regionalHrCookie))
const payload = await response.json()
assert.deepEqual(payload.offices.map(item => item.id), [regionalOffice.id])
assert.doesNotMatch(JSON.stringify(payload), /latitude|longitude|radius|gps|location|wifi|map/i)
assert.equal(payload.offices[0].divisions.length, 2)
```

Add a Regional HR office-settings GET and PUT case. It may update work policy for `regionalOffice.id`, but its response must contain only `id`, `name`, and `workPolicy`.

Send a forged PUT body containing `gps.latitude`, `gps.longitude`, `gps.radiusMeters`, `location`, and `wifiSsid` along with a valid work-policy change. Assert the work policy changes, every saved location value remains byte-for-byte equal to its pre-request value, and the response contains none of those protected fields.

**Execution corrections identified on 2026-09-02:** the existing account hook sends only changed fields, so the planned office-repair control would fail validation or overwrite omitted account fields. Add a partial repair request `{ scope: 'regional', officeId: regionalOffice.id }` for an inactive, unassigned Regional HR fixture. Assert its saved email, display name, active status, and PIN hash remain unchanged. Also test invalid office-type assignments through PUT, not only POST.

The existing session resolver ignores the signed account ID and reloads by email. Add a same-cookie regression covering reassignment, immediate deactivation, deletion followed by a different account using the same email, and a missing signed account ID. The first change must appear immediately; the other three invalid sessions must resolve to `null`. Preserve a valid special HR PIN session, but reject that special session when its assigned office is blank so subsequent queries cannot interpret a blank office as global access.

- [x] **Step 2: Run focused route tests and confirm failure**

Run: `npm run test:routes -- --test-name-pattern="HR account assignment|HR office response|HR office settings|HR session identity"`

Expected: FAIL because Regional HR currently loses `officeId`, HR-user validation accepts blank regional assignment, and `/api/offices` returns full office data.

- [x] **Step 3: Validate HR account office type on create and update**

In both HR-user routes, require `officeId` for every scope, load the office with `getOfficeRecord`, and call `validateHrOfficeAssignment` before writing:

```javascript
if (!body.officeId) return 'Every HR account requires an assigned office.'
```

```javascript
const office = await getOfficeRecord(null, body.officeId)
const assignmentError = validateHrOfficeAssignment(body.scope, office)
if (assignmentError) {
  return NextResponse.json({ ok: false, message: assignmentError }, { status: 400 })
}
```

Write `officeId: body.officeId` into audit records for both Office HR and Regional HR.

For PUT, authenticate and load the existing profile before validating. Overlay only supplied account fields before normalization; missing fields must not become empty strings or reactivate an inactive account:

```javascript
const editableFields = ['email', 'displayName', 'scope', 'officeId', 'pin', 'active']
const suppliedFields = Object.fromEntries(editableFields
  .filter(field => Object.hasOwn(input || {}, field))
  .map(field => [field, input[field]]))
const body = normalizeBody({ ...existing, ...suppliedFields })
```

After the unchanged valid special PIN handling, resolve named sessions through the existing `getHrProfileById` helper. Replace the email lookup; do not add an email fallback:

```javascript
const hrUserId = String(session.hrUserId || '').trim()
if (!hrUserId) return null
const profile = await getHrProfileById(db, hrUserId)
```

Retain the active-profile, assigned-office, and office-type checks from Task 1. In the special PIN branch, trim `session.officeId` and return `null` when it is blank; retain its valid office-scoped permissions and identity.

- [x] **Step 4: Add Regional HR controls to the account UI**

In `components/admin/AddRoleModal.jsx`, add `hrScope` state. Show an HR scope selector and filter the office selector:

```javascript
const hrOffices = offices.filter(office => (
  hrScope === 'regional'
    ? office.officeType === 'Regional Office'
    : office.officeType !== 'Regional Office'
))
```

Submit both fields without clearing Regional HR office ID:

```javascript
onSubmit({
  type: 'hr',
  displayName: hrDisplayName.trim(),
  scope: hrScope,
  officeId: hrOfficeId,
  pin: hrPin,
})
```

In `components/admin/AdminsPanel.jsx`:

```javascript
...hrUsers.map(user => ({ ...user, userType: 'hr', role: 'hr' }))
```

Display `Regional HR` when `user.scope === 'regional'`, display the assigned office name rather than “All offices,” and send the actual scope from `handleAddRole`.

For existing HR rows, provide an office selector filtered by the saved scope. Changing it calls:

```javascript
handleUpdate(user, { scope: user.scope, officeId: event.target.value })
```

This control repairs existing Regional HR profiles that currently have no office assignment.

Render an explicit `Office assignment required` status when an existing HR row has a blank or missing office ID so a Regional Administrator can identify the blocked account.

- [x] **Step 5: Serialize an HR-safe office summary**

Add to `lib/offices/hr-office-settings.js`:

```javascript
export function toHrOfficeSummary(office = {}, employees = 0) {
  return {
    id: String(office.id || ''),
    code: String(office.code || ''),
    officeType: String(office.officeType || ''),
    name: String(office.name || ''),
    shortName: String(office.shortName || ''),
    status: String(office.status || 'active'),
    divisions: Array.isArray(office.divisions)
      ? office.divisions.map(division => ({
          id: String(division?.id || ''),
          name: String(division?.name || ''),
          shortName: String(division?.shortName || ''),
        }))
      : [],
    workPolicy: pickHrWorkPolicy(office.workPolicy),
    employees: Number(employees || 0),
  }
}
```

In `app/api/offices/route.js`, return full `enriched` offices only to administrators. Return `visible.map(office => toHrOfficeSummary(office, counts[office.id]))` to HR.

`app/api/public/offices/route.js` already omits coordinates and radius. Add a route assertion so this remains locked.

- [x] **Step 6: Permit assigned Regional HR to edit only work policy**

Rename `getOfficeForOfficeHr` to `getOfficeForHr` in `app/api/hr/office-settings/route.js`. Replace the scope check with:

```javascript
if (!resolvedSession?.active || !resolvedSession.officeId) {
  return { error: NextResponse.json({ ok: false, message: 'Assigned HR office access is required.' }, { status: 403 }) }
}
```

Keep `toHrOfficeSettings` and `updateLocalHrOfficeWorkPolicy`; do not add location fields to request or response.

- [x] **Step 7: Update UI tests**

In `tests/ui/admin-operations.test.jsx`, prove:

- Regional HR creation sends `{ scope: 'regional', officeId: regionalOffice.id }`.
- Regional Office does not appear for Office HR.
- Field offices do not appear for Regional HR.
- Account table shows assigned office, never “All offices,” for Regional HR.
- Existing HR account with blank office ID shows `Office assignment required`.

In `components/AdminDashboard.jsx`, add `office-settings` and `workforce` navigation for both HR scopes without duplicating items already granted by permissions. For the HR rendering path, always pass `allowNationalHolidays={false}` to `WorkforcePanel`; national calendar controls belong only to Regional Administrators.

In `tests/ui/admin-role-routing.test.jsx`, make the `AdminShell` mock render navigation labels and make the `WorkforcePanel` mock expose the `allowNationalHolidays` value. Prove Regional HR receives Office Settings and Workforce, does not receive Office, and receives `allowNationalHolidays={false}`. In `tests/ui/admin-operations.test.jsx`, verify `HrOfficeSettingsPanel` renders no map or location fields and sends only `{ workPolicy }` when saving.

- [x] **Step 8: Run focused tests**

Run: `npx vitest run tests/ui/admin-operations.test.jsx tests/ui/admin-role-routing.test.jsx`

Expected: PASS.

Run: `npm run test:routes -- --test-name-pattern="HR account assignment|HR office response|HR office settings"`

Expected: PASS.

- [x] **Step 9: Commit**

```bash
git add app/api/hr-users app/api/offices/route.js app/api/hr/office-settings/route.js components/AdminDashboard.jsx components/admin/AddRoleModal.jsx components/admin/AdminsPanel.jsx components/admin/HrOfficeSettingsPanel.jsx lib/offices/hr-office-settings.js tests/ui/admin-operations.test.jsx tests/ui/admin-role-routing.test.jsx tests/postgres/identity.routes.test.mjs
git commit -m "fix: protect HR office boundaries"
```

## Task 3: Apply the assigned-office filter to every HR work path

**Files:**

- Modify: `lib/employee-access.js`
- Modify: `lib/postgres/report-store.js`
- Modify: `lib/routes/persons-route.js`
- Modify: `lib/workforce-policy.js`
- Modify: `app/api/persons/route.js`
- Modify: `app/api/persons/pending-count/route.js`
- Modify: `app/api/attendance/recent/route.js`
- Modify: `app/api/hr/employees/route.js`
- Modify: `app/api/hr/dtr/employees/route.js`
- Modify: `app/api/hr/dtr/route.js`
- Modify: `app/api/hr/dtr/workbook/route.js`
- Modify: `app/api/hr/workforce-records/route.js`
- Test: `tests/postgres/identity.routes.test.mjs`
- Test: `tests/run-tests.mjs`

- [x] **Step 1: Write failing cross-office route tests**

Create active employees in the Regional Office, Gensan fixture, and Cotabato fixture. Using Regional HR cookie, assert:

- person directory returns only Regional Office employees;
- pending count counts only Regional Office employees;
- recent attendance returns only Regional Office entries;
- DTR employee list, DTR JSON, and workbook reject or omit outside employees;
- workforce leave and official-order writes reject any outside employee;
- national holiday seeding and organization-wide policy changes return 403 for Regional HR;
- leave and official orders for employees in two different Regional Office divisions succeed;
- employee update, activation or rejection, deletion, photo read/write, and access-code regeneration reject Gensan and Cotabato employees.

Using each Office HR cookie, assert the same routes return only its assigned field office.

**Execution correction identified on 2026-09-02:** `/api/persons` GET and `/api/attendance/recent` currently accept only administrator cookies. Replacing their office-filter expressions alone would still reject every HR request. Use `resolveEmployeeManagementSession` and `resolveStaffAttendanceSession`, respectively, with `sessionAllowsOffice` so the tests prove both authorized own-office access and rejection or omission of outside records. Preserve the public persons POST path. Test both normal and `access-codes` modes of `/api/hr/employees`, including a forged requested office, and the paged and ordinary persons directory modes. Existing DTR JSON/workbook paths already authorize the saved person's office; verify them rather than forcing unnecessary edits.

**Review corrections identified on 2026-09-02:** Workforce list queries must restrict records to the assigned office before returning database rows, not load the whole organization and filter afterward. Include all official-order members when checking ownership, so a mixed-office order cannot become visible to one office's HR. Division holidays must validate that the selected division belongs to the supplied office, and special-day evaluation must match both office and division to prevent old or malformed records from affecting another office. Existing organization/division policies must remain distinguishable from missing records: Regional Administrator updates and deletions succeed, HR receives 403, and absent records receive 404. Paged person-directory defense must be tested through the production handler with an injected outside-office result, not by matching source text alone. The narrow GET factory lives in `lib/routes/persons-route.js`; include it in subsequent error-response work.

New HR access to recent attendance must not expose the raw stored payload. Return an explicit set of HR attendance fields without direct or nested coordinates, map, radius, or Wi-Fi data; preserve administrator responses. Test location-populated records through the actual route. Do not copy raw `geofenceStatus` into the HR response: existing status text can include a Wi-Fi name.

- [x] **Step 2: Run focused tests and confirm the current global Regional HR behavior fails**

Run: `npm run test:routes -- --test-name-pattern="cross-office|assigned Regional Office|national holiday"`

Expected: FAIL because several routes convert `scope === 'regional'` to an empty office filter.

- [x] **Step 3: Add one shared SQL filter rule**

Add to `lib/employee-access.js`:

```javascript
export function getSessionOfficeFilter(session, requestedOfficeId = '') {
  if (!session?.active) return ''
  if (session.role === 'admin' && session.scope === 'regional') {
    return String(requestedOfficeId || '').trim()
  }
  return String(session.officeId || '').trim()
}
```

Use this helper instead of every `session.scope === 'office' ? session.officeId : ''` branch in the files listed above. Regional Administrators remain global; every HR scope receives its assigned office ID.

In `lib/postgres/report-store.js`, change `listLocalDtrEmployees` to apply `session.officeId` whenever `session.role === 'hr'` or `session.scope === 'office'`.

- [x] **Step 4: Remove direct Regional HR organization-wide grants**

In `app/api/hr/workforce-records/route.js`, national holidays and organization or division-wide policies remain Regional Administrator-only:

```javascript
if (type === 'holiday' && !officeId) {
  return session.role === 'admin' && session.scope === 'regional'
}
```

Regional HR may manage records tied to `session.officeId`, including employees in any division under that Regional Office. It may not seed the national calendar or change another office.

- [x] **Step 5: Search for remaining global-HR shortcuts**

Run:

```powershell
rg -n -e "scope === 'office'" -e "scope !== 'office'" -e 'scope === "regional"' app/api/hr app/api/attendance app/api/persons lib/postgres/report-store.js
```

Expected: each remaining scope check is administrator-only, presentation-only, or documented by the plan. No HR data query turns Regional HR into an empty/global office filter.

- [x] **Step 6: Run focused tests**

Run: `npm run test:routes -- --test-name-pattern="cross-office|assigned Regional Office|national holiday"`

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add lib/employee-access.js lib/postgres/report-store.js app/api/persons/route.js app/api/persons/pending-count/route.js app/api/attendance/recent/route.js app/api/hr tests/postgres/identity.routes.test.mjs
git commit -m "fix: scope every HR work path"
```

**Accepted on 2026-09-02:** Task 3 implementation and review corrections are committed in `8f94346`, `e2a1704`, `0839057`, `2ff6a84`, and `4baf7cb`. Independent specification and quality reviews passed, including the final HR recent-attendance privacy change. Fresh Node 22.23.2 verification: full guarded PostgreSQL route suite **81/81** at `4baf7cb`; non-route suite at `2ff6a84`: safety **38**, units **118**, contract **1**, UI **79**, all passed. Final privacy diff also passed an independent no-database serializer probe and `git diff --check`. Browser, real-device, and hosting release gates remain pending; these tests do not establish production readiness.

## Task 4: Make attendance correction trust `personId`

**Files:**

- Modify: `app/api/admin/attendance/route.js`
- Modify: `app/api/admin/attendance/[attendanceId]/route.js`
- Modify: `components/admin/AttendanceOverrideModal.jsx`
- Modify: `tests/postgres/identity.routes.test.mjs`
- Modify: `tests/ui/admin-operations.test.jsx`

- [ ] **Step 1: Write failing correction tests**

Extend the correction route test with an employee whose `employee_id` is empty. Send a body containing the correct `personId` but forged name, employee ID, and outside office fields. Assert the stored row uses the database person:

```javascript
assert.deepEqual(stored.rows[0], {
  person_id: person.id,
  employee_id: '',
  name: person.name,
  office_id: person.officeId,
  office_name: person.officeName,
})
```

Assert the same request from another Office HR returns 403. Add GET assertions showing `personId` and date are sufficient without Employee ID. Add delete and field-duty review cases proving authorization uses the saved attendance row office.

**Execution correction identified on 2026-09-02:** `refreshDailyRecord` in the attendance-item route currently returns early when Employee ID is blank. Add regressions proving deletion and field-duty review refresh the daily record for an employee identified by `personId` with no Employee ID. Require the canonical person ID and date for that refresh; do not reintroduce an Employee ID requirement after fixing creation. Preserve the saved person's division information when resolving its work policy.

- [ ] **Step 2: Run the focused route test and confirm failure**

Run: `npm run test:routes -- --test-name-pattern="attendance correction"`

Expected: FAIL because GET and POST require Employee ID and POST trusts browser identity and office fields.

- [ ] **Step 3: Load the person before authorization and writing**

In GET, require `personId` and date, load `getLocalPersonById(personId)`, authorize `person.officeId`, then query logs with `{ personId: person.id, employeeId: person.employeeId || '', dateKey }`. Ignore any Employee ID supplied by the caller; it is display data, not correction identity.

In POST, accept only:

```javascript
const personId = String(body?.personId || '').trim()
const action = String(body?.action || '').trim()
const manualSlot = String(body?.manualSlot || '').trim()
const timestamp = Number(body?.timestamp)
const requestedDateKey = String(body?.dateKey || '').trim()
const reason = String(body?.reason || '').trim()
```

Load and authorize the person:

```javascript
const person = await getLocalPersonById(personId)
if (!person) return NextResponse.json({ ok: false, message: 'Employee record was not found.' }, { status: 404 })
if (!sessionAllowsOffice(resolvedSession, person.officeId)) {
  return NextResponse.json({ ok: false, message: 'This account cannot correct attendance for that employee.' }, { status: 403 })
}
```

Build the entry only from saved fields:

```javascript
const entry = {
  employeeId: person.employeeId || '',
  personId: person.id,
  name: person.name || '',
  officeId: person.officeId || '',
  officeName: person.officeName || '',
  divisionId: person.divisionId || '',
  divisionName: person.divisionName || '',
  action,
  attendanceMode: 'manual_override',
  geofenceStatus: 'Admin override',
  decisionCode: 'manual_admin_override',
  confidence: 1,
  timestamp: timing.timestamp,
  dateKey: timing.dateKey,
  dateLabel: timing.dateLabel,
  date: timing.dateLabel,
  time: timing.time,
  source: 'manual_override',
  manualSlot,
  overrideReason: reason,
  overriddenBy: resolvedSession.email || '',
  overriddenAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  descriptor: null,
  landmarks: null,
  latitude: null,
  longitude: null,
}
```

Reject when `buildAttendanceEntryTiming(timestamp).dateKey !== requestedDateKey` so audit and daily projection cannot disagree about the date.

- [ ] **Step 4: Stop the UI sending identity copies**

In `components/admin/AttendanceOverrideModal.jsx`, load logs with:

```javascript
`/api/admin/attendance?personId=${encodeURIComponent(row.personId || '')}&date=${encodeURIComponent(row.dateKey)}`
```

POST only `personId`, `action`, `manualSlot`, `timestamp`, `dateKey`, and `reason`. Keep Employee ID as optional display text.

- [ ] **Step 5: Add a UI request-body regression test**

In `tests/ui/admin-operations.test.jsx`, capture the correction fetch body and assert:

```javascript
expect(body).toMatchObject({ personId: 'person-1', dateKey: '2026-08-24' })
expect(body).not.toHaveProperty('employeeId')
expect(body).not.toHaveProperty('name')
expect(body).not.toHaveProperty('officeId')
expect(body).not.toHaveProperty('officeName')
```

- [ ] **Step 6: Run focused tests**

Run: `npx vitest run tests/ui/admin-operations.test.jsx`

Expected: PASS.

Run: `npm run test:routes -- --test-name-pattern="attendance correction"`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/admin/attendance components/admin/AttendanceOverrideModal.jsx tests/postgres/identity.routes.test.mjs tests/ui/admin-operations.test.jsx
git commit -m "fix: use saved identity for corrections"
```

## Task 5: Commit accepted attendance as one operation

**Files:**

- Modify: `lib/postgres/attendance-store.js`
- Modify: `lib/attendance/write.js`
- Modify: `lib/attendance/index.js`
- Modify: `lib/scan-events.js`
- Modify: `lib/attendance/process.js`
- Modify: `tests/postgres/identity.routes.test.mjs`

- [ ] **Step 1: Write a failing simultaneous-first-scan test**

Create a new active person with no attendance and no `attendance_locks` row. Submit two valid attendance requests concurrently with separate challenges:

```javascript
const [left, right] = await Promise.all([
  submit(buildBody(person.accessCode)),
  submit(buildBody(person.accessCode)),
])
assert.deepEqual([left.status, right.status].sort(), [200, 409])
assert.equal(Number((await queryPostgres(
  'SELECT count(*)::integer AS count FROM attendance WHERE person_id = $1',
  [person.id],
)).rows[0].count), 1)
```

Assert one daily row, one accepted scan event, and one cooldown row exist.

- [ ] **Step 2: Write a failing rollback test**

In the isolated test database, add a temporary trigger that raises `simulated accepted scan event failure` only when `NEW.person_id` equals the rollback fixture. Submit attendance and assert status 500, then assert zero rows for that person in `attendance`, `attendance_daily`, `attendance_locks`, and accepted `scan_events`. Drop the trigger and function in `finally`.

- [ ] **Step 3: Run the focused tests and confirm both failures**

Run: `npm run test:routes -- --test-name-pattern="simultaneous first scans|accepted attendance rolls back"`

Expected: FAIL because a missing cooldown row cannot be locked and accepted writes currently happen in separate operations.

- [ ] **Step 4: Allow low-level writers to share one transaction client**

In `lib/postgres/attendance-store.js`, use this helper:

```javascript
function databaseFor(client) {
  return client || getPostgresPool()
}
```

Update daily and scan-event writers to accept `{ client } = {}` and call `databaseFor(client).query(...)`:

```javascript
export async function getLocalAttendanceLogsForDate(employeeId, dateKey, personId = '', { client } = {})
export async function upsertLocalDailyAttendanceRecord(record, { client } = {})
export async function writeLocalScanEvent(event, { client } = {})
```

Extract the existing attendance INSERT and cooldown upsert into client-only helpers. Do not open nested transactions.

- [ ] **Step 5: Make accepted scan-event building pure**

In `lib/scan-events.js`, extract the current sanitizing body into:

```javascript
export function buildScanEventRecord({
  status = 'blocked', decisionCode = 'blocked_unknown', reason = '',
  entry = {}, person = null, debug = null, requestMeta = null,
}) {
  const descriptor = Array.isArray(entry?.descriptor) ? entry.descriptor : []
  const descriptorMagnitude = descriptor.length > 0
    ? Math.sqrt(descriptor.reduce((sum, value) => sum + (Number(value) * Number(value)), 0))
    : null
  const captureContext = toPlainObject(entry?.captureContext)
  const scanDiagnostics = toPlainObject(entry?.scanDiagnostics)
  const kioskContext = toPlainObject(entry?.kioskContext)
  const challenge = toPlainObject(entry?.challenge)
  const matchDebug = toPlainObject(debug)
  const identity = resolvePersistedScanIdentity({ entry, person, debug: matchDebug, requestMeta })
  const serverTimings = sanitizeServerTimings(
    scanDiagnostics.serverTimings
    || matchDebug.serverTimings
    || entry?.serverTimings,
  )
  const riskFlags = Array.isArray(entry?.riskFlags) ? entry.riskFlags : []

  return {
    status,
    decisionCode: String(decisionCode || '').slice(0, 80),
    reason: String(reason || '').slice(0, 500),
    timestamp: Number(entry?.timestamp || Date.now()),
    employeeId: identity.employeeId,
    personId: identity.personId || null,
    name: String(person?.name || entry?.name || '').slice(0, 160),
    officeId: identity.officeId,
    officeName: String(person?.officeName || entry?.officeName || '').slice(0, 160),
    attendanceMode: String(entry?.attendanceMode || requestMeta?.attendanceMode || '').slice(0, 40),
    geofenceStatus: String(entry?.geofenceStatus || requestMeta?.geofenceStatus || '').slice(0, 120),
    location: {
      latitude: Number.isFinite(entry?.latitude) ? Number(entry.latitude) : null,
      longitude: Number.isFinite(entry?.longitude) ? Number(entry.longitude) : null,
    },
    riskFlags: Array.from(new Set(
      riskFlags.map(flag => String(flag || '').trim().toLowerCase()).filter(Boolean),
    )).slice(0, 16),
    captureContext,
    scanDiagnostics,
    performance: summarizeServerPerformance(serverTimings),
    matchDebug,
    requestMeta: requestMeta || {},
    data: {
      verificationMode: String(entry?.verificationMode || 'legacy').slice(0, 80),
      verificationStage: String(entry?.verificationStage || '').slice(0, 40),
      descriptor: { length: descriptor.length, magnitude: roundMetric(descriptorMagnitude) },
      kioskContext: {
        kioskId: String(kioskContext.kioskId || '').slice(0, 120),
        source: String(kioskContext.source || '').slice(0, 40),
      },
      challenge: {
        challengeId: String(challenge.challengeId || challenge.token || '').slice(0, 200),
        mode: String(challenge.mode || '').slice(0, 40),
        motionType: String(challenge.motionType || '').slice(0, 64),
      },
      challengeUsed: Boolean(entry?.challenge?.token),
    },
  }
}
```

Keep `writeScanEvent` as the non-blocking wrapper for rejected scans. On a rejected-history write failure, create a tracking ID with `randomUUID()`, log only `{ errorId, errorCode, internalMessage }` on the server, return `{ ok: false, errorId }`, and do not change the scan rejection response. Return `{ ok: true }` after a successful rejected-history write.

Accepted attendance passes `{ status, decisionCode, reason, debug, requestMeta }` as `scanEventContext` into the attendance transaction. After the locked action is known, the transaction calls `buildScanEventRecord({ ...scanEventContext, entry: committedEntry, person })` so accepted history cannot record a stale action.

- [ ] **Step 6: Implement one per-person accepted-attendance transaction**

Replace the current `writeAttendanceAtomically` plus later daily and scan-event calls with a high-level `commitAcceptedAttendance` in `lib/attendance/write.js`. Its input is `{ entry, person, office, policyOverride, scanEventContext }`.

The currently unused `lib/attendance/index.js` still re-exports the old writer names. Keep those exports consistent with the replacement so this change does not leave a module with broken named imports. Do not retain obsolete write implementations solely to support an unused export. Removing the unused barrel itself remains Release 2 work.

Inside `withPostgresTransaction`:

```javascript
await client.query(
  'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
  [`attendance:${entry.personId}`],
)
```

Then, using the same client:

1. Read current attendance rows for `person_id` and `date_key` through the same transaction client.
2. Recalculate `nextAction` with `getNextAttendanceAction(lockedLogs, office, entry.timestamp, policyOverride)`.
3. Return `{ ok: false, reason: 'complete', action: 'complete', entry: latestPreview }` if the day is complete.
4. Build `committedEntry = { ...entry, action: nextAction }`; when field duty is pending, also replace `requestedAction` with `nextAction`.
5. Calculate cooldown from `getCooldownForActionMinutes(office, nextAction)`, read the cooldown row, and return `{ ok: false, reason: 'cooldown', action: nextAction, entry: lastPreview }` when blocked.
6. Insert `committedEntry` as raw attendance.
7. Derive and upsert daily DTR from `lockedLogs` plus `committedEntry`.
8. Build and insert the accepted scan event from `committedEntry` and `scanEventContext`.
9. Upsert cooldown state.
10. Return `{ ok: true, action: nextAction, storedEntry, entryPreview }`.

No catch inside this function may convert a database failure into success.

- [ ] **Step 7: Update the attendance processor**

In `lib/attendance/process.js`, keep the current pre-write daily-log and next-action calculation only as an early user-facing check, preserving the present “day complete” decision order. Treat its action as provisional. Keep biometric, person, office, workforce, and location decisions before the write. Remove the post-write `updateDailyAttendanceCache` and accepted `writeScanEvent` calls.

Call `commitAcceptedAttendance`. The locked result is authoritative: map `reason: 'complete'` to the existing `blocked_day_complete` response and `reason: 'cooldown'` to the existing `blocked_recent_duplicate` response, using `writeResult.action` in its message and evidence. Keep rejected-scan logging non-blocking.

- [ ] **Step 8: Run focused route tests**

Run: `npm run test:routes -- --test-name-pattern="kiosk persists|simultaneous first scans|accepted attendance rolls back"`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/postgres/attendance-store.js lib/attendance/write.js lib/scan-events.js lib/attendance/process.js tests/postgres/identity.routes.test.mjs
git commit -m "fix: commit attendance atomically"
```

## Task 6: Serialize duplicate registration and make enrollment create-only

**Files:**

- Modify: `lib/postgres/person-store.js`
- Modify: `lib/routes/persons-route.js`
- Modify: `tests/postgres/identity.routes.test.mjs`
- Modify: `tests/run-tests.mjs`

- [ ] **Step 1: Write a failing simultaneous same-face registration test**

Submit two registrations concurrently with the same deterministic server descriptors but different names and empty Employee IDs:

```javascript
const [left, right] = await Promise.all([
  register(registrationFixture({ employeeId: '', lastName: 'ConcurrentFaceA', photoDataUrl })),
  register(registrationFixture({ employeeId: '', lastName: 'ConcurrentFaceB', photoDataUrl })),
])
assert.deepEqual([left.status, right.status].sort(), [200, 409])
```

Query both normalized names and assert exactly one person exists. Assert the winner retains its own identity, photo, descriptors, and pending approval state.

- [ ] **Step 2: Add a create-only source contract test**

In `tests/run-tests.mjs`, read `lib/postgres/person-store.js` and assert the `enrollLocalPerson` slice contains neither `const existing = null` nor `ON CONFLICT (id)` nor `DO UPDATE SET`.

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `npm run test:routes -- --test-name-pattern="simultaneous same-face"`

Expected: FAIL because different identity locks can perform duplicate checks concurrently.

Run: `node tests/run-tests.mjs`

Expected: FAIL on the create-only source contract.

- [ ] **Step 4: Lock the final duplicate check and insert**

Inside the existing enrollment transaction, before identity-specific locking and `loadDuplicateCandidates`, acquire one enrollment-decision lock:

```javascript
await client.query(
  'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
  ['person_registration:biometric'],
)
```

Keep the identity-specific lock after it so every registration takes locks in the same order.

- [ ] **Step 5: Remove unreachable update behavior**

Delete `existing`, every `existing ?` branch, stored-descriptor merge, and `ON CONFLICT(id) DO UPDATE`. Build a new person directly:

```javascript
const submittedNames = normalizeEmployeeNameFields(body)
const { accepted: uniqueDescriptors, rejected: duplicateDescriptors } =
  deduplicateDescriptors(body.descriptors, [], {
    minSampleDiversity: ENROLLMENT_SUPPORT_SAMPLE_MIN_DIVERSITY,
  })
const personId = crypto.randomUUID()
const accessCode = await generateLocalAccessCode(client)
const nextApprovalStatus = resolvedSession ? PERSON_APPROVAL_APPROVED : PERSON_APPROVAL_PENDING
```

Keep the existing persons column list and values, but make it a plain `INSERT INTO persons` statement: delete the entire `ON CONFLICT (id) DO UPDATE SET` clause and do not replace it. Remove `existing` from the transaction result. Change `writeLocalEnrollmentAuditLog` to always write action `person_submission_create` with summary `Public enrollment submitted for ${body.name}`.

Keep the current post-transaction `biometric_index` sync for Release 2 removal.

- [ ] **Step 6: Stop registration API from implying update behavior**

In `lib/routes/persons-route.js`, keep the safe 409 duplicate response. Remove only fields or warning text that refer to resubmission or existing-record update. Do not change administrator approval.

- [ ] **Step 7: Run focused tests**

Run: `node tests/run-tests.mjs`

Expected: PASS.

Run: `npm run test:routes -- --test-name-pattern="missing Employee ID does not bypass|simultaneous same-face|public registration"`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/postgres/person-store.js lib/routes/persons-route.js tests/postgres/identity.routes.test.mjs tests/run-tests.mjs
git commit -m "fix: serialize create-only enrollment"
```

## Task 7: Require server anti-spoofing without liveness

**Files:**

- Create: `lib/biometrics/antispoof-policy.js`
- Modify: `lib/biometrics/server-embedding-core.js`
- Modify: `lib/biometrics/server-attendance.js`
- Modify: `lib/attendance/normalize.js`
- Modify: `lib/attendance/capture-policy.js`
- Modify: `lib/attendance/challenge-policy.js`
- Modify: `lib/attendance/process.js`
- Modify: `.env.example`
- Modify: `tests/run-tests.mjs`
- Modify: `tests/postgres/identity.routes.test.mjs`

- [ ] **Step 1: Replace liveness-policy tests with failing anti-spoof tests**

Remove unit tests whose result depends on eye, blink, motion, iris, or `entry.liveness`. Add:

```javascript
await run('server anti-spoof policy fails closed when score is missing', () => {
  assert.deepEqual(assessServerAntispoof(null), {
    ok: false,
    decisionCode: 'blocked_missing_antispoof',
    message: 'Server anti-spoofing is unavailable. Please try again.',
  })
})

await run('server anti-spoof policy blocks weak scores', () => {
  assert.equal(assessServerAntispoof(0.57).decisionCode, 'blocked_antispoof')
  assert.equal(assessServerAntispoof(0.58).ok, true)
})

await run('attendance normalization ignores browser PAD claims', () => {
  const entry = normalizeEntry({ antispoof: 1, liveness: 1, livenessEvidence: { pass: true } })
  assert.equal(Object.hasOwn(entry, 'antispoof'), false)
  assert.equal(Object.hasOwn(entry, 'liveness'), false)
  assert.equal(Object.hasOwn(entry, 'livenessEvidence'), false)
})
```

In route tests, make a service payload with `antispoof: null` return `blocked_missing_antispoof`, and a payload with `antispoof: 0.57` return `blocked_antispoof`, regardless of browser fields.

- [ ] **Step 2: Run tests and confirm failure**

Run: `node tests/run-tests.mjs`

Expected: FAIL because the new policy does not exist and normalization still accepts liveness and browser PAD fields.

- [ ] **Step 3: Implement the pure server anti-spoof rule**

Create `lib/biometrics/antispoof-policy.js`:

```javascript
export const SERVER_ANTISPOOF_PASS_THRESHOLD = 0.58

export function assessServerAntispoof(value) {
  if (value === null || value === undefined || value === '') {
    return {
      ok: false,
      decisionCode: 'blocked_missing_antispoof',
      message: 'Server anti-spoofing is unavailable. Please try again.',
    }
  }
  const score = Number(value)
  if (!Number.isFinite(score) || score < 0 || score > 1) {
    return {
      ok: false,
      decisionCode: 'blocked_missing_antispoof',
      message: 'Server anti-spoofing is unavailable. Please try again.',
    }
  }
  if (score < SERVER_ANTISPOOF_PASS_THRESHOLD) {
    return {
      ok: false,
      decisionCode: 'blocked_antispoof',
      message: 'Photo or screen detected. Please scan your real face.',
    }
  }
  return { ok: true, score }
}
```

- [ ] **Step 4: Enable server anti-spoof and disable server liveness**

In `lib/biometrics/server-embedding-core.js`:

```javascript
const SERVER_ATTENDANCE_ANTISPOOF_ENABLED =
  process.env.SERVER_ATTENDANCE_ANTISPOOF_ENABLED !== 'false'

attendance: {
  mesh: false,
  iris: false,
  antispoof: SERVER_ATTENDANCE_ANTISPOOF_ENABLED,
  liveness: false,
  maxDimension: ATTENDANCE_IMAGE_MAX_DIMENSION,
},
```

Remove `SERVER_ATTENDANCE_PAD_ENABLED` and stop returning `face.liveness`.

In `.env.example`, replace the old PAD switch with:

```text
SERVER_ATTENDANCE_ANTISPOOF_ENABLED=true
```

An explicit false setting does not permit attendance: it produces no server score and the policy fails closed.

Make that contract explicit in the server result mapping: when the attendance anti-spoof model is disabled, return `antispoof: null` rather than accepting any default value a disabled model might leave in `face.real`.

- [ ] **Step 5: Aggregate the weakest authoritative frame and remove liveness payloads**

In `lib/biometrics/server-attendance.js`, remove liveness collection and return anti-spoof only when every accepted frame has a finite score:

```javascript
const antispoofValues = acceptedFrames
  .map(frame => frame.antispoof)
  .map(value => (
    value === null || value === undefined || value === ''
      ? null
      : Number(value)
  ))
const hasCompleteAntispoof = antispoofValues.length > 0
  && antispoofValues.every(value => Number.isFinite(value) && value >= 0 && value <= 1)
const antispoof = hasCompleteAntispoof
  ? Math.min(...antispoofValues)
  : null
```

The weakest accepted frame controls the result; one suspicious frame cannot be hidden by averaging it with a strong frame.

- [ ] **Step 6: Remove browser PAD authority from normalization and application**

Remove `antispoof`, `liveness`, and `livenessEvidence` from `normalizeEntry`.

In `applyAuthoritativePayload`, never fall back to browser fields:

```javascript
antispoof: Number.isFinite(authoritativePayload.antispoof)
  ? Number(authoritativePayload.antispoof)
  : null,
```

Remove `liveness`. Add `authoritativeAntispoofSource` to capture context using the server model version.

- [ ] **Step 7: Simplify capture and challenge policy**

In `lib/attendance/capture-policy.js`, remove the liveness import, constants, mapping, temporal overrides, and liveness risk flags. Call `assessServerAntispoof(entry.antispoof)` and return its block before the remaining descriptor, frame, resolution, and orientation checks.

In `lib/attendance/challenge-policy.js`, remove the liveness comparison. Do not mark a score below 0.58 as a gray-zone risk because capture policy now blocks it.

- [ ] **Step 8: Run unit and route tests**

Run: `node tests/run-tests.mjs`

Expected: PASS.

Run: `npm run test:routes -- --test-name-pattern="kiosk persists|server anti-spoof"`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add .env.example lib/biometrics/antispoof-policy.js lib/biometrics/server-embedding-core.js lib/biometrics/server-attendance.js lib/attendance/normalize.js lib/attendance/capture-policy.js lib/attendance/challenge-policy.js lib/attendance/process.js tests/run-tests.mjs tests/postgres/identity.routes.test.mjs
git commit -m "fix: require server anti-spoofing"
```

## Task 8: Remove browser liveness, models, labels, and maintenance noise

**Files:**

- Delete: `lib/biometrics/liveness.js`
- Delete: `public/models/human/liveness.json`
- Delete: `public/models/human/liveness.bin`
- Delete: `public/models/human/iris.json`
- Delete: `public/models/human/iris.bin`
- Modify: `lib/biometrics/human.js`
- Modify: `lib/biometrics/server-embedding-core.js`
- Modify: `hooks/useVerificationBurst.js`
- Modify: `hooks/useKioskLoop.js`
- Modify: `lib/kiosk-utils.js`
- Modify: `lib/maintenance/event-evidence.js`
- Modify: `lib/maintenance/system-evidence.js`
- Modify: `app/api/health/route.js`
- Modify: `README.md`
- Modify: `tests/run-tests.mjs`
- Modify: `tests/ui/source-hygiene.test.js`
- Modify: `tests/ui/kiosk.test.jsx`
- Modify: `tests/ui/public-attendance.test.jsx`
- Modify: `tests/postgres/identity.routes.test.mjs`

- [ ] **Step 1: Write failing source and UI expectations**

Add a source-hygiene test that searches active application files, `.env.example`, and README for biometric liveness fields and model names. Allow historical migration or committed design documents, but require zero active imports or payload fields for:

```text
livenessEvidence
blocked_missing_liveness
blocked_liveness
weak_eye_signal
weak_temporal_liveness
liveness.json
liveness.bin
```

Add kiosk UI assertions that anti-spoof failure displays “Photo or screen detected” and no screen asks the employee to blink, move naturally, or pass liveness.

**Execution clarification identified on 2026-09-02:** the Human library configuration still needs explicit disabled model switches. Permit only `liveness: { enabled: false }` (and the equivalent disabled iris setting) in the two Human configuration files; these switches are not active features. Remove obsolete profile properties and liveness model-path strings. Source checks must distinguish these deliberate disabling flags from a model load, returned metric, capture decision, request field, or UI instruction. A literal zero-occurrence check for the word `liveness` would contradict the required disabled configuration.

- [ ] **Step 2: Run source and UI tests and confirm failure**

Run: `npx vitest run tests/ui/kiosk.test.jsx tests/ui/source-hygiene.test.js`

Expected: FAIL on current liveness code and labels.

- [ ] **Step 3: Remove liveness capture and request data**

In `lib/biometrics/human.js`, set browser liveness and iris models disabled and stop mapping `face.live`.

In `hooks/useVerificationBurst.js`, remove iris warnings, `analyzeBurstLiveness`, liveness-frame construction, and returned `livenessEvidence`. Keep descriptor capture, strict-frame selection, pose data, and camera diagnostics.

In `hooks/useKioskLoop.js`, remove browser liveness blocking and remove `antispoof`, `liveness`, and `livenessEvidence` from the request body. Keep raw server scan frames and all non-liveness capture information.

- [ ] **Step 4: Remove obsolete response labels and maintenance category**

In `lib/kiosk-utils.js`, remove active liveness response cases. Keep `blocked_antispoof` with plain photo/screen guidance.

In `lib/maintenance/event-evidence.js`, replace `liveness_observation_block` with `antispoof_observation_block`. Map active anti-spoof decision codes there. Map historical `blocked_liveness` and `blocked_missing_liveness` rows to `other_biometric_failure` so old evidence remains countable without presenting liveness as an active feature.

In `lib/maintenance/system-evidence.js`, remove liveness and iris model files from the required Human inventory. Keep face detector, face mesh, face descriptor, and anti-spoof files.

Change `/api/health` response `kind` from `process-liveness` to `process-health`; this avoids using biometric terminology for simple process status.

- [ ] **Step 5: Delete unused liveness and iris assets**

Delete the five files listed at the start of this task. Before deletion, the source search must show iris is used only by the removed liveness path.

- [ ] **Step 6: Update tests and documentation**

Remove liveness imports and tests from `tests/run-tests.mjs`. Update model-inventory and PostgreSQL route fixtures to anti-spoof-only payloads. Update README authority text to “server embedding and anti-spoof policy.”

Do not change the attendance PIN tests or flow.

- [ ] **Step 7: Prove no active liveness remains**

Run:

```powershell
rg -n -i "liveness|livenessEvidence|blocked_liveness|weak_eye_signal" app components hooks lib public .env.example README.md tests
```

Expected: output is limited to the explicit legacy decision-code mapping in `lib/maintenance/event-evidence.js`, fixtures labeled as legacy evidence, and the narrowly allowed disabled Human configuration switches. There is no liveness import, model path, request or response field, capture decision, UI guidance, or active maintenance category.

- [ ] **Step 8: Run focused suites**

Run: `node tests/run-tests.mjs`

Expected: PASS.

Run: `npx vitest run tests/ui/kiosk.test.jsx tests/ui/public-attendance.test.jsx tests/ui/source-hygiene.test.js`

Expected: PASS.

Run: `npm run test:routes -- --test-name-pattern="kiosk persists|anti-spoof|health"`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -- .env.example README.md app/api/health/route.js hooks/useKioskLoop.js hooks/useVerificationBurst.js lib/attendance/capture-policy.js lib/attendance/challenge-policy.js lib/attendance/normalize.js lib/attendance/process.js lib/biometrics/human.js lib/biometrics/liveness.js lib/biometrics/server-attendance.js lib/biometrics/server-embedding-core.js lib/kiosk-utils.js lib/maintenance/event-evidence.js lib/maintenance/system-evidence.js public/models/human/iris.bin public/models/human/iris.json public/models/human/liveness.bin public/models/human/liveness.json tests/postgres/identity.routes.test.mjs tests/run-tests.mjs tests/ui/kiosk.test.jsx tests/ui/public-attendance.test.jsx tests/ui/source-hygiene.test.js
git commit -m "refactor: remove biometric liveness"
```

## Task 9: Add the safe server-error contract

**Files:**

- Create: `lib/http/server-error.js`
- Create: `tests/server-error.test.mjs`
- Create: `tests/security/server-error-responses.test.mjs`
- Modify: `package.json`
- Modify: `lib/routes/persons-route.js`
- Modify: `lib/biometrics/server-attendance.js`
- Modify: `lib/attendance/process.js`
- Modify: `tests/postgres/identity.routes.test.mjs`

- [ ] **Step 1: Write failing runtime tests**

Create `tests/server-error.test.mjs`:

```javascript
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SafeRequestError,
  serverErrorResponse,
} from '../lib/http/server-error.js'

test('unexpected server errors return tracking ID without internal text', async () => {
  const originalError = console.error
  console.error = () => {}
  try {
    const response = serverErrorResponse(
      new Error('postgres://private-user:private-password@private-host/database'),
      { context: 'test', publicMessage: 'Request could not be completed.' },
    )
    const payload = await response.json()
    assert.equal(response.status, 500)
    assert.equal(payload.message, `Request could not be completed. Reference: ${payload.errorId}`)
    assert.match(payload.errorId, /^[0-9a-f-]{36}$/i)
    assert.doesNotMatch(JSON.stringify(payload), /private-user|private-password|private-host/i)
  } finally {
    console.error = originalError
  }
})

test('declared request errors keep only their approved public message', async () => {
  const response = serverErrorResponse(
    new SafeRequestError('Choose a valid holiday year.', { status: 400, code: 'invalid_holiday_year' }),
    { context: 'test' },
  )
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), {
    ok: false,
    code: 'invalid_holiday_year',
    message: 'Choose a valid holiday year.',
  })
})
```

- [ ] **Step 2: Write a failing source guard**

Create `tests/security/server-error-responses.test.mjs`. Recursively read `app/api`, `lib/routes`, and `lib/attendance`; fail on these raw-error message fields:

```javascript
const forbidden = [
  /(?:message|error|detail|reason)\s*:\s*error\s+instanceof\s+Error\s*\?\s*error\.message/,
  /(?:message|error|detail|reason)\s*:\s*err\s+instanceof\s+Error\s*\?\s*err\.message/,
  /(?:message|error|detail|reason)\s*:\s*error\?\.message/,
  /(?:message|error|detail|reason)\s*:\s*err\?\.message/,
  /(?:message|error|detail|reason)\s*:\s*error\.message/,
]
```

Use `internalMessage` rather than `message` for server-only `console.error` and `console.warn` metadata. This keeps the guard simple and prevents raw errors from being mistaken for client-safe message fields. Direct log arguments such as `console.error(label, error?.message)` remain allowed because they do not create a response-like `message` field.

**Execution correction identified on 2026-09-02:** the attendance processor also copies caught embedding errors into an intermediate `message` variable and returns that text as a scan rejection. A route-only field search would miss this path. Add a runtime test injecting an embedding service failure containing a private connection string or file path; `/api/attendance/v2` must return its generic 500 response with an error ID, never raw text or a misleading 403. Check the one-frame and fallback-frame error paths. Preserve normal expected scan guidance only for explicitly declared safe request errors; unexpected model, image, filesystem, or database failures must propagate to the existing safe outer route catch. Add a focused source assertion for these intermediate handoffs as well as the field patterns above.

- [ ] **Step 3: Add the tests to the normal test command and confirm failure**

Add both files to the first `node --test` group in `package.json`.

Run: `node --test tests/server-error.test.mjs tests/security/server-error-responses.test.mjs`

Expected: FAIL because helper is missing and many routes return caught error text.

- [ ] **Step 4: Implement the helper**

Create `lib/http/server-error.js`:

```javascript
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server.js'

export class SafeRequestError extends Error {
  constructor(message, { status = 400, code = 'invalid_request' } = {}) {
    super(message)
    this.name = 'SafeRequestError'
    this.status = status
    this.code = code
  }
}

export function serverErrorResponse(error, {
  context = 'server',
  publicMessage = 'Request could not be completed. Please try again.',
} = {}) {
  if (error instanceof SafeRequestError) {
    return NextResponse.json(
      { ok: false, code: error.code, message: error.message },
      { status: error.status },
    )
  }

  const errorId = randomUUID()
  console.error(`[${context}] Unexpected error`, {
    errorId,
    errorName: error?.name || 'UnknownError',
    errorCode: error?.code || '',
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  })
  return NextResponse.json(
    { ok: false, message: `${publicMessage} Reference: ${errorId}`, errorId },
    { status: 500 },
  )
}
```

- [ ] **Step 5: Restrict registration error codes**

The explicit `.js` import is required by the standalone Node 22 ESM helper tests; the extensionless Next import does not resolve without the route test loader. In `server-attendance.js`, declare expected capture errors using `SafeRequestError` with the existing approved decision code and status. In the processor, retain only those approved messages and rethrow unknown errors to the outer route catch. Do not remove the existing one-frame/two-frame retry decisions or convert native errors into trusted request errors merely because they have a `message` or `code` property.

In `lib/routes/persons-route.js`, keep only the expected duplicate conflict as a direct response:

```javascript
if (duplicateFace?.duplicate || duplicateRegistration) {
  return NextResponse.json({
    ok: false,
    code: 'duplicate_person_registration',
    message: 'This registration matches an existing employee record and cannot be submitted again.',
  }, { status: 409 })
}

return serverErrorResponse(error, {
  context: 'api/persons:POST',
  publicMessage: 'Registration could not be completed. Please try again or contact HR.',
})
```

Do not return arbitrary PostgreSQL or native-library `error.code` values. Remove the now-unused `toHttpStatus` helper.

Rename both server-only log metadata keys in this file from `message` to `internalMessage`; the logged value remains server-only.

In `tests/postgres/identity.routes.test.mjs`, create a persons POST handler whose injected `enrollLocalPerson` throws `new Error('postgres://private-registration-host/faceid')`. Submit an otherwise valid fixture and assert status 500, matching `errorId`, a visible `Reference: <same ID>` in the message, and no private string. Keep the existing duplicate-registration 409 assertion.

- [ ] **Step 6: Run helper test**

Run: `node --test tests/server-error.test.mjs`

Expected: PASS. Source guard still fails until Tasks 10 and 11 finish.

Run: `npm run test:routes -- --test-name-pattern="registration hides internal error|attendance hides internal error|duplicate registration"`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/http/server-error.js lib/routes/persons-route.js package.json tests/server-error.test.mjs tests/security/server-error-responses.test.mjs tests/postgres/identity.routes.test.mjs
git commit -m "feat: add safe server error responses"
```

## Task 10: Replace raw errors in public and employee routes

**Files:**

- Modify: `app/api/attendance/challenge/route.js`
- Modify: `app/api/attendance/count/route.js`
- Modify: `app/api/attendance/daily/route.js`
- Modify: `app/api/attendance/dtr/route.js`
- Modify: `app/api/attendance/me/route.js`
- Modify: `app/api/attendance/monthly/route.js`
- Modify: `app/api/attendance/public/route.js`
- Modify: `app/api/attendance/recent/route.js`
- Modify: `app/api/attendance/table/route.js`
- Modify: `app/api/attendance/v2/route.js` (server-log key only)
- Modify: `app/api/offices/route.js`
- Modify: `app/api/public/offices/route.js`
- Modify: `app/api/persons/route.js`
- Modify: `app/api/persons/pending-count/route.js`
- Modify: `app/api/persons/check-duplicate/route.js`
- Modify: `lib/routes/persons-route.js` (persons GET moved here during Task 3)
- Modify: `app/api/persons/[personId]/access-code/route.js`
- Modify: `app/api/persons/[personId]/photo/route.js` (server-log key only)
- Modify: `app/api/persons/[personId]/reenroll/route.js` (server-log key only)
- Test: `tests/security/server-error-responses.test.mjs`
- Test: `tests/postgres/identity.routes.test.mjs`

- [ ] **Step 1: Add a forced public-route failure test**

Expose a small factory for `app/api/public/offices/route.js`:

```javascript
export function createPublicOfficesGetHandler({ listOffices = listOfficeRecords } = {}) {
  return async function getPublicOffices() {
    try {
      const offices = await listOffices(null)
      return NextResponse.json({
        ok: true,
        offices: offices
          .filter(office => (office?.status || 'active') !== 'inactive')
          .map(toPublicOffice),
      })
    } catch (error) {
      return serverErrorResponse(error, {
        context: 'api/public/offices:GET',
        publicMessage: 'Failed to load offices.',
      })
    }
  }
}

export const GET = createPublicOfficesGetHandler()
```

Inject a loader that throws a secret-like connection string. Assert response has status 500, a tracking ID, and no secret text.

- [ ] **Step 2: Replace public-route catches with the shared helper**

For every file listed above, import `serverErrorResponse` and replace raw catch responses using this exact mapping:

Apply the `/api/persons` GET row inside `createPersonsGetHandler` in `lib/routes/persons-route.js`; the route file now only instantiates that handler. Do not leave the moved catch outside the error-response sweep.

| Route | Method | Context | Public message |
|---|---|---|---|
| `/api/attendance/challenge` | POST | `api/attendance/challenge:POST` | `Failed to issue attendance challenge.` |
| `/api/attendance/count` | GET | `api/attendance/count:GET` | `Failed to load attendance count.` |
| `/api/attendance/daily` | GET | `api/attendance/daily:GET` | `Failed to load daily attendance records.` |
| `/api/attendance/dtr` | GET | `api/attendance/dtr:GET` | `Failed to generate DTR workbook.` |
| `/api/attendance/me` | GET | `api/attendance/me:GET` | `Failed to load attendance records.` |
| `/api/attendance/monthly` | GET | `api/attendance/monthly:GET` | `Failed to load monthly attendance.` |
| `/api/attendance/public` | GET | `api/attendance/public:GET` | `Failed to load daily attendance records.` |
| `/api/attendance/recent` | GET | `api/attendance/recent:GET` | `Failed to load attendance.` |
| `/api/attendance/table` | GET | `api/attendance/table:GET` | `Failed to load attendance table.` |
| `/api/offices` | GET | `api/offices:GET` | `Failed to load offices.` |
| `/api/public/offices` | GET | `api/public/offices:GET` | `Failed to load offices.` |
| `/api/persons` | GET | `api/persons:GET` | `Failed to load employees.` |
| `/api/persons/pending-count` | GET | `api/persons/pending-count:GET` | `Failed to load pending count.` |
| `/api/persons/check-duplicate` | POST | `api/persons/check-duplicate:POST` | `Failed to check duplicate.` |
| `/api/persons/[personId]/access-code` | POST | `api/persons/[personId]/access-code:POST` | `Failed to regenerate the access code.` |

Use this exact form for each table row:

```javascript
} catch (error) {
  return serverErrorResponse(error, {
    context: 'api/public/offices:GET',
    publicMessage: 'Failed to load offices.',
  })
}
```

Do not include request bodies, coordinates, face data, credentials, or session values in helper options.

In person-photo and person-reenrollment routes, do not change response behavior. Rename server log object key `message` to `internalMessage` so the source guard can distinguish internal logging from client messages. In the already-safe `/api/attendance/v2` route, make the same log-key rename and append `Reference: ${errorId}` to its generic 500 message while retaining the separate `errorId` field.

In `app/api/attendance/table/route.js`, replace the deliberate configuration throw with:

```javascript
throw new SafeRequestError(
  'Office work policy is not configured for attendance history.',
  { status: 503, code: 'office_policy_unavailable' },
)
```

Keep the existing custom `/api/attendance/v2` safe error and audit behavior; it already returns a tracking ID without internal text.

- [ ] **Step 3: Run source and route tests**

Run: `node --test tests/server-error.test.mjs tests/security/server-error-responses.test.mjs`

Expected: source guard may still fail only on staff and administrator routes assigned to Task 11.

Run: `npm run test:routes -- --test-name-pattern="public route hides internal error"`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/api/attendance app/api/offices/route.js app/api/public/offices/route.js app/api/persons tests/security/server-error-responses.test.mjs tests/postgres/identity.routes.test.mjs
git commit -m "fix: hide public route errors"
```

## Task 11: Replace raw errors in staff and administrator routes

**Files:**

- Modify: `app/api/admin/attendance/route.js`
- Modify: `app/api/admin/attendance/[attendanceId]/route.js`
- Modify: `app/api/admin/audit-logs/route.js`
- Modify: `app/api/admin/kiosk-devices/route.js`
- Modify: `app/api/admin/offices/route.js`
- Modify: `app/api/admin/offices/[officeId]/route.js`
- Modify: `app/api/admins/route.js`
- Modify: `app/api/admins/[adminId]/route.js`
- Modify: `app/api/hr-users/route.js`
- Modify: `app/api/hr-users/[hrUserId]/route.js`
- Modify: `app/api/hr/employees/route.js`
- Modify: `app/api/hr/session/route.js`
- Modify: `app/api/hr/office-settings/route.js`
- Modify: `app/api/hr/dtr/employees/route.js`
- Modify: `app/api/hr/dtr/route.js`
- Modify: `app/api/hr/dtr/workbook/route.js`
- Modify: `app/api/hr/workforce-records/route.js`
- Test: `tests/security/server-error-responses.test.mjs`

- [ ] **Step 1: Convert declared workforce validation failures**

Import `SafeRequestError` and `serverErrorResponse` in the workforce route. Replace each validation `throw new Error(message)` with:

```javascript
throw new SafeRequestError(message, {
  status: 400,
  code: 'invalid_workforce_record',
})
```

Use this exact message-to-code mapping for both POST and PATCH while keeping every current user-facing message:

| Validation message | Code |
|---|---|
| `Choose a valid holiday year.` | `invalid_holiday_year` |
| `Holiday date, name, and scope are required.` | `invalid_holiday` |
| `Holiday date and name are required.` | `invalid_holiday` |
| `Employee and a valid date range are required.` | `invalid_leave_dates` |
| `Leave type must be VL, SL, CTO, or WL (Wellness Leave).` | `invalid_leave_type` |
| `A valid leave type and date range are required.` | `invalid_leave_type` |
| `This employee already has an overlapping leave record.` | `workforce_date_conflict` |
| `At least one employee and a valid date range are required.` | `invalid_official_order` |
| `A valid date range is required.` | `invalid_official_order` |
| `Select at least one employee for this official order.` | `invalid_official_order` |
| `A selected employee already has an overlapping official order.` | `workforce_date_conflict` |
| `A valid policy scope is required.` | `invalid_policy_scope` |

- [ ] **Step 2: Replace every staff and administrator raw catch**

For each listed route and method, replace `error.message` response data with the exact context and public message below:

| Route | Method | Context | Public message |
|---|---|---|---|
| `/api/admin/attendance` | GET | `api/admin/attendance:GET` | `Failed to load attendance logs.` |
| `/api/admin/attendance` | POST | `api/admin/attendance:POST` | `Failed to create attendance entry.` |
| `/api/admin/attendance/[attendanceId]` | DELETE | `api/admin/attendance/[attendanceId]:DELETE` | `Failed to delete attendance entry.` |
| `/api/admin/attendance/[attendanceId]` | PATCH | `api/admin/attendance/[attendanceId]:PATCH` | `Failed to review field-duty request.` |
| `/api/admin/audit-logs` | GET | `api/admin/audit-logs:GET` | `Failed to load audit logs.` |
| `/api/admin/kiosk-devices` | GET | `api/admin/kiosk-devices:GET` | `Failed to load kiosk devices.` |
| `/api/admin/offices` | POST | `api/admin/offices:POST` | `Failed to create office.` |
| `/api/admin/offices/[officeId]` | PUT | `api/admin/offices/[officeId]:PUT` | `Failed to save office configuration.` |
| `/api/admin/offices/[officeId]` | DELETE | `api/admin/offices/[officeId]:DELETE` | `Failed to delete office.` |
| `/api/admins` | GET | `api/admins:GET` | `Failed to load admin records.` |
| `/api/admins` | POST | `api/admins:POST` | `Failed to create admin record.` |
| `/api/admins/[adminId]` | PUT | `api/admins/[adminId]:PUT` | `Failed to update admin record.` |
| `/api/admins/[adminId]` | DELETE | `api/admins/[adminId]:DELETE` | `Failed to delete admin record.` |
| `/api/hr-users` | GET | `api/hr-users:GET` | `Failed to load HR user records.` |
| `/api/hr-users` | POST | `api/hr-users:POST` | `Failed to create HR user record.` |
| `/api/hr-users/[hrUserId]` | PUT | `api/hr-users/[hrUserId]:PUT` | `Failed to update HR user record.` |
| `/api/hr-users/[hrUserId]` | DELETE | `api/hr-users/[hrUserId]:DELETE` | `Failed to delete HR user record.` |
| `/api/hr/employees` | GET | `api/hr/employees:GET` | `Failed to load employees.` |
| `/api/hr/session` | GET | `api/hr/session:GET` | `Failed to load HR session.` |
| `/api/hr/office-settings` | GET | `api/hr/office-settings:GET` | `Unable to load office settings.` |
| `/api/hr/office-settings` | PUT | `api/hr/office-settings:PUT` | `Unable to save office settings.` |
| `/api/hr/dtr/employees` | GET | `api/hr/dtr/employees:GET` | `Failed to load employees.` |
| `/api/hr/dtr` | GET | `api/hr/dtr:GET` | `Failed to generate DTR.` |
| `/api/hr/dtr/workbook` | POST | `api/hr/dtr/workbook:POST` | `Failed to generate DTR workbook.` |
| `/api/hr/workforce-records` | POST | `api/hr/workforce-records:POST` | `Unable to save workforce record.` |
| `/api/hr/workforce-records` | PATCH | `api/hr/workforce-records:PATCH` | `Unable to update workforce record.` |

Use this exact form for each table row:

```javascript
return serverErrorResponse(error, {
  context: 'api/hr/session:GET',
  publicMessage: 'Failed to load HR session.',
})
```

Keep expected 400, 401, 403, 404, and 409 responses outside the unexpected catch. A database uniqueness error or programming exception must not become a client-visible message.

- [ ] **Step 3: Run the source guard**

Run: `node --test tests/server-error.test.mjs tests/security/server-error-responses.test.mjs`

Expected: PASS with no raw caught-error message in API responses.

- [ ] **Step 4: Run focused route tests**

Run: `npm run test:routes -- --test-name-pattern="HR|attendance correction|workforce|office"`

Expected: PASS; expected validation text remains stable and unexpected failures are generic.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin app/api/admins app/api/hr-users app/api/hr lib/http/server-error.js tests/security/server-error-responses.test.mjs
git commit -m "fix: hide staff route errors"
```

## Task 12: Release 1 verification and evidence

**Files:**

- Modify only if a failing check reveals a Release 1 defect.
- Do not begin Release 2 cleanup while fixing Release 1 verification.

- [ ] **Step 1: Confirm working tree contains only intended Release 1 changes**

Run: `git status --short`

Expected: no unrelated or unidentified files.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 2: Prove Node.js release version**

Run: `node --version`

Expected for final release evidence: `v22.x.x`.

If local shell is not Node.js 22, record that limitation and rerun final proof in the configured Node.js 22 environment. Do not change global Node configuration without user authorization.

- [ ] **Step 3: Run all non-route tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 4: Run all PostgreSQL route tests**

Run: `npm run test:routes`

Expected: PASS against the guarded local PostgreSQL 18 `faceid_rc_*` database. The runner must refuse missing or unsafe `FACEID_TEST_DATABASE_URL` rather than using production `DATABASE_URL`.

- [ ] **Step 5: Run complete liveness and raw-error checks**

Run:

```powershell
rg -n -i "livenessEvidence|blocked_missing_liveness|blocked_liveness|weak_eye_signal|liveness.json|liveness.bin" app components hooks lib public .env.example README.md tests
node --test tests/security/server-error-responses.test.mjs
rg -n "(message|error|detail|reason)\s*:\s*(error\s+instanceof\s+Error\s*\?\s*error\.message|err\s+instanceof\s+Error\s*\?\s*err\.message|error\?\.message|err\?\.message|error\.message)" app/api lib/routes
```

Expected: liveness search output is limited to the explicit legacy decision-code mapping and labeled legacy fixtures; the raw-error guard passes; the final raw-error search prints nothing. No liveness import, model path, request or response field, capture decision, UI guidance, or active maintenance category remains.

- [ ] **Step 6: Build the hosting artifact**

Run: `npm run build:hosting`

Expected: PASS. Release 4 has not yet removed `.next/cache` or disabled OpenVINO materialization, so artifact-size findings remain known and are not falsely claimed fixed here.

- [ ] **Step 7: Perform manual security smoke checks**

Using local test accounts and non-production data:

1. Gensan HR cannot open or change Cotabato employee, attendance, correction, DTR, or workforce records.
2. Regional HR can open employees in two Regional Office divisions and cannot open Gensan or Cotabato employees.
3. No HR screen or response contains map, latitude, longitude, radius, location, or Wi-Fi data.
4. Employee without Employee ID can receive a correction by `personId`.
5. Two simultaneous first scans create one attendance.
6. Printed or displayed face replay is rejected by server anti-spoofing.
7. Genuine face succeeds under expected lighting; record score and response time to detect excessive false rejections.
8. Attendance PIN flow behaves exactly as before.
9. Forced internal route failure returns a tracking ID and no database or file-system detail.

- [ ] **Step 8: Review final diff**

Run: `git diff e38ae78..HEAD --stat`

Run: `git log --oneline e38ae78..HEAD`

Expected: small, named commits matching Tasks 1–11 plus the approved plan commit; no Release 2 or Release 3 work mixed in.

If any check exposes a defect, return to the owning task, add a focused failing test, fix only that defect, rerun the task checks, and amend that task before repeating this final gate. Do not create an empty “verification” commit.

# Organization Hierarchy and Cascading Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a normalized Regional Office → Department → Division → Section hierarchy, safely import legacy divisions, and provide descendant-aware Admin/Office HR filters across employee and DTR workflows.

**Architecture:** `organization_units` is an adjacency-list tree scoped to an office; each person stores the deepest applicable unit ID and derives ancestors. An additive migration preserves legacy division fields during compatibility. Server queries validate ancestry and office scope, while UI selectors cascade and clear invalid descendants.

**Tech Stack:** PostgreSQL recursive CTEs, Next.js Route Handlers, React 18, Zustand, Node.js 22 tests.

---

## File Structure

- Create `db/migrations/0016_organization_units.sql`: additive hierarchy tables, mappings, constraints, indexes, person reference, and assignment history.
- Create `lib/organization-hierarchy.js`: pure type/ancestry/filter normalization.
- Create `lib/postgres/organization-store.js`: hierarchy queries, validation, descendant resolution, legacy import report.
- Create `app/api/organization-units/route.js`: scoped list/create API.
- Create `app/api/organization-units/[unitId]/route.js`: scoped update/deactivate API.
- Create `tests/postgres/organization.routes.test.mjs`: migration, ancestry, scope, and filter proofs.
- Modify `lib/postgres/person-store.js`: normalized assignment and descendant directory filter.
- Modify `lib/persons/directory.js`: parse `departmentId`, `divisionId`, `sectionId`, and `organizationUnitId`.
- Modify `app/api/persons/route.js` and `app/api/persons/[personId]/route.js`: validate canonical unit assignment.
- Modify `lib/postgres/report-store.js`, `app/api/hr/employees/route.js`, and DTR routes: descendant filters with HR scope.
- Modify `lib/offices.js`, office admin routes/components: compatibility read while unit administration moves to its API.
- Modify `lib/admin/store-slices/employees.js`, `lib/admin/hooks/useEmployees.js`, and `components/admin/EmployeesPanel.jsx`: cascading filters.
- Modify registration/editor/DTR/workforce components: normalized assignment/path display.

### Task 1: Pure hierarchy rules

**Files:**
- Create: `lib/organization-hierarchy.js`
- Modify: `tests/run-tests.mjs`

- [ ] **Step 1: Write failing hierarchy-rule tests**

Cover valid parent combinations, optional intermediate levels, cross-office rejection, cycles, inactive assignment, ancestor path ordering, parent filter resets, and selecting a parent including descendants.

```javascript
assert.equal(isAllowedUnitParent('department', null), true)
assert.equal(isAllowedUnitParent('division', 'department'), true)
assert.equal(isAllowedUnitParent('division', null), true)
assert.equal(isAllowedUnitParent('section', 'division'), true)
assert.equal(isAllowedUnitParent('department', 'division'), false)
assert.deepEqual(clearDescendantFilters({ officeId: 'ro', departmentId: 'd', divisionId: 'v', sectionId: 's' }, 'department'), {
  officeId: 'ro', departmentId: 'd', divisionId: 'all', sectionId: 'all',
})
```

- [ ] **Step 2: Run and confirm missing-module failure**

Run: `npm test`
Expected: FAIL because `lib/organization-hierarchy.js` does not exist.

- [ ] **Step 3: Implement pure rules**

Export `UNIT_TYPES`, `isAllowedUnitParent`, `validateHierarchyPath`, `buildOrganizationPath`, `clearDescendantFilters`, and `normalizeOrganizationFilters`. Keep the module independent of React, Next.js, PostgreSQL, and office storage.

- [ ] **Step 4: Re-run and commit**

Run: `npm test`
Expected: PASS.

```powershell
git add lib/organization-hierarchy.js tests/run-tests.mjs
git commit -m "test: define organization hierarchy rules"
```

### Task 2: Additive organization schema

**Files:**
- Create: `db/migrations/0016_organization_units.sql`
- Test: `tests/postgres/organization.routes.test.mjs`

- [ ] **Step 1: Write failing migration tests**

After applying all migrations, assert tables/columns/indexes exist, invalid unit types fail, cross-office parent assignment fails through the server transaction, referenced unit deletion is blocked, and `persons.organization_unit_id` remains nullable for compatibility.

- [ ] **Step 2: Add the schema**

```sql
CREATE TABLE IF NOT EXISTS organization_units (
  id text PRIMARY KEY,
  office_id text NOT NULL REFERENCES offices(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  parent_id text NULL REFERENCES organization_units(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  unit_type text NOT NULL CHECK (unit_type IN ('department', 'division', 'section')),
  name text NOT NULL,
  name_lower text NOT NULL,
  short_name text NOT NULL DEFAULT '',
  head_name text NOT NULL DEFAULT '',
  head_position text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  legacy_division_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE persons ADD COLUMN IF NOT EXISTS organization_unit_id text NULL;
ALTER TABLE persons
  ADD CONSTRAINT persons_organization_unit_fk
  FOREIGN KEY (organization_unit_id) REFERENCES organization_units(id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS organization_units_parent_idx ON organization_units(parent_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS organization_units_office_idx ON organization_units(office_id, unit_type, is_active, sort_order);
CREATE INDEX IF NOT EXISTS persons_organization_unit_idx ON persons(organization_unit_id);
CREATE UNIQUE INDEX IF NOT EXISTS organization_units_root_name_unique_idx
  ON organization_units(office_id, unit_type, name_lower)
  WHERE parent_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS organization_units_child_name_unique_idx
  ON organization_units(office_id, parent_id, unit_type, name_lower)
  WHERE parent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS organization_units_legacy_division_unique_idx
  ON organization_units(office_id, legacy_division_id)
  WHERE legacy_division_id <> '';

CREATE TABLE IF NOT EXISTS person_organization_assignments (
  id bigserial PRIMARY KEY,
  person_id text NOT NULL REFERENCES persons(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  office_id text NOT NULL REFERENCES offices(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  organization_unit_id text NULL REFERENCES organization_units(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  effective_from date NOT NULL,
  effective_to date NULL,
  reason text NOT NULL,
  actor_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS person_organization_open_assignment_idx
  ON person_organization_assignments(person_id)
  WHERE effective_to IS NULL;
CREATE INDEX IF NOT EXISTS person_organization_assignment_date_idx
  ON person_organization_assignments(person_id, effective_from, effective_to);
```

Do not drop or rename legacy `division_id`, `division_name`, or `offices.divisions`.

- [ ] **Step 3: Apply to the isolated database**

Run: `npm run postgres:test:reset`
Expected: `0014_add_rejected_employee_lifecycle.sql`, `0015_security_rate_limits.sql`, and `0016_organization_units.sql` are recorded in `schema_migrations`.

- [ ] **Step 4: Run migration tests and commit**

Run: `npm run test:routes -- --test-name-pattern="organization migration"`
Expected: PASS.

```powershell
git add db/migrations/0016_organization_units.sql tests/postgres/organization.routes.test.mjs
git commit -m "feat: add organization unit schema"
```

### Task 3: PostgreSQL hierarchy store and compatibility import

**Files:**
- Create: `lib/postgres/organization-store.js`
- Test: `tests/postgres/organization.routes.test.mjs`

- [ ] **Step 1: Write failing store tests**

Seed Regional and non-regional offices. Assert list tree ordering, allowed parent types, cycle rejection, cross-office rejection, deactivation behavior, descendant IDs, deepest-unit path, and legacy division import. Include duplicate/missing legacy IDs and assert they appear in an exception report instead of guessed mappings.

- [ ] **Step 2: Implement store interfaces**

```javascript
export async function listOrganizationUnits({ officeId, activeOnly = true, client = null })
export async function getOrganizationUnitPath({ unitId, client = null })
export async function listOrganizationDescendantIds({ unitId, includeSelf = true, client = null })
export async function validatePersonOrganizationAssignment({ officeId, organizationUnitId, client = null })
export async function upsertOrganizationUnit(unit, { actor, client = null })
export async function deactivateOrganizationUnit(unitId, { actor, client = null })
export async function importLegacyOfficeDivisions({ officeId, dryRun = true, client = null })
```

Use a recursive CTE for paths/descendants and a transaction-level cycle check before parent updates. The import generates stable IDs from office + legacy division ID, writes only when `dryRun` is false, backfills only exact unambiguous matches, and returns `{ created, backfilled, ambiguous, unmatched }`.

- [ ] **Step 3: Run store tests and commit**

Run: `npm run test:routes -- --test-name-pattern="organization store|legacy division"`
Expected: PASS.

```powershell
git add lib/postgres/organization-store.js tests/postgres/organization.routes.test.mjs
git commit -m "feat: add organization hierarchy store"
```

### Task 4: Scoped organization APIs

**Files:**
- Create: `app/api/organization-units/route.js`
- Create: `app/api/organization-units/[unitId]/route.js`
- Test: `tests/postgres/organization.routes.test.mjs`

- [ ] **Step 1: Write failing authorization tests**

Assert public access is denied. Regional Admin can list/create/update/deactivate allowed units. Office-scoped Admin/HR can list only its office tree; Office HR cannot create/update/deactivate. Forged parent/unit IDs from another office return 403/409. Referenced units deactivate rather than delete.

- [ ] **Step 2: Implement thin route handlers**

GET resolves staff session, fixes `officeId` to the session office when scoped, and calls `listOrganizationUnits`. POST/PUT/DELETE require Regional Admin, origin guard, normalized payload, store validation, and immutable audit records. DELETE means deactivation and returns `{ ok: true, unit: { ...unit, isActive: false } }`.

- [ ] **Step 3: Run API tests and commit**

Run: `npm run test:routes -- --test-name-pattern="organization API"`
Expected: PASS.

```powershell
git add app/api/organization-units/route.js app/api/organization-units/[unitId]/route.js tests/postgres/organization.routes.test.mjs
git commit -m "feat: expose scoped organization APIs"
```

### Task 5: Person assignment and descendant directory queries

**Files:**
- Modify: `lib/postgres/person-store.js`
- Modify: `lib/persons/directory.js`
- Modify: `app/api/persons/route.js`
- Modify: `app/api/persons/[personId]/route.js`
- Modify: `lib/postgres/report-store.js`
- Modify: `app/api/hr/employees/route.js`
- Test: `tests/postgres/organization.routes.test.mjs`

- [ ] **Step 1: Write failing assignment/filter tests**

Assert a person assigned to a Section is returned by Section, parent Division, parent Department, and Office filters. Assert sibling/cross-office filters exclude it. Assert invalid unit/office assignment is rejected. Assert Office HR cannot override its office through query parameters. Assert any hierarchy filter change resets cursor pagination.

- [ ] **Step 2: Extend the directory contract**

Parse stable IDs:

```javascript
{
  officeId,
  departmentId,
  divisionId,
  sectionId,
  organizationUnitId: sectionId || divisionId || departmentId || '',
}
```

When a unit filter exists, resolve its descendant IDs and add `organization_unit_id = ANY($n::text[])`; verify the filter unit belongs to the requested/authorized office first.

- [ ] **Step 3: Validate writes server-side**

Registration and employee updates send `organizationUnitId`. The server calls `validatePersonOrganizationAssignment`, stores that ID, derives the path for response DTOs, and synchronizes legacy division fields only at this compatibility boundary. In the same transaction it closes the prior open `person_organization_assignments` row and inserts the new effective assignment with reason/actor; overlapping or multiple open assignments are rejected.

- [ ] **Step 4: Run directory tests and commit**

Run: `npm run test:routes -- --test-name-pattern="organization assignment|descendant filter"`
Expected: PASS.

```powershell
git add lib/postgres/person-store.js lib/persons/directory.js lib/postgres/report-store.js app/api/persons/route.js app/api/persons/[personId]/route.js app/api/hr/employees/route.js tests/postgres/organization.routes.test.mjs
git commit -m "feat: filter employees by organization tree"
```

### Task 6: Cascading Admin and Office HR filters

**Files:**
- Modify: `lib/admin/store-slices/employees.js`
- Modify: `lib/admin/hooks/useEmployees.js`
- Create: `components/admin/OrganizationFilters.jsx`
- Modify: `components/admin/EmployeesPanel.jsx`
- Modify: `components/admin/HrEmployeesPanel.jsx`
- Test: `tests/run-tests.mjs`

- [ ] **Step 1: Write state/query contract tests**

Assert changing Office clears Department/Division/Section; changing Department clears Division/Section; changing Division clears Section; every change clears current/next cursor and history; URL parameters include only selected stable IDs.

- [ ] **Step 2: Add store fields/actions**

Add `employeeDepartmentFilter`, `employeeDivisionFilter`, `employeeSectionFilter`, setters using `clearDescendantFilters`, and one `resetEmployeePagination` action. Avoid separate duplicated reset logic in components.

- [ ] **Step 3: Build one shared cascading component**

`OrganizationFilters` receives `units`, selected values, change callbacks, `officeLocked`, and `compact`. It derives child options from parent IDs, hides unused levels, keeps labels attached, and disables a child only while its parent/data is unavailable.

- [ ] **Step 4: Compose request filters**

`useEmployees` adds `departmentId`, `divisionId`, and `sectionId`. Office HR fixes Office to its session value and renders only descendants. No UI-provided office is trusted server-side.

- [ ] **Step 5: Run contract/route tests and commit**

Run:

```powershell
npm test
npm run test:routes -- --test-name-pattern="descendant filter|Office HR"
```

Expected: PASS.

```powershell
git add lib/admin/store-slices/employees.js lib/admin/hooks/useEmployees.js components/admin/OrganizationFilters.jsx components/admin/EmployeesPanel.jsx components/admin/HrEmployeesPanel.jsx tests/run-tests.mjs tests/postgres/organization.routes.test.mjs
git commit -m "feat: add cascading employee filters"
```

### Task 7: Registration, editor, workforce, DTR, and signatory integration

**Files:**
- Modify: `components/RegisterView.jsx`
- Modify: `components/register/DetailsStep.jsx`
- Modify: `components/admin/EmployeeEditorModal.jsx`
- Modify: `components/admin/WorkforcePanel.jsx`
- Modify: `components/admin/WorkforceRecordModal.jsx`
- Modify: `components/admin/summary/DtrModal.jsx`
- Modify: `components/admin/summary/DtrSelectionView.jsx`
- Modify: `lib/workforce-policy.js`
- Modify: `lib/dtr-server.js`
- Modify: `lib/offices.js`
- Modify: `app/api/hr/dtr/employees/route.js`
- Test: `tests/postgres/organization.routes.test.mjs`

- [ ] **Step 1: Write failing workflow tests**

Assert registration/editor requires the deepest selected valid unit only when that office configuration requires it; workforce policy resolves the nearest applicable unit scope; DTR employee filters include descendants; signatory resolves nearest configured unit head then office head; a display name never grants authority.

- [ ] **Step 2: Reuse `OrganizationFilters` for assignments**

Registration/editor send `organizationUnitId` and display the derived path. Non-regional offices with no child units hide all hierarchy selectors. Optional intermediate levels do not force empty controls.

- [ ] **Step 3: Resolve policy/signatory by ancestry**

Load the employee's assignment/path effective on the DTR date. Policy precedence is person-specific, deepest unit to ancestors, office, then national/default. Signatory selects the nearest configured authorized head in the same effective path, otherwise office head.

- [ ] **Step 4: Run all hierarchy gates**

Run:

```powershell
npm run postgres:test:reset
npm run test:routes -- --test-name-pattern="organization|hierarchy|DTR signatory"
npm test
git diff --check
```

Expected: PASS; legacy columns still exist and imported fixtures reconcile without guesses.

- [ ] **Step 5: Commit workflow integration**

```powershell
git add components/RegisterView.jsx components/register/DetailsStep.jsx components/admin/EmployeeEditorModal.jsx components/admin/WorkforcePanel.jsx components/admin/WorkforceRecordModal.jsx components/admin/summary/DtrModal.jsx components/admin/summary/DtrSelectionView.jsx lib/workforce-policy.js lib/dtr-server.js lib/offices.js app/api/hr/dtr/employees/route.js tests/postgres/organization.routes.test.mjs
git commit -m "feat: integrate organization hierarchy workflows"
```

## Phase Stop Gate

Do not remove legacy Division columns/JSON in this project. Stop if import reports ambiguous/unmatched rows without an exported exception report, if any forged cross-office unit passes, or if selecting a parent fails to include descendants. Production migration remains deferred until a trusted restorable backup and dry-run approval exist.

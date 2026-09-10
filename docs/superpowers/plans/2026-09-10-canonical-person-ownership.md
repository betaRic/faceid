# Canonical Person Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make person ID the sole employee-record ownership key and safely attach known historical attendance.

**Architecture:** Preserve existing API compatibility while moving grouping and ownership decisions to `person_id`. Use an idempotent SQL repair with an explicit owner for historical `12170` and unique-only matching for other legacy rows.

**Tech Stack:** Next.js, JavaScript, PostgreSQL, Vitest, Node.js

---

### Task 1: Protect daily summaries from repeated employee numbers

**Files:**
- Modify: `lib/attendance-summary.js`
- Modify: `app/api/attendance/daily/route.js`
- Test: `tests/run-tests.mjs`

- [ ] Add a failing test with two person IDs sharing one employee number.
- [ ] Run the focused test and confirm that the current code merges the people.
- [ ] Group attendance by `personId`; allow legacy employee-number matching only when exactly one person owns the number.
- [ ] Load fallback people by the person IDs present in attendance.
- [ ] Run the focused test and confirm separate summaries.

### Task 2: Add an idempotent historical ownership repair

**Files:**
- Create: `db/maintenance/2026-09-10-backfill-attendance-person-ownership.sql`
- Test: `tests/postgres/identity.routes.test.mjs`

- [ ] Add a failing database test for explicit `12170` ownership, unique-number repair, and ambiguous-number preservation.
- [ ] Run the focused database test and confirm the repair is missing.
- [ ] Add transactional SQL that assigns `12170` to Michael and repairs unique matches.
- [ ] Re-run the focused database test twice to prove idempotence.

### Task 3: Verify application identity paths

**Files:**
- Modify only if tests expose an unsafe active path.

- [ ] Run attendance, DTR, workforce, biometric, maintenance, and employee-route tests.
- [ ] Run the full pure test suite and production hosting build.
- [ ] Inspect the final diff for any employee-number ownership decision.

### Task 4: Repair live historical data safely

**Files:**
- Use: `db/maintenance/2026-09-10-backfill-attendance-person-ownership.sql`

- [ ] Record a database backup before mutation.
- [ ] Record dry-run counts and total attendance rows.
- [ ] Apply the transaction once.
- [ ] Verify unchanged attendance row count, correct `12170` owner, and remaining unresolved rows.
- [ ] Rebuild affected daily summaries without changing raw attendance.


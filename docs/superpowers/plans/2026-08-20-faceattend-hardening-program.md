# FaceAttend Hardening Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the approved FaceAttend hardening design as six independently testable phases without touching production or deploying.

**Architecture:** The program starts with a fail-closed local PostgreSQL route harness, repairs authoritative identity and attendance boundaries, removes Firebase only after extraction/caller proof, adds the organization hierarchy additively, then renews UI and performs classification-first cleanup. Every phase has a stop gate; later phases may not hide failures from earlier ones.

**Tech Stack:** Next.js 16, React 18, PostgreSQL 18, Node.js 22, `pg`, `sharp`, `framer-motion` 11, Tailwind CSS 3.

---

## Execution Order

- [ ] **Phase 1: PostgreSQL route harness and identity hardening**

Execute [2026-08-20-postgres-route-harness-and-identity-hardening.md](./2026-08-20-postgres-route-harness-and-identity-hardening.md). Stop until registration, pending visibility, lifecycle, photo, re-enrollment, kiosk identity, deletion preservation, Office HR field scope, and route isolation pass.

- [ ] **Phase 2: Canonical attendance, corrections, DTR, and cron**

Execute [2026-08-20-canonical-attendance-corrections-dtr-cron.md](./2026-08-20-canonical-attendance-corrections-dtr-cron.md). Stop until every display/export fallback matches the canonical derivation and correction/cron scope tests pass.

- [ ] **Phase 3: Biometric math extraction and Firebase removal**

Execute [2026-08-20-biometric-math-and-firebase-removal.md](./2026-08-20-biometric-math-and-firebase-removal.md). Stop until pure math decisions remain stable, warm-cache behavior is truthful, and runtime Firebase calls reach zero.

- [ ] **Phase 4: Organization hierarchy and filters**

Execute [2026-08-20-organization-hierarchy-and-filters.md](./2026-08-20-organization-hierarchy-and-filters.md). Stop until migration/import exception reporting, descendant filters, forged-scope rejection, pagination reset, and DTR signatory ancestry pass. Do not remove legacy Division columns.

- [ ] **Phase 5: Responsive UI, motion, and accessibility**

Execute [2026-08-20-responsive-ui-motion-accessibility.md](./2026-08-20-responsive-ui-motion-accessibility.md). Stop until required widths, reduced motion, native bidirectional scrolling, keyboard/dialog behavior, and large-list fluidity are verified.

- [ ] **Phase 6: Cleanup and release verification**

Execute [2026-08-20-cleanup-and-release-verification.md](./2026-08-20-cleanup-and-release-verification.md). Stop until artifacts are classified, `cookies.txt` is resolved without exposure, tests/build/diff checks pass freshly, and the report explicitly says no deployment occurred.

## Global Rules

- Production database and SmartASP remain untouched.
- `FACEID_TEST_DATABASE_URL` must be loopback and target `faceid_rc_*`; no fallback to `DATABASE_URL`.
- Use test-first steps and focused commits. Preserve user-owned dirty-worktree changes.
- Capture the execution-start `git status --short`. Before every commit, run `git diff --cached --name-status`; never stage a path that was already dirty unless task-owned hunks have been isolated. If clean hunk isolation is not possible, skip that commit rather than absorb the user's prior work.
- Treat every directory-style `git add` in a phase as shorthand for the exact files named by that task; expand it to exact paths and verify the staged diff before committing.
- Do not delete code based on age or naming. Require caller/replacement evidence.
- Do not upload `.next`, run production migrations, rotate credentials, or claim deployability.
- If a stop gate fails, diagnose and repair that phase before continuing.

## Specification Traceability

| Approved requirement | Owning phase |
|---|---|
| Isolated synthetic PostgreSQL 18; no production fallback | Phase 1 Tasks 1-3 |
| Registration bind/visibility, duplicate review/block, safe photos, committed-success contract | Phase 1 Tasks 4-5 |
| Lifecycle, re-enrollment ownership, preserved employee history | Phase 1 Tasks 5-6 and Task 8 |
| Kiosk canonical matched person and accept/reject reasons | Phase 1 Task 7 |
| Durable rate/origin/CSP, Office HR DTO, PIN/session/threshold scope | Phase 1 Tasks 8-10 |
| Correction server-derived identity and Office HR scope | Phase 2 Task 3 |
| One attendance fallback for screens/exports/DTR/cron | Phase 2 Tasks 1-6 |
| Pure biometric math, PostgreSQL index, truthful warm cron, Firebase deletion proof | Phase 3 Tasks 1-6 |
| Regional Office → Department → Division → Section, compatibility import/history | Phase 4 Tasks 1-5 |
| Descendant filters, pagination reset, Office HR scope, DTR/signatory ancestry | Phase 4 Tasks 5-7 |
| Flat compact UI, mobile filters/tables/dialogs, smooth bidirectional motion, reduced motion | Phase 5 Tasks 1-6 |
| Complete all-file/function/runtime map with connected, zero-caller, and uncertain logic | Phase 6 Task 4 |
| Generated artifacts, `cookies.txt`, dead code/query/UI, documentation truth | Phase 6 Tasks 1-3 and 5-6 |
| Full tests, isolated routes, hosting build, BUILD_ID, no deployment | Phase 6 Task 7 |

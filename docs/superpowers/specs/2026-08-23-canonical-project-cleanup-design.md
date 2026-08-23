# Canonical Project Cleanup Design

**Date:** 2026-08-23  
**Scope:** `D:\projects\faceid` working tree only. SmartASP production files and the production PostgreSQL database are excluded.

## Objective

Make the repository describe and contain the application that actually runs: Next.js 16 on Node 22, PostgreSQL persistence, local persistent profile-photo storage, and SmartASP hosting. Remove generated artifacts, obsolete Firebase-era code, misleading deployment instructions, and disconnected diagnostics without changing employee, biometric, attendance, photo, or audit data.

## Non-negotiable boundaries

- Do not connect to or mutate production during cleanup or verification.
- Do not modify, squash, renumber, or delete `db/migrations/0001` through `0016`.
- Do not require employee re-registration or biometric re-enrollment.
- Preserve the root `app.js`, root `web.config`, `App_Data/veriface-files`, the Node 22 hosting build path, and `scripts/materialize-next-externals.mjs`.
- Preserve existing unrelated working-tree changes.
- Apply cleanup in independently verifiable batches.

## Repository hygiene

Delete tracked or local-only artifacts that have no runtime role: DTR inspection folders, generated output workbooks/previews, Graphify output, development/server logs, the expired exported browser cookie, the PNG stored as `render.bin`, obsolete IIS reverse-proxy material, and Superpowers browser scratch state. Add root-scoped ignore rules so these classes do not return.

Keep `.codegraph/.gitignore` because it prevents the local CodeGraph database from being committed. Keep the active secondary Git worktree until its branch is reviewed separately. Relocate the portable Node 22 runtime outside the repository; delete only its redundant ZIP after the extracted runtime is verified.

## Canonical documentation

Replace stale and repeated documentation with:

- `README.md`: product scope, current stack, quick start, and links to authoritative documents.
- `docs/architecture.md`: active request, authorization, biometric, attendance, HR, reporting, and persistence paths.
- `docs/database-and-local-testing.md`: migration immutability, local production clone boundaries, and test database rules.
- `docs/smartasp-operations.md`: current Node/SmartASP build and upload contract, protected remote files, and rollback gates.
- `docs/security-and-release-gates.md`: security boundaries, retained risks, required tests, and production approval boundary.
- `db/README.md`: migration ownership and ordering rules.

After current facts are extracted, delete superseded dated plans/specifications and the obsolete IIS deployment guide. Git history remains the archive.

## Runtime cleanup

Separate pure biometric bucket/matching functions from the dead Firestore persistence functions currently mixed in `lib/biometric-index.js`. Remove the disconnected Firestore enrollment implementation and remote-storage stubs only after regression tests prove the active PostgreSQL registration and re-enrollment imports remain intact.

Delete the broken Firestore biometric-cache cron. Preserve the PostgreSQL daily-summary cron and require its existing secret authentication. Remove diagnostic-only routes with no supported UI or operational contract. Routes that may represent an intentional public or operational feature remain until their ownership is proven or explicitly retired.

## Dependency and asset cleanup

Remove packages only when source search and a clean Node 22 build both prove they are unnecessary. Remove disabled Human model files only when active Human configurations, server embedding configuration, browser runtime verification, and hosting build tracing prove they are not requested. Do not remove OpenVINO assets merely because OpenVINO is shadow/optional.

## Environment safety

The local production connection file must not remain inside the Next.js project because Next.js can load `.env` as a fallback during development and builds. Move it to a protected external operator location without displaying or changing credentials. Keep `.env.development.local` as the local application configuration. Leave SmartASP's remote `.env` untouched.

## Verification

Each behavior-changing batch starts with a failing contract test, then receives the smallest implementation change. Final proof requires:

1. source searches showing removed Firebase/diagnostic paths are absent;
2. migration inventory and isolated local migration verification;
3. `npm test`;
4. isolated PostgreSQL route tests;
5. `npm run build:hosting` using Node 22 and a local database only;
6. `.next/BUILD_ID` and materialized external-package verification;
7. `git diff --check` and final tracked/untracked inventory; and
8. Git integrity verification before optional non-history-rewriting garbage collection.

No passing local result authorizes production migration or deployment.

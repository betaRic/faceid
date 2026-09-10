# Canonical Person Ownership Design

## Goal

Use `persons.id` / `person_id` as the owner of every employee-specific operational record while retaining `employee_id` only as a visible and searchable reference.

## Decisions

- The four-digit `access_code` selects one person during 1:1 attendance scanning.
- `persons.id` owns biometric samples, attendance, daily summaries, schedules, leaves, official orders, DTRs, and maintenance attribution.
- `employee_id` may repeat and must never merge, select, lock, update, or delete one person's records.
- Historical attendance with a blank `person_id` may be repaired automatically only when one current person is the sole safe owner.
- Historical rows labeled `12170` belong to Michael James Muyco Dedase (`4892e711-e2e8-4ccc-a271-91e92ee59df4`), as confirmed by the system owner.
- Rows that remain ambiguous stay unassigned and visible for review.

## Application changes

Daily-summary rebuilding groups current records by `person_id`. A legacy row without `person_id` may join a person only when its employee number resolves to exactly one person. Shared employee numbers never collapse into one summary.

Admin and HR DTR paths continue accepting their existing request fields for compatibility, but selectors send and resolve the unique person ID. Attendance writing, cooldown, daily cache updates, workforce records, and biometric ownership remain keyed by person ID.

## Data repair

The repair is idempotent and runs in one transaction. It first assigns all blank-person `12170` attendance rows to Michael. It then assigns other blank-person attendance rows where the employee number identifies exactly one person. It never guesses for blank numbers or other repeated numbers. The repair refreshes affected daily summaries through the application after ownership is established.

## Verification

- A regression test proves two people sharing one employee number remain separate in daily summaries.
- PostgreSQL tests prove current attendance and daily records require/use `person_id`.
- A dry-run query reports rows to change before any live update.
- Post-update checks prove `12170` ownership, no cross-person merge, and no changed attendance row count.


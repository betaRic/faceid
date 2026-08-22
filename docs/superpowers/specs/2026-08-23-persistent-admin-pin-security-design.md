# Persistent Admin PIN Security Design

**Date:** 2026-08-23  
**Status:** Approved design, pending written-spec review  
**Scope:** Named Admin PIN authentication, shared Regional Admin PIN authentication, staff sessions, threshold authorization, durable throttling, and audit behavior.

## 1. Decision

FaceAttend will retain both PIN authentication paths:

1. named Admin and Office HR accounts authenticate with their own stored PIN credentials; and
2. a shared Regional Admin PIN remains available whenever it is explicitly configured and enabled.

The shared Regional Admin PIN must not be automatically disabled merely because one or more named Regional Admin accounts exist. This rule intentionally supersedes the older one-time-bootstrap assumption in the hardening plan.

The shared credential has a known limitation: the system can prove that the shared Regional Admin credential was used, but it cannot identify the individual human who entered it. That attribution gap is accepted for this requirement. Named accounts remain the preferred path when individual attribution is required.

## 2. Security Boundaries

- No hardcoded, sample, documented, or source-controlled fallback PIN may authenticate a user.
- An absent or blank configured Regional Admin PIN means the shared-PIN path is unavailable.
- Plaintext PINs must never be written to PostgreSQL, logs, audit metadata, telemetry, exceptions, or API responses.
- Existing password/PIN hashes remain the authority for named accounts.
- Shared-PIN comparison must use a timing-safe comparison after normalizing the input and configured value into equal-length buffers.
- API responses expose only whether the Regional Admin PIN is configured and enabled. They never expose the PIN or any reversible representation.
- PIN rotation is an operational environment-secret change. The application may enable or disable the shared path, but must not persist the environment PIN into application tables.

## 3. Authentication Paths

### Named Admin and Office HR PIN

1. Normalize and validate the login request.
2. Apply durable throttling using both network identity and the normalized account identity.
3. Load only eligible staff records from PostgreSQL.
4. Verify the stored credential hash.
5. Resolve role and office scope from the authoritative staff record.
6. Create the unified staff session.
7. Record a safe audit result without storing the supplied PIN.

Named account existence does not alter shared Regional PIN availability.

### Shared Regional Admin PIN

1. Confirm the Regional Admin PIN is explicitly configured in the runtime environment.
2. Load the PostgreSQL `regional_pin_access` control and require it to be enabled.
3. Apply durable throttling before credential comparison.
4. Compare the supplied PIN to the configured PIN using the timing-safe helper.
5. Create a Regional Admin session marked as a shared-PIN session.
6. Audit success or failure as shared Regional PIN use, including request context allowed by policy but no secret material.

The login route must not make a named-admin-count query a prerequisite for this path.

## 4. Regional PIN Control

`/api/admin/regional-pin` remains a Regional-Admin-only control.

- `GET` returns `{ configured, enabled }` and no credential data.
- `POST` accepts only an explicit boolean enable/disable instruction.
- The route rejects Office HR and non-Regional Admin sessions.
- A state change and its audit record occur in one PostgreSQL transaction.
- Enabling an unconfigured PIN is rejected with a safe configuration error.
- Disabling the shared path does not delete named accounts or end named-account sessions.
- The UI must clearly distinguish “not configured” from “configured but disabled.”

## 5. Durable Rate Limiting and Audit

An in-memory limiter alone is insufficient on production hosting because process restarts and multiple workers reset or split its state.

The security-sensitive login limiter will use PostgreSQL-backed state with bounded retention. It must:

- rate-limit by normalized network identity and credential identity;
- avoid storing raw PINs or secrets in limiter keys;
- use a keyed one-way digest for sensitive identifiers where practical;
- enforce escalating temporary lockouts with a defined maximum;
- return a stable retry response without revealing whether an account exists;
- prune expired limiter rows through bounded cleanup;
- audit meaningful lockout and authentication outcomes without creating an unbounded row per harmless request.

Audit records must distinguish named-account authentication from shared Regional PIN authentication. They must include the result, actor/session type when known, safe request context, and timestamp. They must not include submitted PINs, credential hashes, cookies, authorization headers, or full environment values.

## 6. Unified Staff Session Cookie

Admin and Office HR login, session refresh, and logout will use one shared cookie-options helper.

Required properties:

- `HttpOnly` always;
- `Secure` in production;
- an explicit `SameSite` policy compatible with the same-site application flow;
- `Path=/`;
- a bounded positive lifetime for created sessions;
- immediate expiry using the same name, path, security, and same-site attributes during logout.

Session payloads must carry the authoritative role, office scope, and whether authentication used a named account or the shared Regional PIN. A shared-PIN session must not pretend to be a named individual.

## 7. Threshold Authorization

Global biometric threshold configuration is Regional-Admin-only for both reads and writes.

- Office HR and office-scoped Admin sessions receive `403`.
- The route accepts only an allowlist of known threshold fields.
- Unknown, non-numeric, non-finite, or out-of-range values reject the entire request; they are not silently skipped.
- PostgreSQL is the only persistence authority.
- The threshold update and audit record are atomic.
- The audit records previous and new safe numeric values, never biometric templates or credentials.
- Firebase fallback behavior is removed only after call-path and test proof confirms PostgreSQL ownership.

## 8. Error Contract

Public authentication errors remain deliberately non-enumerating. Invalid named credentials, an invalid shared PIN, and an unavailable credential path use safe stable error codes/messages that do not disclose account existence or configuration internals beyond the authorized Regional PIN control route.

Raw SQL messages, bind counts, stack traces, environment names/values, hashes, and internal session data remain server-only. Operational logs use structured event names and sanitized context.

## 9. Verification

Focused tests must prove:

- a valid named Regional Admin PIN succeeds;
- a valid Office HR PIN succeeds with office scope;
- the shared Regional Admin PIN succeeds while named Regional Admin accounts exist;
- disabling the shared path blocks only that path;
- enabling fails when the environment PIN is absent;
- incorrect PINs fail without account/configuration enumeration;
- rate limits persist across limiter/service instances and cover network plus credential identities;
- no audit or response contains a submitted PIN;
- Regional PIN control rejects Office HR and non-Regional Admin sessions;
- Admin and HR login/session/logout use identical cookie security attributes;
- global threshold GET and POST reject Office HR and office-scoped Admin sessions;
- a valid threshold update and its audit commit together;
- invalid or partial threshold payloads cause no update;
- removed Firebase threshold paths have no live callers.

Fresh completion gates remain the relevant focused tests, isolated PostgreSQL route suite, full `npm test`, `npm run build:hosting` with a new `.next/BUILD_ID`, and `git diff --check`.

## 10. Acceptance Criteria

This hardening slice is complete only when:

- both required PIN paths work under the rules above;
- named-account presence never disables an explicitly configured and enabled Regional Admin PIN;
- no fallback/default credential remains;
- the shared credential can be explicitly disabled by a Regional Admin;
- durable throttling and safe audits cover both paths;
- staff session cookies have one verified security contract;
- threshold access and updates are restricted and atomic;
- focused and full verification pass freshly.

The result reduces avoidable credential risk but does not solve individual attribution for the shared PIN. Eliminating that limitation would require replacing the shared credential with named authentication, which is outside the approved requirement.

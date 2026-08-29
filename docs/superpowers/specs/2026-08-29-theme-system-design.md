# VeriFace Theme System Design

**Date:** 2026-08-29  
**Status:** Approved for implementation  
**Release boundary:** Theme selection, shared-shell entry visibility, and verification of the existing Regional Admin PIN path only.

## Outcome

Add a global Light, Dark, and System appearance preference to the public, staff, and admin interfaces without changing biometric, attendance, employee, authorization, or database behavior. System is the default, the explicit choice persists in the browser, and a small accessible selector lives in the shared header. The home page no longer exposes the Staff/Admin/HR access link, while `/login` and role-specific restricted routes remain directly available.

## Non-goals

- No biometric sample, face descriptor, photo, attendance, employee, or audit mutation.
- No Regional Admin PIN policy, secret, route, database schema, or permission change.
- No redesign of page structure or wider feature work.
- No production deployment or production-database mutation.

## Architecture

### Preference and resolution

The browser preference is one of `light`, `dark`, or `system`. A small pure module owns validation and resolution so the same contract is testable without rendering UI. `system` resolves from `prefers-color-scheme`; an explicit choice ignores later operating-system changes until the user returns to System.

The preference is stored under a version-neutral local-storage key. Storage and `matchMedia` failures fall back to System without breaking rendering. The resolved theme is expressed as `data-theme="light|dark"` on the root `<html>` element, while the saved preference remains separate from the resolved value.

### First paint and hydration

The root layout emits a short, hard-coded inline boot script before the application renders. It reads the saved preference, resolves System, and sets `data-theme` plus `color-scheme` before first paint. The `<html>` element uses `suppressHydrationWarning` because the browser may update this attribute before React hydrates. The script contains no request data or dynamic user content.

`ThemeProvider` then owns live synchronization after hydration. It exposes the current preference and setter through context, updates the root element, persists explicit user changes, and listens to the operating-system media query only while System is selected.

### Selector

`ThemeSelector` is a 44-by-44-pixel shared-header control using Lucide sun, moon, and monitor icons. Activating it opens a compact menu with three radio-style options: Light, Dark, and System. The button reports the current preference, exposes menu state with `aria-expanded` and `aria-controls`, and supports pointer and keyboard use. Escape closes the menu and returns focus to the trigger. Selecting an option applies it immediately and closes the menu.

The selector appears in every `AppShell` header, including public, staff, and admin screens. At a 375-pixel viewport it keeps the brand, selector, and navigation trigger usable without horizontal overflow.

## Theme tokens

The existing semantic Tailwind names remain the component contract: `primary`, `canvas`, `surface`, `foreground`, `secondary`, `line`, `success`, `warning`, and `destructive`. Light values preserve the current civic palette. Dark values are assigned through `[data-theme='dark']` custom properties rather than component-specific color overrides.

Additional semantic surface tokens cover success, warning, destructive, informational, and subdued panels. Active components using fixed light backgrounds or fixed slate text are converted to these semantic tokens or given an intentional dark counterpart. Brand artwork, camera video, face guides, and official document output do not change.

Both themes must preserve:

- at least 4.5:1 contrast for normal text;
- visible keyboard focus rings;
- distinguishable borders, selected states, errors, warnings, and success states;
- reduced-motion behavior already present in the application;
- native form control coloring through `color-scheme`.

## Homepage access boundary

`AppShell` currently renders the role-aware Staff/Admin/HR access link on every route. It will omit that link only when `usePathname()` is exactly `/`. Scan, registration, and all non-home shell behavior remain unchanged. The `/login` route is preserved, so authorized staff can still use a direct bookmark or controlled link outside the public home page.

## Regional Admin PIN boundary

No PIN implementation changes are authorized by this work. Verification must re-prove the existing chain:

`AdminLogin -> /api/admin/login -> configured named/shared PIN checks -> PostgreSQL system_config regional_pin_access enable flag -> bounded admin session cookie`

The release evidence must distinguish local proof from production proof. Local success requires non-empty ignored environment values, the enabled PostgreSQL control row in the guarded local clone, and focused route tests for named PINs, shared Regional PINs, disabled access, and PIN-collision non-escalation. This does not prove the SmartASP production environment until its remote variables and database row are checked there.

## Error and edge behavior

- Missing or malformed storage value resolves to System.
- Unavailable local storage does not block rendering or selection for the current page session.
- Unavailable `matchMedia` resolves System to Light.
- Operating-system changes update the page only while System is active.
- Menu closes on selection, Escape, outside pointer interaction, and route change.
- Theme selection never calls an API and never touches PostgreSQL.

## Verification

Implementation is accepted only after:

1. Focused tests first fail, then pass for preference resolution, persistence, System media changes, accessible selector behavior, homepage Staff-link removal, and preserved non-home Staff access.
2. Existing UI and contract tests pass.
3. Light, Dark, and System are visually inspected at desktop and 375-pixel widths, including public home, login, scan, and an authenticated-shell representative where locally reachable.
4. Contrast and focus behavior are checked on the shared header, menus, forms, surfaces, and status messages.
5. The guarded local PostgreSQL clone proves the Regional Admin PIN control row and focused login route cases without exposing secrets.
6. `npm test`, `npm run test:routes`, `npm run build:hosting`, `git diff --check`, generated-runtime link checks, and a secret scan pass.

## Stop condition

Stop after the theme system, homepage Staff-link boundary, PIN verification, and release gates are complete. Any broader visual redesign, authentication change, biometric work, deployment, or production data action requires separate authorization.

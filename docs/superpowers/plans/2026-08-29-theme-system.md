# VeriFace Theme System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a persistent Light, Dark, and System theme across VeriFace, remove Staff access from the public home header only, and re-prove the unchanged Regional Admin PIN path and hosting release gates.

**Architecture:** A pure theme contract validates and resolves preferences, a client provider synchronizes storage and operating-system changes, and a shared accessible selector controls it. The root layout runs a static pre-paint script, while CSS semantic tokens supply both palettes and active light-only application surfaces are migrated to those tokens.

**Tech Stack:** Next.js 16.3 App Router, React 18, Tailwind CSS 3, Lucide React, Vitest/Testing Library, Node test runner, PostgreSQL 18 release-test cluster.

---

## File structure

- Create `lib/theme.js`: pure preference constants, validation, system resolution, and DOM application.
- Create `components/ThemeProvider.jsx`: client context, persistence, and media-query subscription.
- Create `components/ThemeSelector.jsx`: accessible shared-header menu.
- Modify `app/layout.jsx`: pre-paint theme initialization and hydration-safe root attributes.
- Modify `components/AppProviders.jsx`: install the theme provider above application providers.
- Modify `components/AppShell.jsx`: render selector everywhere and suppress Staff access only at `/`.
- Modify `components/ui/Icon.jsx`: expose sun, moon, and monitor icons through the existing icon contract.
- Modify `app/globals.css` and `tailwind.config.cjs`: add dark values and semantic status/subdued surfaces.
- Modify active non-camera UI files found by the fixed-light-class audit: replace fixed white/stone/red/amber surfaces with semantic tokens while retaining deliberate camera overlays, primary-button white text, and document output styling.
- Create `tests/ui/theme-provider.test.jsx` and `tests/ui/theme-selector.test.jsx`: preference and interaction regression coverage.
- Modify `tests/ui/app-shell.test.jsx`: homepage visibility and non-home preservation coverage.

### Task 1: Theme preference contract

**Files:**
- Create: `lib/theme.js`
- Test: `tests/ui/theme-provider.test.jsx`

- [ ] **Step 1: Write the failing contract tests**

Cover the exact contract:

```jsx
expect(normalizeThemePreference('dark')).toBe('dark')
expect(normalizeThemePreference('invalid')).toBe('system')
expect(resolveTheme('system', { matches: true })).toBe('dark')
expect(resolveTheme('system', { matches: false })).toBe('light')
expect(resolveTheme('dark', { matches: false })).toBe('dark')
```

- [ ] **Step 2: Run the focused test and observe the missing-module failure**

Run: `npx vitest run tests/ui/theme-provider.test.jsx`  
Expected: FAIL because `@/lib/theme` does not exist.

- [ ] **Step 3: Implement the pure contract**

```js
export const THEME_STORAGE_KEY = 'veriface-theme'
export const THEME_PREFERENCES = ['light', 'dark', 'system']
export const THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)'

export function normalizeThemePreference(value) {
  return THEME_PREFERENCES.includes(value) ? value : 'system'
}

export function resolveTheme(preference, mediaQuery) {
  const normalized = normalizeThemePreference(preference)
  if (normalized !== 'system') return normalized
  return mediaQuery?.matches ? 'dark' : 'light'
}

export function applyResolvedTheme(root, preference, mediaQuery) {
  const resolved = resolveTheme(preference, mediaQuery)
  root.dataset.theme = resolved
  root.dataset.themePreference = normalizeThemePreference(preference)
  root.style.colorScheme = resolved
  return resolved
}
```

- [ ] **Step 4: Re-run the focused test**

Run: `npx vitest run tests/ui/theme-provider.test.jsx`  
Expected: PASS for normalization, System resolution, and DOM application.

- [ ] **Step 5: Commit the contract**

```text
test: define theme preference contract
```

### Task 2: Hydration-safe provider and pre-paint initialization

**Files:**
- Create: `components/ThemeProvider.jsx`
- Modify: `components/AppProviders.jsx`
- Modify: `app/layout.jsx`
- Test: `tests/ui/theme-provider.test.jsx`

- [ ] **Step 1: Add failing provider tests**

Render a probe consuming `useTheme()` and assert:

```jsx
expect(screen.getByTestId('preference')).toHaveTextContent('system')
expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
await userEvent.click(screen.getByRole('button', { name: 'Choose dark' }))
expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
```

Also dispatch a mocked media-query change and prove it changes the root only when the preference is System.

- [ ] **Step 2: Run the provider test and observe failure**

Run: `npx vitest run tests/ui/theme-provider.test.jsx`  
Expected: FAIL because `ThemeProvider` and `useTheme` do not exist.

- [ ] **Step 3: Implement provider synchronization**

Create a client context that initializes from guarded local storage, calls `applyResolvedTheme`, writes valid changes, subscribes with `addEventListener('change', ...)` while System is active, removes the listener during cleanup, and throws a clear error when `useTheme` is used outside the provider.

- [ ] **Step 4: Add static root boot script**

In `app/layout.jsx`, add `suppressHydrationWarning`, an initial `data-theme="light"`, and a static script before `<body>` that uses the same storage key and media query. The script must catch storage/media errors and default safely to Light-resolved System. Wrap `BiometricRuntimeProvider` with `ThemeProvider` in `AppProviders`.

- [ ] **Step 5: Run provider and existing public-entry tests**

Run: `npx vitest run tests/ui/theme-provider.test.jsx tests/ui/public-entry.test.jsx`  
Expected: PASS.

- [ ] **Step 6: Commit provider and boot behavior**

```text
feat: add persistent theme provider
```

### Task 3: Accessible shared-header selector and homepage boundary

**Files:**
- Create: `components/ThemeSelector.jsx`
- Modify: `components/ui/Icon.jsx`
- Modify: `components/AppShell.jsx`
- Create: `tests/ui/theme-selector.test.jsx`
- Modify: `tests/ui/app-shell.test.jsx`

- [ ] **Step 1: Write failing selector and shell tests**

Assert the selector exposes one 44-pixel trigger, a labeled menu, checked radio state, selection, Escape focus return, and outside-click closure. Change the home-shell assertion to:

```jsx
expect(screen.queryByRole('link', { name: 'Admin staff access' })).not.toBeInTheDocument()
```

Then render pathname `/scan` and assert the same Staff link still points to `/admin`.

- [ ] **Step 2: Run focused tests and observe failure**

Run: `npx vitest run tests/ui/theme-selector.test.jsx tests/ui/app-shell.test.jsx`  
Expected: FAIL because the selector is absent and the home shell still exposes Staff access.

- [ ] **Step 3: Implement selector and icons**

Add `Sun`, `Moon`, and `Monitor` to `components/ui/Icon.jsx`. Build `ThemeSelector` with an `IconButton`, a positioned semantic menu, three `menuitemradio` buttons, `aria-checked`, `aria-expanded`, `aria-controls`, outside-pointer handling, and Escape focus restoration.

- [ ] **Step 4: Install selector and narrow Staff visibility**

Render `<ThemeSelector />` in the shared actions group. Wrap the existing Staff link with `pathname !== '/'`; do not alter its href, role label, or styling on any other route.

- [ ] **Step 5: Run focused tests**

Run: `npx vitest run tests/ui/theme-selector.test.jsx tests/ui/app-shell.test.jsx tests/ui/public-entry.test.jsx`  
Expected: PASS.

- [ ] **Step 6: Commit interaction behavior**

```text
feat: add shared theme selector
```

### Task 4: Semantic dark palette and active surface audit

**Files:**
- Modify: `app/globals.css`
- Modify: `tailwind.config.cjs`
- Modify: active page/component files returned by the fixed-light audit, excluding intentional black camera overlays and white text/icons on dark media or primary controls.

- [ ] **Step 1: Add semantic surface tokens**

Define light and dark values for:

```css
--color-info-surface
--color-info-border
--color-success-surface
--color-success-border
--color-warning-surface
--color-warning-border
--color-destructive-surface
--color-destructive-border
--color-subdued-surface
```

Map them in Tailwind as `info-surface`, `info-line`, `success-surface`, `success-line`, `warning-surface`, `warning-line`, `destructive-surface`, `destructive-line`, and `subdued`.

- [ ] **Step 2: Add dark root values**

Under `html[data-theme='dark']`, use a deep navy-charcoal canvas, slightly raised surface, near-white foreground, muted blue-gray secondary text, visible borders, accessible brand-primary blue, amber focus, and dark status surfaces. Rebind legacy `--bg-*`, `--text-*`, borders, shadows, headings, scrollbars, and loader shadows to semantic values.

- [ ] **Step 3: Replace fixed light status surfaces**

Apply these exact class families across shared feedback, registration, admin, attendance, and kiosk alerts:

```text
border-amber-200 bg-amber-50 text-amber-900 -> border-warning-line bg-warning-surface text-warning
border-red-200 bg-red-50 text-red-900 -> border-destructive-line bg-destructive-surface text-destructive
bg-white or bg-stone-50 used as an application panel -> bg-surface or bg-subdued
border-black/5 or border-black/10 used as UI chrome -> border-line
text-ink or text-muted used as body text -> text-foreground or text-secondary
```

Keep black media stages, translucent white camera HUD text, white primary-button text, and map-marker contrast unchanged because they are deliberate theme-independent overlays.

- [ ] **Step 4: Re-run the fixed-light audit**

Run the repository search for fixed `white`, `stone`, `red`, `amber`, `navy`, `sky`, and `black` utility colors. Review every remaining match and classify it as brand foreground, media overlay, map marker, document output, or an intentional exception; convert any remaining application surface.

- [ ] **Step 5: Run the UI suite**

Run: `npm run test:ui`  
Expected: all UI files pass.

- [ ] **Step 6: Commit palette migration**

```text
feat: apply semantic light and dark palettes
```

### Task 5: Browser, accessibility, PIN, and release proof

**Files:**
- Verification only unless a proven defect requires a focused regression patch.

- [ ] **Step 1: Run a local production-like server**

Use the repository-supported Node runtime, start the app on a free local port, and open public home, login, scan, and a representative staff/admin shell.

- [ ] **Step 2: Inspect Light, Dark, and System**

At 1440 pixels and 375 pixels, capture screenshots and inspect header fit, menu placement, surface contrast, forms, focus rings, status feedback, and absence of horizontal overflow. Emulate both operating-system schemes and verify System follows the change while explicit Light/Dark do not.

- [ ] **Step 3: Verify homepage and direct login boundary**

Prove `/` has no Staff/Admin/HR access link in the shared header and `/login` still renders the PIN form directly.

- [ ] **Step 4: Re-prove Regional Admin PIN locally**

Start only the marker-guarded PostgreSQL 18 release-test cluster. Verify without printing secrets that required ignored environment values are non-empty, `system_config.regional_pin_access.value.enabled` is true, and focused route cases pass for named Admin PIN, shared Regional PIN, disabled shared PIN, and collision non-escalation. Stop the cluster cleanly.

- [ ] **Step 5: Run complete release gates**

Run:

```text
npm test
npm run test:routes
npm run build:hosting
git diff --check
```

Expected: zero failures, successful hosting build, and no whitespace errors. Inspect `.next` for unresolved Junction/reparse-point runtime dependencies and scan the changed files for credential-like values.

- [ ] **Step 6: Review and freeze**

Review the complete branch diff against the design, confirm no biometric/PIN/database behavior changed, commit remaining verified changes, and stop. Do not deploy, merge, push, or start broader work without separate authorization.

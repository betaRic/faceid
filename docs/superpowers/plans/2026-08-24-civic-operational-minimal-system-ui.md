# Civic Operational Minimal System UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace VeriFace’s inconsistent and cluttered interface with one accessible, responsive, DILG-aligned Civic Operational Minimal system without changing biometric, attendance, persistence, or authorization behavior.

**Architecture:** Add a small tested UI primitive layer and semantic design tokens, then migrate shared shells before individual page families. Keep business hooks, API calls, stores, and route contracts in place; change presentation at their existing React boundaries. Remove legacy CSS only after every consumer is migrated.

**Tech Stack:** Next.js 16.3, React 18.3, Tailwind CSS 3.4, custom CSS variables, Framer Motion 11, Lucide React, Vitest, Testing Library, jsdom, axe-core, Node 22.

**Design specification:** `docs/superpowers/specs/2026-08-24-civic-operational-minimal-system-ui-design.md`

---

## Execution Boundaries

- Work against the current checkout because it contains approved uncommitted PostgreSQL, security, cleanup, registration, and attendance changes that are not present in a clean worktree.
- Never reset, stash, overwrite, or include unrelated changes in a UI commit.
- Stage only the paths named in the current task.
- The index already contains approved staged cleanup work. Every task commit must use `git commit --only` with the exact task paths so unrelated staged files cannot enter the commit.
- Do not change API payloads, database queries, biometric thresholds, capture decisions, attendance derivation, authentication, PIN behavior, or role permissions.
- Do not connect to or mutate the production database.
- Keep the application buildable after every task.
- Run focused tests after each task and the complete gates only at the final task.

## File Structure

### New shared UI ownership

- `components/ui/cx.js` — dependency-free class-name composition.
- `components/ui/Icon.jsx` — the only named-icon adapter; maps product names to Lucide icons.
- `components/ui/Button.jsx` — primary, secondary, quiet, and destructive buttons plus icon buttons.
- `components/ui/FormControls.jsx` — field, select, textarea, checkbox, hint, and error structure.
- `components/ui/Status.jsx` — lifecycle and operational status rendering.
- `components/ui/Feedback.jsx` — loading, empty, error, and toast presentation.
- `components/ui/Surface.jsx` — necessary bounded surface and page-header primitives.
- `components/ui/Dialog.jsx` — accessible modal structure and mobile panel behavior.
- `components/ui/DataView.jsx` — table shell, mobile record list, pagination, and filter bar.
- `components/ui/OrganizationFilterFields.jsx` — optional organization-level filter rendering without inventing unavailable data.
- `components/ui/index.js` — explicit public exports.

### New UI tests

- `vitest.config.js` — jsdom test environment.
- `tests/ui/setup.jsx` — Next.js, Framer Motion, media-query, and browser API test setup.
- `tests/ui/test-axe.js` — critical accessibility assertion.
- `tests/ui/harness.test.jsx` — test-environment smoke proof.
- `tests/ui/tokens.test.js` — semantic-token regression proof.
- `tests/ui/primitives.test.jsx` — shared component behavior.
- `tests/ui/app-shell.test.jsx` — public navigation and mobile behavior.
- `tests/ui/admin-shell.test.jsx` — Admin navigation, collapse, and role labels.
- `tests/ui/public-entry.test.jsx` — home, login, loading, and error states.
- `tests/ui/registration.test.jsx` — step presentation and registration constraints.
- `tests/ui/public-attendance.test.jsx` — employee attendance states and responsive structure.
- `tests/ui/admin-operations.test.jsx` — employees, filters, scope, dialogs, and reporting states.
- `tests/ui/kiosk.test.jsx` — access-code, scanning, result, and recovery presentation.

### Existing files migrated by ownership

- Foundation: `app/globals.css`, `app/layout.jsx`, `tailwind.config.cjs`, `package.json`, `package-lock.json`, `components/shared/ui.jsx`.
- Public shell: `components/BrandMark.jsx`, `components/AppShell.jsx`, `components/PlatformNavigator.jsx`, `components/AdminLogin.jsx`.
- Public workflows: `components/RegisterView.jsx`, `components/register/*.jsx`, `app/(public)/attendance/page.jsx`, `app/(public)/summary/page.jsx`, `components/kiosk/AttendanceTableView.jsx`.
- Admin shell: `components/admin/AdminShell.jsx`, `components/AdminDashboard.jsx`.
- Admin operations: all files under `components/admin/` and `components/admin/summary/` listed in the task that owns them.
- Kiosk/capture: `components/KioskView.jsx`, `components/kiosk/*.jsx`, `components/biometrics/*.jsx`, `app/admin/employee/[personId]/reenroll/EmployeeReenrollPage.jsx`.

---

### Task 1: Establish the UI Test Harness and Baseline

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.js`
- Create: `tests/ui/setup.jsx`
- Create: `tests/ui/test-axe.js`
- Create: `tests/ui/harness.test.jsx`

- [ ] **Step 1: Record the untouched baseline**

Run:

```powershell
git status --short
npm test
git diff --check
```

Expected: existing tests pass; `git diff --check` emits no whitespace errors. Save the status output in the execution notes so later commits do not absorb unrelated files.

- [ ] **Step 2: Install only the approved UI dependencies**

Run:

```powershell
npm install lucide-react
npm install --save-dev vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event axe-core
```

Expected: `package.json` contains `lucide-react` under dependencies and the six test packages under devDependencies; no application package is removed or downgraded.

- [ ] **Step 3: Create a passing harness smoke test**

Create `tests/ui/harness.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { expectNoCriticalAxeViolations } from './test-axe'

describe('UI test harness', () => {
  it('renders React and runs accessibility checks', async () => {
    const { container } = render(<main><h1>VeriFace UI tests</h1></main>)
    expect(screen.getByRole('heading', { name: 'VeriFace UI tests' })).toBeVisible()
    await expectNoCriticalAxeViolations(container)
  })
})
```

- [ ] **Step 4: Add the Vitest configuration and browser mocks**

Create `vitest.config.js`:

```js
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/ui/setup.jsx'],
    include: ['tests/ui/**/*.test.{js,jsx}'],
    clearMocks: true,
    restoreMocks: true,
  },
})
```

Create `tests/ui/setup.jsx`:

```jsx
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

vi.mock('next/link', async () => {
  const React = await import('react')
  return { default: React.forwardRef(function MockLink({ href, children, ...props }, ref) {
    const resolved = typeof href === 'string' ? href : href?.pathname || '/'
    return <a href={resolved} ref={ref} {...props}>{children}</a>
  }) }
})

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('framer-motion', async () => {
  const React = await import('react')
  const motionProps = new Set(['animate', 'exit', 'initial', 'layout', 'transition', 'variants', 'whileHover', 'whileTap'])
  return {
    AnimatePresence: ({ children }) => children,
    motion: new Proxy({}, {
      get: (_, tag) => React.forwardRef(function MotionMock({ children, ...props }, ref) {
        const clean = Object.fromEntries(Object.entries(props).filter(([key]) => !motionProps.has(key)))
        return React.createElement(tag, { ...clean, ref }, children)
      }),
    }),
  }
})

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
```

Create `tests/ui/test-axe.js`:

```js
import axe from 'axe-core'
import { expect } from 'vitest'

export async function expectNoCriticalAxeViolations(container) {
  const result = await axe.run(container)
  const critical = result.violations.filter(item => item.impact === 'critical')
  expect(critical).toEqual([])
}
```

- [ ] **Step 5: Add the UI test scripts**

Add these entries to `package.json`:

```json
{
  "scripts": {
    "test:ui": "vitest run",
    "test:ui:watch": "vitest"
  }
}
```

Append `&& npm run test:ui` to the existing `test` script rather than replacing the PostgreSQL, security, contract, or route checks.

- [ ] **Step 6: Prove the harness passes**

Run:

```powershell
npm run test:ui -- tests/ui/harness.test.jsx
```

Expected: PASS with one test.

- [ ] **Step 7: Commit the test harness**

```powershell
git add package.json package-lock.json vitest.config.js tests/ui/setup.jsx tests/ui/test-axe.js tests/ui/harness.test.jsx
git commit --only -m "test: add UI regression harness" -- package.json package-lock.json vitest.config.js tests/ui/setup.jsx tests/ui/test-axe.js tests/ui/harness.test.jsx
```

---

### Task 2: Add Semantic Tokens, Typography, and Global Motion Rules

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.jsx`
- Modify: `tailwind.config.cjs`
- Create: `tests/ui/tokens.test.js`

- [ ] **Step 1: Add a failing semantic-token test**

Create `tests/ui/tokens.test.js`:

```js
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('semantic design tokens', () => {
  it('defines the civic palette and reduced motion', () => {
    const css = readFileSync('app/globals.css', 'utf8')
    expect(css).toContain('--color-primary: #032d57')
    expect(css).toContain('--color-accent: #ea921f')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
```

- [ ] **Step 2: Run the focused test and observe failure**

Run `npm run test:ui -- tests/ui/tokens.test.js`.

Expected: FAIL because the semantic tokens do not exist.

- [ ] **Step 3: Replace the root token block without deleting compatibility tokens**

In `app/globals.css`, define these authoritative semantic variables inside `:root` and point existing aliases at them during migration:

```css
:root {
  --color-primary: #032d57;
  --color-primary-strong: #021e3a;
  --color-accent: #ea921f;
  --color-background: #f4f6f8;
  --color-surface: #ffffff;
  --color-text: #172033;
  --color-text-muted: #5d6878;
  --color-border: #dce2e8;
  --color-success: #117a50;
  --color-warning: #8a5200;
  --color-destructive: #b42318;
  --focus-ring: 0 0 0 3px rgb(234 146 31 / 45%);
  --radius-control: 0.5rem;
  --radius-surface: 0.75rem;
  --shadow-menu: 0 12px 30px rgb(3 45 87 / 12%);
  --shadow-dialog: 0 20px 50px rgb(3 45 87 / 20%);
  --font-sans: "Segoe UI Variable", "Segoe UI", Inter, Roboto, Arial, sans-serif;
}
```

Keep old navy, amber, surface, and text variables temporarily if active consumers still reference them. Mark the compatibility section with `/* Remove in Task 14 after consumer scan */`.

- [ ] **Step 4: Normalize base typography and focus**

Add this base behavior in `app/globals.css`:

```css
html { color-scheme: light; }
body {
  background: var(--color-background);
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: 1rem;
  text-rendering: optimizeLegibility;
}
:where(button, a, input, select, textarea):focus-visible {
  box-shadow: var(--focus-ring);
  outline: 2px solid transparent;
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto !important; }
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
```

Do not add wheel-scroll interception or JavaScript scroll smoothing.

- [ ] **Step 5: Expose semantic Tailwind colors and restrained elevation**

Extend `tailwind.config.cjs` with:

```js
colors: {
  primary: 'var(--color-primary)',
  'primary-strong': 'var(--color-primary-strong)',
  accent: 'var(--color-accent)',
  canvas: 'var(--color-background)',
  surface: 'var(--color-surface)',
  foreground: 'var(--color-text)',
  secondary: 'var(--color-text-muted)',
  line: 'var(--color-border)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  destructive: 'var(--color-destructive)',
},
boxShadow: {
  menu: 'var(--shadow-menu)',
  dialog: 'var(--shadow-dialog)',
},
borderRadius: {
  control: 'var(--radius-control)',
  surface: 'var(--radius-surface)',
},
```

Merge these keys into the existing `extend` object. Do not remove old keys until Task 14.

- [ ] **Step 6: Remove the obsolete scroll marker from the root layout**

Change `app/layout.jsx` to:

```jsx
<html lang="en">
  <body className="font-sans antialiased">
    <AppProviders>{children}</AppProviders>
  </body>
</html>
```

- [ ] **Step 7: Verify CSS compilation**

Run:

```powershell
npx tailwindcss -i app/globals.css -o .next/ui-token-check.css --minify
git diff --check -- app/globals.css app/layout.jsx tailwind.config.cjs
```

Expected: Tailwind exits 0 and the diff check emits nothing. Do not stage `.next/ui-token-check.css`.

- [ ] **Step 8: Commit tokens**

```powershell
git add app/globals.css app/layout.jsx tailwind.config.cjs tests/ui/tokens.test.js
git commit --only -m "style: add civic design tokens" -- app/globals.css app/layout.jsx tailwind.config.cjs tests/ui/tokens.test.js
```

---

### Task 3: Implement Icons, Buttons, Forms, Status, and Feedback

**Files:**
- Create: `components/ui/cx.js`
- Create: `components/ui/Icon.jsx`
- Create: `components/ui/Button.jsx`
- Create: `components/ui/FormControls.jsx`
- Create: `components/ui/Status.jsx`
- Create: `components/ui/Feedback.jsx`
- Create: `components/ui/index.js`
- Modify: `components/shared/ui.jsx`
- Test: `tests/ui/primitives.test.jsx`

- [ ] **Step 1: Create the failing primitive contract test**

Create `tests/ui/primitives.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button, Field, Status, Toast } from '@/components/ui'
import { expectNoCriticalAxeViolations } from './test-axe'

describe('Civic UI primitives', () => {
  it('renders labeled controls and semantic status', async () => {
    const onClick = vi.fn()
    const { container } = render(
      <div>
        <Field label="Employee name" htmlFor="employee-name"><input id="employee-name" /></Field>
        <Status tone="pending">Pending review</Status>
        <Button onClick={onClick}>Review employee</Button>
      </div>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Review employee' }))
    expect(onClick).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Employee name')).toBeVisible()
    expect(screen.getByText('Pending review')).toHaveAttribute('data-tone', 'pending')
    await expectNoCriticalAxeViolations(container)
  })

  it('connects errors and disables unavailable actions', async () => {
    const onClick = vi.fn()
    render(
      <>
        <Field label="PIN" htmlFor="pin" error="PIN is required"><input id="pin" /></Field>
        <Button disabled onClick={onClick}>Continue</Button>
      </>,
    )
    expect(screen.getByLabelText('PIN')).toHaveAccessibleDescription('PIN is required')
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('gives notification dismissal an accessible name', () => {
    render(<Toast onDismiss={vi.fn()}>Saved</Toast>)
    expect(screen.getByRole('button', { name: 'Dismiss notification' })).toBeVisible()
  })
})
```

- [ ] **Step 2: Run and confirm the contract fails**

Run `npm run test:ui -- tests/ui/primitives.test.jsx`.

Expected: FAIL on missing exports.

- [ ] **Step 3: Add the dependency-free class composer**

Create `components/ui/cx.js`:

```js
export function cx(...values) {
  return values.flat().filter(Boolean).join(' ')
}
```

- [ ] **Step 4: Add the named icon adapter**

Create `components/ui/Icon.jsx` with explicit Lucide imports and this public contract:

```jsx
import {
  ArrowLeft, ArrowRight, Building2, CalendarCheck, Check, ChevronLeft,
  ChevronRight, CircleAlert, Clock3, Download, FileText, House, Landmark,
  LayoutDashboard, LoaderCircle, LogOut, Menu, Pencil, ScanFace, Search,
  Settings, ShieldCheck, SlidersHorizontal, Trash2, User, UserPlus, Users, X,
} from 'lucide-react'

const icons = {
  'arrow-left': ArrowLeft, 'arrow-right': ArrowRight, building: Building2,
  attendance: CalendarCheck, check: Check, 'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight, alert: CircleAlert, clock: Clock3,
  download: Download, report: FileText, home: House, agency: Landmark,
  dashboard: LayoutDashboard, loading: LoaderCircle, logout: LogOut, menu: Menu,
  edit: Pencil, scan: ScanFace, search: Search, settings: Settings,
  security: ShieldCheck, filters: SlidersHorizontal, delete: Trash2, user: User,
  'user-add': UserPlus, employees: Users, close: X,
}

export default function Icon({ name, size = 18, label, className = '' }) {
  const Component = icons[name]
  if (!Component) throw new Error(`Unknown VeriFace icon: ${name}`)
  return <Component aria-hidden={label ? undefined : true} aria-label={label} className={className} size={size} strokeWidth={1.8} />
}
```

- [ ] **Step 5: Implement Button and IconButton**

Create `components/ui/Button.jsx` with variants mapped to these classes:

```jsx
const variants = {
  primary: 'border-primary bg-primary text-white hover:bg-primary-strong',
  secondary: 'border-line bg-surface text-primary hover:bg-canvas',
  quiet: 'border-transparent bg-transparent text-primary hover:bg-primary/5',
  destructive: 'border-destructive bg-destructive text-white hover:bg-red-800',
}
```

Both controls use `inline-flex min-h-11 items-center justify-center gap-2 rounded-control border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50`. `IconButton` uses `min-w-11 px-2`, requires `aria-label`, and renders its label only to assistive technology.

- [ ] **Step 6: Implement form and status contracts**

In `components/ui/FormControls.jsx`, export `Field`, `Input`, `Select`, `Textarea`, and `Checkbox`. Generate stable hint/error IDs from `htmlFor`; use `React.Children.only` and `cloneElement` so `Field` injects `aria-describedby` and `aria-invalid` into its child; use sentence-case labels; and apply `min-h-11 rounded-control border border-line bg-surface px-3 py-2 text-base text-foreground sm:text-sm`.

In `components/ui/Status.jsx`, map `neutral`, `active`, `pending`, `review`, `blocked`, `rejected`, `success`, and `error` to semantic text colors and a visible dot. Set `data-tone={tone}` and never render icon-only status.

- [ ] **Step 7: Implement feedback components**

In `components/ui/Feedback.jsx`, export:

```jsx
export function LoadingState({ label = 'Loading…', compact = false })
export function EmptyState({ title, message, action = null })
export function ErrorState({ title = 'Something went wrong', message, action = null, requestId = '' })
export function Toast({ children, tone = 'neutral', onDismiss })
```

`LoadingState` uses the `loading` icon with `animate-spin` and `role="status"`; `ErrorState` uses `role="alert"`; `Toast` uses `aria-live="polite"` and a close IconButton labeled `Dismiss notification`.

- [ ] **Step 8: Add the public entrypoint and compatibility exports**

Create `components/ui/index.js` with explicit exports. Update `components/shared/ui.jsx` to import and re-export the new `Field`, `Status`, and `Toast` contracts while preserving `WizardStep`, `Badge`, `StatusBadge`, `ApprovalBadge`, and store-backed `ToastContainer` until their consumers migrate.

- [ ] **Step 9: Run tests and commit**

Run `npm run test:ui -- tests/ui/primitives.test.jsx` and expect PASS.

```powershell
git add components/ui components/shared/ui.jsx tests/ui/primitives.test.jsx
git commit --only -m "feat: add civic UI primitives" -- components/ui components/shared/ui.jsx tests/ui/primitives.test.jsx
```

---

### Task 4: Add Surfaces, Dialogs, Data Views, and Organization Filters

**Files:**
- Create: `components/ui/Surface.jsx`
- Create: `components/ui/Dialog.jsx`
- Create: `components/ui/DataView.jsx`
- Create: `components/ui/OrganizationFilterFields.jsx`
- Modify: `components/ui/index.js`
- Test: `tests/ui/primitives.test.jsx`

- [ ] **Step 1: Add failing interaction tests**

Test that a dialog has a name, closes on its close button, and restores focus; a filter bar keeps search first; a mobile record exposes the same labels as the table row; and changing a parent organization filter invokes `onChange(level, value)`.

```jsx
it('renders an accessible dialog', async () => {
  const onClose = vi.fn()
  render(<Dialog open title="Review employee" onClose={onClose}><p>Review details</p></Dialog>)
  expect(screen.getByRole('dialog', { name: 'Review employee' })).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
  expect(onClose).toHaveBeenCalledOnce()
})
```

- [ ] **Step 2: Confirm failure**

Run `npm run test:ui -- tests/ui/primitives.test.jsx` and expect missing-export failures.

- [ ] **Step 3: Implement Surface and PageHeader**

`Surface` renders `rounded-surface border border-line bg-surface`; it accepts no shadow by default. `PageHeader` renders one `h1`, one optional supporting paragraph, a wrapping action area, and `items-start justify-between gap-4` with a stacked mobile layout.

- [ ] **Step 4: Implement Dialog**

Use native React portals only when `document` exists. Give the panel `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`. Capture the active element on open, focus the close button, close on Escape, restore focus on close, and prevent background scrolling while open. Use `fixed inset-0`, `bg-black/45`, `max-h-[calc(100dvh-2rem)]`, and a bottom-aligned mobile panel that centers at `sm`.

- [ ] **Step 5: Implement DataView**

Export `FilterBar`, `TableFrame`, `ResponsiveRecordList`, and `Pagination`. `TableFrame` uses one controlled horizontal overflow region; `ResponsiveRecordList` renders `dl` label/value pairs; `Pagination` disables unavailable actions and exposes `Page {current} of {total}`.

- [ ] **Step 6: Implement optional organization filters**

`OrganizationFilterFields` receives:

```jsx
{
  levels: [
    { id: 'region', label: 'Region', value, options, disabled },
    { id: 'office', label: 'Office', value, options, disabled },
    { id: 'department', label: 'Department', value, options, disabled },
    { id: 'division', label: 'Division', value, options, disabled },
    { id: 'section', label: 'Section', value, options, disabled },
  ],
  onChange(levelId, value),
}
```

Render a level only when it has options or a selected value. Do not synthesize department or section options. Parent-child clearing remains in the owning hook or page because it depends on authoritative data.

- [ ] **Step 7: Verify and commit**

Run `npm run test:ui -- tests/ui/primitives.test.jsx` and expect PASS.

```powershell
git add components/ui tests/ui/primitives.test.jsx
git commit --only -m "feat: add civic operational patterns" -- components/ui tests/ui/primitives.test.jsx
```

---

### Task 5: Rebuild BrandMark and the Public AppShell

**Files:**
- Modify: `components/BrandMark.jsx`
- Modify: `components/AppShell.jsx`
- Create: `tests/ui/app-shell.test.jsx`

- [ ] **Step 1: Write failing shell tests**

Test Home, Scan, conditional Attendance, Register, staff access, active route state, mobile menu disclosure, and accessible menu close behavior. Mock `usePathname` per test.

```jsx
it('opens labeled mobile navigation', async () => {
  render(<AppShell><p>Content</p></AppShell>)
  const trigger = screen.getByRole('button', { name: 'Open navigation' })
  await userEvent.click(trigger)
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
})
```

- [ ] **Step 2: Confirm the current shell fails the new names and structure**

Run `npm run test:ui -- tests/ui/app-shell.test.jsx`.

Expected: FAIL on `Open navigation` or named primary navigation.

- [ ] **Step 3: Simplify BrandMark**

Use the existing `/veriface-icon-192.png`, remove the glow shadow and ring, retain DILG Region XII and VeriFace text, and expose `compact` and `inverted`. Use sentence-case supporting text, weight 500/600, and no wide letter tracking.

- [ ] **Step 4: Rebuild public desktop and mobile navigation**

Replace inline SVG functions with `Icon`. Desktop uses labeled links with a 44px minimum height. Mobile uses one `Open navigation` IconButton and an anchored surface with a visible `Close navigation` IconButton. Name both nav elements `Primary navigation`. Keep `onBeforeNavigate`, `showNavigation`, `fitViewport`, `navItems`, and `onMobileMenuChange` signatures unchanged.

- [ ] **Step 5: Preserve the staff destination contract**

Keep `usePortalDestination()` and its role-specific destination. Render the action with a security icon and visible `Admin`, `HR`, or `Staff` text from `sm` upward; retain an accessible name at all widths.

- [ ] **Step 6: Verify and commit**

Run:

```powershell
npm run test:ui -- tests/ui/app-shell.test.jsx
npm run test:ui -- tests/ui/primitives.test.jsx
```

Expected: PASS.

```powershell
git add components/BrandMark.jsx components/AppShell.jsx tests/ui/app-shell.test.jsx
git commit --only -m "feat: rebuild public application shell" -- components/BrandMark.jsx components/AppShell.jsx tests/ui/app-shell.test.jsx
```

---

### Task 6: Rebuild the Admin and HR Shell

**Files:**
- Modify: `components/admin/AdminShell.jsx`
- Modify: `components/AdminDashboard.jsx`
- Create: `tests/ui/admin-shell.test.jsx`

- [ ] **Step 1: Write failing Admin-shell tests**

Cover visible role scope, active navigation, pending badge text, collapse persistence, mobile drawer, disabled Regional-only action, Scan, and Logout.

```jsx
it('shows the current role and selected operation', () => {
  render(
    <AdminShell
      activePanel="employees"
      navItems={[{ id: 'employees', label: 'Employees', badge: 3 }]}
      roleScope="office"
    ><p>Employee table</p></AdminShell>,
  )
  expect(screen.getByText('Office HR workspace')).toBeVisible()
  expect(screen.getByRole('button', { name: /Employees/ })).toHaveAttribute('aria-current', 'page')
})
```

- [ ] **Step 2: Run and confirm failure**

Run `npm run test:ui -- tests/ui/admin-shell.test.jsx`.

Expected: FAIL on role label and `aria-current`.

- [ ] **Step 3: Replace duplicated navigation SVGs and card buttons**

Use `Icon`, `Button`, and `IconButton`. Map dashboard, office, employees, summary, workforce, settings, roles, and office-settings to named icons. Render selected navigation as a quiet rectangular row with a left amber marker, not a separate card.

- [ ] **Step 4: Implement responsive shell behavior**

Desktop `xl`: persistent sidebar with collapse control. Tablet `md` to `xl`: compact horizontal labeled navigation only when it fits. Mobile: top bar plus modal navigation drawer; remove the permanently fixed scrolling bottom navigation. Preserve localStorage key `faceattend:admin-sidebar-collapsed:v2`.

- [ ] **Step 5: Clarify workspace identity without expanding permission**

Render `Regional Admin workspace` for `roleScope === 'regional'` and `Office HR workspace` otherwise. Keep the current `permissions` filtering, role disabling, `usePendingApprovals`, and default-panel correction in `AdminDashboard` unchanged.

- [ ] **Step 6: Convert header actions**

Use a secondary Button for Scan and a quiet Button for Logout with visible labels. Replace the loading card/gradient with `LoadingState label="Loading workspace…"` on the canvas.

- [ ] **Step 7: Verify and commit**

Run both shell test files and expect PASS.

```powershell
git add components/admin/AdminShell.jsx components/AdminDashboard.jsx tests/ui/admin-shell.test.jsx
git commit --only -m "feat: rebuild admin and HR shell" -- components/admin/AdminShell.jsx components/AdminDashboard.jsx tests/ui/admin-shell.test.jsx
```

---

### Task 7: Simplify Home, Login, and Shared Public States

**Files:**
- Modify: `components/PlatformNavigator.jsx`
- Modify: `components/AddToHomeScreenButton.jsx`
- Modify: `components/AdminLogin.jsx`
- Modify: `components/ErrorBoundary.jsx`
- Modify: `components/BiometricWorkspaceGate.jsx`
- Modify: `components/shared/DilgLoadingIndicator.jsx`
- Create: `tests/ui/public-entry.test.jsx`

- [ ] **Step 1: Write failing public-entry tests**

Assert the home page exposes Scan, Register employee, and role-aware portal access without fabricated live statistics; login keeps PIN input and error feedback; loading and error states use status/alert semantics.

```jsx
it('keeps only essential public entry actions', () => {
  render(<PlatformNavigator />)
  expect(screen.getByRole('link', { name: /scan/i })).toBeVisible()
  expect(screen.getByRole('link', { name: /register employee/i })).toBeVisible()
  expect(screen.getByRole('link', { name: /portal/i })).toBeVisible()
  expect(screen.queryByText(/live system/i)).not.toBeInTheDocument()
  expect(screen.queryByText(/server-enforced identity verification/i)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run and observe failure**

Run `npm run test:ui -- tests/ui/public-entry.test.jsx`.

Expected: FAIL because the current home contains promotional modules, statistic bars, and decorative status treatments.

- [ ] **Step 3: Replace the marketing-style home**

In `PlatformNavigator.jsx`, remove decorative circles, gradients, live-system badge, statistic bar, feature bullet walls, and repeated portal descriptions. Keep Add to Home Screen, Scan, Register employee, and role-aware portal access. Use one compact civic introduction and three plain action rows with icons.

- [ ] **Step 4: Simplify PIN login without changing authentication**

Keep `handlePinLogin`, `/api/login`, `{ loginType: 'pin', pin }`, router push, and status handling unchanged. Replace the hero band and nested PIN card with a narrow `Surface`, a labeled password `Input`, one primary Continue button, one Back link, and an alert for `status`. Keep both admin and HR PIN wording.

- [ ] **Step 5: Standardize loading and error presentation**

Use `LoadingState` in `BiometricWorkspaceGate` and `DilgLoadingIndicator`. Use `ErrorState` in `ErrorBoundary` while preserving retry/reset behavior and any safe diagnostic identifier.

- [ ] **Step 6: Verify and commit**

Run `npm run test:ui -- tests/ui/public-entry.test.jsx` and expect PASS.

```powershell
git add components/PlatformNavigator.jsx components/AddToHomeScreenButton.jsx components/AdminLogin.jsx components/ErrorBoundary.jsx components/BiometricWorkspaceGate.jsx components/shared/DilgLoadingIndicator.jsx tests/ui/public-entry.test.jsx
git commit --only -m "feat: simplify public entry experience" -- components/PlatformNavigator.jsx components/AddToHomeScreenButton.jsx components/AdminLogin.jsx components/ErrorBoundary.jsx components/BiometricWorkspaceGate.jsx components/shared/DilgLoadingIndicator.jsx tests/ui/public-entry.test.jsx
```

---

### Task 8: Redesign Registration Without Changing Enrollment

**Files:**
- Modify: `components/RegisterView.jsx`
- Modify: `components/register/DetailsStep.jsx`
- Modify: `components/register/RegisterStepRail.jsx`
- Modify: `components/register/CaptureStep.jsx`
- Modify: `components/register/ReviewStep.jsx`
- Modify: `components/register/CompleteStep.jsx`
- Create: `tests/ui/registration.test.jsx`

- [ ] **Step 1: Write registration contract tests**

Mock `useEnrollmentCapture`, duplicate checking, audio, and camera. Assert four stages remain; Employee ID remains optional and digits-only; Regional Office still requires division; privacy consent remains required; existing employees see `Do not enroll again`; access code appears before the employee name in completion; pending approval is visible.

```jsx
it('shows the access code before employee identity on completion', () => {
  const { container } = render(
    <CompleteStep
      lastSavedSummary={{ accessCode: '2841', name: 'Maria Santos', officeName: 'Regional Office', lifecycleStatus: 'pending', sampleCount: 4 }}
      onAddAnotherSample={vi.fn()}
      onEnrollNewPerson={vi.fn()}
    />,
  )
  const text = container.textContent
  expect(text.indexOf('2841')).toBeGreaterThanOrEqual(0)
  expect(text.indexOf('2841')).toBeLessThan(text.indexOf('Maria Santos'))
  expect(screen.getByText(/pending/i)).toBeVisible()
})
```

- [ ] **Step 2: Run and capture the intended failures**

Run `npm run test:ui -- tests/ui/registration.test.jsx`.

Expected: at least the new existing-employee notice and completion reading-order assertion fail.

- [ ] **Step 3: Convert the step rail to quiet progress**

Keep the `STEPS` IDs and state machine unchanged. Replace four card-like wizard steps with an ordered list, a 3px progress rule, numbered text, `aria-current="step"`, and completed check icons. Do not add a fifth stage or change transition conditions.

- [ ] **Step 4: Rebuild details with shared fields**

Use `Field`, `Input`, `Select`, `Checkbox`, and `OrganizationFilterFields`. Supply only Office and Division from the current `offices` payload. Render Division only for Regional Office as current logic requires. Place the existing-employee warning before Continue and state: `Already registered? Do not enroll again. Contact HR if your details need correction.`

- [ ] **Step 5: Simplify capture and review surfaces**

Keep camera start/stop, `useEnrollmentCapture`, duplicate check, pose feedback, sample frames, and preview callbacks unchanged. Remove nested cards and glow shadows. Keep functional oval, distance guidance, capture phase, sample count, duplicate blocked/review-required feedback, Retake, Edit details, and Submit enrollment.

- [ ] **Step 6: Fix completion hierarchy**

In `CompleteStep.jsx`, render the generated access code as the first result value, then employee name, office, lifecycle status, sample count, and duplicate-review status. Keep `onAddAnotherSample` and `onEnrollNewPerson`; visually demote re-enrollment because normal existing employees must not use it.

- [ ] **Step 7: Replace blocking overlays and toast chrome**

Use `Dialog open` for duplicate checking/saving with `LoadingState`. Use `Toast` for transient feedback. Keep `enrollmentSubmitRef`, all `try/finally` behavior, and duplicate decision branches unchanged.

- [ ] **Step 8: Verify and commit**

Run:

```powershell
npm run test:ui -- tests/ui/registration.test.jsx
npm test
```

Expected: PASS.

```powershell
git add components/RegisterView.jsx components/register tests/ui/registration.test.jsx
git commit --only -m "feat: redesign employee registration" -- components/RegisterView.jsx components/register tests/ui/registration.test.jsx
```

---

### Task 9: Redesign Employee Attendance and Summary Views

**Files:**
- Modify: `app/(public)/attendance/page.jsx`
- Modify: `app/(public)/summary/page.jsx`
- Modify: `components/kiosk/AttendanceTableView.jsx`
- Create: `tests/ui/public-attendance.test.jsx`

- [ ] **Step 1: Write attendance-view tests**

Assert loading, expired access, empty, error, current-day, monthly, and download states. Verify no duplicated check-in/check-out summary appears when the same values are already presented as the daily record. Verify every displayed daily row comes from the existing canonical API response and no new client-side attendance derivation is introduced.

```jsx
it('renders canonical attendance rows without duplicate metric tiles', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, days: [{ date: '2026-08-24', amIn: '08:00', amOut: '12:00', pmIn: '13:00', pmOut: '17:00', status: 'complete' }] }),
  }))
  render(<AttendanceTableView currentMatch={{ personId: 'person-1', employeeId: '2841' }} onBack={vi.fn()} />)
  expect(await screen.findByText('2026-08-24')).toBeVisible()
  expect(screen.getAllByText('08:00')).toHaveLength(1)
  expect(screen.queryByText(/check-ins today/i)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Confirm failure on the current card-heavy structure**

Run `npm run test:ui -- tests/ui/public-attendance.test.jsx`.

- [ ] **Step 3: Convert attendance lookup and record list**

Use `PageHeader`, `FilterBar`, `TableFrame`, `ResponsiveRecordList`, `LoadingState`, `EmptyState`, and `ErrorState`. Keep `buildEmployeeViewHeaders`, `loadAttendanceMatch`, `clearAttendanceMatch`, fetch URLs, downloads, month/year filters, and API data fields unchanged.

- [ ] **Step 4: Remove redundant summary tiles**

In `app/(public)/summary/page.jsx`, retain today’s records and the monthly aggregate, but do not show the same check-in/check-out count in both a top statistic grid and the record list. Use tabular time, sentence-case labels, and one Back action.

- [ ] **Step 5: Add responsive record equivalence**

At `md` and above, render the quiet table. Below `md`, render labeled record rows containing date, AM in/out, PM in/out, status, mode, undertime, and available action. Never hide correction or download state solely because of width.

- [ ] **Step 6: Verify and commit**

Run the new test plus `npm test`; expect PASS.

```powershell
git add 'app/(public)/attendance/page.jsx' 'app/(public)/summary/page.jsx' components/kiosk/AttendanceTableView.jsx tests/ui/public-attendance.test.jsx
git commit --only -m "feat: simplify employee attendance views" -- 'app/(public)/attendance/page.jsx' 'app/(public)/summary/page.jsx' components/kiosk/AttendanceTableView.jsx tests/ui/public-attendance.test.jsx
```

---

### Task 10: Redesign Admin Employee Operations and Organization Filtering

**Files:**
- Modify: `components/admin/EmployeesPanel.jsx`
- Modify: `components/admin/HrEmployeesPanel.jsx`
- Modify: `components/admin/EmployeeEditorModal.jsx`
- Modify: `components/admin/EmployeeDeleteModal.jsx`
- Modify: `components/admin/EmployeeAccessCodeExportActions.jsx`
- Modify: `components/admin/EmployeeReenrollPanel.jsx`
- Modify: `components/admin/OfficePanel.jsx`
- Modify: `components/admin/OfficeEditorModal.jsx`
- Modify: `components/AdminOfficePanel.jsx`
- Modify: `components/OfficeLocationPicker.jsx`
- Test: `tests/ui/admin-operations.test.jsx`

- [ ] **Step 1: Write employee-operation tests**

Cover pending-first filtering, search, office/division filters, current/next cursor behavior, approval, rejection, lifecycle status, edit, delete confirmation, access-code export, Office HR scope, and absence of unauthorized GPS/map/radius controls for Office HR.

```jsx
it('keeps Office HR inside personnel scope', () => {
  render(<AdminDashboard initialRoleScope="office" initialOfficeId="office-12" permissions={['employees', 'summary']} />)
  expect(screen.getByText('Office HR workspace')).toBeVisible()
  expect(screen.getByRole('button', { name: /employees/i })).toBeVisible()
  expect(screen.queryByText(/latitude|longitude|radius|map|gps/i)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run and observe visual-contract failures**

Run `npm run test:ui -- tests/ui/admin-operations.test.jsx`.

- [ ] **Step 3: Consolidate employee filters**

Use one `FilterBar` ordered as Search, Office, Department, Division, Section, Status, More filters. Pass only current authoritative Office and Division options. Keep `employeeNextCursor`, previous cursor history, query reset behavior, hooks, and endpoint parameters unchanged.

- [ ] **Step 4: Replace duplicated lifecycle and action components**

Remove local `LifecycleBadge`, `ActionButton`, and `SkeletonRow` implementations from both employee panels. Use `Status`, `Button`, `LoadingState`, `TableFrame`, `ResponsiveRecordList`, and `Pagination`. Pending review must be visible text, not only a colored badge.

- [ ] **Step 5: Convert employee dialogs**

Wrap editor and delete flows in `Dialog`. Preserve every field, validation, lifecycle update, duplicate-review field, employee ID optionality, office/division behavior, and store mutation. Destructive delete requires employee name in the dialog and a destructive button; Cancel receives initial focus.

- [ ] **Step 6: Preserve safe re-enrollment boundaries**

Keep re-enrollment available only through the existing authorized route and candidate workflow. Replace local `InfoCard` with shared status/feedback components. Do not add reset-biometric, mass re-enrollment, or public re-enrollment actions.

- [ ] **Step 7: Convert office management without leaking HR controls**

Regional Admin keeps office, schedule, geofence, map/location/radius, and division management. Office HR employee views and office settings must not import or render `OfficeLocationPicker`, latitude, longitude, radius, or map controls.

- [ ] **Step 8: Verify and commit**

Run:

```powershell
npm run test:ui -- tests/ui/admin-operations.test.jsx
npm run test:routes
```

Expected: PASS.

```powershell
git add components/admin/EmployeesPanel.jsx components/admin/HrEmployeesPanel.jsx components/admin/EmployeeEditorModal.jsx components/admin/EmployeeDeleteModal.jsx components/admin/EmployeeAccessCodeExportActions.jsx components/admin/EmployeeReenrollPanel.jsx components/admin/OfficePanel.jsx components/admin/OfficeEditorModal.jsx components/AdminOfficePanel.jsx components/OfficeLocationPicker.jsx tests/ui/admin-operations.test.jsx
git commit --only -m "feat: streamline employee operations" -- components/admin/EmployeesPanel.jsx components/admin/HrEmployeesPanel.jsx components/admin/EmployeeEditorModal.jsx components/admin/EmployeeDeleteModal.jsx components/admin/EmployeeAccessCodeExportActions.jsx components/admin/EmployeeReenrollPanel.jsx components/admin/OfficePanel.jsx components/admin/OfficeEditorModal.jsx components/AdminOfficePanel.jsx components/OfficeLocationPicker.jsx tests/ui/admin-operations.test.jsx
```

---

### Task 11: Redesign Admin Attendance, DTR, Workforce, Settings, and Roles

**Files:**
- Modify: `components/admin/DashboardPanel.jsx`
- Modify: `components/admin/SummaryPanel.jsx`
- Modify: `components/admin/summary/SummaryFilters.jsx`
- Modify: `components/admin/summary/SummaryTable.jsx`
- Modify: `components/admin/summary/DtrModal.jsx`
- Modify: `components/admin/summary/DtrSelectionView.jsx`
- Modify: `components/admin/AttendanceOverrideModal.jsx`
- Modify: `components/admin/WorkforcePanel.jsx`
- Modify: `components/admin/WorkforceRecordModal.jsx`
- Modify: `components/admin/HrOfficeSettingsPanel.jsx`
- Modify: `components/admin/ThresholdSettings.jsx`
- Modify: `components/admin/AdminsPanel.jsx`
- Modify: `components/admin/HrUsersPanel.jsx`
- Modify: `components/admin/AddRoleModal.jsx`
- Modify: `components/admin/BiometricBenchmarkPanel.jsx`
- Modify: `components/admin/ActionButton.jsx`
- Modify: `components/admin/InfoRow.jsx`
- Modify: `components/admin/LoadingPanel.jsx`
- Modify: `components/admin/MetricCard.jsx`
- Modify: `components/admin/Skeleton.jsx`
- Test: `tests/ui/admin-operations.test.jsx`

- [ ] **Step 1: Add failing tests for every operational family**

Add tests for attendance date/organization filters, correction original-versus-proposed values, DTR employee/period/output actions, workforce record dialogs, Regional-only national holiday behavior, Office HR work-policy editing, Admin PIN and threshold controls, role creation, and biometric benchmark loading/error/data states.

```jsx
it('shows correction evidence before save', () => {
  render(
    <AttendanceOverrideModal
      row={{ personId: 'person-1', dateKey: '2026-08-24', amIn: '08:15', amOut: '12:00', pmIn: '13:00', pmOut: '17:00' }}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />,
  )
  expect(screen.getByText(/original/i)).toBeVisible()
  expect(screen.getByDisplayValue('08:15')).toBeVisible()
  expect(screen.getByLabelText(/reason/i)).toBeVisible()
  expect(screen.getByRole('button', { name: /save correction/i })).toBeVisible()
})
```

- [ ] **Step 2: Confirm the test fails before migration**

Run `npm run test:ui -- tests/ui/admin-operations.test.jsx`.

- [ ] **Step 3: Reduce the dashboard to actionable content**

Keep pending approval, re-enrollment queue, and operational device or failure information only when actionable. Remove duplicated metric cards and decorative totals. Link each retained exception directly to its owning panel.

- [ ] **Step 4: Convert attendance and correction presentation**

Use shared filters and responsive data views. `AttendanceOverrideModal` must show original value, proposed value, reason, actor context, and save state. Keep route, payload, timestamp conversion, and permission checks unchanged.

- [ ] **Step 5: Convert DTR and report presentation**

Use one selection flow for employee, period, organization scope, generation status, and download. Preserve `DtrModal`, selection callbacks, export endpoints, file naming, and response handling. Remove nested cards and repeated month/employee summaries.

- [ ] **Step 6: Convert workforce and Office HR settings**

Use quiet tables/forms and `Dialog`. Keep national-holiday controls gated by `allowNationalHolidays`. In `HrOfficeSettingsPanel`, retain schedule and work-policy fields but assert no GPS, map, location, latitude, longitude, or radius labels or payload keys.

- [ ] **Step 7: Convert sensitive settings and role management**

Preserve Admin and Regional Admin PIN behavior exactly. Use labeled fields, explicit Save/Reset actions, status feedback, and destructive confirmation where required. Do not expose stored PIN values. Keep existing permission and role-scope gates.

- [ ] **Step 8: Replace local visual helpers**

Make `ActionButton`, `InfoRow`, `LoadingPanel`, `MetricCard`, and `Skeleton` thin compatibility wrappers over `components/ui`, or delete them when `rg` proves they have zero imports. Do not keep two independently styled button, metric, or loading implementations.

- [ ] **Step 9: Verify and commit**

Run:

```powershell
npm run test:ui -- tests/ui/admin-operations.test.jsx
npm run test:routes
npm run test:contracts
```

Expected: PASS.

```powershell
git add components/admin tests/ui/admin-operations.test.jsx
git commit --only -m "feat: unify admin operational UI" -- components/admin tests/ui/admin-operations.test.jsx
```

---

### Task 12: Simplify Kiosk and Biometric Capture Presentation

**Files:**
- Modify: `components/KioskView.jsx`
- Modify: `components/kiosk/KioskScanningOverlay.jsx`
- Modify: `components/kiosk/KioskSuccessScreen.jsx`
- Modify: `components/kiosk/KioskAlert.jsx`
- Modify: `components/kiosk/FaceOverlayCanvas.jsx`
- Modify: `components/biometrics/CaptureDistanceHud.jsx`
- Modify: `components/biometrics/CaptureGuideHud.jsx`
- Modify: `components/biometrics/FaceSizeGuidance.jsx`
- Modify: `components/biometrics/GuidedCapturePanel.jsx`
- Create: `tests/ui/kiosk.test.jsx`

- [ ] **Step 1: Write kiosk-state tests**

Mock kiosk hooks and camera. Cover access-code entry, exactly-four-digit validation, change code, field duty, camera ready, confirmed, already recorded, blocked, unknown, error, and back-to-kiosk actions. Assert functional face guide and instruction remain while decorative scan grid/sweep/corners are absent.

```jsx
it('rejects an incomplete access code before scanning', async () => {
  render(<KioskView camera={cameraStub} modelsReady workspaceReady locationState={{ ready: true }} onLogAttendance={vi.fn()} />)
  await userEvent.type(screen.getByLabelText(/four-digit access code/i), '12')
  await userEvent.click(screen.getByRole('button', { name: /continue to scan/i }))
  expect(screen.getByText('Enter exactly four digits.')).toHaveAttribute('role', 'alert')
  expect(cameraStub.start).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run and confirm failure**

Run `npm run test:ui -- tests/ui/kiosk.test.jsx`.

Expected: FAIL on decorative scanner selectors or new semantic result structure.

- [ ] **Step 3: Simplify access-code entry**

Use a narrow kiosk `Surface`, labeled numeric `Input`, and primary Continue button. Keep sessionStorage key `faceattend:claimed-access-code`, normalization, four-digit validation, and `claimedEmployeeId` behavior unchanged.

- [ ] **Step 4: Make the camera the dominant surface**

Retain video, face overlay canvas, one oval/bracket position guide, distance guidance, current instruction, time/date, and location state. Remove `scan-visual__grid`, `scan-visual__sweep`, four decorative corners, glow shadows, and looping nonfunctional effects.

- [ ] **Step 5: Standardize result and alert states**

Confirmed, already-recorded, blocked, and unknown states must include text, icon, semantic color, recorded time where applicable, employee identity where known, and one recovery action. Preserve audio cues, timers, `saveAttendanceMatch`, result-key behavior, and scan resume scheduling.

- [ ] **Step 6: Convert field duty to an accessible dialog**

Keep reasons, 500-character remarks, GPS notice, validation, and `fieldDuty` request payload unchanged. Use shared Field, Select, Textarea, Dialog, Cancel, and primary Use for scan actions.

- [ ] **Step 7: Normalize capture guidance**

Use shared Status and Icon presentation across enrollment, kiosk, and re-enrollment HUDs. Keep all measurements, `getFaceSizeGuidance`, phase types, pose decisions, aspect ratio, and canvas drawing logic unchanged.

- [ ] **Step 8: Verify and commit**

Run:

```powershell
npm run test:ui -- tests/ui/kiosk.test.jsx
npm test
```

Expected: PASS.

```powershell
git add components/KioskView.jsx components/kiosk components/biometrics tests/ui/kiosk.test.jsx
git commit --only -m "feat: simplify kiosk and capture UI" -- components/KioskView.jsx components/kiosk components/biometrics tests/ui/kiosk.test.jsx
```

---

### Task 13: Align the Authorized Re-enrollment Page and Remaining Route States

**Files:**
- Modify: `app/admin/employee/[personId]/reenroll/EmployeeReenrollPage.jsx`
- Modify: `components/RegisterRuntimeApp.jsx`
- Modify: `components/ScanRuntimeApp.jsx`
- Modify: `components/BiometricRuntimeProvider.jsx`
- Modify: `components/AppProviders.jsx`
- Test: `tests/ui/registration.test.jsx`
- Test: `tests/ui/kiosk.test.jsx`

- [ ] **Step 1: Add tests for authorized route state**

Assert re-enrollment shows the employee identity, reason/context, Back action, loading/error state, and capture panel without exposing a public reset action. Assert runtime loading and model errors use shared feedback.

```jsx
it('keeps re-enrollment authorized and non-destructive', () => {
  render(<EmployeeReenrollPage person={{ id: 'person-1', firstName: 'Maria', lastName: 'Santos', lifecycleStatus: 'active' }} />)
  expect(screen.getByRole('heading', { name: /Maria Santos/i })).toBeVisible()
  expect(screen.getByRole('button', { name: /back/i })).toBeVisible()
  expect(screen.queryByRole('button', { name: /reset biometric/i })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run and observe failure**

Run both registration and kiosk test files.

- [ ] **Step 3: Convert route presentation only**

Use AdminShell-compatible header, PageHeader, Feedback, and shared capture presentation. Preserve route authorization, `personId`, camera lifecycle, enrollment submission, descriptor persistence, and navigation behavior.

- [ ] **Step 4: Normalize runtime gates**

Replace local spinners, raw error blocks, and repeated loading cards in runtime/provider components with `LoadingState` and `ErrorState`. Keep initialization order, dynamic loading, model loading, and error propagation unchanged.

- [ ] **Step 5: Verify and commit**

Run the two focused suites and `npm test`; expect PASS.

```powershell
git add 'app/admin/employee/[personId]/reenroll/EmployeeReenrollPage.jsx' components/RegisterRuntimeApp.jsx components/ScanRuntimeApp.jsx components/BiometricRuntimeProvider.jsx components/AppProviders.jsx tests/ui/registration.test.jsx tests/ui/kiosk.test.jsx
git commit --only -m "feat: align remaining biometric route UI" -- 'app/admin/employee/[personId]/reenroll/EmployeeReenrollPage.jsx' components/RegisterRuntimeApp.jsx components/ScanRuntimeApp.jsx components/BiometricRuntimeProvider.jsx components/AppProviders.jsx tests/ui/registration.test.jsx tests/ui/kiosk.test.jsx
```

---

### Task 14: Remove Superseded CSS, Icons, and Visual Duplication

**Files:**
- Modify: `app/globals.css`
- Modify: `tailwind.config.cjs`
- Modify or delete after zero-import proof: `components/admin/ActionButton.jsx`
- Modify or delete after zero-import proof: `components/admin/InfoRow.jsx`
- Modify or delete after zero-import proof: `components/admin/LoadingPanel.jsx`
- Modify or delete after zero-import proof: `components/admin/MetricCard.jsx`
- Modify or delete after zero-import proof: `components/admin/Skeleton.jsx`
- Delete after zero-caller proof: `components/admin/DtrPanel.jsx`
- Delete after zero-caller proof: `components/hr/Form48Dtr.jsx`
- Modify: `components/shared/ui.jsx`
- Create: `tests/ui/source-hygiene.test.js`

- [ ] **Step 1: Produce the legacy-consumer inventory**

Run:

```powershell
rg -n "bg-hero-gradient|card-gradient|orange-gradient|shadow-glow|shadow-glow-orange|rounded-\[1\.(5|6|75|8)rem\]|uppercase tracking|scan-visual__(grid|sweep|corner)|<svg|✕|→|←|›|‹" app components
rg -n "\b(card|btn|input|badge|field-label|stat-card|stat-value)\b" app components
```

Expected: every match is assigned to an active functional exception or removed in the next step. Keep SVG only for the brand asset, face canvas geometry, or an icon unavailable through the adapter with a documented reason.

- [ ] **Step 2: Add a regression test for removed functional glyphs**

Create `tests/ui/source-hygiene.test.js`:

```js
import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

function sourceFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = join(root, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return ['.js', '.jsx'].includes(extname(path)) ? [path] : []
  })
}

describe('UI source hygiene', () => {
  it('does not use text glyphs as functional icons', () => {
    const failures = [...sourceFiles('app'), ...sourceFiles('components')]
      .filter(path => /[✕›‹]/u.test(readFileSync(path, 'utf8')))
    expect(failures).toEqual([])
  })
})
```

- [ ] **Step 3: Remove zero-consumer CSS and Tailwind keys**

Delete gradient backgrounds, glow shadows, decorative scanner rules, obsolete oversized radii, old animation keys, and compatibility aliases only after `rg` returns no active consumer. Keep map marker and functional face-overlay geometry if still used.

- [ ] **Step 4: Remove or collapse compatibility wrappers**

Run:

```powershell
rg -n "from ['\"]@?/?.*(ActionButton|InfoRow|LoadingPanel|MetricCard|Skeleton|DtrPanel|Form48Dtr|components/shared/ui)" app components
```

Delete a wrapper only when it has zero imports. Otherwise make it a one-purpose wrapper over the new primitive and record the remaining import path in the execution notes.

If either scan still reports a legacy consumer outside the exact Task 14 file list, stop and return to that consumer’s owning migration task. Do not broaden the cleanup commit dynamically.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm run test:ui
npx tailwindcss -i app/globals.css -o .next/ui-cleanup-check.css --minify
git diff --check
```

Expected: PASS and no whitespace output.

```powershell
git add app/globals.css tailwind.config.cjs components/admin/ActionButton.jsx components/admin/InfoRow.jsx components/admin/LoadingPanel.jsx components/admin/MetricCard.jsx components/admin/Skeleton.jsx components/admin/DtrPanel.jsx components/hr/Form48Dtr.jsx components/shared/ui.jsx tests/ui/source-hygiene.test.js
git commit --only -m "refactor: remove legacy UI clutter" -- app/globals.css tailwind.config.cjs components/admin/ActionButton.jsx components/admin/InfoRow.jsx components/admin/LoadingPanel.jsx components/admin/MetricCard.jsx components/admin/Skeleton.jsx components/admin/DtrPanel.jsx components/hr/Form48Dtr.jsx components/shared/ui.jsx tests/ui/source-hygiene.test.js
```

Before committing, inspect `git diff --cached --name-only`; the `--only` commit must contain only the listed paths.

---

### Task 15: Verify Responsive, Accessibility, and Workflow Behavior

**Files:**
- Create: `docs/ui-verification.md`
- Modify: UI files only when a verification failure requires correction

- [ ] **Step 1: Start the application with local-only configuration**

Run the documented local PostgreSQL start procedure, then:

```powershell
npm run dev
```

Expected: local server starts without reading production credentials. Do not run migrations against production.

- [ ] **Step 2: Verify representative routes at required widths**

Using the in-app browser, inspect 320x800, 375x812, 768x1024, 1024x768, and 1440x900 for:

- `/`
- `/login`
- `/registration`
- `/scan`
- `/attendance`
- `/summary`
- `/admin/login`
- `/admin` as Regional Admin
- `/admin` as Office HR
- authorized `/admin/employee/{personId}/reenroll`

At every width verify: no page-level horizontal overflow, 44px controls, readable labels, visible focus, action availability, correct stacking, and no clipped dialog.

- [ ] **Step 3: Exercise keyboard and reduced-motion behavior**

For each shell: Tab through navigation, open/close mobile navigation, open/close one dialog, submit one invalid form, and verify focus movement. Emulate `prefers-reduced-motion: reduce`; verify nonessential transitions and smooth scrolling stop while state updates remain visible.

- [ ] **Step 4: Exercise critical local workflows**

Using the local restored database only, verify:

1. Registration validation, capture readiness, duplicate block/review presentation, submit, pending completion, and generated access code.
2. Employee approval and lifecycle status change.
3. Kiosk accepted, already-recorded, blocked, unknown, and error outcomes.
4. Office HR can edit work policy but cannot see map/GPS/location/radius controls.
5. Attendance correction shows original/proposed values and saves.
6. DTR selection, generation, and download.
7. Admin and Regional Admin PIN login remains available.

- [ ] **Step 5: Run automated accessibility checks**

Run `npm run test:ui` and confirm all representative renders pass the critical axe assertion. Manually inspect heading order, form labels, status text, table headers, dialog names, and contrast because jsdom cannot validate layout-dependent accessibility.

- [ ] **Step 6: Document evidence**

Create `docs/ui-verification.md` containing the tested commit, date, viewport matrix, routes, workflow results, accessibility findings, screenshots retained outside the repository, remaining limitations, and explicit statement that production was not modified.

- [ ] **Step 7: Commit verification corrections and evidence**

```powershell
$verificationPaths = @(git diff --name-only --diff-filter=ACMRT -- app components tests/ui docs/ui-verification.md)
$verificationPaths
git add -- $verificationPaths
git commit --only -m "test: verify civic UI workflows" -- $verificationPaths
```

Expected: the printed list contains `docs/ui-verification.md` and only UI files corrected during verification.

---

### Task 16: Run Final Release Gates and Stop

**Files:**
- Modify: `README.md` only if its interface description is inaccurate after migration
- Modify: `docs/architecture.md` only if shared UI ownership is absent or inaccurate
- Verify: all changed UI and test files

- [ ] **Step 1: Run all focused and complete tests**

```powershell
npm run test:ui
npm test
npm run test:routes
npm run test:contracts
```

Expected: every command exits 0. A skipped database test is not equivalent to a seeded local PostgreSQL pass; record skips explicitly.

- [ ] **Step 2: Run the hosting build**

```powershell
npm run build:hosting
```

Expected: command exits 0 and `.next/BUILD_ID` exists. Do not call the application deployable if the build is still compiling or the file is absent.

- [ ] **Step 3: Run repository hygiene checks**

```powershell
git diff --check
git status --short
Test-Path -LiteralPath '.next/BUILD_ID'
Get-Content -LiteralPath '.next/BUILD_ID'
```

Expected: no whitespace errors; status contains only known changes; BUILD_ID check returns `True` and prints a non-empty identifier.

- [ ] **Step 4: Review the complete UI diff for behavioral leakage**

Run:

```powershell
git diff --stat 9214b99..HEAD
git diff 9214b99..HEAD -- app components package.json tailwind.config.cjs tests/ui docs
```

Confirm no API route, database, biometric library, attendance calculation, authentication, or permission file changed as part of this UI program unless separately approved and independently tested.

- [ ] **Step 5: Update truthful documentation only**

If README or architecture documentation still describes gradients, old navigation, Firebase, reset-biometric maintenance, mandatory Employee ID, or another removed UI path, replace only the inaccurate statements with the verified current behavior. Do not add deployment claims.

- [ ] **Step 6: Commit documentation if changed**

```powershell
git add README.md docs/architecture.md
git commit --only -m "docs: align UI documentation" -- README.md docs/architecture.md
```

Skip this commit when neither file changed.

- [ ] **Step 7: Stop with an evidence-based handoff**

Report: completed task commits, tests and exact outcomes, hosting BUILD_ID, viewport/workflow evidence, known limitations, and production-not-modified status. Do not upload `.next`, deploy, or migrate production under this plan.

---

## Program Stop Conditions

Stop and investigate before continuing when any of these occur:

- A UI change requires an API payload, database schema, biometric threshold, attendance derivation, or permission change.
- A focused test fails outside the files owned by the current task.
- Local testing would fall back to `DATABASE_URL` or another production connection.
- A page loses an authorized action or exposes an unauthorized one.
- Registration, approval, kiosk, correction, or DTR behavior differs from its pre-redesign contract.
- The hosting build does not produce `.next/BUILD_ID`.

The program is complete only after Task 16 passes. Visual improvement without workflow proof is not completion.

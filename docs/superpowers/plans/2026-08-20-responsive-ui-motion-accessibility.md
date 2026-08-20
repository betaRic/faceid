# Responsive UI, Motion, and Accessibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Admin and Office HR into a compact mobile-first operational interface with responsive hierarchy filters, safe smooth scrolling, limited reversible motion, and accessible feedback.

**Architecture:** Existing workflows and sidebar remain. Shared layout/filter/motion primitives replace repeated nested boxes, while data screens own only their domain content. Motion uses `framer-motion` transform/opacity with user reduced-motion settings; scrolling remains native and never intercepted.

**Tech Stack:** React 18, Next.js 16, Tailwind CSS 3, `framer-motion` 11, Zustand, existing in-app browser verification.

---

## File Structure

- Create `components/shared/AppMotionProvider.jsx`: one `MotionConfig reducedMotion="user"` boundary.
- Create `components/shared/RevealSection.jsx`: restrained reversible viewport transition.
- Create `components/shared/ScrollToTopButton.jsx`: explicit native smooth-scroll control.
- Create `components/admin/OperationalToolbar.jsx`: responsive search/filter/action shell.
- Create `components/admin/MobileFilterSheet.jsx`: accessible hierarchy/status filters on small screens.
- Create `lib/ui/responsive-filters.js`: pure active-filter chip and reset helpers.
- Create `tests/ui-contract.test.mjs`: pure/source UI contract checks.
- Modify `components/AppProviders.jsx`: install the motion provider.
- Modify `app/globals.css`: smooth-scroll/reduced-motion, compact tokens, responsive operational styles.
- Modify `components/admin/AdminShell.jsx` and `components/AppShell.jsx`: flat canvas and mobile navigation.
- Modify `components/admin/EmployeesPanel.jsx` and `HrEmployeesPanel.jsx`: responsive toolbar/table/cards.
- Modify dashboard, office, workforce, attendance, summary, and DTR panels: remove redundant container layers.
- Modify registration steps and kiosk feedback only where responsive/accessibility defects are verified.

### Task 1: UI contract tests and shared tokens

**Files:**
- Create: `tests/ui-contract.test.mjs`
- Modify: `app/globals.css`

- [ ] **Step 1: Write failing source/pure contract tests**

Assert global CSS contains native smooth scrolling plus a reduced-motion override, operational controls use at least 44 px touch targets on coarse/mobile pointers, page containers prevent horizontal page overflow, and no animation rule targets employee rows/cells.

```javascript
test('global motion contract respects reduced motion', async () => {
  const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8')
  assert.match(css, /scroll-behavior:\s*smooth/)
  assert.match(css, /prefers-reduced-motion:\s*reduce/)
  assert.match(css, /scroll-behavior:\s*auto/)
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/ui-contract.test.mjs`
Expected: FAIL until the global contract is added.

- [ ] **Step 3: Add compact, accessible global rules**

```css
html { scroll-behavior: smooth; }
body { overflow-x: clip; }

.operational-control { min-height: 2.75rem; }
.operational-canvas { width: 100%; min-width: 0; }

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Use 4/8 spacing multiples and 8-12 px radii for new operational components. Do not globally overwrite model/capture geometry.

- [ ] **Step 4: Run and commit**

Run: `node --test tests/ui-contract.test.mjs`
Expected: PASS.

```powershell
git add app/globals.css tests/ui-contract.test.mjs
git commit -m "style: define responsive motion contract"
```

### Task 2: Motion provider and reversible section primitive

**Files:**
- Create: `components/shared/AppMotionProvider.jsx`
- Create: `components/shared/RevealSection.jsx`
- Create: `components/shared/ScrollToTopButton.jsx`
- Modify: `components/AppProviders.jsx`
- Test: `tests/ui-contract.test.mjs`

- [ ] **Step 1: Add failing component contract checks**

Assert source uses `MotionConfig reducedMotion="user"`, `useReducedMotion`, `viewport.once: false`, opacity/transform only, and no `useScroll` listener that sets `window.scrollTo` continuously.

- [ ] **Step 2: Implement the provider**

```jsx
'use client'

import { MotionConfig } from 'framer-motion'

export default function AppMotionProvider({ children }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
```

- [ ] **Step 3: Implement restrained reveal motion**

```jsx
'use client'

import { motion, useReducedMotion } from 'framer-motion'

export default function RevealSection({ children, className = '', as = 'section' }) {
  const reduce = useReducedMotion()
  const Component = motion[as] || motion.section
  return (
    <Component
      className={className}
      initial={reduce ? { opacity: 1 } : { opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: false, amount: 0.16, margin: '0px 0px -6% 0px' }}
      transition={{ duration: reduce ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Component>
  )
}
```

Apply only to major panels/sections, never rows, cells, or every metric.

- [ ] **Step 4: Implement explicit scroll-to-top**

The button appears after a passive scroll threshold, has `aria-label="Scroll to top"`, and calls `window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })` only when clicked. It never changes position during wheel/touch events.

- [ ] **Step 5: Install provider and run tests**

Wrap existing provider children once in `AppProviders`. Run:

```powershell
node --test tests/ui-contract.test.mjs
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit shared motion**

```powershell
git add components/shared/AppMotionProvider.jsx components/shared/RevealSection.jsx components/shared/ScrollToTopButton.jsx components/AppProviders.jsx tests/ui-contract.test.mjs
git commit -m "feat: add accessible shared motion"
```

### Task 3: Flat operational shell

**Files:**
- Modify: `components/admin/AdminShell.jsx`
- Modify: `components/AppShell.jsx`
- Modify: `components/AdminDashboard.jsx`
- Modify: `app/globals.css`
- Test: `tests/ui-contract.test.mjs`

- [ ] **Step 1: Capture current desktop/mobile screenshots**

Run local app and capture Admin at 375×812 and 1440×900 before editing. Record sidebar width, nested containers, horizontal overflow, footer height, and first-action visibility.

- [ ] **Step 2: Flatten shell structure**

Keep sidebar/navigation semantics. Use one page background, one content header, and one content surface. Remove nonessential page footer, repeated page titles, nested shadow/radius wrappers, and padding layers that do not communicate grouping.

- [ ] **Step 3: Make navigation responsive**

Desktop sidebar remains persistent. Mobile uses a labeled menu button and focus-trapped drawer; closing restores focus. Main content uses `min-width: 0`, safe-area padding, and no fixed width that causes page-level horizontal scroll.

- [ ] **Step 4: Add major-panel reveals only**

Wrap at most the page title/action group and primary content panel with `RevealSection`. Sidebar links, tables, rows, and live result updates remain static.

- [ ] **Step 5: Verify shell breakpoints and commit**

Check 320, 375, 414, 768, 1024, and 1440 widths. Expected: navigation/action access without clipped controls or horizontal page scrolling.

```powershell
git add components/admin/AdminShell.jsx components/AppShell.jsx components/AdminDashboard.jsx app/globals.css tests/ui-contract.test.mjs
git commit -m "style: flatten operational app shell"
```

### Task 4: Responsive hierarchy filter toolbar

**Files:**
- Create: `components/admin/OperationalToolbar.jsx`
- Create: `components/admin/MobileFilterSheet.jsx`
- Create: `lib/ui/responsive-filters.js`
- Modify: `components/admin/OrganizationFilters.jsx`
- Modify: `components/admin/EmployeesPanel.jsx`
- Modify: `components/admin/HrEmployeesPanel.jsx`
- Test: `tests/ui-contract.test.mjs`
- Test: `tests/run-tests.mjs`

- [ ] **Step 1: Write pure filter-chip tests**

Assert selected Office/Department/Division/Section/status values produce ordered labeled chips; removing a parent clears descendants; `activeFilterCount` ignores `all`/empty; Office HR locked Office cannot be removed.

- [ ] **Step 2: Implement pure chip helpers**

Export `buildActiveFilterChips(filters, lookups, { officeLocked })`, `removeFilterAndDescendants(filters, key)`, and `countActiveFilters(filters, { officeLocked })` from `responsive-filters.js`.

- [ ] **Step 3: Build desktop/tablet toolbar**

At desktop widths, show search, cascading filters, status filters, result count, and primary action in one compact toolbar that wraps into two predictable rows on tablet. Labels remain programmatically associated.

- [ ] **Step 4: Build accessible mobile filter sheet**

Below the desktop breakpoint, render a 44 px Filter button with active count. The sheet uses a dialog title, focus trap, Escape/close, full-width controls, Apply/Clear actions, and restores focus. Active removable chips remain above results.

- [ ] **Step 5: Keep filtering stable during async loads**

Reserve selector space, show an inline loading state, disable only dependent selectors, and retain parent selection. Applying any changed filter resets cursor/history through the store action from the hierarchy plan.

- [ ] **Step 6: Run tests and commit**

Run:

```powershell
node --test tests/ui-contract.test.mjs
npm test
```

Expected: PASS.

```powershell
git add components/admin/OperationalToolbar.jsx components/admin/MobileFilterSheet.jsx components/admin/OrganizationFilters.jsx components/admin/EmployeesPanel.jsx components/admin/HrEmployeesPanel.jsx lib/ui/responsive-filters.js tests/ui-contract.test.mjs tests/run-tests.mjs
git commit -m "feat: add responsive hierarchy filters"
```

### Task 5: Employee table/card responsiveness

**Files:**
- Modify: `components/admin/EmployeesPanel.jsx`
- Modify: `components/admin/HrEmployeesPanel.jsx`
- Modify: `components/admin/EmployeeEditorModal.jsx`
- Modify: `app/globals.css`
- Test: `tests/ui-contract.test.mjs`

- [ ] **Step 1: Define information priority**

Always visible: access code/Employee ID where present, employee name, lifecycle/approval, office/organization path, primary review/edit action. Secondary metadata moves into a details disclosure on narrow screens.

- [ ] **Step 2: Implement two deliberate render modes**

Desktop uses an edge-to-edge table with sticky header and stable columns. Mobile uses compact labeled employee cards/list rows; it does not squeeze the full desktop table. Both render from the same employee result and action components.

- [ ] **Step 3: Make dialogs mobile-safe**

Editor/review dialogs use viewport-bounded height, internal scroll, sticky action footer, visible validation summary, and 44 px actions. They do not create body-width overflow or hide Save/Cancel behind browser chrome.

- [ ] **Step 4: Verify large-list fluidity**

Load at least 100 synthetic employees through pagination. Scroll both directions and operate filters/actions. Expected: no per-row reveal animation, no visible layout jump, and interactions remain responsive.

- [ ] **Step 5: Commit employee responsiveness**

```powershell
git add components/admin/EmployeesPanel.jsx components/admin/HrEmployeesPanel.jsx components/admin/EmployeeEditorModal.jsx app/globals.css tests/ui-contract.test.mjs
git commit -m "style: make employee directory mobile-first"
```

### Task 6: Clean remaining operational panels

**Files:**
- Modify: `components/admin/DashboardPanel.jsx`
- Modify: `components/admin/OfficePanel.jsx`
- Modify: `components/admin/WorkforcePanel.jsx`
- Modify: `components/admin/SummaryPanel.jsx`
- Modify: `components/admin/DtrPanel.jsx`
- Modify: `components/admin/HrOfficeSettingsPanel.jsx`
- Modify: `components/admin/AttendanceOverrideModal.jsx`
- Modify: `components/RegisterView.jsx`
- Modify: `components/register/CaptureStep.jsx`
- Modify: `components/register/CompleteStep.jsx`
- Modify: `components/register/DetailsStep.jsx`
- Modify: `components/register/RegisterStepRail.jsx`
- Modify: `components/register/ReviewStep.jsx`

- [ ] **Step 1: Audit each panel before changing it**

For each panel, list repeated heading, nested box, excessive padding, dead footer, hidden mobile action, missing loading/error/empty state, and accessibility defect. Do not change biometric capture geometry merely for visual consistency.

- [ ] **Step 2: Apply shared operational patterns**

Use metrics cards only for actual metrics/status, edge-to-edge tables for data, `OperationalToolbar` for controls, one action hierarchy, and shared loading/empty/error feedback. Office HR work-policy UI must not render or receive GPS/map/radius fields.

- [ ] **Step 3: Keep registration/kiosk feedback immediate**

Registration steps remain linear and mobile-first; errors are field-linked and summarized. Submission shows one pending state and safe error. Kiosk success/reject screens avoid extra scroll motion and keep critical text/buttons visible.

- [ ] **Step 4: Verify motion/accessibility manually**

At each required width, test scrolling down/up, scroll-to-top, browser back, keyboard-only navigation, dialog focus, Escape, visible focus, reduced-motion emulation, slow data loading, empty results, and server errors. Expected: native scroll remains controllable and content never depends on motion.

- [ ] **Step 5: Run Phase 5 gates**

Run:

```powershell
node --test tests/ui-contract.test.mjs
npm test
npm run test:routes
npm run build:hosting
git diff --check
```

Expected: all pass and `.next/BUILD_ID` exists.

- [ ] **Step 6: Commit panel cleanup**

```powershell
git add components/admin/DashboardPanel.jsx components/admin/OfficePanel.jsx components/admin/WorkforcePanel.jsx components/admin/SummaryPanel.jsx components/admin/DtrPanel.jsx components/admin/HrOfficeSettingsPanel.jsx components/admin/AttendanceOverrideModal.jsx components/RegisterView.jsx components/register/CaptureStep.jsx components/register/CompleteStep.jsx components/register/DetailsStep.jsx components/register/RegisterStepRail.jsx components/register/ReviewStep.jsx app/globals.css tests/ui-contract.test.mjs
git commit -m "style: simplify operational panels"
```

## Phase Stop Gate

Do not call the UI complete until 320/375/414/768/1024/1440 checks pass, reduced-motion removes movement, scrolling remains native in both directions, mobile filters preserve hierarchy semantics, and large employee lists have no row-level animation or horizontal page overflow.

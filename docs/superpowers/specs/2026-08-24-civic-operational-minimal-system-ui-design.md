# VeriFace Civic Operational Minimal System UI Design

**Date:** 2026-08-24  
**Status:** Proposed for final review  
**Scope:** Entire VeriFace interface: public pages, registration, employee views, kiosk and scan flows, Admin, Office HR, attendance, corrections, DTR and reports, settings, dialogs, tables, forms, navigation, and system feedback.

## 1. Decision

VeriFace will use a single **Civic Operational Minimal** design system. It will retain the DILG Region XII identity while removing decorative dashboard patterns, repeated card chrome, oversized headings, redundant explanatory text, inconsistent icons, and avoidable motion.

The visual system must support two different operational needs without splitting into separate brands:

- Public, registration, and kiosk interfaces must be calm, guided, touch-friendly, and readable at distance.
- Admin and HR interfaces must be compact, fast to scan, keyboard-usable, and information-dense without becoming cluttered.

The redesign may reorganize navigation, labels, page structure, and component placement. It must not change biometric decisions, attendance rules, approval requirements, authorization boundaries, database behavior, or retention rules.

## 2. Evidence and Current Constraints

Current shared UI ownership is concentrated in `AppShell`, `AdminShell`, `PlatformNavigator`, `BrandMark`, `components/shared/ui.jsx`, and `app/globals.css`.

Observed constraints:

- `AppShell` affects public pages, employee summary, blocked and unauthorized states, registration, and Admin login.
- `AdminShell` owns the main Admin navigation and is rendered by `AdminDashboard`.
- Kiosk and registration combine shared global classes with large amounts of local Tailwind styling.
- The stylesheet already contains DILG navy and amber tokens, but also retains gradients, large glow shadows, pill-shaped controls, large statistic treatments, uppercase microcopy, and elaborate scanner decoration.
- There is no installed, system-wide React icon library. Icons are therefore inconsistent or absent.
- Shared shell components do not currently have focused visual or responsive regression tests.
- The repository already uses Tailwind CSS and Framer Motion. A second styling framework is not required.

## 3. Goals

1. Establish one predictable visual language across every route.
2. Reduce operational clutter and scrolling.
3. Improve mobile and tablet usability without degrading desktop density.
4. Make hierarchy, state, and the next action immediately understandable.
5. Provide consistent accessible controls, feedback, icons, tables, and dialogs.
6. Preserve all existing application behavior and security boundaries.
7. Make future UI work cheaper by consolidating repeated patterns into shared primitives.

## 4. Non-goals

- No biometric algorithm, threshold, anti-spoofing, or face-capture behavior changes.
- No attendance derivation, correction, DTR, cron, or persistence changes.
- No authorization expansion for Admin, Regional Admin, Office HR, or employees.
- No fabricated organization data. Department, division, and section filters appear only when returned by the authoritative organization data source.
- No dark-mode program in this redesign. Kiosk may retain a dark camera surface for contrast.
- No marketing-style landing page, glassmorphism, animated infographic dashboard, or ornamental redesign.
- No remote font dependency required for correct production rendering.

## 5. Visual Foundation

### 5.1 Color

The existing DILG-aligned palette remains authoritative, but its usage becomes stricter:

| Role | Token | Value | Usage |
|---|---|---:|---|
| Primary | `--color-primary` | `#032D57` | Navigation, primary actions, selected state, strong headings |
| Primary strong | `--color-primary-strong` | `#021E3A` | Desktop sidebar and high-contrast civic chrome |
| Accent | `--color-accent` | `#EA921F` | DILG identity, focus emphasis, progress, restrained highlights |
| Background | `--color-background` | `#F4F6F8` | Application background |
| Surface | `--color-surface` | `#FFFFFF` | Necessary bounded content only |
| Text | `--color-text` | `#172033` | Primary copy |
| Muted text | `--color-text-muted` | `#5D6878` | Supporting copy that still passes contrast |
| Border | `--color-border` | `#DCE2E8` | Quiet separation |
| Success | `--color-success` | `#117A50` | Approved, active, and completed state |
| Warning | `--color-warning` | `#8A5200` | Pending and review-required state |
| Destructive | `--color-destructive` | `#B42318` | Errors and destructive actions |

Rules:

- Color never carries meaning alone; status always includes text and, where useful, an icon.
- Amber is not a general button color and is not used as decorative filler.
- Gradients and glows are removed from operational pages.
- Shadows are limited to dialogs, menus, elevated mobile navigation, and camera/result overlays.
- Borders and spacing, not nested cards, establish most grouping.

### 5.2 Typography

Use a production-safe system stack:

```css
font-family: "Segoe UI Variable", "Segoe UI", Inter, Roboto, Arial, sans-serif;
```

No Google Fonts network request is required. Typography roles:

- Page title: 28–32px desktop, 24–28px mobile, weight 600.
- Section title: 18–22px, weight 600.
- Body and control text: 16px public/mobile, 14–16px operational desktop.
- Table and dense metadata: 14px minimum.
- Supporting text: 12–14px; never below 12px.
- Numeric time and attendance values use tabular numerals.
- Uppercase is restricted to short civic identifiers or compact category labels. Form labels and table headers use sentence case.
- Letter spacing is restrained; wide tracking is removed from ordinary labels.

### 5.3 Spacing, Radius, and Elevation

- Base spacing unit: 4px.
- Standard control height: 44px; kiosk and primary mobile controls may use 48–56px.
- Standard radius: 8px controls, 10–12px necessary panels, round only for avatars and status dots.
- Pill shapes are limited to short status labels and compact segmented controls.
- Default surfaces are flat. One subtle shadow level is used for menus and elevated overlays; one stronger level is used for dialogs.

## 6. Shared Component System

Create or consolidate the following shared components. Tailwind owns composition and responsive geometry. Custom CSS owns semantic tokens, browser normalization, complex camera geometry, reduced-motion behavior, and a small set of cross-route component classes.

### 6.1 Core primitives

- `Icon`: one adapter over `lucide-react`, with consistent size, stroke, and accessibility rules.
- `Button`: primary, secondary, quiet, and destructive variants; no arbitrary per-page button styling.
- `IconButton`: only for universally recognizable actions; requires an accessible name and tooltip.
- `Field`, `SelectField`, `TextareaField`, `CheckboxField`: shared label, hint, error, disabled, and focus behavior.
- `Status`: semantic text plus optional icon/dot for pending, active, blocked, rejected, success, error, and review-required.
- `Surface`: used only when a bounded visual region is necessary; nesting is prohibited.
- `Divider`, `Skeleton`, `Spinner`, `Progress`, and `Toast`.

### 6.2 Operational patterns

- `PageHeader`: title, concise supporting line, one primary action, optional secondary actions.
- `FilterBar`: search first, dependent organization filters, status/date filters, and a mobile expansion pattern.
- `DataTable`: quiet row dividers, sticky header when useful, meaningful column priority, row action menu, loading, error, and empty states.
- `ResponsiveRecordList`: mobile alternative for tables whose essential fields cannot fit.
- `Dialog` and `Drawer`: accessible focus management, escape handling, labeled close action, destructive confirmation variant.
- `EmptyState`: concise explanation plus one recovery or creation action; no decorative illustration.
- `ErrorState`: actionable message, request identifier where available, and retry action.
- `Pagination`: clear previous/next controls and result context without redundant counters.

### 6.3 Organization filters

Organization filtering follows the available hierarchy:

`Region -> Office -> Department -> Division -> Section`

Each level is optional and populated only when the backend returns that level. Changing a parent clears invalid descendants. Office HR receives only its authorized organization scope. Location, GPS, map, and radius controls remain hidden and server-rejected for Office HR.

## 7. Application Shells

### 7.1 Public shell

Used by home, login, registration, attendance lookup, employee summary, blocked, and unauthorized views.

- Compact DILG/VeriFace brand header.
- One clear page purpose.
- No global footer unless legally or operationally required.
- Content width chosen by task: narrow for authentication, medium for forms, wide only for records.
- Mobile header uses labels for essential actions and avoids icon-only navigation.

### 7.2 Admin and HR shell

- Persistent desktop sidebar at large widths.
- Collapsible labeled navigation at medium widths.
- Mobile top bar plus accessible navigation drawer.
- Navigation groups reflect operational ownership rather than technical modules.
- Current route has a high-contrast selected state and left accent marker.
- Role and office scope are visible without consuming a large header block.
- No dashboard tile wall by default. Overview shows only actionable exceptions and genuinely useful totals.

### 7.3 Kiosk shell

- Camera is the dominant surface.
- Only functional face-position guidance remains; decorative grid, sweep, target, shimmer, and repeated corner effects are removed.
- Access code, scan instruction, result state, time, privacy notice, and recovery action remain immediately visible.
- Confirmed, blocked, unknown, and already-recorded outcomes receive distinct text, icon, color, and audio behavior.
- Kiosk motion never delays scanning or hides the result.

## 8. Page-family Design

### 8.1 Public home and login

- Replace promotional or infographic content with direct entry points: attendance scan, registration, employee summary, and staff login where applicable.
- Explain approval and privacy once, near the relevant action.
- Keep one primary action per visible section.

### 8.2 Registration

- Three clear stages: details, face capture, review and submit.
- Preserve optional Employee ID behavior and generated access-code display.
- Explain that existing employees must not enroll again before face capture begins.
- Use dependent organization selectors and inline validation.
- Success view clearly states pending approval and shows the generated access code before the employee name.
- Error messages are translated into user actions; raw database errors are never shown.

### 8.3 Employee views

- Prioritize today’s attendance state, recent records, correction status, and DTR access.
- Avoid duplicating the same attendance values in cards and tables.
- Use the canonical daily attendance display path for all fallback rendering.

### 8.4 Admin and Office HR

- Employees: consolidated filters, visible lifecycle state, pending review first when selected, compact row actions, responsive record list on narrow screens.
- Attendance: date and organization filters first, exceptions visible, corrections reachable without leaving context.
- Corrections: clear original versus proposed values, reason, actor, and approval state.
- DTR/reports: employee, period, organization scope, generation state, and download action; no decorative chart unless it answers an operational question.
- Settings: group by business ownership. Office HR work-policy controls are separated from Regional Admin location/security controls.

## 9. Responsive Behavior

Required verification widths: 320, 375, 768, 1024, and 1440 pixels.

- No page-level horizontal overflow.
- Content stacks before text or controls become compressed.
- Touch targets are at least 44x44px.
- Forms use one column on narrow screens and two columns only when labels and values remain readable.
- Filter bars collapse into two-column then one-column layouts; advanced filters use a drawer or disclosed region.
- Tables use column priority. If essential information still cannot fit, use a record-list presentation rather than shrinking text.
- Dialogs become bottom sheets or full-width inset panels on narrow screens when appropriate.
- Kiosk controls remain usable in portrait and landscape orientations.

## 10. Motion and Interaction

- Motion supports continuity and state change; it is not decoration.
- Standard duration: 150–220ms for controls, 220–320ms for drawers/dialogs/page sections.
- Animate only transform and opacity where possible.
- Scrolling may be smooth only for explicit in-page navigation. Normal user scrolling stays native and fluid.
- `prefers-reduced-motion: reduce` disables nonessential transitions, smooth scrolling, scanner animation, and celebratory effects.
- Loading indicators never block unrelated controls and never loop excessively when a skeleton or progress message is clearer.
- Focus is moved deliberately after dialog open/close, validation failure, and significant route/state transitions.

## 11. Accessibility

- WCAG AA contrast: at least 4.5:1 for normal text and 3:1 for large text and UI boundaries.
- Every interactive element is keyboard reachable and has a visible focus indicator.
- Icon-only buttons have accessible names; decorative icons are hidden from assistive technology.
- Forms associate labels, hints, requirements, and errors programmatically.
- Dynamic results use restrained live regions; blocking errors use alerts.
- Dialogs trap focus and restore it to the trigger.
- Tables preserve semantic headers; mobile record-list alternatives preserve equivalent labels.
- Status is never communicated by color alone.

## 12. Clutter-removal Rules

Remove or consolidate an element when any of these are true:

1. It repeats information already visible in the same viewport.
2. It does not support a user decision or action.
3. It exists only to fill space or make a dashboard look populated.
4. Its information can be expressed more clearly as a table column, status line, or concise message.
5. It creates a nested card without defining a separate interactive or semantic boundary.
6. It uses an animation, gradient, glow, badge, or large icon without conveying state.

Keep an element when it is required for compliance, privacy, safety, biometric capture, error recovery, or operational decision-making.

## 13. Implementation Strategy

The redesign is incremental and behavior-preserving:

1. Add semantic tokens, typography, icon adapter, and shared primitives.
2. Rebuild shared public and Admin shells while retaining route contracts.
3. Convert public home, login, registration, summary, and error states.
4. Convert Admin and HR navigation, headers, filters, tables, dialogs, and page families.
5. Simplify kiosk and face-capture presentation without touching capture or recognition logic.
6. Remove superseded CSS and duplicated page-local patterns only after their consumers are migrated.

Every phase must remain buildable. Compatibility classes may exist briefly but receive a deletion owner and phase.

## 14. Verification and Acceptance Criteria

The redesign is accepted only when all applicable conditions pass:

- Existing application tests remain green.
- Focused component or route tests cover shared shell/navigation behavior and critical form/state rendering.
- Registration details, capture, submission, success, and validation states still function.
- Employee approval/status changes, Office HR scope, attendance correction, DTR output, and kiosk accept/reject flows remain unchanged.
- Visual checks pass at 320, 375, 768, 1024, and 1440 pixels with no page-level horizontal overflow.
- Keyboard-only navigation can reach and operate all primary workflows.
- Reduced-motion mode removes nonessential movement.
- Automated accessibility checks find no critical violations on representative public, kiosk, Admin, and HR routes.
- No raw database or internal error is exposed in user-facing feedback.
- No emoji remains as a functional icon.
- No obsolete global styling rule remains after all consumers migrate.
- `npm test`, the hosting build, and `git diff --check` pass after the final phase.

## 15. Risks and Controls

| Risk | Control |
|---|---|
| Shared CSS change causes broad regressions | Introduce tokens and primitives first; migrate one page family at a time; remove legacy rules last |
| Mobile redesign hides necessary actions | Define action priority per page and verify real workflows at required widths |
| Icon dependency increases bundle or inconsistency | Use one tree-shakeable library behind one adapter; prohibit direct arbitrary icon imports outside the adapter policy |
| Table conversion loses information | Define essential, secondary, and expandable fields before creating mobile record lists |
| Motion interferes with kiosk or accessibility | Keep kiosk motion nonblocking and implement reduced-motion globally |
| Organization hierarchy is incomplete | Render only authoritative levels and preserve parent-child clearing rules |
| Visual refactor changes business behavior | Keep data hooks and route contracts outside presentation changes; run focused workflow regression tests after each phase |

## 16. Final Design Principle

VeriFace should look like an official operational service, not a generic SaaS template. Every visible element must help a DILG employee register, record attendance, review personnel, correct a record, produce a DTR, or understand system state. If an element does none of those things, it should be removed.

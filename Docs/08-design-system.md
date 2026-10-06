# 08 · Design System (Cloudscape)

Vidyawan's UI is built entirely from the **AWS Cloudscape Design System** (`@cloudscape-design/components`, `@cloudscape-design/global-styles`, `@cloudscape-design/design-tokens`). This document says which Cloudscape component or pattern to use for each Vidyawan use case, how theming, dark mode and density work, and what not to do. Icons are covered in [09-iconography.md](09-iconography.md), UX rules in [06-ux-principles.md](06-ux-principles.md) and screens in [10-screen-specs.md](10-screen-specs.md).

## 1. Foundations

| Topic | Decision |
|---|---|
| Packages | `@cloudscape-design/components`, `@cloudscape-design/global-styles`, `@cloudscape-design/design-tokens`, `@cloudscape-design/collection-hooks`, `@cloudscape-design/board-components` (dashboards) and `@cloudscape-design/chart-components` (charts). No other UI library ([ADR-003](23-decision-log.md#adr-003-cloudscape-as-the-only-ui-library)). |
| Global styles | `import '@cloudscape-design/global-styles/index.css'` once, in `src/app/layout.tsx`. |
| Visual mode | `applyMode(Mode.Light \| Mode.Dark)` from `@cloudscape-design/global-styles`. The default follows `prefers-color-scheme`, and the user override is saved in `User.visualMode`. |
| Density | `applyDensity(Density.Comfortable \| Density.Compact)`. The default is Comfortable. Compact suits desktop staff roles that work in dense tables (accountant, school_admin, librarian). The choice is saved in `User.density`. |
| Motion | Cloudscape motion follows `prefers-reduced-motion` automatically. Never add custom animation. |
| Custom CSS | Allowed only for layout glue that no Cloudscape component covers (`.vw-icon`, `.vw-top-nav` which keeps the top navigation fixed while the page scrolls, print stylesheets). A few rules hide Cloudscape's duplicate navigation toggle and make the breadcrumb row compact ([ADR-020](23-decision-log.md#adr-020-hide-the-duplicate-navigation-toggle-inside-the-side-panel)), the only overrides of Cloudscape classes. Every value comes from `@cloudscape-design/design-tokens`. Never override Cloudscape class names. |
| Typography | Cloudscape defaults (Open Sans in the visual refresh). Devanagari falls back to `Noto Sans Devanagari`, loaded through `next/font` and added to the font stack only for `hi`. |

## 2. Page layouts

| Page type | Cloudscape layout | Used for |
|---|---|---|
| App shell | `AppLayoutToolbar` (`navigation`, `breadcrumbs`, `notifications`, `drawers`, `content`) plus `TopNavigation` above it. The toolbar variant gives a fixed breadcrumb row across the content area with the navigation toggle in it, and `navigationCloseBehavior="collapse"` with `SideNavigation collapsed` turns the closed navigation into an icon-only rail | Every authenticated page |
| Dashboard | `ContentLayout` + `Header` + `Board` (from board-components) with `BoardItem`s. Staff can rearrange; students and parents get a fixed `Grid` | Role dashboards |
| Collection | `ContentLayout` → `Table` (or `Cards` on mobile) with `Header` (counter + actions), `PropertyFilter`, `Pagination` and `CollectionPreferences` | Students, invoices, staff, books, homework |
| Detail | `ContentLayout` → `Header` (actions) → `Container` with `KeyValuePairs` for the summary → `Tabs` for sub-areas | Student profile, invoice, staff profile |
| Create/edit (short) | `Form` + `Container` + `FormField`s, with a single column on mobile | Announcement, homework, event |
| Create (multi-step) | `Wizard` | Admission application, promotion, fee structure, import, report card generation, payroll run |
| Data entry grid | `Table` with inline editing (`columnDefinitions[].editConfig`) | Marks entry, attendance (desktop) |
| Split view | `AppLayout` `splitPanel` | Selecting an invoice or loan in a table shows its details without leaving the list |
| Settings | `AppLayout` with a settings `SideNavigation` + `Form` sections | `/settings/*` |
| Public | `ContentLayout` (no nav), centred `Container`, max width 640 | Sign in, online admission form, receipt verification |

## 3. Components per use case

| Use case | Component | Rules |
|---|---|---|
| Page title and actions | `Header` (`variant="h1"`, `actions` = `SpaceBetween` of `Button`s) | One primary button per page, at the far right |
| Section in a page | `Container` with `Header variant="h2"` | No nested containers more than two levels deep |
| Read-only facts | `KeyValuePairs` | Use it for student summaries, invoice headers and receipt details, never a hand-made table |
| List of records | `Table` + `useCollection` (collection-hooks) | Sticky header; `resizableColumns`; `stripedRows` off; `trackBy="_id"`; `selectionType` only when bulk actions exist |
| Filtering | `PropertyFilter` (structured) or `TextFilter` (under 50 rows) | Filters sync to the URL (`filter=`). Filtering runs on the server for anything paginated. |
| Pagination | `Pagination` with `openEnd` (cursor-based) | See [19-performance-and-scalability.md](19-performance-and-scalability.md#pagination) |
| Table preferences | `CollectionPreferences` | Page size, visible columns, wrap lines and density. Saved per user per table. |
| Status | `StatusIndicator` | The mapping is in the status map below. Always with text. |
| Counts and tags | `Badge` | Counts ("3 new") and short categories. Never a status. |
| Filters shown as chips | `TokenGroup` | Selected students in bulk actions, recipients in announcements |
| Single choice | `RadioGroup` (≤ 5 options), `Select` (> 5), `Autosuggest` (searchable, remote) | Student pickers are `Autosuggest` with the photo, admission number and class |
| Multi choice | `Multiselect` (≤ 50), `Checkbox` group (≤ 5) | Announcement audience is a `Multiselect` of sections plus role `Checkbox`es |
| Two or three views | `SegmentedControl` | Attendance "Grid / List", calendar "Month / Week / Agenda" |
| Toggle a setting | `Toggle` | Immediate effect only. Otherwise use a `Checkbox` inside a `Form`. |
| Dates | `DatePicker`, `DateRangePicker`, `Calendar` | The locale follows the user; the week start follows `School.settings.weekStart` |
| Time | `TimeInput` | Period definitions, PTM slots |
| Files | `FileUpload` + `FileDropzone` + `FileTokenGroup` | Show the accepted types and max size in `constraintText` |
| Long text | `Textarea` | Show a character count in `constraintText` near the limit |
| Rich text | `Textarea` with Markdown + a preview `Tabs` | Announcements. No WYSIWYG library. |
| Confirmation | `Modal` | Destructive or irreversible actions only (void invoice, delete, lock marks, publish results). The primary button repeats the verb ("Lock marks"). |
| Delete with consequence | `Modal` + typed confirmation (`Input` matching the name) | Deleting a class, section, fee structure or branch |
| Global feedback | `Flashbar` (in `AppLayout.notifications`) | Success after save, with an undo where possible. Errors that aren't tied to a field. `stackItems` when there are more than 2. |
| Inline feedback | `Alert` | Page-level warnings ("Attendance for 7-B is not taken yet") |
| Field errors | `FormField errorText` | See [12-content-and-microcopy.md](12-content-and-microcopy.md#error-messages) |
| Contextual help | `Popover`, `HelpPanel` in the Help drawer, `FormField info` link | Every non-obvious field has an info link |
| Progress | `ProgressBar` (known progress), `Spinner` (short unknown), `StatusIndicator type="loading"` | Imports and report card generation use a `ProgressBar` with a per-row count |
| Loading a region | `Table loading` / `Cards loading` + `loadingText`; `Container` with `Box` + `Spinner` | Never a blank area |
| Empty collection | `Table empty` slot → `Box` with a 48px icon, a heading, one sentence and a primary action | See [10-screen-specs.md](10-screen-specs.md#state-patterns) |
| Charts | The charts in `@cloudscape-design/components`: `LineChart`, `BarChart`, `PieChart` (donut, ≤ 5 slices). `chart-components` is not installed: it needs Highcharts, a separately licensed dependency | Always a data table alternative ("View as table") and an `ariaLabel` |
| KPI tiles | `Container` + `Box variant="awsui-value-large"` + a trend `Icon` + text | Each drills down to a filtered table |
| Steps within a record | `Steps` | The admission status timeline, refund status |
| Expandable detail | `ExpandableSection` | Advanced settings, the audit diff |
| Tabs in a record | `Tabs` | ≤ 7 tabs, synced to `?tab=` |
| Navigation within a page | `AnchorNavigation` | Long settings pages, the PRD-style help |
| Copy a value | `CopyToClipboard` | Admission number, invite links, receipt number |
| Mobile collections | `Cards` | Collections switch from `Table` to `Cards` below 688px (Cloudscape's `xs` breakpoint) |
| Onboarding | `TutorialPanel` in a drawer | First-run for School Admin: create an academic year → classes → import students → fee structure |

### Status map (StatusIndicator types)

| Domain status | `type` | Label |
|---|---|---|
| Attendance present, invoice paid, payment captured, report card published | `success` | "Present", "Paid", "Captured", "Published" |
| Absent, payment failed, invoice overdue, import failed | `error` | "Absent", "Failed", "Overdue", "Failed" |
| Late, partially paid, documents pending, leave pending | `warning` | "Late", "Partly paid", "Documents pending", "Pending approval" |
| Leave (approved), holiday, draft | `info` / `stopped` | "On leave", "Holiday", "Draft" |
| Processing, importing, generating | `in-progress` / `loading` | "Importing 312 of 1,200" |
| Scheduled, not started | `pending` | "Scheduled" |
| Void, withdrawn, archived | `stopped` | "Void", "Withdrawn", "Archived" |

## 4. Design tokens

- Use tokens from `@cloudscape-design/design-tokens` (JS or SCSS) for any custom value: `spaceScaledM`, `colorTextStatusError`, `borderRadiusContainer`, `fontSizeBodyM`.
- Spacing between components: `SpaceBetween` (`size="l"` between containers, `"m"` inside forms, `"xs"` between buttons). Don't use margins.
- Layout grids: `ColumnLayout` (equal columns, with `variant="text-grid"` for key/value) or `Grid` (custom spans). Don't use CSS grid.
- Text styling: `Box` (`variant`, `color`, `fontSize`, `fontWeight`). Don't use raw `<p style>`.

## 5. Theming (school branding)

**Default accent: orange** ([ADR-021](23-decision-log.md#adr-021-orange-as-the-default-accent-colour)). `src/app/providers.tsx` replaces Cloudscape's blue `primary` reference palette with an orange one through `generateThemeStylesheet` and renders it as a `<style>` on the server, so there is no blue flash. Every accent follows from that palette: primary and normal buttons, links, focus rings, selected rows, tabs, the active navigation link, checkboxes, toggles and progress bars. The `info` palette is untouched, so info status, info alerts and info flashes stay blue.

| Step | Value | Carries |
|---|---|---|
| 600 | `#c2410c` | Light mode: primary button fill under white text (5.18:1) and link text on white (5.18:1) |
| 400 | `#fb923c` | Dark mode: primary button fill under dark text and link text on the dark background (8.17:1) |
| 900 | `#6a2408` | Light mode hover and pressed |
| 300 | `#fdba74` | Dark mode hover and pressed |
| 50 / 1000 | `#fff7ed` / `#2a0c03` | Selected-row background in light / dark |

Schools may set a **primary brand colour** and a **logo**. Vidyawan applies the colour with Cloudscape `applyTheme` (`@cloudscape-design/components/theming`) to a restricted set of tokens only:

```ts
applyTheme({
  theme: {
    tokens: {
      colorBackgroundButtonPrimaryDefault: { light: brand.light, dark: brand.dark },
      colorBorderButtonPrimaryDefault: { light: brand.light, dark: brand.dark },
      colorTextLinkDefault: { light: brand.linkLight, dark: brand.linkDark },
      colorBorderItemFocused: { light: brand.light, dark: brand.dark },
    },
  },
});
```

- Settings → Branding runs a contrast check against `colorTextButtonPrimaryDefault` and the backgrounds, and **rejects** colours below 4.5:1 with a suggested accessible shade. Branding never breaks WCAG ([11-accessibility.md](11-accessibility.md#contrast)).
- Status colours, typography, spacing and radius are never themed. Red must always mean error in every school.
- The logo appears in `TopNavigation.identity`, and on PDFs (receipts, report cards, TCs).

## 6. Visual modes (dark mode)

- Three options in Profile → Appearance: System (default), Light, Dark (a `SegmentedControl` with `lightMode` / `darkMode` icons).
- The top navigation also has a one-click toggle: an icon-only utility showing `themeToggle` in both modes, labelled "Switch to dark mode" in light mode and "Switch to light mode" in dark mode. It applies the mode at once and saves it with `setVisualMode`.
- The choice is mirrored in the `vw.mode` cookie (set on sign-in and on every change) so the server renders `awsui-dark-mode` on `<body>` and there is no flash. With System, the mode is applied after hydration from `prefers-color-scheme`.
- Everything uses tokens and `currentColor`, so dark mode needs no per-screen work. PDFs and printed pages are always light.
- Charts use the Cloudscape chart palette, which adapts automatically. Never hard-code series colours.
- Student photos and school logos get a `colorBorderDividerDefault` border in dark mode so they don't float.

## 7. Density

| Density | Default for | Why |
|---|---|---|
| Comfortable | teacher, student, parent, principal, transport_manager | Touch-friendly; these roles often use phones and tablets |
| Compact | Offered to accountant, school_admin and librarian on first login | They scan long tables all day, and compact shows 40% more rows |

Density is a per-user preference (Profile → Density). Marks entry and attendance grids never force compact: 24×24 CSS px is the minimum touch target (WCAG 2.5.8).

## 8. Responsive and PWA

- Cloudscape breakpoints: `xxs` 465, `xs` 688, `s` 912, `m` 1120, `l` 1280, `xl` 1840.
- Below `xs`: `AppLayout` navigation becomes an overlay; `Table` becomes `Cards`; `Wizard` shows one field group per screen; header actions collapse into a `ButtonDropdown` ("Actions").
- **Student and parent PWA**: a bottom tab bar (4 tabs + More) built from Cloudscape `Box` + `Link` with `Icon svg` inside a fixed footer. This is the one approved custom layout component (`src/components/MobileTabBar.tsx`), because Cloudscape has no bottom navigation. It uses tokens only, 48px targets and `aria-current="page"`, and the active tab's icon is Filled.
- Offline (PWA): an `Alert type="warning"` banner with the `offline` icon, "You're offline. Attendance you take is saved on this device and syncs when you're back online."
- The install prompt is a dismissible `Alert` on the parent home after the second visit. It is shown once.

## 9. Do's and don'ts

| Do | Don't |
|---|---|
| Use `Table` + `PropertyFilter` + `Pagination` + `CollectionPreferences` for every collection | Build a custom data grid, or use a third-party table |
| Use `Header` actions with exactly one `variant="primary"` button | Put two primary buttons on one screen |
| Use `KeyValuePairs` for read-only details | Build detail views out of disabled inputs |
| Use `StatusIndicator` for state | Show state with a coloured `Badge` or coloured text |
| Use `Modal` only for irreversible or destructive actions | Confirm routine saves with a modal |
| Use `Flashbar` success messages with the object name ("Receipt RCPT/2026-27/000871 created") | Say "Success!" |
| Use `Wizard` for flows over 8 fields with natural steps | Put a 40-field single form on one page |
| Pass icons via `iconSvg` or `svg` from `@/components/icons` | Use `iconName`, other icon libraries or inline SVGs |
| Use `SpaceBetween`, `ColumnLayout` and `Grid` for layout | Use custom margins, flexbox CSS or Tailwind |
| Use design tokens for any custom style | Hard-code hex colours, px font sizes or shadows |
| Keep `disabled` buttons explained with `disabledReason` | Disable a button without saying why |
| Use `FormField` `description`, `constraintText` and `info` for guidance | Use placeholder text as the label or the instructions |
| Show `loading` states in-place with `loadingText` | Show full-page spinners after the first paint |
| Use `Cards` for collections on mobile | Make users scroll a table horizontally on a phone |
| Use `ButtonDropdown` for more than 3 secondary actions | Show 6 buttons in a row |

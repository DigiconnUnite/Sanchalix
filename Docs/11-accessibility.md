# 11 · Accessibility

Vidyawan meets **WCAG 2.2 Level AA** on every screen, in both languages and both visual modes. Accessibility is a release blocker, not a backlog item. Cloudscape components are built to be accessible. Most failures come from how we use them, so this document focuses on our responsibilities. Related: [06-ux-principles.md](06-ux-principles.md) (P9), [08-design-system.md](08-design-system.md), [09-iconography.md](09-iconography.md#1-rules), [18-testing-strategy.md](18-testing-strategy.md#accessibility-tests).

## Who we are designing for

- Teachers and parents of all ages, including older grandparents who pick up the children, with low vision or tremor.
- Students with dyslexia, ADHD and visual impairments (inclusive schools).
- Staff who work keyboard-only all day (accountants, office staff).
- Users with screen readers: NVDA and JAWS (Windows), TalkBack (Android), VoiceOver (iOS/macOS).
- Users on small screens at high zoom, and on low-contrast, glare-prone phone screens outdoors.

## WCAG 2.2 AA: how Vidyawan meets it

| Criterion | What we do |
|---|---|
| 1.1.1 Non-text content | Reicon glyphs are `aria-hidden`. Icon-only buttons have an `ariaLabel`. Student photos have `alt="{name}"` in pickers, and `alt=""` where the name is adjacent. Charts have `ariaLabel` + `ariaDescription` + a "View as table" alternative. |
| 1.3.1 Info and relationships | Cloudscape `FormField` associates labels, descriptions and errors. Tables use `Table` (real table semantics) with a `header` and `ariaLabels`. Headings follow order (h1 page → h2 container → h3 section). |
| 1.3.5 Identify input purpose | `autocomplete` on name, email, tel, one-time-code, street-address and postal-code fields. |
| 1.4.1 Use of colour | Status is always `StatusIndicator` (icon + text). The attendance register shows P/A/L letters, not just colour. Charts use patterns or labels alongside colour. |
| 1.4.3 / 1.4.11 Contrast | Cloudscape tokens meet 4.5:1 for text and 3:1 for UI components in light and dark. School branding is validated (below). |
| 1.4.4 / 1.4.10 Resize and reflow | Every screen works at 320 CSS px wide / 400% zoom without horizontal scroll, except data tables, where Cloudscape's table scroll is allowed (the criterion's exception for 2D data), and tables become `Cards` below 688px. |
| 1.4.12 Text spacing | No fixed-height text containers. We test with the text-spacing bookmarklet. |
| 1.4.13 Content on hover/focus | Only Cloudscape `Popover` (dismissible, hoverable, persistent). |
| 2.1.1 Keyboard | Every action is keyboard reachable. Custom interactions (marks grid, attendance grid) are specified with keyboard maps ([10-screen-specs.md](10-screen-specs.md#s18--marks-entry-grid)). |
| 2.1.4 Character key shortcuts | Single-key shortcuts (`/`, `?`, P/A/L in attendance) are active only when focus is in the relevant region, and can be turned off in Profile → Keyboard shortcuts. |
| 2.2.1 Timing adjustable | Session timeout warns 2 minutes ahead with "Stay signed in". OTP expiry is shown with a resend option. |
| 2.3.3 Animation | We use no custom animation. Cloudscape honours `prefers-reduced-motion`. |
| 2.4.1 Bypass blocks | Cloudscape `AppLayout` provides skip links to the main content and navigation. |
| 2.4.2 Page titled | `<title>` = "{Page} · {Context} · {School} · Vidyawan", e.g. "Take attendance · 7-B · Green Valley School · Vidyawan". |
| 2.4.3 Focus order | DOM order = visual order. After an action, focus moves predictably (below). |
| 2.4.6 Headings and labels | Descriptive headings. Buttons are verb + noun ("Collect payment", not "Submit"). |
| 2.4.7 / 2.4.11 Focus visible, not obscured | Cloudscape focus rings. Sticky headers and footers (the attendance summary, marks totals) must not cover the focused element, so we use `scroll-padding` equal to the sticky height. |
| 2.5.3 Label in name | The visible label text is contained in the accessible name ("Print receipt RCPT/…" contains "Print"). |
| 2.5.7 Dragging movements | Board rearranging has keyboard and button alternatives (Cloudscape board-components). No drag-only interaction exists anywhere. |
| 2.5.8 Target size (minimum) | ≥ 24×24 CSS px everywhere; 44×44 for primary actions and attendance status toggles on mobile. Compact density never goes below 24. |
| 3.1.1 / 3.1.2 Language | `<html lang="en">` or `lang="hi"`. Mixed-language content (e.g. an English name in Hindi UI) needs no marking. A Hindi announcement body in the English UI is wrapped with `lang="hi"` when the author selects the language. |
| 3.2.2 On input | No context change on select. Filters apply on selection within the current page only. |
| 3.3.1 / 3.3.3 Error identification and suggestion | `FormField errorText` with specific fix text ([12-content-and-microcopy.md](12-content-and-microcopy.md#error-messages)). |
| 3.3.4 Error prevention (legal, financial) | Payments show a review step before submission. Refunds, voids and publishing results require confirmation. Receipts are reversible only through a refund. |
| 3.3.7 Redundant entry | Guardian details entered in an admission carry over into the student record. Counter "recent students" avoid re-searching. |
| 3.3.8 Accessible authentication | OTP (paste allowed, `one-time-code` autocomplete), password managers supported, and Google sign-in. No cognitive tests or CAPTCHA puzzles (we use invisible rate limiting instead). |
| 4.1.2 Name, role, value | Cloudscape components expose these. Custom pieces (`MobileTabBar`) use native elements (`<nav>`, `<a aria-current="page">`). |
| 4.1.3 Status messages | `Flashbar` is announced (`ariaRole="status"`). Autosave status uses a polite `LiveRegion` from Cloudscape. Offline and sync changes are announced. |

## Keyboard navigation

### Global shortcuts
| Key | Action |
|---|---|
| `/` | Focus global search |
| `?` | Open keyboard shortcuts help |
| `g` then `d` | Go to dashboard |
| `g` then `n` | Open the notifications drawer |
| `Esc` | Close the drawer, modal or popover (Cloudscape default) |

### Focus management rules
1. **After page navigation:** focus goes to the `h1` (via Next.js route change handling), and the page title is announced.
2. **After a successful create:** navigate to the new record, with focus on the `h1` and the Flashbar announced.
3. **After a successful inline save:** focus stays where it was.
4. **After a validation failure:** focus goes to the first invalid field, and the `Form errorText` summary is announced.
5. **After closing a modal:** focus returns to the element that opened it (Cloudscape default; don't break it by unmounting the trigger).
6. **After deleting a row:** focus moves to the next row, or to the table header if none are left.
7. **Wizard steps:** focus moves to the step heading.

## Screen readers

- **Tables:** `ariaLabels` for the selection checkbox ("Select Aarav Sharma"), `renderAriaLive` for "Showing 25 of 1,176 students", sorting announced by Cloudscape.
- **Live updates:** the attendance summary counter is a polite live region ("38 present, 2 absent"), announced after a 500 ms debounce, not on every tap.
- **Marks grid:** each cell's accessible name is "{Student}, {Component}, out of {max}". The saved state is announced politely only on failure (success is silent, so it isn't noisy).
- **Numbers and money:** render with `Intl.NumberFormat('en-IN' | 'hi-IN', { style: 'currency', currency: 'INR' })` so screen readers read "₹12,500" correctly. Don't abbreviate in accessible text: "₹18.4L" is visual, and its `aria-label` is "18 lakh 40 thousand rupees".
- **Dates:** visible "30 Sep"; accessible name "30 September 2026".
- **Status letters in the register:** each cell has a label ("Present", not "P").

## Contrast

- Cloudscape tokens meet AA in light and dark modes. Never override the text or background tokens.
- **School branding** (see [08-design-system.md](08-design-system.md#5-theming-school-branding)): the brand colour must be ≥ 4.5:1 against white button text (light) and against the dark background for links. Otherwise the settings screen rejects it and suggests the nearest compliant shade. The check uses the WCAG relative luminance formula in `src/lib/contrast.ts`.
- Charts: series colours come from the Cloudscape chart palette. Adjacent series must be distinguishable without colour (labels, legend order, hover values).
- Disabled controls are exempt from contrast rules, but the `disabledReason` is always readable.

## Cognitive accessibility

- Plain language at about a Grade 6–8 reading level ([12-content-and-microcopy.md](12-content-and-microcopy.md)).
- One primary action per screen. Wizards for long tasks, with progress shown.
- Consistent placement: the primary action is at the top right on desktop and the bottom (sticky) on mobile.
- No time pressure except OTP and sessions, and both warn in advance.
- Undo instead of confirmations for reversible actions.

## Testing

| Layer | Tool | Gate |
|---|---|---|
| Component and page | `@axe-core/playwright` on every E2E page visit, in light and dark, desktop and mobile | 0 critical/serious violations blocks the merge |
| Lint | `eslint-plugin-jsx-a11y` (only relevant for custom elements) + a custom rule: `Button variant="icon"` requires `ariaLabel` | Error |
| Manual, per release | Keyboard-only pass of the top 10 flows; NVDA + Chrome, TalkBack + Chrome Android, VoiceOver + Safari iOS | Checklist signed in the release PR |
| Zoom and reflow | 200% and 400% zoom, 320px width | Release checklist |
| Users | Quarterly session with ≥ 2 screen-reader users and ≥ 2 low-vision users (via a disability partner NGO) | Findings triaged within 1 sprint |

Accessibility defects are severity-ranked like security bugs: a blocker (a task can't be completed) is fixed before release, and serious ones within one sprint.

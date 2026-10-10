# 06 · UX Principles

UX is Sanchalix's top priority. This document sets the principles, the heuristics every screen is reviewed against, and the rules for how UX decisions get made. It applies to every screen in [10-screen-specs.md](10-screen-specs.md), using the components in [08-design-system.md](08-design-system.md), the icons in [09-iconography.md](09-iconography.md) and the words in [12-content-and-microcopy.md](12-content-and-microcopy.md).

## Principles

### P1. Design for the busiest moment
Design every screen for its user at their worst moment: the teacher with 3 minutes between periods, the accountant with a queue of 20 parents, the parent on a slow phone at the school gate.
- **Rule:** the primary daily task for each role is one click from the dashboard, and finishes within its time budget (the table below).
- **Example:** attendance defaults everyone to Present, so the teacher only taps the exceptions.

| Role | Task | Budget |
|---|---|---|
| teacher | Daily attendance, 40 students | ≤ 60 s |
| teacher | Enter marks for one section, one subject | ≤ 5 min (40 students) |
| accountant | Counter payment + receipt | ≤ 30 s |
| librarian | Issue a book | ≤ 10 s |
| parent | Pay all dues | ≤ 90 s including the gateway |
| parent | See whether my child is at school today | ≤ 2 taps after opening the app |
| principal | Approve a leave request | ≤ 3 clicks from the notification |

### P2. Defaults do the work
Pre-fill whatever the system can know: the current academic year, the teacher's current section and period, the class's fee structure, the next roll number, the oldest dues, today's date. The user's job is to correct, not to enter.

### P3. Four states, always
Every screen, and every region that loads data, designs all four states before it is built. Nothing ships with only the happy path.

| State | Rule | Cloudscape pattern |
|---|---|---|
| Loading | Show where content will appear. Never blank, never a full-page spinner after the first paint. Loading states over 10 s explain what's happening. | `Table loading` + `loadingText`, `Spinner` in the region, `StatusIndicator type="loading"`, `ProgressBar` for long jobs |
| Empty | Explain why it's empty and give the next action. Distinguish "nothing yet" from "no results for these filters". | The `Table empty` slot: 48px module icon + heading + one line + primary action. For no filter results: "No matches" + "Clear filters". |
| Error | Say what failed, why (if known), and what to do. Keep the user's input. Offer a retry. | `Alert type="error"` in the region, `FormField errorText`, `Flashbar` for action failures |
| Success | Confirm with the object's name and the next step. Offer undo where possible. | `Flashbar type="success"` with an action button ("View receipt", "Undo") |

Also designed where relevant: **partial** (some rows failed), **offline**, **permission denied** (a 403 with a way out), **read-only** (a closed academic year, locked marks) and **first-run** (a tutorial panel).

### P4. Never lose work
- Forms with more than 5 fields autosave drafts (to the server when online, to local storage when offline).
- Grids (marks, attendance) save per cell or row within 1 s, and show a per-row saved status.
- Leaving a page with unsaved changes asks "Leave without saving? Changes to this form will be lost."
- Destructive actions get a confirmation modal. Reversible ones get "Undo" in the flash instead of a modal.
- Financial records are immutable. They are corrected with a new record, never by editing.

### P5. Every number is a door
Every count, KPI or chart segment links to the filtered list behind it. A number you can't click is a dead end.

### P6. Show the right thing to the right role
The role decides the nav, the dashboard, the actions and the fields. Don't show disabled clutter for things a role can never do; hide them. Disable (with `disabledReason`) only for things the user *could* do once a condition is met.

### P7. One way to do one thing
The same task uses the same pattern everywhere: collections are `Table` + `PropertyFilter`, detail pages are `Header` + `KeyValuePairs` + `Tabs`, long creation flows are `Wizard`, and a concept always has the same icon and the same word ([22-glossary.md](22-glossary.md)).

### P8. Mobile-real, not mobile-shrunk
Parents and students use phones first. Collections become `Cards`, wizards show one group per screen, touch targets are ≥ 24×24 CSS px (44 px for primary actions on mobile), and the PWA works offline for its core tasks.

### P9. Inclusive by default
WCAG 2.2 AA is the floor, not a phase ([11-accessibility.md](11-accessibility.md)). Hindi is a first-class UI language, not an afterthought. Pages must be usable on a 360px screen at 200% zoom, over 3G.

### P10. Respect people's time and attention
- No notification without a clear action or information need. Parents never get more than 3 non-urgent notifications a day (grouped into a digest after that).
- Quiet hours for SMS and push.
- Teachers never have to share their phone number.

### P11. Trust through transparency
Show who changed what (history tabs), why a number is what it is (the "Why?" on risk scores, the fee breakdown on invoices), and what will happen before it happens ("This will notify 164 parents by SMS").

## Heuristics (review checklist)

Nielsen's 10 heuristics, applied to Sanchalix. Every screen spec and PR with UI is reviewed against this list.

| # | Heuristic | What it means in Sanchalix |
|---|---|---|
| H1 | Visibility of system status | Autosave status, sync status (offline), job progress (imports, report cards), notification delivery status |
| H2 | Match with the real world | School words: "Class 7-B", "Roll no.", "TC", "Fee counter", "Half-Yearly". Indian formats: ₹12,500, 30 Sep 2026, +91 98xxx xxxxx |
| H3 | User control and freedom | Undo for reversible actions, cancel on every wizard step, back-button safe (state in the URL) |
| H4 | Consistency and standards | Cloudscape patterns only, the one icon map, the glossary terms |
| H5 | Error prevention | Clash detection in the timetable, max marks limits, balance checks for leave, idempotent payments, confirmation for irreversible actions |
| H6 | Recognition over recall | Pickers show the photo + class + admission number, recent students on the counter, pre-filled context |
| H7 | Flexibility and efficiency | Keyboard shortcuts (`/` search, `g d` dashboard, `?` help), keyboard marks entry, bulk actions, saved filters |
| H8 | Aesthetic and minimalist design | One primary action per screen, progressive disclosure (`ExpandableSection` for advanced settings), no decorative charts |
| H9 | Help users recover from errors | Every error message names the problem and the fix ([12-content-and-microcopy.md](12-content-and-microcopy.md#error-messages)) |
| H10 | Help and documentation | Contextual Help drawer per page, `FormField info` links, a tutorial panel for first setup |

## How UX decisions get made

1. **Start from the persona and the task.** Every spec names the role, the task, the frequency and the time budget ([02-personas-and-roles.md](02-personas-and-roles.md)).
2. **Use the Cloudscape pattern first.** If a Cloudscape pattern fits, use it as intended. A custom component needs a decision record in [23-decision-log.md](23-decision-log.md) explaining which user need Cloudscape can't meet.
3. **When two options conflict, the tie-breakers apply in order:**
   1. Safety and privacy of children's data
   2. Accessibility
   3. Speed of the most frequent task for the most frequent role
   4. Consistency with existing Sanchalix patterns
   5. Visual preference (last, always)
4. **Test with real users before building anything major.** Wizards, grids and dashboards are prototyped and tested with ≥ 5 users of that role (a hallway test is fine for small changes).
5. **Measure after release.** Each major screen has one metric tied to its budget (P1) and is reviewed 30 days after release.
6. **Record it.** Decisions with trade-offs go in [23-decision-log.md](23-decision-log.md). Screen changes update [10-screen-specs.md](10-screen-specs.md) in the same PR.

## UX review checklist (per PR with UI)

- [ ] The persona, task and budget are stated in the PR.
- [ ] Loading, empty, error and success states are implemented, plus offline, read-only and 403 where relevant.
- [ ] One primary action. Destructive actions confirmed, reversible ones undoable.
- [ ] Autosave or unsaved-changes protection where input is over 5 fields.
- [ ] The URL reflects filters, tabs and selection.
- [ ] Works at 360px and 200% zoom. Tables become Cards on mobile.
- [ ] Keyboard only: every action is reachable, focus is visible, and focus moves sensibly after actions.
- [ ] Screen reader: labels, `ariaLabel` on icon-only buttons, live regions for async status.
- [ ] Icons come from `@/components/icons` via `iconSvg`/`svg`. No `iconName`.
- [ ] Strings are in the `en` catalogue (and `hi` once it returns, ADR-018), following the microcopy rules.
- [ ] Numbers link to their detail (P5).
- [ ] Dark mode checked.

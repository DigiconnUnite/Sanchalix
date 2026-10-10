# 23 · Decision Log (ADRs)

Architecture and design decisions for Sanchalix, in a lightweight ADR format. A decision is changed by adding a new ADR that supersedes the old one, never by editing history. Add an ADR for any choice with real trade-offs, including any custom component that Cloudscape doesn't cover ([06-ux-principles.md](06-ux-principles.md#how-ux-decisions-get-made)).

**Status values:** Proposed · Accepted · Superseded by ADR-xxx · Deprecated.

| ADR | Title | Status | Date |
|---|---|---|---|
| 001 | Next.js monolith plus a background worker | Accepted | 2026-09-30 |
| 002 | Shared-collection multi-tenancy by schoolId | Accepted | 2026-09-30 |
| 003 | Cloudscape as the only UI library | Accepted | 2026-09-30 |
| 004 | Reicon over Cloudscape built-in icons | Accepted | 2026-09-30 |
| 005 | Auth.js with database sessions and OTP | Accepted | 2026-09-30 |
| 006 | Razorpay as the primary payment gateway | Accepted | 2026-09-30 |
| 007 | BullMQ on Redis for background jobs | Accepted | 2026-09-30 |
| 008 | Rule-based explainable risk scoring first | Accepted | 2026-09-30 |
| 009 | Cursor pagination for collections | Accepted | 2026-09-30 |
| 010 | Server-first state without a client state library | Accepted | 2026-09-30 |
| 011 | Role-driven navigation with shared URLs | Accepted | 2026-09-30 |
| 012 | next-intl for localisation, English and Hindi at launch | Accepted | 2026-09-30 |
| 013 | Embedded attendance entries per section-day | Accepted | 2026-09-30 |
| 014 | A PWA instead of native mobile apps | Accepted | 2026-09-30 |
| 015 | Immutable receipts with gap-free numbering | Accepted | 2026-09-30 |
| 016 | All personal data hosted in India on AWS | Accepted | 2026-09-30 |
| 017 | Password sign-in writes sessions directly, without Auth.js | Proposed | 2026-10-03 |
| 018 | English only until the core modules are built | Accepted | 2026-10-03 |
| 019 | Two-step verification switched off during development | Accepted | 2026-10-03 |
| 020 | Shell overrides: hide the duplicate navigation toggle, compact breadcrumb row | Accepted | 2026-10-03 |

---

## ADR-001: Next.js monolith plus a background worker

**Context.** Sanchalix needs server-rendered pages, form mutations, webhooks, and long or retried work (notification fan-out to thousands, PDF batches, imports, the timetable solver, scheduled fee jobs). The team is small (4 engineers).

**Decision.** One Next.js App Router application serves the UI, Server Actions and Route Handlers. A separate Node **worker** process, built from the same repository and sharing `src/server/**`, consumes BullMQ queues. There are no other services.

**Consequences.**
- ✅ One codebase, one type system, one deploy pipeline; domain logic is reused by web and worker.
- ✅ Web requests stay fast. Anything slower than about 1 s or needing retries goes to the worker.
- ⚠️ Web and worker must be deployed compatibly (the same image, and job payloads versioned).
- ❌ Rejected: **microservices** (too much operational overhead for this team and scale); **serverless functions for jobs** (execution time limits for PDF batches and the solver, cold starts at the 08:00 peak); **a separate Express API** (duplicates Next.js route handling and loses Server Actions).

## ADR-002: Shared-collection multi-tenancy by schoolId

**Context.** There are up to 500 schools, most small (≤ 2,000 students), and a few large organizations. Onboarding must take under a day. Cross-tenant leakage is the worst possible failure.

**Decision.** A single MongoDB cluster with shared collections. Every tenant document carries `schoolId`; a Mongoose **tenant plugin** rejects any query without it; `schoolId` leads every index. Enterprise organizations can be moved to a dedicated cluster with the same code ([19-performance-and-scalability.md](19-performance-and-scalability.md#multi-tenancy-and-sharding)).

**Consequences.**
- ✅ Cheap to run, instant onboarding, simple migrations and reporting.
- ✅ A clear sharding key (`schoolId`) when needed.
- ⚠️ Isolation depends on code discipline, so it is enforced by the plugin, lint rules and generated tests ([18-testing-strategy.md](18-testing-strategy.md#what-must-be-tested-non-negotiable)).
- ❌ Rejected: **a database per school** (connection explosion, slow migrations across 500 DBs); **a cluster per school** (cost).

## ADR-003: Cloudscape as the only UI library

**Context.** Staff roles are data-heavy (tables, filters, forms, wizards). Accessibility is mandatory. The team has one designer.

**Decision.** Use AWS Cloudscape for every UI element, using its components, patterns, layouts and design tokens as intended. No other UI kit, CSS framework or headless library. A custom component requires an ADR. The one approved so far is `MobileTabBar`, because Cloudscape has no bottom navigation ([08-design-system.md](08-design-system.md#8-responsive-and-pwa)).

**Consequences.**
- ✅ Mature table, filter, form and wizard patterns fit school administration closely; accessibility is built in; dark mode and density come for free.
- ✅ One consistent look without a large design team.
- ⚠️ Cloudscape's look is "console-like". We soften it through content, spacing and school branding tokens, not overrides.
- ⚠️ The mobile consumer experience (parents) needs care: `Cards`, a single column, and the bottom tab bar.
- ❌ Rejected: **MUI/Chakra/shadcn** (more visual freedom, but we would own accessibility and data-grid patterns ourselves); **mixing libraries** (inconsistent UX and a double bundle).

## ADR-004: Reicon over Cloudscape built-in icons

**Context.** Cloudscape's built-in icon set (about 130 icons) is designed for cloud consoles. It has no icons for students, graduation, fees, buses, libraries, attendance, report cards, hostels or PTMs. A school product needs a broad, domain-specific, consistent icon vocabulary, and mixing icon sets would look inconsistent.

**Decision.** Use **Reicon** (`reicon-react`, 2,676 icons, Outline and Filled weights) as the only icon library.
- All icons are defined once in `src/components/icons.tsx` (concept → Reicon component) and passed to Cloudscape through its custom icon slots: `iconSvg` on `Button`, `ButtonDropdown` items, `TopNavigation` utilities, drawers and so on, and `svg` on `<Icon />` (including `SideNavigation` link `icon`s).
- The Reicon `<svg>` is wrapped in a `<span>` and sized to 100% of the slot. Cloudscape forces `stroke="currentColor"` onto a root `<svg>` in its slots, which would thicken Reicon's filled glyphs. The wrapper is Cloudscape's documented opt-out, and it lets the Cloudscape component own the size (16/20/32/48px).
- `IconProvider` remaps Cloudscape's *semantic* internal glyphs (search, notification, status icons and so on) to Reicon, so built-in components match. Component chrome (carets, angles, close ×, sort, drag and resize handles) stays on Cloudscape glyphs.
- `iconName`, other icon packages and inline hand-written SVGs are banned by lint.

**Consequences.**
- ✅ Every school concept has a fitting icon, and one icon means one concept across the app ([09-iconography.md](09-iconography.md#5-complete-icon-map)).
- ✅ Cloudscape spacing, alignment, colour variants, hover, disabled and focus states are preserved, because we use its slots rather than placing icons beside components.
- ✅ Outline/Filled gives a clear active-state signal in navigation.
- ✅ Direct imports keep the bundle small (only used glyphs ship).
- ⚠️ Reicon is a smaller community project than Cloudscape. Mitigations: the version is pinned, the icon map isolates usage in one file (a replacement library would mean changing one file), and a test verifies every mapped icon exists after upgrades.
- ⚠️ The chrome glyphs stay Cloudscape's, which is a tiny visual difference we accept because swapping them risks breaking component affordances.
- ❌ Rejected: **Cloudscape built-in icons only** (the domain concepts are missing); **Cloudscape + a second library for the gaps** (two visual styles); **custom SVGs** (design and maintenance cost, inconsistent quality).

## ADR-005: Auth.js with database sessions and OTP

**Context.** Parents need password-less sign-in (SMS OTP). Privileged roles need 2FA. Sessions must be revocable (a lost phone, staff exit).

**Decision.** Auth.js v5 with the credentials, Google and a custom OTP provider; **database sessions** in MongoDB; TOTP 2FA implemented in our session flow ([16-auth-and-security.md](16-auth-and-security.md#authentication)).

**Consequences.** ✅ Revocable sessions and an active sessions UI. ✅ No vendor lock-in or per-MAU cost for about 1M users. ⚠️ A DB read per request, mitigated by React `cache()` per request and indexed session tokens. ❌ Rejected: **JWT sessions** (can't revoke instantly); **Clerk/Auth0** (cost at parent scale, data residency concerns, and OTP/DLT integration with Indian SMS is awkward).

## ADR-006: Razorpay as the primary payment gateway

**Context.** Indian parents pay mostly by UPI. Schools need settlement into their own accounts and low MDR on UPI.

**Decision.** Razorpay (Checkout, Orders, webhooks, Route for split settlements) behind a `PaymentGateway` interface. Stripe is the second implementation for international schools (v2).

**Consequences.** ✅ UPI, cards, netbanking and wallets out of the box. ✅ Route supports platform-collected funds settled to schools. ⚠️ Per-school KYC takes time, so it starts at contract signature. ❌ Rejected: **PayU/Cashfree first** (comparable, but Razorpay has better docs and Route); **gateway-agnostic from day one with 3+ providers** (speculative).

## ADR-007: BullMQ on Redis for background jobs

**Context.** We need delayed jobs (absence alerts at 09:30), repeatable jobs (the daily fee jobs), retries with backoff, per-school concurrency limits, and progress reporting.

**Decision.** BullMQ on ElastiCache Redis, with deterministic job IDs for idempotency.

**Consequences.** ✅ Delays, repeats, retries, rate limits, groups and progress events are built in. ⚠️ Redis becomes critical for job delivery. Redis isn't backed up, so the reconcile jobs re-derive work from DB state after a loss. ❌ Rejected: **Agenda (Mongo-backed)** (weaker throughput and rate limiting); **SQS + Lambda** (a 15 min limit, and no delayed jobs beyond 15 min without extra machinery).

## ADR-008: Rule-based explainable risk scoring first

**Context.** Principals want early warning about struggling students. ML models on sparse per-school data would be opaque, hard to validate, and risky for children (labelling, bias).

**Decision.** v2 starts with a **transparent weighted rule model**: attendance (last 30 days vs. the school average), the marks trend across exams, homework completion and fee dues (as a possible family-stress signal, weighted low and switchable off per school). Every score shows its factors and data. Scores are visible only to staff, never to students or parents, and never drive automated actions. LLMs are used only to write narrative summaries from pseudonymised aggregates, opt-in per school.

**Consequences.** ✅ Explainable, auditable, easy to tune per school, and no training data needed. ✅ DPDP-aligned (no profiling shown to children, human in the loop). ⚠️ Less predictive than a trained model could be, which we accept. We'll revisit ML only after 2 years of labelled outcomes and an ethics review.

## ADR-009: Cursor pagination for collections

**Context.** Collections like attendance, notifications, audit logs and payments grow large, and data changes while users page through it.

**Decision.** Opaque cursors over `(sortField, _id)` with matching compound indexes. Cloudscape `Pagination` with `openEnd`. Offset pagination is not allowed on tenant collections.

**Consequences.** ✅ Constant-time pages and no skipped or duplicated rows under writes. ⚠️ No "jump to page 37". We use filters and search instead, which matches how users actually find records. Counts are capped at "10,000+".

## ADR-010: Server-first state without a client state library

**Context.** Most screens are read-mostly and permission-filtered. Global client state stores add complexity and stale-data bugs.

**Decision.** Server Components for data; the URL for view state; `useActionState` and `useOptimistic` for mutations; local state in interactive islands; IndexedDB only for the offline queue. No Redux, Zustand, React Query or SWR in MVP.

**Consequences.** ✅ Less code and one source of truth. ✅ Refresh, back button and sharing just work. ⚠️ Highly interactive screens (marks grid) manage their own local state carefully. ⚠️ Client polling for notifications uses SSE rather than a query cache. Revisit if more than 3 screens need client-side caching.

## ADR-011: Role-driven navigation with shared URLs

**Context.** Nine roles see very different things. Role-prefixed URLs (`/teacher/students/…`) would break sharing and multiply routes.

**Decision.** One URL per resource. The active role decides the navigation, dashboard, actions and visible fields. Access is checked by permission on every request ([07-information-architecture.md](07-information-architecture.md#principles)).

**Consequences.** ✅ Links in notifications and messages work for anyone allowed to see them. ✅ One route tree. ⚠️ Pages must adapt to role (they are tested per role in E2E). A link to a forbidden resource shows a helpful 403, not a broken page.

## ADR-012: next-intl for localisation, English and Hindi at launch

**Context.** Many parents prefer Hindi, and more Indian languages will follow. Cloudscape ships its own component strings.

**Decision.** `next-intl` with ICU messages, locale-prefixed routes (the default locale is unprefixed), and Cloudscape's `I18nProvider` with its message bundles. Hindi is translated by native speakers against the glossary.

**Finding at setup (2026-10-03).** Cloudscape 3.0.1391 ships message bundles for ar, de, en, en-GB, es, fr, id, it, ja, ko, pt-BR, th, tr, zh-CN and zh-TW, but **not Hindi**. The Hindi strings for Cloudscape components (pagination labels, table selection, dismiss buttons and so on) must be written in our own catalogue and passed to `I18nProvider`.

**Consequences.** ✅ Server-side translations (no client bundle bloat); plurals and formatting via ICU and `Intl`. ⚠️ Every PR must add `en` and `hi` keys, and a CI check fails on missing keys. SMS templates also need DLT registration per language.

## ADR-013: Embedded attendance entries per section-day

**Context.** Attendance is the highest-volume write (about 80M entries a year) and is always read by section and day or by student and month.

**Decision.** One `attendanceRecords` document per section, date (and period) with an embedded `entries[]` array, plus a nightly and on-correction `attendanceMonthly` rollup per student.

**Consequences.** ✅ One write per submission, one read per register day, and 40× fewer documents. ✅ Atomic whole-class submit. ⚠️ Student-centric history queries use a multikey index on `entries.studentId`, or the monthly rollup. ⚠️ The document size stays small (≤ 60 entries × about 100 bytes).

## ADR-014: A PWA instead of native mobile apps

**Context.** Parents and students are mostly on Android. We need install, push, camera and offline support. The team is small.

**Decision.** An installable PWA (Serwist service worker, web push, IndexedDB offline queue) for all roles. No native apps in v1 or v2.

**Consequences.** ✅ One codebase and instant updates, with no app store review. ⚠️ iOS push requires the app to be installed (iOS 16.4+), so we guide users in-app. We revisit if iOS push reach is < 60% ([05-roadmap.md](05-roadmap.md#explicitly-later-or-never)).

## ADR-015: Immutable receipts with gap-free numbering

**Context.** Receipts are legal and financial records. Auditors expect sequential numbering with no gaps. Parents need to trust that a receipt is genuine.

**Decision.** Receipt numbers come from a per-school per-year `counters` document incremented inside the payment transaction (so an aborted transaction doesn't consume a number). Captured payments are immutable, and corrections happen through refunds. Every receipt has a QR code linking to a public verification page that shows no student PII.

**Consequences.** ✅ Audit-friendly and tamper-evident. ⚠️ The counter document is a hot spot during the fee rush. It is per school, so the contention is local, and it's measured in load tests (50 concurrent collections, 0 duplicates or gaps).

## ADR-016: All personal data hosted in India on AWS

**Context.** Schools and parents expect children's data to stay in India. The DPDP Act allows the government to restrict transfers. Cloudscape and ECS fit AWS well.

**Decision.** All data stores and processing run in AWS ap-south-1 (Mumbai), with DR in ap-south-2 (Hyderabad). MongoDB Atlas runs on AWS in the same regions. External processors receive the minimum data needed (the SMS text, the email address, the payment amount). The LLM gets no PII.

**Consequences.** ✅ Clear residency story for schools. ⚠️ Global schools (v2) may need another region, which the per-organization cluster option in ADR-002 supports.

## ADR-017: Password sign-in writes sessions directly, without Auth.js

**Status.** Proposed. It narrows [ADR-005](#adr-005-authjs-with-database-sessions-and-otp) and needs the project owner's approval.

**Context.** ADR-005 chose Auth.js v5 with database sessions for every sign-in method. Two things came up when building password sign-in:
- Auth.js's credentials provider only issues JWT sessions. Database sessions with credentials need an undocumented workaround in its callbacks.
- The Auth.js adapter stores the raw session token and has no fields for `activeRole` or `activeSchoolId`. [14-data-model.md](14-data-model.md#sessions) requires a hashed token and both fields, and [16-auth-and-security.md](16-auth-and-security.md#sessions) requires role-based idle and absolute lifetimes.

**Decision.** Password sign-in is a Server Action (`signInWithPassword`) that verifies the argon2id hash and calls `createSession` in `src/server/auth/session.ts`, which writes the `sessions` document and sets the cookie. `getContext()` reads the same collection. OTP sign-in will use the same `createSession`. Auth.js is added only when Google OAuth is built, and its callback will hand over to `createSession` so there is still one session store.

**Consequences.**
- ✅ Sessions match the data model exactly: hashed token, active role and school, revocable, sliding idle expiry with an absolute limit.
- ✅ About 80 lines we fully control, and no dependency for the two most-used sign-in methods.
- ⚠️ We own the session code, so it carries the 95% coverage bar for `server/auth` and two reviews.
- ❌ Rejected: **Auth.js JWT sessions** (can't be revoked instantly, which ADR-005 already ruled out); **forcing database sessions through Auth.js credentials callbacks** (relies on behaviour Auth.js doesn't document or support).

## ADR-018: English only until the core modules are built

**Status.** Accepted by the project owner on 2026-10-03. It defers the Hindi half of [ADR-012](#adr-012-next-intl-for-localisation-english-and-hindi-at-launch); the choice of `next-intl` stands.

**Context.** ADR-012 put English and Hindi in every change from the first screen. In practice each screen needed a second set of strings written without a native-speaker review, Cloudscape ships no Hindi bundle for its own labels, and the language switcher added a full-page reload and its own test surface. The owner asked to keep the application simple and English-only while the core modules are built.

**Decision.** The app ships one locale, `en`. Strings still go in `src/i18n/messages/en.json` and are read through `next-intl`, and pages still live under `app/[locale]/`, so nothing is hard-coded and the structure does not change. The Hindi catalogue, the language switchers and the en/hi key-parity test are removed.

**Consequences.**
- ✅ One catalogue to write and review per change; no unreviewed Hindi in front of users.
- ✅ Adding Hindi later is additive: add `hi` to `src/i18n/routing.ts`, add `messages/hi.json` (translated by a native speaker against the glossary), restore the switcher and the key-parity test.
- ⚠️ Hindi-preferring parents, a primary persona, are not served until then. Hindi must be back before the pilot go-live (roadmap M4).
- ⚠️ Documents that describe the Hindi UI (the PRD's US-14.2, the microcopy Hindi notes, the SMS templates) describe the later state, not the current build.

## ADR-019: Two-step verification switched off during development

**Status.** Accepted by the project owner on 2026-10-03. Temporary.

**Context.** [16-auth-and-security.md](16-auth-and-security.md#authentication) makes TOTP mandatory for `super_admin`, `school_admin`, `principal` and `accountant`, and it is built (setup wizard, sign-in challenge, recovery codes). The owner asked to turn it off for now so that everyday development sign-ins are a password only.

**Decision.** An environment switch, `TWO_FACTOR_ENABLED` (default `false`), decides whether a sign-in asks for a code. The 2FA code, pages and tests stay in the repository. With the switch on, behaviour is exactly as specified.

**Consequences.**
- ✅ Faster sign-in while the modules are being built; nothing to rebuild later.
- ⚠️ With it off, the accounts that can see every child's record and all fee data are protected by a password alone. **`TWO_FACTOR_ENABLED=true` is required before any real school data is loaded**, and belongs on the pilot go-live checklist.
- ⚠️ The 2FA browser journeys are skipped unless the tests run with `TWO_FACTOR_ENABLED=true`, so they can go stale unnoticed. Run them with the switch on before turning it on in an environment.

## ADR-020: Hide the duplicate navigation toggle inside the side panel

**Status.** Accepted by the project owner on 2026-10-03. An exception to [ADR-003](#adr-003-cloudscape-as-the-only-ui-library)'s "never override Cloudscape classes".

**Context.** The shell uses `AppLayoutToolbar`, whose toolbar row has a navigation toggle. Cloudscape also renders a second toggle inside the navigation panel (the angle icon at its top), and offers no property to remove it. The owner wants one toggle, the one in the toolbar.

**Decision.** One rule in `src/styles/global.css` hides the in-panel toggle on viewports wider than 688px: `[class*='awsui_hide-navigation_'] { display: none; }`. It matches the class by its stable prefix, because Cloudscape appends a hash that changes between versions. Phones keep the button, because there it closes the navigation overlay.

**Consequences.**
- ✅ One toggle on desktop, in the toolbar, both for the open panel and the icon rail.
- The same exception covers a **compact breadcrumb row**, also requested by the owner: the toolbar row is 34px instead of Cloudscape's fixed 42px, with the breadcrumb's own vertical padding removed. Breadcrumb text is 12px (Cloudscape's `body-s` size and line height) instead of 14px, and the separator arrow between items is scaled from 16px to 12px to match. `AppLayoutToolbar` measures the row at runtime, so sticky table headers follow the new height.
- The same exception covers the **toolbar toggle's selected state**, also requested by the owner: the toggle keeps its resting colours while the navigation is open, instead of Cloudscape's blue fill. Hover and pressed feedback are unchanged. The open panel and `aria-expanded` still convey the state.
- The same exception covers **navigation icons in the collapsed rail**, also requested by the owner: they stay 20px, the same as in the open panel. Cloudscape's rail centres a 16px icon, so the link's inset is recalculated for 20px. The rail is also one evenly spaced column: Cloudscape's 24px gap above each group is removed, along with the hidden group title's empty box. Each group's list keeps its `aria-label`, so screen readers still hear the group name.
- The same exception covers **icon and label alignment in the navigation**: a 20px icon sits in a 24px box that Cloudscape top-aligns with the 20px text line, which leaves the icon 2px low. A negative block margin on the icon box puts it on the label's centre line.
- The same exception covers **navigation group titles**, also requested by the owner: People, Academics, Fees and Communication are 12px secondary labels instead of Cloudscape's 18px headings, so they don't outweigh the links under them. A 1px divider in Cloudscape's divider colour runs from each title to the panel's edge on the same line; it is decorative (a pseudo-element), and the collapsed rail, which hides the titles, has none.
- The same exception covers **scrollbars**, also requested by the owner: everything that scrolls (the page, the navigation panel, tables, dropdowns, modals, drawers) uses one thin scrollbar (`scrollbar-width: thin`) on a transparent track, instead of the operating system's wide default. The thumb is Cloudscape's secondary text colour at 20% opacity, so it stays faint beside the content in light and dark mode.
- The same exception covers the **header identity**, requested by the owner: the platform logo, a divider, then the school's logo as a 28px circle and the school name. Cloudscape's identity offers one logo and a title, so the divider and the school logo are drawn on the title element. When the school has no logo the `school` icon from the icon map is shown on a tinted disc instead.
- The same exception covers **card and table title rows**, requested by the owner: a 1px line in Cloudscape's divider colour separates the header of every `Container` and `Table` from its content. Cloudscape draws this border itself but fixes it at 0px and transparent, with no property or theme token to turn it on. The header's bottom padding is 12px (matching its top) and the content's top padding is 16px, so the title and the content don't touch the line. A header with no content under it gets no line. In a table whose header also holds a filter or pagination row, or a picker and alerts stacked under the title in a `SpaceBetween`, the line sits directly under the title, not under the whole header. This relies on the `Header` being the first item of that stack.
- The same exception covers **printing**: Cloudscape ships no print styles for its shell, so an `@media print` rule hides the header, the navigation and the breadcrumb row (and anything marked `vw-no-print`). The receipt page switches to light mode while the print dialog is open.
- ⚠️ This depends on a Cloudscape internal class name. After every Cloudscape upgrade, check that the in-panel toggle is still hidden and that the toolbar toggle still opens and collapses the navigation.
- ⚠️ Cloudscape moves keyboard focus to the in-panel button when the navigation opens; with it hidden, focus stays on the toolbar toggle. Keyboard users can still reach everything.

---

## ADR-021: Orange as the default accent colour

**Context.** Cloudscape's accent is blue. The owner wants Sanchalix to read as orange by default, before any school sets its own brand colour.

**Decision.** Replace Cloudscape's `primary` reference palette (steps 50 to 1000) with an orange scale, using `generateThemeStylesheet` from `@cloudscape-design/components/theming` in `src/app/providers.tsx`. The stylesheet is generated once and rendered as a `<style>` during server rendering. No Cloudscape class is restyled and nothing is added to `global.css`.

**Consequences.**
- ✅ One palette changes every accent at once (buttons, links, focus rings, selection, tabs, navigation, form controls), in light and dark mode, with no per-component overrides.
- ✅ No blue flash on load, because the stylesheet is in the server-rendered HTML.
- The fill is a burnt orange (`#c2410c`), not a bright one: a bright orange such as `#f97316` gives only 2.8:1 under white button text. Steps 600 and 400 must stay at or above 4.5:1 ([11-accessibility.md](11-accessibility.md#contrast)).
- Status colours are not themed. The `info` palette stays blue, so info never looks like warning.
- ⚠️ Orange sits between Cloudscape's warning amber and error red. Status is always shown with `StatusIndicator` (icon + text), so it never depends on hue alone.
- ⚠️ When the CSP in [16-auth-and-security.md](16-auth-and-security.md) gains a `style-src` directive, this inline `<style>` needs the request nonce.
- School branding ([08-design-system.md](08-design-system.md#5-theming-school-branding)) will later override this default per school.

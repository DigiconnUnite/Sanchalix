# CLAUDE.md: Sanchalix

Rules for every Claude session working on this repository. These rules override default behaviour. When a rule and a request conflict, say so before acting.

Sanchalix is a multi-school School Management System: Next.js (App Router, TypeScript) + MongoDB/Mongoose + AWS Cloudscape + Reicon icons. **UX is the top priority.** Every change must make a real user's task (school admin, principal, teacher, student, parent, accountant, librarian, transport manager) easier, faster or safer.

## Non-negotiable rules

### 1. No unnecessary code comments
- Don't write comments that restate what the code does, narrate changes ("changed X to Y", "fixed bug"), or leave TODO/FIXME noise.
- Don't leave commented-out code, file header banners or JSDoc on self-explanatory functions.
- A comment is allowed **only** when it explains a non-obvious *why*: a business rule, a legal or board requirement, a workaround or a constraint.
  - OK: `// CBSE counts half-day as 0.5 present for the 75% eligibility rule.`
  - Not OK: `// loop over students`, `// TODO: improve`, `// updated to use findOneAndUpdate`.

### 2. Cloudscape only
- Build UI from `@cloudscape-design/components` (plus `global-styles`, `design-tokens`, `collection-hooks`, `board-components`, `chart-components`) before considering anything custom. Use components, patterns, layouts and tokens as Cloudscape intends them.
- **Never** add or mix in another UI library, CSS framework or headless kit (no MUI, Chakra, shadcn, Tailwind, Bootstrap, styled-components).
- Don't restyle or override Cloudscape classes. Custom CSS is limited to `src/styles/global.css` and uses design tokens only.
- A genuinely missing pattern needs an ADR in `Docs/23-decision-log.md` before building it.
- Component choice per use case: `Docs/08-design-system.md`.

### 3. Icons: Reicon only, through the icon map
- The only icon library is `reicon-react`. The only file that imports it is `src/components/icons.tsx`, using direct imports (`import Home from 'reicon-react/icons/Home'`).
- Everywhere else, import `svg` / `IconKey` from `@/components/icons` and pass icons through Cloudscape slots: `iconSvg={svg('fees')}` on `Button`, `ButtonDropdown` items, `TopNavigation` utilities, drawers, `SegmentedControl`, `Select` options and `TokenGroup`; `<Icon svg={svg('students')} />` everywhere else (including `SideNavigation` link `icon`).
- **Never** use Cloudscape `iconName` or `iconUrl`, any other icon package, or hand-written inline `<svg>`.
- One icon per concept. A new concept means adding the key to `icons.tsx` **and** the map in `Docs/09-iconography.md` in the same change.
- Sizes come from the Cloudscape slot (16 default, 20 nav/headers, 32/48 empty states). No hex colours, because glyphs use `currentColor`. `Outline` by default; `Filled` only for active/selected state or status emphasis.
- Icon-only buttons must have a specific `ariaLabel`. Status is always shown with `StatusIndicator` (icon + text).
- Full guide: `Docs/09-iconography.md`.

### 4. UX first: every screen, every time
- Every screen and data region implements **loading, empty, error and success** states (and offline, read-only and 403 where relevant). See `Docs/06-ux-principles.md` and the patterns in `Docs/10-screen-specs.md`.
- Meet WCAG 2.2 AA: keyboard operable, visible focus, labelled controls, no colour-only meaning, 24px minimum targets. See `Docs/11-accessibility.md`.
- One primary action per view. Confirm only irreversible actions; offer undo for reversible ones.
- Put filters, sort, pagination and tabs in the URL. Fetch and paginate collections on the server with cursors.
- Use the words from `Docs/12-content-and-microcopy.md` and `Docs/22-glossary.md`. Every user-facing string goes in the `en` catalogue (`src/i18n/messages/en.json`), never hard-coded. The app is English-only for now; Hindi returns as a second catalogue ([ADR-018](Docs/23-decision-log.md#adr-018-english-only-until-the-core-modules-are-built)).

### 5. Follow the standards and the data model, and keep the docs true
- Follow `Docs/17-coding-standards.md` (TypeScript strict, naming, boundaries, `AppError`, logging).
- Schemas must match `Docs/14-data-model.md` exactly: every tenant document has `schoolId`, money is integer `*Minor`, calendar dates are `YYYY-MM-DD`, and indexes are as listed.
- Every Server Action starts with `requirePermission(...)` and then Zod-parses its input. Permissions come from `Docs/02-personas-and-roles.md`. Endpoints come from `Docs/15-api-spec.md`.
- **Update the docs whenever behaviour changes**, in the same change: the data model, API spec, screen spec, icon map, PRD and ADRs as relevant.

### 6. Keep code minimal
- Write the least code that fully meets the requirement. No speculative abstractions, unused options, single-use wrappers, factories for one product, or "for later" scaffolding.
- Reuse what exists (`src/lib`, `src/components`, the module services) before writing new code.
- Don't add a dependency when the platform, Cloudscape or a few lines will do.
- Never cut corners on validation at trust boundaries, authorization, tenant isolation, money handling, data-loss prevention or accessibility.

### 7. Commits: only when told, and only as Shivam Thakur
- **Never commit until Shivam says so** ("okay", "commit"). Finishing a task is not permission. Leave the work in the working tree and say what is uncommitted. One go-ahead covers the work done so far, not later work.
- Every commit is authored by Shivam Thakur's developer account, `ShivamThakurXcode`, which is this repository's git identity (`Shivam Thakur <154581410+ShivamThakurXcode@users.noreply.github.com>`; the Gmail address belongs to a different GitHub account, `shivamThakurXcode2`, and must not be used). Never pass `--author`, never change `user.name` or `user.email`, and never add a `Co-Authored-By: Claude` line, a "Generated with Claude Code" line or any other mention of Claude to a commit message or pull request.
- Never push unless asked. Work reaches `DigiconnUnite/Sanchalix` (`upstream`) as a pull request from the fork `ShivamThakurXcode/Sanchalix` (`origin`), never by pushing to its `main`.

## Safety rails specific to Sanchalix
- **Tenant isolation:** never write a query without `schoolId`, and never take `schoolId` from client input. It comes from `ctx`.
- **Children's data:** don't log PII; project away `medical`, `aadhaarNo`, `bank` and `salary` unless the role needs them; sensitive reads go through `revealSensitive` (audited).
- **Money:** receipts are immutable; use transactions for payment writes; idempotency keys on every money-creating action; webhooks are the source of truth.
- **No production data** in tests, seeds, prompts or examples.

## Key documents

| Need | Read |
|---|---|
| Doc index and sources of truth | `Docs/README.md` |
| Who the users are, and what each role may do | `Docs/02-personas-and-roles.md` |
| Features and acceptance criteria | `Docs/03-prd.md` |
| UX rules | `Docs/06-ux-principles.md` |
| Navigation and URLs | `Docs/07-information-architecture.md` |
| Cloudscape usage | `Docs/08-design-system.md` |
| Icons | `Docs/09-iconography.md` |
| Screen details | `Docs/10-screen-specs.md` |
| Accessibility | `Docs/11-accessibility.md` |
| Wording | `Docs/12-content-and-microcopy.md` |
| Architecture and folders | `Docs/13-architecture.md` |
| Collections and indexes | `Docs/14-data-model.md` |
| Actions and endpoints | `Docs/15-api-spec.md` |
| Security and privacy | `Docs/16-auth-and-security.md` |
| Code style | `Docs/17-coding-standards.md` |
| Tests | `Docs/18-testing-strategy.md` |
| Terms | `Docs/22-glossary.md` |
| Past decisions | `Docs/23-decision-log.md` |

## Definition of done (for any change)
- [ ] Typecheck, lint (including the icon and boundary rules) and tests pass.
- [ ] Loading, empty, error and success states exist; keyboard and screen reader checked; works at 360px and in dark mode.
- [ ] Icons only via `@/components/icons` + `iconSvg`/`svg`.
- [ ] No unnecessary comments.
- [ ] The docs are updated for any behaviour, schema, API, icon or copy change.

## Next.js version
This project runs Next.js 16, which differs from older versions. Read the notes below before writing Next.js code.

@AGENTS.md

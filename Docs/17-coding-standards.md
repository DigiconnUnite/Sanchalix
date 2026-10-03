# 17 · Coding Standards

How Vidyawan code is written. These rules are enforced by TypeScript, ESLint, Prettier and review. They apply to every contributor, human or AI ([CLAUDE.md](../CLAUDE.md)). Architecture: [13-architecture.md](13-architecture.md). Data: [14-data-model.md](14-data-model.md). Tests: [18-testing-strategy.md](18-testing-strategy.md).

## Guiding rules

1. **Minimal code.** Write the least code that meets the requirement. Don't add speculative abstractions, options nobody asked for, wrappers around one call, or "for later" scaffolding.
2. **Cloudscape first.** If Cloudscape has a component or pattern, use it as intended. A custom component needs an ADR.
3. **Server first.** Fetch in RSC; mutate in Server Actions; keep client components to interactive islands.
4. **The docs are part of the code.** A behaviour change updates the relevant document in the same PR (the data model, API spec, screen spec, icon map).

## TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `noImplicitOverride: true`.
- Don't use `any`. Use `unknown` + narrowing. `// @ts-expect-error` needs a reason.
- Zod schemas are the source of truth for input types: `type SubmitAttendanceInput = z.infer<typeof SubmitAttendance>`.
- Mongoose models are typed with `InferSchemaType` and use `lean<T>()` for reads.
- Prefer `type` aliases. Use `interface` only when declaration merging is needed (e.g. the Cloudscape `IconRegistry`).
- Enumerations are string literal unions, not TS `enum`.
- Money is always an integer `*Minor` number. Format only at the edge with `formatMoney(minor, currency, locale)` from `src/lib/money.ts`.
- Calendar dates are `DateStr` (`YYYY-MM-DD`); instants are `Date`. Never mix them.

## Naming

| Thing | Convention | Example |
|---|---|---|
| Files: React components | PascalCase `.tsx` | `TakeAttendance.tsx` |
| Files: everything else | camelCase `.ts` | `tenantPlugin.ts`, `actions.ts` |
| Route folders | kebab-case (URL) | `lesson-plans/`, `report-cards/` |
| Components | PascalCase, noun | `StudentPicker` |
| Hooks | `use` + noun/verb | `useOfflineAttendance` |
| Server Actions | verb + noun, camelCase | `submitAttendance`, `collectPayment` |
| Query functions | `get`/`list` + noun | `getStudent`, `listOpenInvoices` |
| Zod schemas | PascalCase noun, no suffix | `CollectPayment` |
| Mongoose models | Singular PascalCase | `Student`; collection `students` |
| Booleans | `is`/`has`/`can` prefix | `isAbsent`, `hasDues` |
| Constants | UPPER_SNAKE only for true constants | `MAX_UPLOAD_BYTES` |
| Permission strings | `module.resource.action` | `fees.payment.create` |
| i18n keys | `module.screen.element` | `attendance.take.submit` |
| Icon keys | camelCase concept | `collectPayment` ([09-iconography.md](09-iconography.md#5-complete-icon-map)) |
| Queue names / jobs | kebab queue, camel job | `notifications` / `deliver` |

Use domain terms from [22-glossary.md](22-glossary.md) exactly: `Guardian` (not `Parent` in code), `Enrollment`, `Section`, `Invoice`, `Payment`.

## File and folder structure

See the tree in [13-architecture.md](13-architecture.md#folder-structure). Rules:
- **Colocate by module**: `src/server/modules/fees/{actions,service,queries,schemas}.ts` and `src/features/fees/*`.
- **One Mongoose model per file** in `src/server/models/`.
- **`server-only`** is imported at the top of every file in `src/server/**`.
- **No barrel files** (`index.ts` re-exports) except `src/components/icons.tsx`, which is the icon map.
- **Import aliases**: `@/` → `src/`. No deep relative paths (`../../..`).
- **Boundaries** (enforced by `eslint-plugin-boundaries`): `features` → `components`, `lib`, `server/modules/*/actions` (and types only from schemas). `server` → `lib`. `components` → `lib`. Nothing imports from `app` except Next.js itself.

## Comments

**No unnecessary comments.** Code says *what*. A comment is allowed only for a non-obvious *why*: a business rule, a workaround, a legal constraint or a surprising decision.

```ts
// Good: explains a rule the code can't
// CBSE counts half-day as 0.5 present for the 75% eligibility rule.
const presentDays = present + late + halfDay * 0.5;

// Bad: restates the code
// increment the counter
seq += 1;

// Bad: narrates history. That belongs in the commit message.
// changed from findOne to findOneAndUpdate to fix race

// Bad: TODO noise. Open an issue instead.
// TODO: handle this better
```

- No commented-out code.
- No JSDoc on self-explanatory functions. JSDoc is used only on exported functions of `src/lib/*` whose contract isn't obvious from the types.
- No file header banners.

## React and Next.js

- Server Components by default. Add `'use client'` only on the smallest component that needs state, effects or browser APIs.
- Pages fetch through `queries.ts` and pass plain serialisable props, with no Mongoose documents across the boundary (`lean()` + `toJSON` of IDs).
- Use `Suspense` per independent region with a Cloudscape loading state as the fallback.
- Forms use `useActionState` with Server Actions. The client validates with the same Zod schema for instant errors, and the server validates again.
- **Every screen designs four states** (loading, empty, error, success) ([06-ux-principles.md](06-ux-principles.md#p3-four-states-always)). A PR without them isn't done.
- Don't `useEffect` to fetch data that could come from the server.
- Put URL state in search params; use `useSearchParams` + `router.replace` for filters.
- Keys: stable IDs (`_id`), never array indexes for dynamic lists.
- There is no styling code except tokens in `global.css`. No CSS modules, Tailwind or styled-components.

## UI rules

- **Cloudscape only.** No other UI kit, headless library or custom-styled component where a Cloudscape one exists ([08-design-system.md](08-design-system.md)).
- Import per component: `import Table from '@cloudscape-design/components/table'`.
- One `variant="primary"` button per view.
- Every icon-only `Button` has an `ariaLabel`.

### Icons
- Import icons only from `@/components/icons` (`svg(key, filled?)`, `IconKey`).
- Pass them via `iconSvg` (Button, ButtonDropdown items, TopNavigation utilities, drawers, SegmentedControl, Select options, TokenGroup) or `<Icon svg={...} />` (everything else, including SideNavigation `icon`).
- **Never** use `iconName`, `iconUrl`, other icon packages, or inline `<svg>` in JSX.
- ESLint:
  ```js
  'no-restricted-imports': ['error', { patterns: [{ group: ['reicon-react', 'reicon-react/*'], message: 'Import icons from @/components/icons' }, { group: ['lucide-react', 'react-icons', '@heroicons/*', '@mui/*', 'antd'], message: 'Only Cloudscape and Reicon are allowed' }] }],
  'no-restricted-syntax': ['error', { selector: "JSXAttribute[name.name='iconName']", message: 'Use iconSvg with svg() from @/components/icons' }, { selector: "JSXOpeningElement[name.name='svg']", message: 'Add the icon to @/components/icons instead' }],
  ```
  (`src/components/icons.tsx` is exempt from the reicon import rule.)

## Server code

- Every Server Action starts with `requirePermission(...)` and then `Schema.parse(input)` ([16-auth-and-security.md](16-auth-and-security.md#enforcement-points-defence-in-depth)).
- Services take `ctx: RequestContext` first and never read cookies or headers themselves.
- Multi-document writes that must stay consistent (acceptance, payments, promotions) use `withTransaction(ctx, async session => ...)`.
- Every tenant query includes `schoolId` (the plugin throws otherwise).
- Reads use `.lean()`, projections and indexes that exist in [14-data-model.md](14-data-model.md). A new query pattern → a new index → a data model doc update.
- Background work goes to BullMQ. Don't do fire-and-forget promises in request handlers.
- Every job and webhook handler is idempotent.

## Error handling

- The domain raises `AppError(code: ErrorCode, messageKey: string, details?)` ([15-api-spec.md](15-api-spec.md#error-codes)). There is no other error class hierarchy.
- Actions and handlers convert `AppError` into `ActionResult` / HTTP responses at one boundary (`withAction`, `withRoute` wrappers). Unknown errors become `INTERNAL` and are logged with `requestId`, never exposing internals.
- `ZodError` becomes `VALIDATION` with `fieldErrors` keyed by path.
- Mongo duplicate key (`11000`) maps to `CONFLICT` with a module-specific message key.
- Never swallow errors. `catch` only to translate, add context, or recover deliberately.
- Client: `ActionResult.ok === false` → field errors onto `FormField`s, others onto a `Flashbar` with retry. Error boundaries (`error.tsx`) per route segment render the error state with "Retry" (`retry()`, the Next.js 16 name for the old `reset()`).

## Logging

- `pino` with JSON output. Fields: `requestId`, `schoolId`, `userId`, `route`/`action`, `durationMs`.
- Levels: `error` (needs attention), `warn` (unexpected but handled), `info` (business events: payment captured, job done), `debug` (off in production).
- Redact: passwords, OTPs, tokens, cookies, Aadhaar, medical, bank, phone, email (configured in `redact.paths`).

## Testing conventions

Full strategy: [18-testing-strategy.md](18-testing-strategy.md).
- Test files sit next to the code: `service.test.ts`; E2E tests in `tests/e2e/{module}.spec.ts`.
- Name tests by behaviour: `it('rejects attendance for a holiday')`.
- Tests use real MongoDB (in memory) for services. Mock only external providers (Razorpay, MSG91, SES, S3) at their adapter boundary.
- Every bug fix comes with a test that fails without the fix.

## Git and PRs

- Branches: `feat/attendance-offline`, `fix/receipt-numbering`, `docs/...`.
- Commits: Conventional Commits (`feat(fees): collect partial payments`).
- PR template: persona + task, screenshots (light + dark, desktop + mobile), four states checked, a11y checked, docs updated, migration notes.
- CI must pass: typecheck, lint, unit, integration, E2E smoke, axe, build.
- One approving review; two for `fees`, `auth` and `server/db`.

## Formatting and lint

- Prettier: `printWidth: 110`, `singleQuote: true`, `trailingComma: 'all'`.
- ESLint: `next/core-web-vitals`, `@typescript-eslint/strict-type-checked`, `boundaries`, `jsx-a11y`, and the icon rules above.
- `lint-staged` + `husky` pre-commit: Prettier + ESLint on staged files.

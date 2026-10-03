# 19 · Performance and Scalability

How Vidyawan stays fast on cheap phones and slow networks, and how it scales from 1 school to 500. Architecture: [13-architecture.md](13-architecture.md). Indexes per collection: [14-data-model.md](14-data-model.md). Load tests: [18-testing-strategy.md](18-testing-strategy.md#load-tests-k6).

## Load targets

The sizing target is the end of year 2 ([01-product-vision.md](01-product-vision.md#key-assumptions)).

| Dimension | Target |
|---|---|
| Schools | 500 (the largest: 6,000 students, 5 branches) |
| Students / staff / guardians | 400,000 / 40,000 / 650,000 |
| Peak concurrent users | 25,000 (07:45–09:30 IST: attendance + parents checking) |
| Peak write rate | 150 attendance submissions/s; 50 payments/s during the fee rush |
| Documents per year | about 80M attendance entries (embedded in about 2M section-day documents), 30M marks, 5M invoices, 60M notifications |
| Availability | 99.9% monthly |

## Performance budgets

| Metric | Budget | Measured on |
|---|---|---|
| LCP (p75) | ≤ 2.5 s | The parent home and teacher Today on a mid-range Android phone, 4G (RUM) |
| INP (p75) | ≤ 200 ms | Attendance toggles, marks cell entry |
| CLS (p75) | ≤ 0.1 | All pages |
| TTFB (p75) | ≤ 600 ms | All dynamic pages from within India |
| Server read (p95) | ≤ 300 ms | Queries and route handlers |
| Server write (p95) | ≤ 500 ms | Server Actions |
| Client JS per route (gzipped, first load) | ≤ 180 KB for parent/student pages; ≤ 300 KB for staff pages | `next build` output, a CI check |
| Icon cost | Only imported glyphs ship (direct imports) | Bundle analyser |

A budget breach in CI fails the build for JS size. RUM breaches raise an alert.

### Front-end practices
- RSC by default; client islands only for interaction. Cloudscape components are imported per component (`@cloudscape-design/components/table`), never from the package root.
- Reicon icons are imported directly (`reicon-react/icons/Home`) inside `icons.tsx` only, so tree-shaking is guaranteed ([09-iconography.md](09-iconography.md)).
- Stream with `<Suspense>` per dashboard widget, so a slow widget doesn't block the page.
- Images: student photos are resized on upload by the worker (a 96px thumbnail and 400px), served as WebP via CloudFront with long cache headers; `next/image` for static assets.
- Fonts: `next/font` self-hosted; the Devanagari font loads only for `hi`.
- Charts are loaded with `next/dynamic` (client only) below the fold.
- Heavy client libraries (the PDF preview, the XLSX parser) are loaded lazily only on the screens that need them. XLSX parsing runs in the worker, not the browser.

## Pagination

- **Cursor-based everywhere** a collection can grow ([ADR-009](23-decision-log.md#adr-009-cursor-pagination-for-collections)). The cursor is an opaque base64 of `{ value, id, dir, page }`: the sort value and `_id` of the edge row, the direction (`next` or `prev`) and the page number shown by `Pagination`. The query uses `(sortField, _id) > (value, id)` (or `<` when going back) on a compound index matching the sort. `src/server/db/paginate.ts` is the one implementation.
- Page sizes are 10, 25 (default), 50 or 100 (max).
- Cloudscape `Pagination` with `openEnd`. The total count is shown only where it's cheap and useful (a counted estimate via `countDocuments` with a limit of 10,001 → "10,000+").
- **Offset pagination is banned** for tenant collections (it degrades with depth and shifts under writes).
- Sorting is allowed only on indexed fields. The table's `sortingDisabled` is set for other columns.

## Query optimisation

- Every query has `schoolId` first and uses a compound index that covers the filter + sort (ESR: equality, sort, range).
- `lean()` + projections: list queries return only the columns shown.
- **Embedding where it matches the access pattern**: attendance entries are embedded per section-day (one read for the register day, one write per submission); invoice lines and concessions are embedded; the report card snapshot is embedded.
- **Denormalise for hot reads**: `Student.currentEnrollmentId`, `Section.displayName`, `Invoice.balanceMinor`, `InventoryItem.quantity`, thread `lastMessageAt` and `unreadBy`. Each is updated in the same transaction as its source.
- Aggregations for reports run on the **Atlas analytics node** (`readPreference: 'secondary'` with the `nodeType:ANALYTICS` tag), so reports never slow down the school day.
- Pre-computed rollups: `attendanceMonthly` (per student per month) is maintained by the worker nightly and on correction, and powers attendance % everywhere without scanning daily records.
- `explain()` is checked in integration tests for the top 20 queries (asserting `IXSCAN`, no `COLLSCAN`).
- Slow query alert: > 200 ms from the Atlas profiler → Slack.

## Indexing rules

1. Every index starts with `schoolId`, except platform collections.
2. Every unique business number (admission, receipt, invoice) has a `{ schoolId, number }` unique index.
3. Invariants are enforced by unique or partial unique indexes (one current academic year, no teacher clash, one enrollment per year, one PTM booking per child-teacher).
4. No index is added without a query that needs it. Unused indexes are reviewed quarterly (`$indexStats`).
5. TTL indexes for ephemeral data (sessions, OTPs, notifications, vehicle pings).
6. All indexes are declared in the Mongoose schema and listed in [14-data-model.md](14-data-model.md). `autoIndex` is off in production. Indexes are built by a migration step with rolling builds.

## Caching

| Layer | What | Invalidation |
|---|---|---|
| CloudFront | Static assets (hashed, 1 year), public receipt verification (60 s), student photo thumbnails (signed cookies, 1 day) | Hash change / TTL |
| Next.js `'use cache'` | Tenant reference data: classes, sections, subjects, period definitions, fee heads, grading schemes, school settings; tag `school:{id}:{kind}` | `updateTag` in the mutating action |
| React `cache()` | Per-request context (session, permissions, school) | Request end |
| Redis | Rate limit counters; search autosuggest results (30 s); dashboard KPI computations (60 s, keyed by school + role + scope); the idempotency key store (24 h) | TTL |
| Service worker | App shell, the last Today/homework payload per user for offline | Version bump / NetworkFirst |

What is **not** cached: anything money-related on write paths, permission checks (always evaluated), and personal data at the CDN.

## Multi-tenancy and sharding

- **Model:** shared collections with `schoolId` on every document ([ADR-002](23-decision-log.md#adr-002-shared-collection-multi-tenancy-by-schoolid)).
- **Isolation:** the tenant plugin + scope guards + cache tags + S3 prefixes ([13-architecture.md](13-architecture.md#multi-tenancy-at-runtime)).
- **Noisy neighbours:** per-school rate limits on exports and bulk jobs; BullMQ jobs carry `schoolId`, with a per-school concurrency cap (group limits) so one school's 10,000-PDF job doesn't starve another's receipts; report queries run on the analytics node.
- **Scale path:**
  1. Year 1: a single Atlas M40 replica set (3 nodes + 1 analytics).
  2. At about 60% sustained CPU or > 1.5 TB: **shard** high-volume collections (`attendanceRecords`, `marks`, `notifications`, `auditLogs`, `invoices`, `payments`) on `{ schoolId: 1, _id: 1 }` (hashed `schoolId` for even spread is rejected, because range-on-`schoolId` keeps each school's data co-located for targeted queries). Small collections stay unsharded.
  3. Enterprise organizations that require it can get a **dedicated cluster** (the connection is chosen per organization in `getDb(ctx)`). The code is the same; only the data plane is separate.
- **Archival:** records from academic years closed more than 3 years ago move to Atlas Online Archive (queryable, cheaper storage) ([14-data-model.md](14-data-model.md#data-lifecycle)).

## Application scaling

| Component | Scaling |
|---|---|
| web | ECS Fargate autoscaling on CPU 60% and ALB request count; minimum 2 tasks (multi-AZ); scheduled scale-up at 07:30 IST on school days to pre-warm for the attendance peak |
| worker | Scales on BullMQ queue depth (a CloudWatch metric published by the worker); minimum 1, maximum 10 |
| Redis | cache.r7g.large with a replica; the BullMQ and cache keyspaces are separated by prefix |
| MongoDB connections | Pool size 20 per web task, 10 per worker task; Atlas connection limits monitored |

## Specific hot paths

| Path | Design for speed |
|---|---|
| Take attendance | One read (the roster from the enrollments index + today's record if any), one upsert with embedded entries; the alert enqueued as a delayed job; the UI is optimistic |
| Fee counter search | A `{ schoolId, admissionNo }` exact match first, then a text index on names; limit 10; Redis cache for 30 s; photos as thumbnails |
| Marks autosave | Single-document upsert per student-schedule (≤ 1 KB); debounce 400 ms per cell; no page revalidation per save |
| Report card generation | Fan out one job per student; PDFs rendered in the worker; progress counter in Redis; publish is a single status update + notification fan-out |
| Notification fan-out | Batch insert (1,000 per batch) + per-channel delivery queues with provider rate limits (MSG91 TPS, SES send rate) |
| Parent home | One aggregated query per child (attendance today, dues, due homework count, the latest announcement), cached for 60 s per user, invalidated on relevant writes |

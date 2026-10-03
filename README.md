# Vidyawan

A multi-school School Management System covering admissions, attendance, exams, fees and communication.

Built with Next.js 16 (App Router, TypeScript), MongoDB with Mongoose, the AWS Cloudscape Design System and Reicon icons.

**Developed by** Digiconn Unite · **Developer:** Shivam Thakur

## Requirements

- Node.js 22 or later
- Docker Desktop (for the local MongoDB)

## Setup

```powershell
npm install
Copy-Item .env.example .env.local   # then set AUTH_SECRET in .env.local (see the comment in the file)
npm run db:up
npm run seed
npm run dev
```

Then open http://localhost:3000 and sign in. `http://localhost:3000/api/health` returns `{"status":"ok"}` when the app can reach MongoDB.

`npm run seed` wipes the local database and fills it with two synthetic schools. Every seeded user has the password `Vidyawan#Demo2026` (set `SEED_PASSWORD` to change it):

| Email | Role | Sees |
|---|---|---|
| `admin@greenvalley.example` | School admin | All 300 Green Valley students |
| `principal@greenvalley.example` | Principal | All 300 Green Valley students |
| `teacher@greenvalley.example` | Teacher, class teacher of 6-A | The students of 6-A only |
| `accountant@greenvalley.example` | Accountant | No student list (a 403 page) |
| `admin@riverside.example` | School admin of the second school | Riverside's 12 students only |
| `newaccountant@greenvalley.example` | Accountant without 2FA yet | No student list; the 2FA setup wizard when 2FA is on |

Two-step verification is switched off by default, so every account signs in with the password alone. Set `TWO_FACTOR_ENABLED=true` in `.env.local` to turn it on: admins, the principal and the accountant are then asked for a code (run `npm run totp` to print it, or add the demo key `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP` to an authenticator app), and `newaccountant@greenvalley.example` walks through the setup wizard.

`npm run db:up` starts MongoDB 8 as a single-node replica set, which transactions need. It listens on host port 27018, so it can run next to another project's MongoDB on 27017. The replica set is initialised automatically on first start.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm run start` | Serve the production build |
| `npm run typecheck` | Check TypeScript types |
| `npm run lint` | Run ESLint, including the icon rules |
| `npm test` | Run the tests. They start their own in-memory MongoDB, so Docker isn't needed (the first run downloads its binary) |
| `npm run e2e` | Run the Playwright browser tests against a running app; it reseeds the database first (`E2E_BASE_URL` overrides `http://localhost:3000`; run `npx playwright install chromium` once) |
| `npm run seed` | Wipe the local database and load synthetic data |
| `npm run totp` | Print the current 2FA code for the seeded demo accounts |
| `npm run db:up` / `npm run db:down` | Start or stop the local MongoDB |

## Project layout

| Path | Contents |
|---|---|
| `src/app/` | Pages, layouts and API route handlers; pages live under `[locale]/` |
| `src/components/` | Shared UI built from Cloudscape; `icons.tsx` is the only place Reicon is imported |
| `src/features/` | Client components per module |
| `src/server/` | Server-only code: database, models, auth and the module services |
| `src/i18n/` | next-intl setup and the English message catalogue |
| `src/lib/` | Pure utilities, including environment validation |
| `scripts/seed.ts` | Synthetic local data |
| `Docs/` | Product, UX and engineering documentation. Start at [Docs/README.md](Docs/README.md) |
| `CLAUDE.md` | Rules every contributor (human or AI) follows |

## What works today

The roadmap's M0 walking skeleton ([Docs/05-roadmap.md](Docs/05-roadmap.md)):

- Email and password sign-in with account lockout, revocable database sessions and sign-out
- Two-step verification (TOTP) for school admins, principals and accountants, built but switched off by default (`TWO_FACTOR_ENABLED`): a setup wizard, a code at sign-in, and 10 single-use recovery codes
- An audit log of sign-ins and 2FA changes
- The role-based shell with a fixed header and a light/dark toggle, and a 403 page for pages a role can't open
- The student list: tenant-isolated, scoped for teachers, filtered by status, cursor-paginated, with `Cards` on phones
- Add student: one transaction that issues the next admission number, links or creates the parent by phone, and enrolls the student with the next roll number
- The student profile: overview, parents, and a history tab from the audit log
- Academics: the classes and sections of the current year with their strength, and forms to add a class or a section
- Attendance: daily attendance for a section, everyone Present by default, with holiday and non-working-day blocking and same-day changes
- The attendance register: a month grid per section with each student's marks, totals and attendance %
- Holidays: add and delete school holidays, which block attendance on those days
- Fees setup and billing: fee heads, fee structures with installments, principal approval that issues the invoices, and the invoice list
- The fee counter: find a student, select open invoices, take a full or part payment by cash, UPI, card, cheque or bank transfer, and get an immutable receipt with a gap-free number

The app is English-only for now; Hindi is deferred ([ADR-018](Docs/23-decision-log.md#adr-018-english-only-until-the-core-modules-are-built)).

Not built yet, in roadmap order: OTP and Google sign-in (waiting for provider credentials), the role switcher, editing a student, admissions, import, promotion and transfer, absence alerts, the full calendar with events, the payments list, dues and reminders, then online payment.

## Documentation

Everything about what Vidyawan does and how it is built is in [Docs/](Docs/README.md). The rules for writing code are in [CLAUDE.md](CLAUDE.md) and [Docs/17-coding-standards.md](Docs/17-coding-standards.md).

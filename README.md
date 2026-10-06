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

`npm run seed` drops the whole local database and fills it with two synthetic schools. Every seeded user has the password `Vidyawan#Demo2026` (set `SEED_PASSWORD` to change it):

| Email | Role | Sees |
|---|---|---|
| `admin@greenvalley.example` | School admin | All 300 Green Valley students |
| `principal@greenvalley.example` | Principal | All 300 Green Valley students |
| `teacher@greenvalley.example` | Teacher, class teacher of 6-A | The students of 6-A only |
| `accountant@greenvalley.example` | Accountant | No student list (a 403 page) |
| `teacher2@greenvalley.example` to `teacher11@…` | Teachers, each class teacher of one section (6-B onwards) | Their section, and the periods they teach |
| `teacher2@greenvalley.example` (also a parent) | Teacher and parent | Use "Switch to Parent" in the user menu to try the role switcher |
| `teacher12@greenvalley.example` | Subject teacher with no class of their own | Only the periods they teach |
| `librarian@greenvalley.example`, `transport@greenvalley.example` | Librarian, transport manager | Announcements, calendar and their own leave |
| `parent@greenvalley.example` | Parent of two children in 6-A | The parent home, with a child selector and a published report card |
| `parent2@greenvalley.example` | Parent of one child in 9-A | The parent home |
| `student@greenvalley.example` | Student of 6-A | The student home |
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
- Payments and receipts list (newest first) and the dues report with ageing bands and the total overdue
- Announcements to the whole school or chosen roles, with a reach preview, and in-app notifications with an unread badge in the header
- Staff directory with automatic employee numbers, and choosing a section's class teacher from the classes table
- Role dashboards: attendance today, active students, today's fee collection, overdue dues, drafts waiting for approval and the latest announcements, each linking to its list
- Correcting records: edit a student (with a guard against overwriting someone else's change), withdraw a student, edit a staff member and their status, delete a draft fee structure
- Student profile tabs for attendance (last 60 days) and fees (invoices, receipts, balance due)
- Admissions pipeline from enquiry to admitted; admitting creates the student, guardian and enrollment in one transaction
- Bulk import of students from a CSV file, checked first and written all-or-nothing (up to 500 rows)
- Subjects and a weekly timetable per section, with a hard stop on double-booking a teacher, and "Your classes today" for teachers
- Homework: teachers set it for the sections they teach; the office sees all of it
- Move a student to another section from the profile (new roll number, audited)
- Announcements to chosen sections, notices that ask for a read confirmation, a role switcher, and editing a parent's details
- Leave balances, attendance corrections by the principal with a reason, and a fee collection report by method and day
- Student documents: upload, download, verify and delete (kept on the server's disk until file storage is connected)
- Online fee payment for parents through a stand-in gateway, with a Razorpay webhook ready for keys
- Google sign-in for staff, switched on by adding the Google keys; new users are emailed a link to set their password
- Forgot password by emailed link, and sign-in with a phone code for parents and students
- Absence alerts to guardians and fee reminders by SMS (recorded on the Sent messages page until an SMS service is connected)
- A public home page at `/welcome`, the platform and school logos in the header, and a notifications menu
- Settings: school profile, working days and the bell schedule
- CSV export of active students, overdue dues and payments
- Users: create sign-ins for staff with a one-time temporary password, reset passwords, disable or enable accounts
- Portal accounts for a student and their parents from the student's profile, and a home page for them with attendance, fees due, homework, today's classes and upcoming events
- A calendar of school events and holidays by month
- Year end: plan the next academic year (classes and sections are copied), promote, detain, graduate or release students section by section, then close the year
- Period-wise attendance: the teacher of a timetable period marks that period for the section
- Report cards: generated per section from published results, with class teacher and principal remarks, published to students and parents, and printable
- Exams: papers per class and subject, marks entry by the subject teacher, locking by the principal, and published results for students and parents
- Staff attendance by day, with approved leave filled in
- Period attendance in the monthly register and per subject on the student profile
- Staff leave: apply, cancel, and approve or reject with a comment (no balances yet)
- A receipt that prints without the app around it
- Grouped navigation, and a profile page with density and password change

The app is English-only for now; Hindi is deferred ([ADR-018](Docs/23-decision-log.md#adr-018-english-only-until-the-core-modules-are-built)).

Not built yet, in roadmap order: OTP and Google sign-in (waiting for provider credentials), the role switcher, homework submissions, admission documents, absence alerts, the full calendar with events, dues reminders and online payment (both wait for provider credentials), then announcements and dashboards.

## Documentation

Everything about what Vidyawan does and how it is built is in [Docs/](Docs/README.md). The rules for writing code are in [CLAUDE.md](CLAUDE.md) and [Docs/17-coding-standards.md](Docs/17-coding-standards.md).

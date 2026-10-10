# 02 · Personas and Roles

Who uses Sanchalix, what they are trying to get done, and exactly what each role is allowed to do. Role keys, permission strings and scopes defined here are used unchanged in [14-data-model.md](14-data-model.md#users), [15-api-spec.md](15-api-spec.md) and [16-auth-and-security.md](16-auth-and-security.md#authorization-rbac). Navigation per role is in [07-information-architecture.md](07-information-architecture.md#navigation-per-role).

## Persona summary

| Role key | Persona | Primary device | Sessions/day | Top job to be done |
|---|---|---|---|---|
| `super_admin` | Arjun, Sanchalix platform ops | Desktop | 1–3 | Onboard a school in under a day |
| `school_admin` | Meena, school office administrator | Desktop | Continuous | Clear the front-office queue: admissions, records, certificates |
| `principal` | Dr. Rao, principal | Desktop + phone | 3–5 | Know what needs attention today |
| `teacher` | Priya, maths teacher and class teacher of 7-B | Phone in class, laptop at home | 6–10 | Take attendance and enter marks in seconds |
| `student` | Kabir, Class 9 | Phone | 2–4 | Know today's homework and timetable |
| `parent` | Sunita, mother of two | Phone (Android, often low-end) | 1–2 | Pay fees, see attendance and message the teacher |
| `accountant` | Ramesh, accounts | Desktop | Continuous | Collect fees, reconcile, chase dues |
| `librarian` | Farah, librarian | Desktop + barcode scanner | Continuous | Issue and return books fast |
| `transport_manager` | Vikram, transport in-charge | Desktop + phone | 3–6 | Keep routes full, safe and on time |

## Personas

### Arjun — Super Admin (`super_admin`)
- **Context:** Sanchalix employee. Onboards 5–20 schools a month and supports them.
- **Goals:** Provision an organization and school, import the school's legacy data, and hand over to the School Admin.
- **Frustrations:** CSV imports that fail silently; support tickets he can't reproduce because he can't see what the user saw.
- **UX implications:** The import wizard shows row-level errors and a downloadable error file. An impersonation mode ("View as") is read-only, time-boxed, audited and shown to the school in the audit log.
- **Must not:** Browse student PII by default. Break-glass access needs a reason and expires after 60 minutes.

### Meena — School Admin (`school_admin`)
- **Context:** 12 years in the school office, comfortable with Excel, interrupted every 3 minutes by parents at the counter.
- **Goals:** Process admissions, keep student records correct, issue certificates (bonafide, TC), and set up the academic year.
- **Frustrations:** Retyping the same data; not knowing which documents a family still owes; losing work when interrupted.
- **UX implications:** Forms autosave drafts. A document checklist appears on the admission record. Search from the top bar by name, admission number or phone number. Bulk actions work on table selections.

### Dr. Rao — Principal (`principal`)
- **Context:** Responsible for outcomes and compliance; reads far more than he writes.
- **Goals:** Spot problems early (attendance drops, pending marks, fee defaults), approve leave and scholarships, and publish results.
- **Frustrations:** Dashboards full of vanity numbers; having to ask the office for a report.
- **UX implications:** The dashboard leads with a "Needs your attention" list (approvals, anomalies), not charts. Every number drills down to a filtered table. Approvals are one click from notifications.

### Priya — Teacher (`teacher`)
- **Context:** Teaches 5 sections, is class teacher of 7-B, has 40 students per section, and has 3 minutes between periods.
- **Goals:** Take attendance, set homework, enter marks, and talk to parents without giving out her phone number.
- **Frustrations:** Slow systems on the school Wi-Fi; marks entry that loses data; parents messaging at 11 pm.
- **UX implications:** Attendance defaults every student to Present, so she only taps the exceptions, and it works offline in the PWA. Marks entry is a keyboard-driven grid with autosave. Messaging respects quiet hours and she never exposes her phone number.

### Kabir — Student (`student`)
- **Context:** 14, has a shared family phone some days.
- **Goals:** See today's timetable, pending homework and results; submit assignments.
- **UX implications:** A "Today" home screen with timetable, due homework and announcements. Submissions accept a photo from the camera. The student sees only their own data.

### Sunita — Parent (`parent`)
- **Context:** Two children in the same school, a low-end Android phone, prefers Hindi, and logs in by SMS OTP.
- **Goals:** Pay fees quickly, know whether her child reached school, see results, and book a PTM slot.
- **Frustrations:** Passwords; English-only screens; separate logins per child.
- **UX implications:** OTP login. A child switcher at the top (one account covers all children). Hindi UI. The fee screen shows the total due with one "Pay now" button. Absence alerts arrive the same morning.

### Ramesh — Accountant (`accountant`)
- **Context:** Handles counter payments at peak times (the first 10 days of each quarter).
- **Goals:** Collect a payment and print a receipt in under 30 seconds; reconcile online payments; send dues reminders.
- **Frustrations:** Mismatches between the gateway and the ledger; students with the same name.
- **UX implications:** The fee counter screen searches by admission number, shows a photo to disambiguate, and preselects the oldest dues. Receipts are immutable and numbered. The reconciliation view flags mismatches.

### Farah — Librarian (`librarian`)
- **Goals:** Issue and return books with a barcode scanner, and track overdue loans.
- **UX implications:** A single circulation screen where the scanner types into a focused input; Enter confirms. Overdue loans are listed with one-click reminders.

### Vikram — Transport Manager (`transport_manager`)
- **Goals:** Assign students to routes and stops, manage vehicle documents (insurance, fitness certificate expiry), and inform parents of delays.
- **UX implications:** A route capacity bar per vehicle. Expiry alerts 30 days out. A "Notify route" action sends to the guardians of every student on a route.

## Scopes

Every role assignment carries a scope. A permission applies only inside its scope.

| Scope | Meaning | Roles |
|---|---|---|
| `platform` | All organizations | `super_admin` |
| `school` | All branches of one school | `school_admin`, `principal`, `accountant` (default) |
| `branch` | One branch | Any staff role can be narrowed to a branch |
| `assigned` | Only sections/subjects the teacher is assigned to via `TimetableSlot` or `Section.classTeacherId` | `teacher` |
| `route` | Only routes the user manages | `transport_manager` (optional narrowing) |
| `self` | Only their own records | `student`, and staff for their own leave and payslips |
| `ward` | Only students linked through `Guardian.studentIds` | `parent` |

## Permission model

- Permissions are strings in the form `module.resource.action`, e.g. `attendance.record.create`, `fees.refund.approve`.
- Actions: `read`, `create`, `update`, `delete`, `approve`, `publish`, `export`.
- Roles map to permission sets in code (`src/server/auth/permissions.ts`). The schools can't edit these in MVP. Custom roles are a v2 "Could" ([03-prd.md](03-prd.md#1-authentication-rbac-and-tenancy)).
- A user may hold several role assignments. The effective permission set is the union, each evaluated in its own scope.

## RBAC matrix

Legend: **R** read · **C** create · **U** update · **D** delete (soft) · **A** approve · **P** publish · **E** export · **—** no access. A scope qualifier follows in brackets when it is narrower than the role default, e.g. `R[assigned]`.

### Platform and administration

| Module · resource | super_admin | school_admin | principal | teacher | student | parent | accountant | librarian | transport_manager |
|---|---|---|---|---|---|---|---|---|---|
| Organizations, schools | CRUD | R (own) | R (own) | — | — | — | — | — | — |
| Branches | CRUD | CRU | R | — | — | — | — | — | — |
| School settings | RU | RU | R | — | — | — | R (fees) | — | — |
| Users and role assignments | CRUD | CRUD (not super_admin) | R | — | — | — | — | — | — |
| Academic years and terms | R | CRU | R + A (close year) | R | R | R | R | R | R |
| Audit log | R | R | R | — | — | — | — | — | — |
| Data import/export | CRUD | CRE | E | — | — | — | E (fees) | E (library) | E (transport) |
| Backups and restore | CRUD | — | — | — | — | — | — | — | — |

### Students and admissions

| Module · resource | super_admin | school_admin | principal | teacher | student | parent | accountant | librarian | transport_manager |
|---|---|---|---|---|---|---|---|---|---|
| Admissions | R (break-glass) | CRUD | R + A | — | — | C (online form) + R[ward] | R | — | — |
| Student profile | R (break-glass) | CRUD + E | R + E | R[assigned] | R[self] | R[ward], U (contact fields) | R (name, class, fees) | R (name, class) | R (name, class, stop) |
| Student documents | — | CRUD | R | — | R[self] | C + R[ward] | — | — | — |
| Enrollment, promotion, transfer | — | CRU | A | R[assigned] | R[self] | R[ward] | R | — | — |
| Certificates (bonafide, TC) | — | C + P | A | — | R[self] | R[ward] + request | — | — | — |
| Alumni | — | RU | R | — | — | — | — | — | — |

### Staff and HR

| Module · resource | super_admin | school_admin | principal | teacher | student | parent | accountant | librarian | transport_manager |
|---|---|---|---|---|---|---|---|---|---|
| Staff profiles | — | CRUD | R | R[self] | — | — | R (salary) | R[self] | R[self] |
| Staff attendance | — | CRU | R | C[self] (check-in) + R[self] | — | — | R | C[self] + R[self] | C[self] + R[self] |
| Leave requests (staff) | — | R + A | A | C + R[self] | — | — | C + R[self] | C + R[self] | C + R[self] |
| Payroll runs and payslips | — | R | R + A | R[self] | — | — | CRU + P | R[self] | R[self] |
| Appraisals | — | CRU | CRU + A | R[self] + U (self-review) | — | — | — | R[self] | R[self] |

### Academics and classroom

| Module · resource | super_admin | school_admin | principal | teacher | student | parent | accountant | librarian | transport_manager |
|---|---|---|---|---|---|---|---|---|---|
| Classes, sections, subjects | — | CRUD | R | R | R[self] | R[ward] | R | R | R |
| Curriculum and lesson plans | — | R | R + A | CRU[assigned] | R[self] (topics) | — | — | — | — |
| Timetable | — | CRU + P | R + A | R | R[self] | R[ward] | — | — | — |
| Substitutions | — | CRU | CRU | R | R[self] | — | — | — | — |
| Student attendance | — | CRU | R + U (corrections) | CU[assigned] | R[self] | R[ward] | — | — | C (bus boarding) |
| Exams and schedules | — | CRU | CRU + A | R | R[self] | R[ward] | — | — | — |
| Grading schemes | — | CRU | A | R | — | — | — | — | — |
| Marks | — | R | R + U (moderation) + A (lock) | CU[assigned] until locked | R[self] after publish | R[ward] after publish | — | — | — |
| Report cards and transcripts | — | C (generate) + E | A + P | R[assigned] + U (remarks, class teacher) | R[self] | R[ward] | — | — | — |
| Homework and assignments | — | R | R | CRUD[assigned] | R[self] + C (submission) | R[ward] | — | — | — |
| Submissions and evaluation | — | — | R | RU[assigned] | CRU[self] until due | R[ward] | — | — | — |

### Finance

| Module · resource | super_admin | school_admin | principal | teacher | student | parent | accountant | librarian | transport_manager |
|---|---|---|---|---|---|---|---|---|---|
| Fee heads and fee structures | — | R | R + A | — | — | — | CRUD | — | — |
| Invoices | — | R | R | — | R[self] | R[ward] | CRU + D (void, before any payment) | — | — |
| Discounts | — | R | A | — | — | — | CRU | — | — |
| Scholarships | — | C (nominate) | A | C (nominate) | — | C (apply) | R | — | — |
| Payments and receipts | — | R | R | — | R[self] | C (online) + R[ward] | C + R + E | — | — |
| Refunds | — | — | A | — | — | — | C (request) | — | — |
| Finance reports | — | R | R + E | — | — | — | R + E | — | — |

### Communication

| Module · resource | super_admin | school_admin | principal | teacher | student | parent | accountant | librarian | transport_manager |
|---|---|---|---|---|---|---|---|---|---|
| Announcements and notices | C (platform notices) | CRUD + P | CRUD + P | C + P[assigned sections] | R | R | C + P (fee notices) | — | C + P[route guardians] |
| Messages | — | CR | CR | CR[assigned guardians] | CR (with teachers, if enabled) | CR (with their children's teachers) | CR (fee queries) | — | CR (route guardians) |
| PTM events and slots | — | CRUD | CRUD | RU[own slots] | — | R + C (booking)[ward] | — | — | — |
| Notification preferences | — | RU (school defaults) | RU[self] | RU[self] | RU[self] | RU[self] | RU[self] | RU[self] | RU[self] |

### Operations

| Module · resource | super_admin | school_admin | principal | teacher | student | parent | accountant | librarian | transport_manager |
|---|---|---|---|---|---|---|---|---|---|
| Library catalogue and copies | — | R | R | R | R | — | — | CRUD + E | — |
| Loans | — | R | R | R[self] | R[self] | R[ward] | R (fines) | CRU | — |
| Vehicles, routes, stops | — | R | R | — | — | — | — | — | CRUD |
| Transport assignments | — | CRU | R | — | R[self] | R[ward] + C (request) | R | — | CRU |
| Live vehicle location (v2) | — | R | R | — | R[self route] | R[ward route] | — | — | R |
| Hostel, rooms, allocations | — | CRUD | R | R (warden flag) | R[self] | R[ward] | R | — | — |
| Inventory and stock | — | CRUD | R + A (purchase) | C (request) | — | — | R | — | — |
| Events, holidays, calendar | — | CRUD | CRUD | C (class events) + R | R | R | R | R | R |

### Insights

| Module · resource | super_admin | school_admin | principal | teacher | student | parent | accountant | librarian | transport_manager |
|---|---|---|---|---|---|---|---|---|---|
| Role dashboard | R (platform) | R | R | R | R | R | R | R | R |
| Reports | R (platform usage) | R + E | R + E | R + E[assigned] | — | — | R + E (finance) | R + E (library) | R + E (transport) |
| At-risk insights (v2) | — | R | R | R[assigned] | — | — | — | — | — |

## Rules that the matrix alone does not capture

1. **Marks lock.** Once a principal locks an exam schedule, teachers can't edit marks. Unlocking needs `exams.mark.approve` and a reason, and is audited.
2. **Receipts are immutable.** Nobody, including `super_admin`, can edit or delete a receipt. Corrections happen through a refund plus a new payment.
3. **Guardian contact edits** made by parents (phone, email, address) are applied immediately but flagged for School Admin review, because they change who receives notifications.
4. **Class teacher** is not a role. It grants `attendance.record.create` (daily mode) and `exams.reportCard.update` (remarks) for that one section.
5. **Multi-role users:** a teacher who is also a parent sees a role switcher in the top navigation. The active role decides the navigation and the dashboard. Permissions are never mixed on one screen.
6. **Break-glass access** for `super_admin` requires a reason and expires in 60 minutes. The school admin is notified and it appears in the school's audit log.
7. **Minimum data for helper roles:** `accountant`, `librarian` and `transport_manager` see only the student fields their work needs (name, admission number, class and section, photo, plus fee, loan or stop data). No health, document or marks data.

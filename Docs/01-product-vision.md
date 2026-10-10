# 01 · Product Vision

## The problem

Indian K-12 schools run on a patchwork: attendance registers on paper, fees in Tally or Excel, marks in spreadsheets, and parent communication in personal WhatsApp groups. The costs are concrete:

- **Teachers lose 20–40 minutes a day** on registers, marks tabulation and answering parents one by one on their personal phones.
- **Office staff retype the same student data** into 4–6 places (admission register, fee ledger, exam sheets, TC book, transport list, library cards), so errors spread.
- **Fee collection is slow and opaque.** Counter queues run 30+ minutes in the first week of each quarter, dues are chased by phone, and reconciling online payments is manual.
- **Parents are in the dark.** They learn about absences, low marks and dues days or weeks late, and they must visit the school for routine tasks.
- **Principals can't see problems early.** A struggling student is usually spotted after the half-yearly exam, when it is late to help.
- **Student data is scattered and unprotected.** Photos, Aadhaar numbers and medical notes sit in shared drives and WhatsApp, which is a compliance risk under the DPDP Act 2023.

Existing school ERPs digitise these forms but copy their clumsiness: dense screens, 30-field forms, English only, desktop only, and no thought for the teacher with 3 minutes between periods or the parent on a low-end Android phone.

## Vision

> **Sanchalix makes running a school feel effortless for everyone in it: the teacher in the corridor, the parent at home, the accountant at the counter and the principal who needs to know what matters today.**

Sanchalix is one system of record for the whole school, designed task-first for each role, fast on cheap phones and patchy networks, available in the family's language, and careful with children's data.

## Goals

| # | Goal | Why it matters |
|---|---|---|
| G1 | **Daily tasks in seconds.** Attendance for 40 students in under 60 seconds; a counter fee payment with receipt in under 30 seconds. | Teachers and accountants adopt tools that save them time, and abandon tools that don't. |
| G2 | **Enter data once.** One student record feeds attendance, exams, fees, transport, library and certificates. | It removes retyping and the errors that come with it. |
| G3 | **Parents informed the same day.** Absence alerts by 10:00, results the day they are published, dues before they are overdue. | Early information changes outcomes and cuts office phone calls. |
| G4 | **Principals see problems early.** Attention lists and (v2) explainable at-risk flags. | Intervention in week 3 beats intervention after the half-yearly exam. |
| G5 | **Fees are collected faster and reconciled automatically.** | Cash flow is the school's lifeline. |
| G6 | **Inclusive by default.** WCAG 2.2 AA, Hindi + English, works on a ₹8,000 phone over 3G. | Parents and staff aren't all on laptops or fluent in English. |
| G7 | **Trustworthy with children's data.** DPDP-aligned consent, minimal access, full audit. | Schools are accountable for children's data, and parents need to trust them with it. |
| G8 | **One platform for many schools.** Multi-school and multi-branch, onboarding in under a day. | This is the business model: trusts and chains run several campuses. |

## Success metrics

Measured per school, after 90 days live.

| Metric | Target | Source |
|---|---|---|
| Median time to submit daily attendance for a section | ≤ 60 s | `attendanceRecords.submittedAt` minus the page-open event |
| Sections with attendance submitted by 10:00 | ≥ 95% | Attendance report |
| Median counter payment time (student search → receipt printed) | ≤ 30 s | Client timing event |
| Share of fees paid online | ≥ 60% by month 6 | `payments.method` |
| Dues over 30 days as a share of billed amount | Down 30% vs. the first term | Dues ageing report |
| Parent weekly active users / parents with an account | ≥ 70% | Sessions |
| Teacher weekly active users / teachers | ≥ 95% | Sessions |
| Marks entry completed before the lock deadline | ≥ 98% of schedules | `examSchedules.status` |
| Report cards published within 7 days of the last exam | 100% | `reportCards.publishedAt` |
| Support tickets per 100 users per month | ≤ 2 | Help desk |
| System Usability Scale (SUS), per role, measured quarterly | ≥ 80 (teacher, parent), ≥ 75 (school_admin, accountant, librarian) | In-app survey |
| Accessibility defects (axe critical/serious) in production | 0 | CI ([18-testing-strategy.md](18-testing-strategy.md#accessibility-tests)) |
| p75 LCP on the parent home over 4G on a mid-range Android phone | ≤ 2.5 s | RUM ([19-performance-and-scalability.md](19-performance-and-scalability.md#performance-budgets)) |
| School onboarding (contract → first attendance taken) | ≤ 1 working day | Onboarding tracker |

## Non-goals

These are deliberately out of scope, so Sanchalix stays focused.

| Non-goal | Why not |
|---|---|
| A full LMS (video lessons, quizzes, course authoring) | Schools already use Google Classroom or similar. Homework and submissions cover the daily loop, and deep links cover the rest. |
| Accounting ledger / general ledger | Sanchalix produces fee and payroll exports for Tally and Zoho Books. It doesn't replace the school's accounts. |
| Native iOS/Android apps in v1 or v2 | A PWA covers install, push and offline at a fraction of the cost. Revisit if iOS push reach falls below target. |
| Higher education (credits, semesters, university exams) | A different domain model; it would bloat K-12 UX. |
| Building our own payment, SMS or email infrastructure | We integrate with providers ([21-notifications-and-integrations.md](21-notifications-and-integrations.md)). |
| Custom per-school feature forks | One product with settings. Schools configure, they don't fork. |
| Automated decisions about students by AI | AI insights only **suggest** and always explain. A human decides ([ADR-008](23-decision-log.md#adr-008-rule-based-explainable-risk-scoring-first)). |
| Social feed, likes, public profiles | They create child-safety and moderation burdens with little value to the school. |

## Key assumptions

These shape every other document. Each one is recorded as a decision in [23-decision-log.md](23-decision-log.md).

1. **India-first, configurable for elsewhere.** CBSE, ICSE and State boards; INR; GST on applicable fee heads; the DPDP Act 2023. Currency, locale, grading schemes and the academic year start are settings.
2. **Multi-tenant SaaS.** Organization → School → Branch. Shared MongoDB collections isolated by `schoolId` ([ADR-002](23-decision-log.md#adr-002-shared-collection-multi-tenancy-by-schoolid)).
3. **A Next.js monolith + one worker.** The worker handles notifications, PDFs, imports, the timetable solver and AI scoring ([ADR-001](23-decision-log.md#adr-001-nextjs-monolith-plus-a-background-worker)).
4. **Hosted on AWS** (ECS Fargate, MongoDB Atlas on AWS in Mumbai `ap-south-1`, ElastiCache Redis, S3, CloudFront), so data stays in India.
5. **Providers:** Razorpay (primary payments), Stripe (international schools), MSG91 (SMS, DLT-registered templates), Amazon SES (email) and Web Push.
6. **Languages:** English and Hindi at launch. Adding a language needs only a message catalogue.
7. **Devices:** staff on desktops and phones; students and parents mostly on Android phones, as an installable PWA.
8. **Scale target** (the end of year 2): 500 schools, 400,000 students, 40,000 staff, a peak of 25,000 concurrent users (08:00–09:30 IST attendance peak).

## Guiding product principles

1. **The teacher's time is sacred.** A feature that adds a step for teachers must remove two.
2. **Defaults do the work.** Everyone starts Present, the oldest dues are preselected, and the current year and section are pre-filled.
3. **Every number is a door.** Any count on a dashboard opens the filtered list behind it.
4. **Say what happened and what to do next.** Every message names the object and the next step ([12-content-and-microcopy.md](12-content-and-microcopy.md)).
5. **Nothing is lost.** Autosave, offline queues, undo and immutable financial records.

Next: [02-personas-and-roles.md](02-personas-and-roles.md) · [03-prd.md](03-prd.md) · [05-roadmap.md](05-roadmap.md)

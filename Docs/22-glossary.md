# 22 · Glossary

The single source of truth for Sanchalix terminology. If a word appears in the UI, the data model or the API, it is defined here, and every other document uses it exactly as written. User-facing wording rules live in [12-content-and-microcopy.md](12-content-and-microcopy.md).

## Organisation and tenancy

| Term | Definition | Code name |
|---|---|---|
| Organization | A legal entity that owns one or more schools (e.g. a trust or society). The billing customer of Sanchalix. | `Organization` |
| School | A single institution with its own affiliation (CBSE, ICSE, State board), branding, settings and fee structures. The primary **tenant boundary**. | `School`, `schoolId` |
| Branch | A physical campus of a school. Students, staff, classes and vehicles belong to one branch. Single-campus schools have one default branch. | `Branch`, `branchId` |
| Tenant | Shorthand for the `schoolId` scope every request and document carries. | — |
| Academic year | The period that classes, enrollments and fee structures belong to, e.g. "2026–27" (1 Apr–31 Mar by default). Exactly one is **current** per school. | `AcademicYear` |
| Term | A subdivision of an academic year used for exams and fees, e.g. "Term 1". | `Term` |

## People and roles

| Term | Definition | Code name |
|---|---|---|
| User | A login identity. One person has one user, which can hold several role assignments (e.g. a teacher who is also a parent). | `User` |
| Role | One of the nine fixed roles below. | `RoleKey` |
| Role assignment | A user + role + scope (school, optionally branch). | `User.roles[]` |
| Permission | A dotted string that authorizes one action, e.g. `fees.invoice.create`. Roles are bundles of permissions. | `Permission` |
| Super Admin | Sanchalix platform operator. Manages organizations and schools. Never sees student data unless granted break-glass access. | `super_admin` |
| School Admin | Runs day-to-day administration of a school. | `school_admin` |
| Principal | Academic head. Approves, oversees and reads everything in the school; edits little. | `principal` |
| Teacher | Teaches subjects; may be the **class teacher** of one section. | `teacher` |
| Class teacher | The teacher responsible for a section: daily attendance, remarks and the report card sign-off. A flag on `Section.classTeacherId`, not a role. | — |
| Student | An enrolled learner. | `student` |
| Parent | A guardian with a login. The UI says "Parent"; the data model says `Guardian` because not every guardian is a parent. | `parent`, `Guardian` |
| Accountant | Manages fees, payments, receipts and payroll disbursement. | `accountant` |
| Librarian | Manages the library catalogue and loans. | `librarian` |
| Transport Manager | Manages vehicles, routes, stops and transport assignments. | `transport_manager` |
| Staff | Any employee record (teaching or non-teaching). A staff member usually, but not always, has a user. | `Staff` |

## Student lifecycle

| Term | Definition | Code name |
|---|---|---|
| Enquiry | A prospective family's first contact. The first stage of an admission. | `Admission.status = enquiry` |
| Admission | The application process from enquiry to acceptance. | `Admission` |
| Admission number | A unique, human-readable ID given at acceptance, e.g. `VWN-2026-00412`. Never reused. | `Student.admissionNo` |
| Enrollment | A student's placement in a section for one academic year. There is one active enrollment per student per year. | `Enrollment` |
| Roll number | A student's number within a section for the year. | `Enrollment.rollNo` |
| Promotion | Creating next year's enrollment in a higher class. | `Enrollment.status = promoted` |
| Detention | Repeating the same class next year. | `Enrollment.status = detained` |
| Transfer | Leaving the school mid-course. Produces a Transfer Certificate. | `Student.status = transferred` |
| Transfer Certificate (TC) | An official leaving document issued on transfer. | `Document.type = tc` |
| Alumni | Students who completed their final class. | `Student.status = alumni` |

## Academics

| Term | Definition | Code name |
|---|---|---|
| Class | A grade level, e.g. "Class 7". Also called a grade in some regions; the UI always says **Class**. | `Class` |
| Section | A group of students within a class, e.g. "7-B". The unit for attendance and timetable. | `Section` |
| Subject | A taught subject, e.g. "Mathematics". It can be scholastic or co-scholastic. | `Subject` |
| Curriculum | The ordered units and topics of a subject for a class. | `Subject.curriculum[]` |
| Lesson plan | A teacher's plan for teaching a topic on a date. | `LessonPlan` |
| Period | A numbered time slot in the school day, e.g. "Period 3, 10:15–11:00". | `PeriodDefinition` |
| Timetable slot | A section + day + period → subject + teacher + room. | `TimetableSlot` |
| Substitution | A one-day replacement teacher for a slot. | `Substitution` |

## Attendance

| Term | Definition | Code name |
|---|---|---|
| Daily attendance | One mark per student per day, taken by the class teacher. | `AttendanceRecord.mode = daily` |
| Period attendance | One mark per student per period, taken by the subject teacher. | `mode = period` |
| Attendance status | `present`, `absent`, `late`, `half_day`, `leave` or `holiday`. | `AttendanceStatus` |
| Attendance source | `manual`, `qr`, `biometric` or `import`. | `AttendanceRecord.source` |
| Attendance % | (present + late + 0.5 × half_day) ÷ working days × 100. `leave` counts as absent unless the school setting says otherwise. | — |

## Examinations

| Term | Definition | Code name |
|---|---|---|
| Exam | A named assessment event, e.g. "Half-Yearly 2026". | `Exam` |
| Exam schedule | A date, time, subject and max marks for one class within an exam. | `ExamSchedule` |
| Grading scheme | The mapping from marks % to grades, e.g. CBSE 9-point (A1–E). | `GradingScheme` |
| Mark | One student's score for one exam schedule. | `Mark` |
| Marks entry | The teacher workflow of entering marks for a section. | — |
| Moderation | A principal reviewing and locking marks before publishing. | `ExamSchedule.status = locked` |
| Report card | A published, per-student, per-exam (or per-term) result document. | `ReportCard` |
| Transcript | A multi-year academic record. | `ReportCard` aggregate, PDF |

## Homework

| Term | Definition | Code name |
|---|---|---|
| Homework | Work assigned to a section for a subject with a due date. The UI uses "Homework" for daily work and "Assignment" for graded work; both are one entity with `graded: boolean`. | `Homework` |
| Submission | A student's response to homework. | `Submission` |
| Evaluation | A teacher's grade and feedback on a submission. | `Submission.evaluation` |

## Fees and finance

| Term | Definition | Code name |
|---|---|---|
| Fee head | A category of charge, e.g. Tuition, Transport, Lab. | `FeeHead` |
| Fee structure | Fee heads + amounts + installment schedule for a class for an academic year. | `FeeStructure` |
| Installment | A due date and amount within a fee structure, e.g. "Q1 – due 10 Apr". | `FeeStructure.installments[]` |
| Invoice | The amount a student owes for one installment, after discounts. | `Invoice` |
| Discount | A reduction rule (sibling, staff ward, early payment). | `Discount` |
| Scholarship | Merit- or need-based funding applied like a discount, with an approval workflow. | `Scholarship` |
| Concession | The umbrella UI term for discount + scholarship lines on an invoice. | — |
| Payment | Money received against one or more invoices (online, cash, cheque, UPI, bank transfer). | `Payment` |
| Receipt | An immutable, numbered proof of payment, e.g. `RCPT/2026-27/000871`. | `Payment.receiptNo` |
| Dues | Unpaid invoice balances past their due date. | `Invoice.status = overdue` |
| Late fee | A charge added automatically after the grace period. | `Invoice.lateFee` |
| Refund | Reversing a payment in whole or part. Never deletes the receipt. | `Payment.refunds[]` |

## Communication

| Term | Definition | Code name |
|---|---|---|
| Announcement | A one-to-many broadcast to an audience (the school, a class, a section or a role). | `Announcement` |
| Notice | A formal announcement with an attachment and acknowledgement tracking. `Announcement.kind = notice`. | — |
| Message | A one-to-one or small-group conversation (parent ↔ teacher). | `Thread`, `Message` |
| Notification | A system-generated alert delivered in-app, and optionally by email, SMS or push. | `Notification` |
| PTM | A Parent-Teacher Meeting event with bookable slots. | `PTMEvent`, `PTMSlot` |
| Quiet hours | A per-school window (default 21:00–07:00) when SMS and push are held. | `School.settings.quietHours` |

## Operations

| Term | Definition | Code name |
|---|---|---|
| Book | A catalogue title. | `Book` |
| Copy | A physical copy with an accession number. | `BookCopy` |
| Loan | A copy issued to a member (a student or staff member). | `Loan` |
| Vehicle, Route, Stop | The transport fleet, ordered stop sequences, and pickup points. | `Vehicle`, `Route`, `Stop` |
| Transport assignment | A student + route + stop for an academic year. It drives the transport fee. | `TransportAssignment` |
| Hostel, Room, Allocation | Residential blocks, rooms with beds, and the student-to-bed assignment. | `Hostel`, `Room`, `HostelAllocation` |
| Inventory item, Stock movement | Consumables and assets, and their in/out ledger. | `InventoryItem`, `StockMovement` |
| Event | A calendar entry (sports day, exam, PTM). | `Event` |
| Holiday | A non-working day. Blocks attendance. | `Holiday` |

## HR

| Term | Definition | Code name |
|---|---|---|
| Leave request | A staff (or student) request for leave, with an approval chain. | `LeaveRequest` |
| Leave type | CL, SL, EL, LOP, etc. with an annual quota. | `LeaveType` |
| Salary structure | Earnings and deductions components per staff member. | `Staff.salary` |
| Payroll run | A monthly computation of payslips for a branch. | `PayrollRun` |
| Payslip | One staff member's pay for one month. | `Payslip` |
| Appraisal | A periodic performance review. | `Appraisal` |

## Platform and technical

| Term | Definition |
|---|---|
| RBAC | Role-based access control. See [16-auth-and-security.md](16-auth-and-security.md#authorization-rbac). |
| Audit log | An append-only record of who did what, when and from where. `AuditLog`. |
| Import job | A background CSV/XLSX import with row-level validation. `ImportJob`. |
| Risk score | An explainable 0–100 at-risk indicator per student (v2). `RiskScore`. |
| Server Action | A Next.js server function invoked from a form. Used for mutations from the UI. |
| Route Handler | A Next.js `route.ts` HTTP endpoint. Used for webhooks, exports, the mobile/PWA sync and public APIs. |
| Worker | A separate Node process that consumes BullMQ queues. |
| Tenant plugin | A Mongoose plugin that injects and enforces `schoolId` on every query. |
| Soft delete | Setting `deletedAt` instead of removing a document. |
| PWA | Progressive Web App: an installable, offline-capable web client. |
| DPDP Act | India's Digital Personal Data Protection Act, 2023. |
| Four states | The loading, empty, error and success states that every screen must design. See [06-ux-principles.md](06-ux-principles.md). |

Related: [02-personas-and-roles.md](02-personas-and-roles.md) · [14-data-model.md](14-data-model.md) · [12-content-and-microcopy.md](12-content-and-microcopy.md)

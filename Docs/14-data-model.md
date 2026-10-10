# 14 · Data Model

Every MongoDB collection in Sanchalix, with its fields, validation, indexes and relationships. Mongoose schemas in `src/server/models/*.ts` must match this document exactly. Change this document in the same PR as any schema change. Terms are defined in [22-glossary.md](22-glossary.md). Access rules are in [02-personas-and-roles.md](02-personas-and-roles.md#rbac-matrix).

## Conventions

| Rule | Detail |
|---|---|
| Collection names | Plural camelCase (`students`, `feeStructures`). Model names are singular PascalCase (`Student`). |
| IDs | `_id: ObjectId`. Human-readable codes (admission number, receipt number) are separate unique fields. |
| Tenancy | Every tenant-owned document has `schoolId: ObjectId` (required, indexed first in every compound index). Branch-scoped documents also have `branchId`. |
| Timestamps | `createdAt` and `updatedAt` (Mongoose `timestamps: true`) plus `createdBy` and `updatedBy: ObjectId<User>`. |
| Soft delete | `deletedAt: Date \| null`. The default query filter excludes deleted documents. Financial documents (`invoices`, `payments`) and `auditLogs` are never deleted. |
| Money | Integers in **minor units** (paise), with `currency` on the school (`INR`). Never floats. |
| Dates | Stored as UTC `Date`. Calendar dates (attendance date, due date) are stored as `YYYY-MM-DD` strings in the school's timezone, so a date never shifts across a timezone boundary. |
| Enums | String literal unions, validated by Mongoose `enum` and mirrored in Zod. |
| Localised text | User-visible content is stored as entered. UI strings live in message catalogues, not the DB. |
| PII | Fields marked 🔒 are encrypted at the field level (see [16-auth-and-security.md](16-auth-and-security.md#encryption)). |
| Validation | Zod at the boundary ([15-api-spec.md](15-api-spec.md)), Mongoose validators as the last line, and unique indexes for invariants. |

### Tenant plugin

`src/server/db/tenantPlugin.ts` is applied to every tenant-owned schema. It:

1. Adds `schoolId` (required, immutable).
2. On `find*`, `count*`, `update*`, `delete*` and `aggregate`, throws `TenantScopeError` if the query or pipeline does not include `schoolId`. This makes a cross-tenant leak impossible to write by accident.
3. Adds `deletedAt: null` to filters unless `{ withDeleted: true }` is passed.

Platform-level collections (`organizations`, `schools`, `users`, `sessions`, `platformAuditLogs`) are exempt and accessed only through `src/server/platform/*`.

## Entity relationship overview

```mermaid
erDiagram
  Organization ||--o{ School : owns
  School ||--o{ Branch : has
  School ||--o{ AcademicYear : defines
  AcademicYear ||--o{ Term : splits
  Branch ||--o{ Class : offers
  Class ||--o{ Section : divides
  Class }o--o{ Subject : teaches
  Section ||--o{ TimetableSlot : scheduled
  Staff ||--o{ TimetableSlot : teaches
  User ||--o| Staff : "is"
  User ||--o| Student : "is"
  User ||--o| Guardian : "is"
  Guardian }o--o{ Student : "guardian of"
  Admission ||--o| Student : "becomes"
  Student ||--o{ Enrollment : "enrolled via"
  Enrollment }o--|| Section : in
  Enrollment }o--|| AcademicYear : for
  Student ||--o{ AttendanceRecord : marked
  Exam ||--o{ ExamSchedule : contains
  ExamSchedule ||--o{ Mark : records
  Student ||--o{ Mark : scores
  Student ||--o{ ReportCard : receives
  Homework ||--o{ Submission : receives
  FeeStructure ||--o{ Invoice : generates
  Student ||--o{ Invoice : billed
  Invoice }o--o{ Payment : "settled by"
  Route ||--o{ Stop : has
  Vehicle ||--o{ Route : runs
  Student ||--o{ TransportAssignment : rides
  Book ||--o{ BookCopy : has
  BookCopy ||--o{ Loan : lent
  Staff ||--o{ LeaveRequest : requests
  PayrollRun ||--o{ Payslip : produces
```

## Platform collections

### organizations
| Field | Type | Rules |
|---|---|---|
| name | string | required, 2–120 chars |
| legalName | string | optional |
| gstin | string | optional, GSTIN regex |
| billingEmail | string | required, email |
| plan | `'starter' \| 'growth' \| 'enterprise'` | required |
| status | `'active' \| 'suspended'` | default `active` |

Indexes: `{ name: 1 }`.

### schools
| Field | Type | Rules |
|---|---|---|
| organizationId | ObjectId<Organization> | required |
| name | string | required |
| code | string | required, unique, `^[A-Z0-9]{3,8}$` (used in admission numbers, e.g. `VWN`) |
| board | `'CBSE' \| 'ICSE' \| 'STATE' \| 'IB' \| 'IGCSE' \| 'OTHER'` | required |
| affiliationNo | string | optional |
| address | Address | required |
| timezone | IANA string | default `Asia/Kolkata` |
| currency | ISO 4217 | default `INR` |
| locales | string[] | default `['en', 'hi']` |
| logoUrl | string | S3 key |
| settings | SchoolSettings | see below |
| integrations | `{ razorpay?: { keyId, keySecret🔒, webhookSecret🔒 }, stripe?: {...🔒}, emailDomain?, allowedGoogleDomains: string[] }` | optional; the platform defaults apply when unset |
| status | `'onboarding' \| 'active' \| 'suspended'` | |

`SchoolSettings`: `attendanceMode: 'daily' | 'period' | 'both'`, `absenceAlertTime: 'HH:mm'` (default `09:30`), `attendanceEditWindow: 'same_day'`, `leaveCountsAsAbsent: boolean`, `transportWindows: { start: 'HH:mm', end: 'HH:mm' }[]` (when route notices may bypass quiet hours), `lateFeeRule: { graceDays, amountMinor, perDay }`, `quietHours: { start: 'HH:mm', end: 'HH:mm' }`, `weekStart: 0-6`, `workingDays: number[]`, `receiptPrefix`, `messagingStudentsEnabled: boolean`, `aiInsightsEnabled: boolean` (default false), `llmSummariesEnabled: boolean` (default false), `defaultGradingSchemeId`.

Indexes: `{ code: 1 } unique`, `{ organizationId: 1 }`.

### users
One login identity, which can hold several roles.

| Field | Type | Rules |
|---|---|---|
| name | string | required |
| email | string | lowercase, unique sparse |
| phone | string | E.164, unique sparse. At least one of email or phone is required. |
| passwordHash | string | argon2id, optional (OTP-only parents have none) |
| roles | `{ role: RoleKey, schoolId?, branchId?, scope: Scope }[]` | min 1 |
| staffId / studentId / guardianId | ObjectId | optional links |
| locale | string | default the school's first locale |
| visualMode | `'light' \| 'dark' \| 'system'` | default `system` |
| density | `'comfortable' \| 'compact'` | default `comfortable` |
| totp | `{ secret🔒, enabledAt, recoveryCodeHashes: string[] }` (SHA-256 of each unused recovery code) | required for `super_admin`, `school_admin`, `principal`, `accountant` |
| status | `'invited' \| 'active' \| 'locked' \| 'disabled'` | |
| lastLoginAt | Date | |
| failedLoginCount | number | lockout at 10; reset on a successful sign-in |
| lockedUntil | Date | set to now + 15 min at the 10th failed attempt; sign-in is refused until it passes |

`RoleKey = 'super_admin' | 'school_admin' | 'principal' | 'teacher' | 'student' | 'parent' | 'accountant' | 'librarian' | 'transport_manager'`
`Scope = 'platform' | 'school' | 'branch' | 'assigned' | 'route' | 'self' | 'ward'`

Indexes: `{ email: 1 } unique sparse`, `{ phone: 1 } unique sparse`, `{ 'roles.schoolId': 1, 'roles.role': 1 }`.

### sessions
Database sessions ([ADR-017](23-decision-log.md#adr-017-password-sign-in-writes-sessions-directly-without-authjs)): `sessionToken` (SHA-256 of the cookie token, unique), `userId`, `activeRole`, `activeSchoolId`, `expires` (the sliding idle expiry), `totpPending` (true between the password and the 2FA code; such a session grants no access and expires in 10 minutes), `ip`, `userAgent`. `createdAt` bounds the absolute lifetime. A TTL index on `expires`.

### flags
Feature flags ([20-devops-and-deployment.md](20-devops-and-deployment.md#cicd-pipeline)). `{ key, schoolId? , enabled, updatedBy }`. A document without `schoolId` is the platform default. A school-level document overrides it.
Indexes: `{ key: 1, schoolId: 1 } unique`.

### outboundMessages
`schoolId`, `channel: 'sms' | 'email'`, `to`, `template`, `subject?`, `body?` (kept only by the development provider), `status: 'sent' | 'failed' | 'skipped'`, `provider`, `error?`, `dedupeKey?`.
Indexes: `{ schoolId: 1, createdAt: -1 }`, `{ schoolId: 1, dedupeKey: 1 } unique` where `dedupeKey` is a string, and a 30-day TTL on `createdAt`.

### otpChallenges
`phone`, `codeHash` (HMAC-SHA-256 of phone and code, keyed with `AUTH_SECRET`), `attempts` (max 5), `sentAt`, `expiresAt` (5 min, TTL index), `purpose: 'login' | 'verify_phone'`. `users` also has `passwordReset: { tokenHash, expiresAt }` for the reset link.

## School structure

### branches
`schoolId`, `name`, `code` (unique per school), `address`, `phone`, `isDefault: boolean`.
Indexes: `{ schoolId: 1, code: 1 } unique`.

### academicYears
| Field | Type | Rules |
|---|---|---|
| schoolId | ObjectId | |
| label | string | `^\d{4}–\d{2}$`, e.g. `2026–27` |
| startDate / endDate | `YYYY-MM-DD` | end after start |
| status | `'planned' \| 'current' \| 'closed'` | exactly one `current` per school |
| terms | `{ _id, name, startDate, endDate }[]` | non-overlapping, within the year |

Indexes: `{ schoolId: 1, label: 1 } unique`, partial unique `{ schoolId: 1 }` where `status = 'current'`.

### classes
`schoolId`, `branchId`, `academicYearId`, `name` ("Class 7"), `order` (number, for promotion), `subjectIds: ObjectId[]`, `gradingSchemeId`.
Indexes: `{ schoolId: 1, branchId: 1, academicYearId: 1, order: 1 } unique`.

### sections
`schoolId`, `branchId`, `academicYearId`, `classId`, `name` ("B"), `displayName` ("7-B", derived), `classTeacherId: ObjectId<Staff>`, `capacity` (default 40), `room`.
Indexes: `{ schoolId: 1, classId: 1, name: 1 } unique`, `{ schoolId: 1, classTeacherId: 1 }`.

### subjects
`schoolId`, `name`, `code` (unique per school), `type: 'scholastic' | 'co_scholastic'`, `curriculum: { classId, units: { title, topics: { title, periodsPlanned }[] }[] }[]`.

### lessonPlans
`schoolId`, `sectionId`, `subjectId`, `teacherId`, `date`, `topic`, `objectives: string[]`, `activities`, `resources: FileRef[]`, `status: 'draft' | 'submitted' | 'approved' | 'delivered'`, `principalComment`.
Indexes: `{ schoolId: 1, teacherId: 1, date: -1 }`.

### periodDefinitions
`schoolId`, `branchId`, `dayPattern: 'mon_fri' | 'mon_sat'`, `periods: { number, label, start: 'HH:mm', end: 'HH:mm', isBreak }[]`.

### timetableSlots
| Field | Type | Rules |
|---|---|---|
| schoolId, branchId, academicYearId | ObjectId | |
| sectionId | ObjectId | |
| day | 1–7 | |
| period | number | exists in the period definitions |
| subjectId | ObjectId | |
| teacherId | ObjectId<Staff> | |
| room | string | optional |
| status | `'draft' \| 'published'` | |

Indexes: `{ schoolId: 1, academicYearId: 1, sectionId: 1, day: 1, period: 1 } unique` (a section can't have two subjects at once), and `{ schoolId: 1, academicYearId: 1, teacherId: 1, day: 1, period: 1 } unique, partialFilter status='published'` (a teacher can't be in two places at once).

### substitutions
`schoolId`, `date`, `timetableSlotId`, `originalTeacherId`, `substituteTeacherId`, `reason`.
Indexes: `{ schoolId: 1, date: 1, substituteTeacherId: 1 }`.

## People

### students
| Field | Type | Rules |
|---|---|---|
| schoolId, branchId | ObjectId | |
| admissionNo | string | unique per school, `{SCHOOLCODE}-{YYYY}-{00000}` |
| firstName, lastName | string | required, 1–60 chars |
| dob | `YYYY-MM-DD` | required, age 2–25 |
| gender | `'female' \| 'male' \| 'other' \| 'undisclosed'` | |
| photoKey | string | S3 key |
| bloodGroup | enum | optional |
| aadhaarNo🔒 | string | optional; only the last 4 digits are displayed |
| medical🔒 | `{ allergies, conditions, notes }` | visible to `school_admin`, `principal` and the class teacher only |
| address | Address | |
| guardianIds | ObjectId<Guardian>[] | min 1 |
| primaryGuardianId | ObjectId | in `guardianIds` |
| siblingGroupId | ObjectId | for sibling discounts |
| category | `'general' \| 'obc' \| 'sc' \| 'st' \| 'ews' \| 'other'` | optional, for reports |
| status | `'active' \| 'transferred' \| 'alumni' \| 'withdrawn'` | |
| userId | ObjectId<User> | optional (students under 10 usually have no login) |
| currentEnrollmentId | ObjectId | denormalised, for fast lookups |
| documents | DocumentRef[] | see below |
| consents | `{ purpose: 'core' \| 'photos_public' \| 'ai_insights', noticeVersion, givenByGuardianId, phone, at, ip, withdrawnAt? }[]` | `core` is required before activation ([16-auth-and-security.md](16-auth-and-security.md#data-privacy-dpdp-act-2023)) |
| leftOn, leavingReason | | set on transfer or withdrawal |
| tcNo | string | serial number of the transfer certificate (`TC/2026/0001`, from `counters` per school and calendar year); set on transfer out |

`DocumentRef = { _id, type: 'birth_certificate' | 'transfer_certificate_prev' | 'aadhaar' | 'photo' | 'report_card_prev' | 'medical' | 'tc' | 'bonafide' | 'other', key, fileName, mime, size, verifiedBy?, verifiedAt? }`. Allowed MIME types are PDF, JPEG, PNG and WEBP, up to 5 MB each.

Indexes: `{ schoolId: 1, admissionNo: 1 } unique`, `{ schoolId: 1, status: 1, lastName: 1, _id: 1 }` (the student list: filter by status, cursor over `lastName, _id`), and a text index on `{ firstName, lastName, admissionNo }` for search.

### guardians
`schoolId`, `name`, `relation: 'mother' | 'father' | 'guardian' | 'other'`, `phone` (E.164, required), `email`, `occupation`, `address`, `studentIds: ObjectId[]`, `userId`, `pendingContactReview: boolean`, `notificationPrefs: { channel: 'in_app' | 'email' | 'sms' | 'push', category: NotificationCategory, enabled }[]`.
Indexes: `{ schoolId: 1, phone: 1 }`, `{ schoolId: 1, studentIds: 1 }`.

### staff
| Field | Type | Rules |
|---|---|---|
| schoolId, branchId | ObjectId | |
| employeeNo | string | unique per school |
| name, dob, gender, phone, email, address | | |
| designation | string | e.g. "TGT Mathematics" |
| department | string | |
| type | `'teaching' \| 'non_teaching'` | |
| joinedOn | `YYYY-MM-DD` | |
| subjectIds | ObjectId[] | for teachers |
| qualifications | `{ degree, institution, year }[]` | |
| bank🔒 | `{ accountNo, ifsc, name }` | |
| pan🔒 | string | |
| salary | `{ components: { code, name, type: 'earning' \| 'deduction', amountMinor, formula? }[], effectiveFrom }` | readable by `accountant`, `principal` and `school_admin` only |
| leaveBalances | `{ leaveTypeCode, year, balance }[]` | |
| status | `'active' \| 'on_leave' \| 'resigned' \| 'terminated'` | |
| userId | ObjectId | |

Indexes: `{ schoolId: 1, employeeNo: 1 } unique`, `{ schoolId: 1, status: 1 }`.

### admissions
| Field | Type | Rules |
|---|---|---|
| schoolId, branchId, academicYearId | | |
| applicationNo | string | unique per school, `APP-{YYYY}-{00000}` |
| status | `'enquiry' \| 'applied' \| 'documents_pending' \| 'assessment' \| 'offered' \| 'accepted' \| 'rejected' \| 'withdrawn'` | follows the state machine below |
| applicant | `{ firstName, lastName, dob, gender, previousSchool, classSought }` | |
| guardians | `{ name, relation, phone, email }[]` | min 1 |
| documents | DocumentRef[] | |
| requiredDocuments | string[] | copied from school settings |
| assessment | `{ date, score, remarks }` | optional |
| source | `'walk_in' \| 'website' \| 'referral' \| 'campaign'` | |
| studentId | ObjectId | set on acceptance |
| history | `{ at, by, from, to, note }[]` | |

State machine: `enquiry → applied → documents_pending ↔ assessment → offered → accepted`. Any state can go to `rejected` or `withdrawn`. Acceptance creates the `Student`, the `Guardian`s and an `Enrollment` in one transaction.

Indexes: `{ schoolId: 1, applicationNo: 1 } unique`, `{ schoolId: 1, academicYearId: 1, status: 1 }`.

### enrollments
`schoolId`, `branchId`, `studentId`, `academicYearId`, `classId`, `sectionId`, `rollNo`, `status: 'active' | 'promoted' | 'detained' | 'transferred' | 'completed'`, `optionalSubjectIds`.
Indexes: `{ schoolId: 1, studentId: 1, academicYearId: 1 } unique`, `{ schoolId: 1, sectionId: 1, rollNo: 1 } unique`.

## Attendance

### attendanceRecords
One document per section per date (per period, in period mode). The marks are embedded, which makes a whole class one write and one read.

| Field | Type | Rules |
|---|---|---|
| schoolId, branchId, academicYearId | | |
| sectionId | ObjectId | |
| date | `YYYY-MM-DD` | not a holiday, not in the future |
| mode | `'daily' \| 'period'` | |
| period | number | required when `mode = 'period'` |
| subjectId | ObjectId | period mode only |
| takenBy | ObjectId<Staff> | |
| entries | `{ studentId, status: AttendanceStatus, source: 'manual' \| 'qr' \| 'biometric' \| 'import', note?, at }[]` | one per enrolled student |
| submittedAt | Date | |
| editedAfterSubmit | boolean | shows an "Edited" badge; the change is logged in the audit log |
| idempotencyKey | string | the key of the last accepted submission; a request repeating it returns the stored result without writing |

`AttendanceStatus = 'present' | 'absent' | 'late' | 'half_day' | 'leave' | 'holiday'`

Indexes: `{ schoolId: 1, sectionId: 1, date: 1, mode: 1, period: 1 } unique`, `{ schoolId: 1, 'entries.studentId': 1, date: -1 }`.

### attendanceMonthly
A rollup maintained by the worker (nightly, and on every correction), so attendance % never needs a scan of the daily records.
`schoolId`, `academicYearId`, `studentId`, `sectionId`, `month: 'YYYY-MM'`, `workingDays`, `counts: { present, absent, late, half_day, leave }`, `percent` (formula in [22-glossary.md](22-glossary.md#attendance)).
Indexes: `{ schoolId: 1, studentId: 1, month: 1 } unique`, `{ schoolId: 1, sectionId: 1, month: 1 }`, `{ schoolId: 1, academicYearId: 1, percent: 1 }` (the low-attendance report).

### staffAttendance
`schoolId`, `branchId`, `staffId`, `date`, `checkIn`, `checkOut`, `status: 'present' | 'absent' | 'half_day' | 'leave' | 'holiday'`, `source: 'manual' | 'qr' | 'biometric'`, `deviceId`.
Indexes: `{ schoolId: 1, staffId: 1, date: 1 } unique`.

### attendanceDevices (v2)
`schoolId`, `branchId`, `name`, `type: 'biometric' | 'qr_kiosk' | 'gps'`, `apiKeyHash`, `lastSeenAt`, `mappings: { deviceUserId, personType: 'staff' | 'student', personId }[]`. See [21-notifications-and-integrations.md](21-notifications-and-integrations.md#biometric-and-qr-attendance).

## Examinations

### gradingSchemes
`schoolId`, `name` ("CBSE 9-point"), `bands: { min, max, grade, gradePoint, descriptor }[]` (contiguous 0–100, non-overlapping), `passPercent`.

### exams
`schoolId`, `academicYearId`, `termId`, `name`, `type: 'unit_test' | 'term' | 'annual' | 'practical' | 'other'`, `weightage` (in the term result), `classIds`, `status: 'draft' | 'scheduled' | 'in_progress' | 'results_published'`.

### examSchedules
`schoolId`, `examId`, `classId`, `subjectId`, `date`, `start`, `end`, `maxMarks`, `passMarks`, `components: { name: 'theory' | 'practical' | 'internal', maxMarks }[]`, `status: 'scheduled' | 'marks_open' | 'submitted' | 'locked'`, `lockedBy`, `lockedAt`.
Indexes: `{ schoolId: 1, examId: 1, classId: 1, subjectId: 1 } unique`.

### marks
`schoolId`, `examScheduleId`, `studentId`, `sectionId`, `components: { name, marks }[]`, `total`, `isAbsent`, `grade` (derived), `enteredBy`, `updatedAt`.
Validation: each component is between 0 and its max, and `isAbsent` implies no marks.
Indexes: `{ schoolId: 1, examScheduleId: 1, studentId: 1 } unique`, `{ schoolId: 1, studentId: 1 }`.

### reportCards
`schoolId`, `studentId`, `academicYearId`, `termId?`, `sectionId` (the section the card was generated for), `examIds`, `snapshot` (the frozen subjects, marks, grades, attendance % and remarks at publish time), `classTeacherRemark`, `principalRemark`, `pdfKey`, `status: 'draft' | 'published' | 'withdrawn'`, `publishedAt`.
Indexes: `{ schoolId: 1, studentId: 1, academicYearId: 1, termId: 1 } unique`, `{ schoolId: 1, sectionId: 1 }`.

## Homework

### homework
`schoolId`, `sectionIds`, `subjectId`, `teacherId`, `title` (≤120), `instructions`, `attachments: FileRef[]`, `assignedOn`, `dueOn`, `graded: boolean`, `maxMarks?`, `allowLate: boolean`, `status: 'draft' | 'published' | 'closed'`.
Indexes: `{ schoolId: 1, sectionIds: 1, dueOn: -1 }`, `{ schoolId: 1, teacherId: 1, dueOn: -1 }`.

### submissions
`schoolId`, `homeworkId`, `studentId`, `text`, `attachments: FileRef[]` (up to 5, each ≤10 MB), `submittedAt`, `isLate`, `status: 'submitted' | 'returned' | 'evaluated'`, `evaluation: { marks?, feedback, evaluatedBy, evaluatedAt }`.
Indexes: `{ schoolId: 1, homeworkId: 1, studentId: 1 } unique`.

## Fees and finance

### feeHeads
`schoolId`, `name`, `code` (unique per school), `taxable: boolean`, `gstRate` (0, 5, 12 or 18), `refundable: boolean`.
Indexes: `{ schoolId: 1, code: 1 } unique`.

### feeStructures
`schoolId`, `academicYearId`, `classIds`, `name`, `lines: { feeHeadId, amountMinor }[]`, `installments: { _id, label, dueDate, percent }[]` (the percents sum to 100), `status: 'draft' | 'approved' | 'active'`, `approvedBy`.
Indexes: `{ schoolId: 1, academicYearId: 1 }` (the structures list).

### discounts
`schoolId`, `name`, `kind: 'sibling' | 'staff_ward' | 'early_payment' | 'custom'`, `type: 'percent' | 'fixed'`, `value`, `feeHeadIds`, `rule` (e.g. `{ siblingOrder: 2 }`), `active`.

### scholarships
`schoolId`, `studentId`, `academicYearId`, `name`, `type: 'percent' | 'fixed'`, `value`, `feeHeadIds`, `status: 'nominated' | 'applied' | 'approved' | 'rejected'`, `nominatedBy`, `approvedBy`, `documents`.

### invoices
| Field | Type | Rules |
|---|---|---|
| schoolId, branchId, academicYearId | | |
| invoiceNo | string | unique per school, `INV/{YYYY-YY}/{000000}` |
| studentId | ObjectId | |
| feeStructureId, installmentId | ObjectId | |
| installmentLabel | string | copied from the installment at issue time, so lists don't need the structure |
| lines | `{ feeHeadId, description, amountMinor, taxMinor }[]` | |
| concessions | `{ source: 'discount' \| 'scholarship', refId, description, amountMinor }[]` | |
| lateFeeMinor | number | |
| totalMinor | number | = Σ lines + tax − concessions + late fee |
| paidMinor | number | |
| balanceMinor | number | derived, = total − paid |
| dueDate | `YYYY-MM-DD` | |
| status | `'draft' \| 'issued' \| 'partially_paid' \| 'paid' \| 'overdue' \| 'void'` | |

Indexes: `{ schoolId: 1, invoiceNo: 1 } unique`, `{ schoolId: 1, studentId: 1, status: 1 }`, `{ schoolId: 1, status: 1, dueDate: 1 }` (the dues report), `{ schoolId: 1, studentId: 1, installmentId: 1 } unique` (no double billing).

### payments
| Field | Type | Rules |
|---|---|---|
| schoolId, branchId | | |
| receiptNo | string | unique per school, gap-free per academic year, generated through the `counters` collection |
| studentId, payerGuardianId | | |
| allocations | `{ invoiceId, amountMinor }[]` | Σ allocations + `advanceMinor` = `amountMinor` |
| advanceMinor | number | default 0 |
| amountMinor | number | > 0 |
| method | `'cash' \| 'cheque' \| 'upi' \| 'card' \| 'netbanking' \| 'bank_transfer' \| 'online'` | |
| gateway | `{ provider: 'razorpay' \| 'stripe', orderId, paymentId, signatureVerified }` | online payments only |
| chequeNo, bankName | | cheque only |
| reference | string | the UPI, card or bank reference typed at the counter (≤ 40) |
| note | string | optional, ≤ 200 |
| status | `'pending' \| 'captured' \| 'failed' \| 'refunded' \| 'partially_refunded'` | |
| refunds | `{ amountMinor, reason, approvedBy, gatewayRefundId, at }[]` | |
| collectedBy | ObjectId<User> | |
| idempotencyKey | string | unique per school |

Receipts are immutable once `captured`. Nothing may change `amountMinor`, `allocations` or `receiptNo` after capture.
Indexes: `{ schoolId: 1, receiptNo: 1 } unique`, `{ schoolId: 1, idempotencyKey: 1 } unique`, `{ 'gateway.paymentId': 1 } unique sparse`, `{ schoolId: 1, createdAt: -1 }`.

Unallocated money (an online capture for invoices that were meanwhile paid at the counter) is kept as `advanceMinor` on the payment, and is shown to the accountant for allocation to the next invoice or a refund.

### paymentOrders
Gateway orders created at checkout, reused while pending so a retry never creates a second charge. `schoolId`, `provider` (`dev` until a gateway is connected), `orderId` (unique), `studentId`, `paymentId?`, `error?`, `invoiceIds` (sorted), `invoiceSetHash`, `amountMinor`, `guardianId`, `status: 'created' | 'paid' | 'expired' | 'failed'`, `expiresAt` (30 min).
Indexes: `{ orderId: 1 } unique`, `{ schoolId: 1, invoiceSetHash: 1, status: 1 }`.

### webhookEvents
Every verified inbound webhook, stored before processing ([21-notifications-and-integrations.md](21-notifications-and-integrations.md#webhooks-inbound)). `provider: 'razorpay' | 'stripe' | 'msg91' | 'ses'`, `eventId` (unique per provider), `type`, `payload`, `receivedAt`, `processedAt?`, `error?`, `attempts`.
Indexes: `{ provider: 1, eventId: 1 } unique`, `{ processedAt: 1 }` (partial, where unprocessed). A TTL of 180 days.

### counters
`{ _id: '{schoolId}:{kind}:{year}', seq }`, used with `findOneAndUpdate` + `$inc` for gap-free receipt, invoice, admission and application numbers.

## Communication

### announcements
`schoolId`, `kind: 'announcement' | 'notice'`, `title` (≤120), `body` (sanitised Markdown, ≤5,000), `attachments`, `audience: { type: 'school' | 'branch' | 'class' | 'section' | 'role', ids: ObjectId[], roles?: RoleKey[] }`, `channels: ('in_app' | 'email' | 'sms' | 'push')[]`, `requiresAck: boolean`, `acks: { userId, at }[]`, `publishAt`, `expiresAt`, `status: 'draft' | 'scheduled' | 'published' | 'archived'`, `authorId`.
Indexes: `{ schoolId: 1, status: 1, publishAt: -1 }`, `{ schoolId: 1, 'audience.ids': 1 }`.

### threads and messages
`threads`: `schoolId`, `participantIds: ObjectId<User>[]` (2–10), `studentId?` (context), `subject`, `lastMessageAt`, `unreadBy: { userId, count }[]`.
`messages`: `schoolId`, `threadId`, `senderId`, `body` (≤2,000), `attachments`, `sentAt`, `heldUntil?` (quiet hours).
Indexes: `{ schoolId: 1, participantIds: 1, lastMessageAt: -1 }`, `{ threadId: 1, sentAt: 1 }`.

### notifications
`schoolId`, `userId`, `category: NotificationCategory`, `title`, `body`, `link` (an app URL), `readAt`, `deliveries: { channel, status: 'queued' | 'sent' | 'failed' | 'skipped', providerId?, error?, at }[]`, `dedupeKey`.
`NotificationCategory = 'attendance' | 'fees' | 'exams' | 'homework' | 'announcements' | 'messages' | 'transport' | 'library' | 'approvals' | 'system'`
Indexes: `{ schoolId: 1, userId: 1, readAt: 1, createdAt: -1 }`, `{ dedupeKey: 1 } unique sparse`, a TTL on `createdAt` of 180 days.

### pushSubscriptions
`userId`, `endpoint` (unique), `keys: { p256dh, auth }`, `userAgent`, `createdAt`, `lastSuccessAt`, `failures`. Removed after 3 consecutive `410 Gone` responses.
Indexes: `{ endpoint: 1 } unique`, `{ userId: 1 }`.

### ptmEvents and ptmSlots
`ptmEvents`: `schoolId`, `title`, `date`, `sectionIds`, `slotMinutes` (5–30), `mode: 'in_person' | 'online'`, `status`.
`ptmSlots`: `schoolId`, `ptmEventId`, `teacherId`, `start`, `end`, `bookedByGuardianId?`, `studentId?`, `meetingUrl?`, `notes`.
Indexes: `{ schoolId: 1, ptmEventId: 1, teacherId: 1, start: 1 } unique`, and a partial unique `{ ptmEventId: 1, studentId: 1, teacherId: 1 }` (one booking per child per teacher).

## Operations

### books, bookCopies, loans
`books`: `schoolId`, `isbn`, `title`, `authors`, `publisher`, `year`, `subjects`, `shelf`, `coverKey`.
`bookCopies`: `schoolId`, `bookId`, `accessionNo` (unique per school, barcoded), `status: 'available' | 'on_loan' | 'lost' | 'damaged' | 'withdrawn'`.
`loans`: `schoolId`, `copyId`, `memberType: 'student' | 'staff'`, `memberId`, `issuedOn`, `dueOn`, `returnedOn`, `fineMinor`, `finePaid`.
Indexes: `{ schoolId: 1, accessionNo: 1 } unique`, `{ schoolId: 1, memberId: 1, returnedOn: 1 }`, `{ schoolId: 1, dueOn: 1, returnedOn: 1 }`, and a text index on `books.title` and `authors`.

### vehicles, routes, stops, transportAssignments
`vehicles`: `schoolId`, `registrationNo` (unique), `capacity`, `driver: { name, phone, licenseNo, licenseExpiry }`, `attendant`, `documents: { type: 'insurance' | 'fitness' | 'permit' | 'puc', expiresOn, key }[]`, `gpsDeviceId?`.
`routes`: `schoolId`, `name`, `vehicleId`, `shift: 'morning' | 'afternoon'`, `stopIds` (ordered).
`stops`: `schoolId`, `name`, `location: GeoJSON Point`, `pickupTime`, `dropTime`, `feeZone`.
`transportAssignments`: `schoolId`, `academicYearId`, `studentId`, `routeId`, `stopId`, `feeHeadId`, `startDate`, `endDate`.
`vehiclePings` (v2): a time-series collection with `{ vehicleId, at, location, speed }` and a 7-day TTL.
Indexes: `stops.location 2dsphere`, `{ schoolId: 1, academicYearId: 1, studentId: 1 } unique` on assignments, `{ schoolId: 1, routeId: 1 }`.

### hostels, rooms, hostelAllocations
`hostels`: `schoolId`, `name`, `gender`, `wardenStaffIds`.
`rooms`: `schoolId`, `hostelId`, `number`, `beds`.
`hostelAllocations`: `schoolId`, `academicYearId`, `studentId`, `roomId`, `bed`, `from`, `to`.
Indexes: `{ schoolId: 1, roomId: 1, bed: 1, to: 1 }`.

### inventoryItems, stockMovements
`inventoryItems`: `schoolId`, `branchId`, `sku`, `name`, `category`, `unit`, `reorderLevel`, `quantity` (derived and cached).
`stockMovements`: `schoolId`, `itemId`, `type: 'in' | 'out' | 'adjust'`, `quantity`, `reason`, `requestedBy`, `approvedBy`, `at`.

## Calendar

### events
`schoolId`, `branchId?`, `title`, `type: 'academic' | 'exam' | 'ptm' | 'sports' | 'cultural' | 'holiday' | 'other'`, `start`, `end`, `allDay`, `audience` (same shape as announcements), `linked: { kind, id }?`.

### holidays
`schoolId`, `date`, `name`, `branchIds?` (default all).
Indexes: `{ schoolId: 1, date: 1 }`.

## HR

### leaveTypes
`schoolId`, `code` (`CL`, `SL`, `EL`, `LOP`), `name`, `annualQuota`, `carryForward`, `appliesTo: 'staff' | 'student'`.

### leaveRequests
`schoolId`, `requesterType: 'staff' | 'student'`, `requesterId`, `leaveTypeCode`, `from`, `to`, `halfDay`, `reason`, `attachmentKey`, `status: 'pending' | 'approved' | 'rejected' | 'cancelled'`, `approvals: { level, approverId, decision, comment, at }[]`.
Approval chain: staff → principal. Students → class teacher (the parent submits).
Indexes: `{ schoolId: 1, status: 1, from: 1 }`, `{ schoolId: 1, requesterId: 1, from: -1 }`.

### payrollRuns and payslips
`payrollRuns`: `schoolId`, `branchId`, `month: 'YYYY-MM'`, `status: 'draft' | 'computed' | 'approved' | 'paid'`, `totals`, `approvedBy`.
`payslips`: `schoolId`, `payrollRunId`, `staffId`, `workingDays`, `lopDays`, `earnings: { code, amountMinor }[]`, `deductions: { code, amountMinor }[]`, `netMinor`, `pdfKey`.
Indexes: `{ schoolId: 1, branchId: 1, month: 1 } unique`, `{ schoolId: 1, staffId: 1, payrollRunId: 1 } unique`.

### appraisals
`schoolId`, `staffId`, `cycle` ("2026–27"), `goals: { title, weight, selfRating, reviewerRating, comment }[]`, `status: 'goal_setting' | 'self_review' | 'manager_review' | 'closed'`, `reviewerId`.

## Platform operations

### auditLogs
Append-only. There is no update or delete permission for any role, and the app DB user has only `insert` and `find` on this collection.
`schoolId`, `actorId`, `actorRole`, `action` (a permission string, e.g. `fees.refund.approve`), `entity: { type, id }`, `before`, `after` (a changed-fields diff, with 🔒 fields redacted), `ip`, `userAgent`, `requestId`, `reason?`, `at`.
Indexes: `{ schoolId: 1, at: -1 }`, `{ schoolId: 1, 'entity.type': 1, 'entity.id': 1, at: -1 }`, `{ schoolId: 1, actorId: 1, at: -1 }`. Retention is 7 years (tiered to cold storage after 1 year).

### importJobs
`schoolId`, `kind: 'students' | 'guardians' | 'staff' | 'fees_opening_balance' | 'marks' | 'books'`, `fileKey`, `status: 'uploaded' | 'validating' | 'validated' | 'importing' | 'done' | 'failed'`, `totalRows`, `validRows`, `errors: { row, field, message }[]` (the first 1,000; the rest go to an error file), `errorFileKey`, `dryRun`, `startedBy`.

### dataRequests
DPDP data principal requests. `schoolId`, `studentId`, `requestedBy` (a guardian's userId or the school_admin), `type: 'access' | 'correction' | 'erasure'`, `details`, `status: 'open' | 'in_progress' | 'completed' | 'rejected'`, `dueBy` (+30 days), `resolution`, `exportKey?`.
Indexes: `{ schoolId: 1, status: 1, dueBy: 1 }`.

### riskScores (v2)
`schoolId`, `studentId`, `academicYearId`, `computedOn`, `score` (0–100), `level: 'low' | 'medium' | 'high'`, `factors: { key: 'attendance' | 'marks_trend' | 'homework' | 'fees', value, weight, contribution, explanation }[]`, `summary?` (LLM text, when enabled), `acknowledgedBy?`, `acknowledgedAt?`, `followUp?: { assigneeId, note, dueOn, status: 'open' \| 'done' }`.
Indexes: `{ schoolId: 1, academicYearId: 1, level: 1, score: -1 }`, `{ schoolId: 1, studentId: 1, computedOn: -1 }`.

## Shared sub-schemas

- `Address = { line1, line2?, city, state, pincode (^\d{6}$ for IN), country }`
- `FileRef = { key, fileName, mime, size }` (the S3 key is tenant-prefixed: `{schoolId}/{module}/{uuid}`)
- `Money` fields always end in `Minor`.

## Data lifecycle

| Data | Retention | On student exit |
|---|---|---|
| Student profile, enrollments, report cards | Permanent (academic record) | Status changes to `transferred` or `alumni`, and the record is kept |
| Medical, Aadhaar 🔒 | Until exit + 1 year | Purged by a scheduled job |
| Attendance, homework submissions | 3 years after exit | Archived to S3, then deleted |
| Invoices, payments | 8 years (tax law) | Kept |
| Notifications | 180 days | TTL |
| Audit logs | 7 years | Kept |

Also see [16-auth-and-security.md](16-auth-and-security.md#data-privacy-dpdp-act-2023) and [19-performance-and-scalability.md](19-performance-and-scalability.md#indexing-rules).

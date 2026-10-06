# 15 · API Specification

Every Server Action and Route Handler in Vidyawan: its permission, input, output and errors. Permission strings come from [02-personas-and-roles.md](02-personas-and-roles.md#permission-model). Shapes use the entities in [14-data-model.md](14-data-model.md). Enforcement is described in [16-auth-and-security.md](16-auth-and-security.md#authorization-rbac).

## Conventions

### When to use which
| Use | Mechanism | Location |
|---|---|---|
| Mutations from the Vidyawan UI | **Server Action** | `src/server/modules/{module}/actions.ts` |
| Reads for pages | **Server-side query functions** called by RSC (not HTTP) | `src/server/modules/{module}/queries.ts` |
| Client-side reads (autosuggest, polling, infinite lists) | **Route Handler** `GET /api/v1/...` | `src/app/api/v1/...` |
| Webhooks, file exports, PWA sync, device ingestion, public verification | **Route Handler** | `src/app/api/...` |

### Server Action contract
```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; fieldErrors?: Record<string, string>; requestId: string } };
```
Every action: `getContext()` → `requirePermission(perm, resource?)` → `schema.parse(input)` → service → audit → `updateTag`/`revalidatePath` → `ActionResult`. Actions never throw to the client; unexpected errors become `INTERNAL`.

### REST contract (`/api/v1`)
- JSON only; `Content-Type: application/json; charset=utf-8`.
- Auth: session cookie (browser/PWA) or `Authorization: Bearer <device key>` (attendance devices only).
- Success: `200 { data, nextCursor? }`, `201 { data }` for creates.
- Error: `{ error: { code, message, fieldErrors?, requestId } }` with the HTTP status below.
- Pagination: cursor-based: `?cursor=<opaque>&limit=25` (max 100). The response has `nextCursor: string | null` ([19-performance-and-scalability.md](19-performance-and-scalability.md#pagination)).
- Idempotency: `Idempotency-Key` header required on POSTs that create money or messages. The key is stored for 24 h.
- Versioning: the `/api/v1` path; breaking changes go in `/v2`.

### Error codes
| Code | HTTP | Meaning | UI treatment |
|---|---|---|---|
| `VALIDATION` | 400 | Zod failure; `fieldErrors` set | Field errors + form summary |
| `UNAUTHENTICATED` | 401 | No or expired session | Redirect to sign in, draft kept |
| `FORBIDDEN` | 403 | Missing permission or out of scope | 403 state |
| `NOT_FOUND` | 404 | Not found in this tenant (a cross-tenant ID also returns 404, never 403) | 404 state |
| `CONFLICT` | 409 | Unique violation, stale version, slot taken, clash | Specific message |
| `BUSINESS_RULE` | 422 | A domain rule broke (leave balance, marks locked, receipt immutable) | Specific message from `message` |
| `RATE_LIMITED` | 429 | Too many requests; `Retry-After` header | "Try again in N minutes" |
| `PAYMENT_FAILED` | 402 | Gateway declined | Payment error copy |
| `INTERNAL` | 500 | Unexpected; logged with `requestId` | Generic error + reference |
| `UNAVAILABLE` | 503 | A dependency is down (gateway, SMS) | Retry message |

Messages are i18n keys resolved on the server into the user's locale ([12-content-and-microcopy.md](12-content-and-microcopy.md#error-messages)).

### Common types
```ts
type Id = string;                // ObjectId hex
type DateStr = `${number}-${number}-${number}`;   // YYYY-MM-DD
type Money = { amountMinor: number; currency: 'INR' | string };
type Page<T> = { data: T[]; nextCursor: string | null };
```

---

## 1. Auth and session

**Messaging and account recovery, built on 2026-10-06.** No SMS or email provider is connected yet. `sendMessages` (`src/server/messaging/send.ts`) has one provider, `dev`, which records each message in `outboundMessages` instead of delivering it; `/outbox` (`messaging.outbox.read`, school admin) lists them so a code or link can be read while testing. In production the `dev` provider keeps no message body and marks the message `skipped`. Real providers plug in at that one function.
- `requestPasswordReset({ email })` always answers the same way. For an active account it stores the SHA-256 of a random token for 30 minutes and emails `/reset-password?token=…`. `resetPassword({ token, next, confirm })` consumes the token atomically, sets the password, clears any lockout and deletes the user's sessions. Pages: `/forgot-password`, `/reset-password`.
- `requestOtpCode({ phone })` and `signInWithOtp({ phone, code })` (`/signin/otp`) are for the `parent` and `student` roles only. The 6-digit code is stored as an HMAC keyed with `AUTH_SECRET`, lasts 5 minutes, allows 5 attempts (counted atomically) and one new code per minute; a number without an account gets the same answer and no message. A parent's account gets the guardian's phone when it is created.
- **Google sign-in for staff** (`GET /api/auth/google`, `GET /api/auth/google/callback`) is on only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set; the button appears with it. It is the authorization-code flow with `state`, `nonce` and PKCE held in a 10-minute httpOnly cookie. The ID token's `iss`, `aud`, `nonce`, `exp` and `email_verified` are checked. The address must belong to an active staff account (never `parent` or `student`), and to one of the school's `allowedGoogleDomains` when that list is set. Two-step verification still applies. **Not yet run against Google**: there are no keys.
- **Role switcher:** `switchRole(role)` works for a role the user holds in the current school. The session is replaced; moving to a role that needs two-step verification asks for the code again. The user menu lists the other roles. There is no screen yet to give a user a second role (the seed gives `teacher2` one), and no school switcher.
- **Invitations:** `createUser` also emails the new user a link to choose their password (the reset link with a 72-hour life, template `invite`). The temporary password is still shown once to the admin.
- Not built: rate limits per IP, the breached-password check.

**Built on 2026-10-05:** `changePassword({ current, next, confirm })` checks the current password, requires at least 10 characters, stores an argon2id hash, deletes every other session of the user and is audited as `auth.password.change`. The breached-password check is not built. `setDensity('comfortable' | 'compact')` saves `User.density` and the `vw.density` cookie. Both need only a signed-in user. The screen is `/profile`.

| Name | Type | Permission | Input | Output | Errors |
|---|---|---|---|---|---|
| `signInWithPassword` | Action | public | `FormData { email, password }` | The session cookie. The sign-in page then re-renders and redirects to its `?next=` (same-site paths only) or the dashboard | `VALIDATION`, `UNAUTHENTICATED` (the same message for a wrong password, an unknown email and a disabled user), `RATE_LIMITED` (locked) |
| `signOut` | Action | self | — | `{}` (deletes the session and the cookie) | — |
| `setVisualMode` | Action | self | `'light' \| 'dark' \| 'system'` | `{}` (saves `User.visualMode` and the `vw.mode` cookie mirror) | `VALIDATION`, `UNAUTHENTICATED` |
| `POST /api/auth/*` | Route (Auth.js) | public | Google OAuth | Session cookie | `UNAUTHENTICATED`, `RATE_LIMITED` |
| `requestOtp` | Action | public | `{ phone: string }` | `{ resendInSeconds: 30 }` (always the same, no enumeration) | `RATE_LIMITED` |
| `verifyOtp` | Action | public | `{ phone, code: string(6) }` | `{ redirectTo }` | `VALIDATION`, `RATE_LIMITED` |
| `confirmTotp` | Action | a session waiting for 2FA | `code` (6 digits) | `{ recoveryCodes: string[10] }`; turns 2FA on. The QR code and key are rendered by `/signin/2fa`, which reuses an unconfirmed secret | `VALIDATION`, `RATE_LIMITED` |
| `completeTotpSetup` | Action | a session waiting for 2FA, with 2FA on | — | A new full session cookie (called once the user has saved the recovery codes) | `FORBIDDEN` |
| `verifyTotp` | Action | a session waiting for 2FA | `FormData { code }` (a 6-digit code or a recovery code) | A new full session cookie; `/signin/2fa` then redirects to `?next=` | `UNAUTHENTICATED`, `RATE_LIMITED` |
| `switchRole` | Action | self | `{ role: RoleKey, schoolId: Id }` | `{ redirectTo }` | `FORBIDDEN` |
| `revokeSession` | Action | self | `{ sessionId }` | `{}` | `NOT_FOUND` |
| `inviteUser` | Action | `users.user.create` | `{ name, email?, phone?, role, scope, branchId? }` | `{ userId }` | `CONFLICT` (exists) |
| `updateRoles` | Action | `users.user.update` | `{ userId, roles: RoleAssignment[] }` | `{}` | `BUSINESS_RULE` (can't remove the last school_admin) |

## 2. Students and admissions

**Built on 2026-10-05:**
- `updateStudent({ id, version, firstName, lastName, dob, gender, bloodGroup?, address })` needs `sis.student.update`. `version` is the record's `updatedAt` when the form opened; a newer save gives `CONFLICT`. Section, roll number and guardians are not editable yet.
- `withdrawStudent({ id, reason })` needs `sis.student.update`, works only on an `active` student, sets `status: 'withdrawn'`, `leftOn` and `leavingReason`, and closes the enrollment as `transferred`, in one transaction.
- The student profile has **Attendance** (last 60 days; needs `attendance.record.read`) and **Fees** (invoices, receipts and balance due; needs `fees.invoice.read`) tabs.
- `updateGuardian({ studentId, guardianId, name, relation, phone, email? })` needs `sis.student.update`. The guardian must belong to that student; a phone already used by another guardian of the school gives `CONFLICT`; a linked parent account's phone follows the change.
- `transferStudent({ id, sectionId })` needs `sis.student.update`: moves an active student to another section of the same academic year and gives the section's next roll number, in one transaction. Attendance already taken stays with the old section.
- Admissions (`sis.admission.read` to view, `sis.admission.update` to change): `createAdmission(...)` issues `APP-{YYYY}-{00000}` from `counters` (unique, not gap-free) at stage `enquiry`; `moveAdmission({ id, to, note? })` follows the state machine in the data model and gives `BUSINESS_RULE` for a skipped or repeated move; `acceptAdmission({ id, sectionId, address })` works only from `offered`, needs a section of the class sought, and creates the student, guardian and enrollment and closes the application in one transaction. Documents, the assessment score and the online form are not built.
- `importStudents({ csv, dryRun })` needs `sis.student.import`. The header row must match the template. Every row is validated with the Add student rules; any error means nothing is written and the errors come back as `{ row, field, message }` (the first 100). A clean file is written in one transaction. It runs in the request and is capped at 500 rows; `importJobs`, the worker and the error file are not built.

| Name | Type | Permission | Input | Output |
|---|---|---|---|---|
| `GET /api/v1/students/search?q=` | Route | `sis.student.read` | `q` (≥ 2 chars), `limit≤10` | `{ data: { id, name, admissionNo, classSection, photoUrl, guardianName }[] }` |
| `GET /api/v1/students?filter=&sort=&cursor=` | Route | `sis.student.read` (scope-filtered) | PropertyFilter query | `Page<StudentRow>` |
| `createStudent` | Action | `sis.student.create` | `StudentInput` (below) | `{ id, admissionNo, name }`. One transaction: the admission number from `counters`, guardians linked by phone or created, the enrollment with the next roll number. Audited. `NOT_FOUND` for a section outside the tenant, `CONFLICT` on a concurrent roll-number clash |
| `updateStudent` | Action | `sis.student.update` | `{ id, version, patch: Partial<StudentInput> }` | `{ version }` · `CONFLICT` if stale |
| `uploadDocument` | Action | `sis.document.create` | `{ studentId, type, fileKey }` (after a presigned PUT) | `{ documentId }` |
| `verifyDocument` | Action | `sis.document.update` | `{ studentId, documentId }` | `{}` |
| `revealSensitive` | Action | `sis.student.read` + role ∈ {school_admin, principal, class teacher} | `{ studentId, field: 'aadhaarNo' \| 'medical' }` | `{ value }` (audited as a sensitive read) |
| `createAdmission` | Action | `sis.admission.create` | `AdmissionInput` | `{ id, applicationNo }` |
| `POST /api/v1/public/apply/{schoolCode}` | Route | public, rate-limited, CAPTCHA-free (honeypot + rate limit) | `AdmissionInput` | `201 { applicationNo, resumeToken }` |
| `transitionAdmission` | Action | `sis.admission.update` (`approve` for `offered` if the setting requires it) | `{ id, to: AdmissionStatus, note? }` | `{ status }` · `BUSINESS_RULE` for an invalid transition |
| `acceptAdmission` | Action | `sis.admission.approve` | `{ id, sectionId, feeStructureId }` | `{ studentId, admissionNo, enrollmentId, invoiceIds }` (one transaction) |
| `transferSection` | Action | `sis.enrollment.update` | `{ studentId, toSectionId, effectiveDate }` | `{}` |
| `promoteStudents` | Action | `sis.enrollment.update` | `{ fromAcademicYearId, toAcademicYearId, decisions: { studentId, action: 'promote' \| 'detain' \| 'graduate' \| 'leave', toSectionId?, reason? }[] }` | `{ promoted, detained, graduated }` |
| `transferOut` | Action | `sis.student.update` + `sis.certificate.approve` (principal) | `{ studentId, leavingDate, reason, duesOverrideReason? }` | `{ tcDocumentId }` · `BUSINESS_RULE` for dues without an override |
| `issueCertificate` | Action | `sis.certificate.create` | `{ studentId, type: 'bonafide' \| 'character' }` | `{ documentId, verifyUrl }` |

```ts
const StudentInput = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().max(60).default(''),
  dob: DateStr,
  gender: z.enum(['female', 'male', 'other', 'undisclosed']),
  branchId: Id,
  sectionId: Id,
  guardians: z.array(z.object({
    id: Id.optional(),
    name: z.string().min(1).max(120),
    relation: z.enum(['mother', 'father', 'guardian', 'other']),
    phone: PhoneIN,
    email: z.string().email().optional(),
  })).min(1).max(4),
  primaryGuardianIndex: z.number().int().min(0),
  address: Address,
  bloodGroup: BloodGroup.optional(),
  aadhaarNo: z.string().regex(/^\d{12}$/).optional(),
  category: StudentCategory.optional(),
});
```
**Built so far:** `branchId` is taken from the section rather than the input; `phone` is entered as 10 digits and stored as E.164; `aadhaarNo` and `category` are not accepted yet (Aadhaar waits for field-level encryption); the form sends one guardian.

## 3. Staff and HR

**Staff attendance, built on 2026-10-05:** `submitStaffAttendance({ date, entries: { staffId, status }[] })` needs `hr.attendance.update` (school admin); reading needs `hr.attendance.read` (school admin, principal). One record per staff member per day, upserted, so saving again changes the marks. Refused on a future date, a holiday or a non-working day, and for anyone outside the school's active staff. On an unsaved day, staff with approved leave covering it start as `leave` (or `half_day`). `/staff/attendance?date=`. Not built: self check-in, QR, check-in and check-out times, a monthly staff register.

**Leave, built on 2026-10-05:** `applyLeave({ leaveTypeCode, from, to, halfDay?, reason })` needs `hr.leave.create` and a staff record; overlapping pending or approved requests give `BUSINESS_RULE`. Leave types are the fixed codes `CL` (12 days a year), `SL` (10), `EL` (15) and `LOP` (no limit); the allowances are constants until `leaveTypes` is built. A balance is computed, not stored: allowance minus the approved and pending days of the current academic year. A request for more than is left gives `BUSINESS_RULE`. `/leave` shows the balances to staff. `decideLeave({ id, decision, comment? })` needs `hr.leave.approve` (principal and school admin), works once on a pending request and never on the approver's own. `cancelLeave(id)` withdraws the requester's own pending request. `/leave` lists own requests for staff and all staff requests for approvers (`hr.leave.read`), filtered by status in the URL. Not built: attachments, substitutions, a notification to the requester, student leave.

**Built on 2026-10-05:** `updateStaff({ id, name, designation, department?, type, phone, email?, joinedOn, status })` needs `hr.staff.update` and is audited. It is last-write-wins (no version check). The screen is `/staff/[id]/edit`, opened from the name in the staff table.

| Name | Type | Permission | Input | Output |
|---|---|---|---|---|
| `createStaff` / `updateStaff` | Action | `hr.staff.create/update` | `StaffInput` | `{ id, employeeNo }` |
| | | | **Built so far:** `createStaff({ name, designation, department?, type, phone, email?, joinedOn })` returns `{ name, employeeNo }`; the employee number (`EMP-0001`) comes from `counters` and is unique per school but not gap-free. `/staff` lists staff by name with cursor pagination. `assignClassTeacher({ sectionId, staffId \| null })` needs `academics.class.create`, accepts only active teaching staff of the same school and is audited; it decides who may take that section's daily attendance. Not built: `updateStaff`, staff profiles, user accounts for staff, staff attendance, leave, payroll | |
| `checkIn` | Action | `hr.attendance.create` (self) | `{ method: 'manual' \| 'qr', qrToken? }` | `{ checkIn }` · `BUSINESS_RULE` if already checked in |
| `applyLeave` | Action | `hr.leave.create` (self) | `{ leaveTypeCode, from, to, halfDay?, reason, attachmentKey? }` | `{ id, status: 'pending' }` · `BUSINESS_RULE` for insufficient balance |
| `decideLeave` | Action | `hr.leave.approve` | `{ id, decision: 'approved' \| 'rejected', comment?, substitutions?: { timetableSlotId, date, substituteTeacherId }[] }` | `{}` |
| `GET /api/v1/timetable/free-teachers?date=&period=` | Route | `academics.timetable.read` | — | `{ data: { teacherId, name, sameSubject: boolean }[] }` |
| `computePayroll` | Action | `hr.payroll.create` | `{ branchId, month: 'YYYY-MM' }` | `{ payrollRunId, exceptions: { staffId, issue }[] }` (the job runs async; the status is polled) |
| `approvePayroll` / `markPayrollPaid` | Action | `hr.payroll.approve` / `hr.payroll.publish` | `{ payrollRunId }` | `{ bankFileUrl? }` |
| `GET /api/v1/payslips/{id}/pdf` | Route | self or `hr.payroll.read` | — | `302` → a presigned S3 URL (60 s) |

## 4. Academics

**Built on 2026-10-05:**
- `upsertSubject({ name, code, type })` needs `academics.class.create`; creates only; `CONFLICT` when the code is taken in the school.
- `upsertTimetableSlot({ sectionId, day, period, subjectId, teacherId })` and `clearTimetableSlot({ sectionId, day, period })` need `academics.timetable.update`; reading needs `academics.timetable.read`. A slot is saved as `published` at once (no draft and publish step). The unique index on teacher, day and period turns a double booking into `CONFLICT`. Clearing is a hard delete, because a soft-deleted slot would keep its place in the unique index.
- Periods come from the bell schedule in Settings (see section 13).
- A teacher with a staff record sees "Your classes today" on the home page. Substitutions are not built, and a teacher's `assigned` scope for the student list is still the class-teacher section only.

| Name | Type | Permission | Input | Output |
|---|---|---|---|---|
| `createAcademicYear` / `closeAcademicYear` | Action | `settings.academicYear.create` / `.approve` | `{ label, startDate, endDate, terms[] }` / `{ id }` | `{ id }` / `{ blockers: Blocker[] }` or `{}` |
| `upsertClass`, `upsertSection`, `upsertSubject` | Action | `academics.class.*` etc. | per schema | `{ id }` |
| | | | **Built so far:** `upsertClass({ name, order })` and `upsertSection({ classId, name, capacity, room? })` create only (no edit yet), need `academics.class.create`, return `{ id, name }`, are audited, and give `CONFLICT` for a class order or section name already used and `NOT_FOUND` for a class outside the tenant | |
| `setTimetableSlot` | Action | `academics.timetable.update` | `{ sectionId, day, period, subjectId, teacherId, room? }` | `{ id }` · `CONFLICT { clash: { type: 'teacher' \| 'section', with: string } }` |
| `generateTimetable` | Action | `academics.timetable.create` | `{ academicYearId, branchId, constraints }` | `{ jobId }` |
| `GET /api/v1/jobs/{jobId}` | Route | owner of the job | — | `{ status, progress, result?, error? }` |
| `publishTimetable` | Action | `academics.timetable.publish` | `{ academicYearId, branchId }` | `{ notified: number }` |
| `saveLessonPlan` / `reviewLessonPlan` | Action | `academics.lessonPlan.update` / `.approve` | per schema | `{ id }` |

## 5. Attendance

**Corrections, built on 2026-10-06:** `correctAttendance(SubmitAttendance + { reason })` needs `attendance.record.update` (principal). It changes a day that was already submitted and would otherwise be locked, never creates one (`BUSINESS_RULE` when the day wasn't taken), marks the record edited, and is audited as `attendance.record.correct` with the reason. It sends no absence alerts. The take screen shows a reason field and Save correction for such a day.

**Period mode, built on 2026-10-05:** `submitAttendance` accepts `mode: 'period'` with `period`. The period must be on the section's published timetable for that weekday (`BUSINESS_RULE` otherwise) and the record stores the slot's `subjectId`. In `assigned` scope only the teacher of that slot may submit it; daily mode stays with the class teacher. `/attendance/take?section=&date=&period=` shows a Period selector when the section has periods that day; a teacher sees the sections they teach as well as their own class. The register takes `?period=` to show one period's marks for the month, and the student profile lists period attendance per subject for the last 60 days. The dashboard tile and the attendance percentage still count daily records only.

| Name | Type | Permission | Input | Output |
|---|---|---|---|---|
| `submitAttendance` | Action | `attendance.record.create` (scope `assigned`: the class teacher for daily mode, the slot teacher for period mode) | `SubmitAttendance` | `{ recordId, summary: { present, absent, late, halfDay, leave } }` |
| `correctAttendance` | Action | `attendance.record.update` (a same-day teacher edit, or the principal with a reason after that) | `{ recordId, changes: { studentId, status }[], reason? }` | `{}` |
| `POST /api/v1/sync/attendance` | Route | as `submitAttendance` | `{ items: (SubmitAttendance & { idempotencyKey: string })[] }` | `{ results: { idempotencyKey, ok, error? }[] }` |
| `GET /api/v1/attendance/register?section=&month=` | Route | `attendance.record.read` | — | `{ students, days, cells }` |
| `POST /api/v1/devices/attendance` (v2) | Route | device key | `{ events: { personType, personRef, at, deviceEventId }[] }` | `{ accepted, duplicates }` |

```ts
const SubmitAttendance = z.object({
  sectionId: Id,
  date: DateStr,                  // server rejects future dates and holidays
  mode: z.enum(['daily', 'period']),
  period: z.number().int().min(1).max(12).optional(),
  entries: z.array(z.object({
    studentId: Id,
    status: z.enum(['present', 'absent', 'late', 'half_day', 'leave']),
    note: z.string().max(200).optional(),
  })).min(1),
  idempotencyKey: z.string().uuid(),
});
```
Server rules: `entries` must cover exactly the active enrollments of the section on `date` (`VALIDATION` lists any missing or extra students); a resubmission with the same idempotency key returns the original result.

**Built so far:** `submitAttendance` in `daily` mode only (`mode: 'period'` is rejected). It returns `{ sectionName, summary, edited }`. A teacher may submit only for the section they are class teacher of; any other section, or one from another school, is `NOT_FOUND`. `BUSINESS_RULE` for a future date, a holiday, a day outside `School.settings.workingDays`, and for changing a day that was submitted earlier than today. A second submission on the same day sets `editedAfterSubmit` and is audited as `attendance.record.update` with the earlier counts. The register is read by the `/attendance/register` page through `getRegister` (no REST route yet); its attendance % is (present + late + ½ × half day) ÷ the days attendance was taken that month. Not built: `correctAttendance`, the sync route, the register REST route and export, absence alerts and the monthly rollup.

## 6. Examinations

**Built on 2026-10-05 (first slice):**
- `upsertExam({ name, type, classIds })` and `upsertExamSchedule({ examId, classId, subjectId, date, maxMarks, passMarks })` need `exams.exam.update` (school admin, principal) and create only. A paper is unique per exam, class and subject (`CONFLICT`). A paper has one total; `components` (theory, practical, internal), start and end times and terms are not built.
- `saveMarks({ examScheduleId, sectionId, entries: { studentId, marks | null, isAbsent }[] })` replaces the spec's per-cell `saveMark` and `submitMarks`: the whole section is saved at once. It needs `exams.mark.update` (teacher, principal). A teacher may save only for a section where the timetable has them teaching that subject. Marks are whole or half numbers from 0 to the paper's maximum; an absent student has none; a blank entry removes the mark. Grades use one fixed 9-point scale (A1 from 91%, pass at 33%); `gradingSchemes` is not built. The audit entry records counts, not marks.
- `lockMarks({ examScheduleId, locked, reason? })` needs `exams.mark.approve` (principal); unlocking needs a reason. A locked paper refuses `saveMarks`.
- `publishExamResults(examId)` needs `exams.exam.publish` (principal) and every paper locked. After it, papers cannot be unlocked or added. Students and parents see only published results, on their home page; staff see marks as entered on the student profile's Results tab.
- **Report cards:** one card per student per academic year (`termId` is always null until terms exist), covering every exam of that year whose results are published.
  - `generateReportCards(sectionId)` needs `exams.reportCard.create` (school admin). It runs in the request, builds or refreshes the draft of every student in the section, copies marks, grades, totals and the last 60 days' attendance % into `snapshot`, and never touches a published card. Returns `{ section, generated, withoutResults, alreadyPublished }`; `BUSINESS_RULE` when nobody has published results.
  - `saveReportCardRemarks({ id, classTeacherRemark?, principalRemark? })` needs `exams.reportCard.update`. A teacher may set only the class teacher's remark and only for the section they are class teacher of; the principal may set both. Refused once published.
  - `publishReportCards(sectionId)` needs `exams.reportCard.publish` (principal) and publishes the section's drafts.
  - `/report-cards/[id]` is the card itself, printable. Staff with `exams.reportCard.read` open cards of sections they work with (a teacher: their class-teacher section), drafts included; a student or parent opens only their own, once published.
  - `reportCards` has an extra `sectionId` field and a `{ schoolId, sectionId }` index.
- Not built: stored PDFs (`pdfKey`) and bulk PDF, withdrawing a card, rank, moderation, the exam timetable notification, the grading-scheme editor.

| Name | Type | Permission | Input | Output |
|---|---|---|---|---|
| `upsertGradingScheme` | Action | `exams.gradingScheme.update` | `{ name, bands[], passPercent }` | `{ id }` · `VALIDATION` if bands overlap or have gaps |
| `upsertExam` / `upsertExamSchedule` | Action | `exams.exam.update` | per schema | `{ id }` |
| `publishExamTimetable` | Action | `exams.exam.publish` | `{ examId }` | `{ notified }` |
| `saveMark` | Action | `exams.mark.update` (assigned, not locked) | `{ examScheduleId, studentId, components: { name, marks }[], isAbsent }` | `{ total, grade, updatedAt }` · `BUSINESS_RULE` if locked |
| `submitMarks` | Action | `exams.mark.update` | `{ examScheduleId, sectionId }` | `{}` · `BUSINESS_RULE` if incomplete (lists the missing roll numbers) |
| `lockMarks` / `unlockMarks` | Action | `exams.mark.approve` | `{ examScheduleId, reason? }` (the reason is required to unlock) | `{}` |
| `saveRemarks` | Action | `exams.reportCard.update` (class teacher) | `{ studentId, examIds, remark: string(≤ 300) }` | `{}` |
| `generateReportCards` | Action | `exams.reportCard.create` | `{ examIds, sectionIds }` | `{ jobId, blockers: [] }` |
| `publishReportCards` | Action | `exams.reportCard.publish` | `{ examIds, sectionIds }` | `{ published, notified }` |
| `GET /api/v1/report-cards/{id}/pdf` | Route | self, ward, assigned teacher, school_admin, principal | — | `302` presigned URL |

## 7. Homework

**Attachments, built on 2026-10-06:** `POST /api/v1/homework/{id}/attachments` (multipart `file`; needs `homework.assignment.create`) adds a PDF or image of up to 5 MB to the teacher's own homework, at most 3 per homework, with the same content check and server-made key as student documents. `GET /api/v1/homework/{id}/attachments/{attachmentId}` downloads it for the teacher who set it, the office and principal, and a student or parent whose section the homework was set for. `homework.attachments` holds `{ key, fileName, mime, size }`. Removing a single attachment is not built.

**Built on 2026-10-05:** `createHomework({ title, instructions?, subjectId, sectionIds, dueOn })` needs `homework.assignment.create` and a staff record; the sections must be ones the teacher is class teacher of or teaches on the timetable (`FORBIDDEN` otherwise); it is published at once. `deleteHomework(id)` soft-deletes the teacher's own homework only. `/homework` lists newest due date first with cursor pagination: a teacher sees their own, the office and principal see all (`homework.assignment.read`). Attachments, grading, submissions and the student and parent views are not built.

| Name | Type | Permission | Input | Output |
|---|---|---|---|---|
| `upsertHomework` | Action | `homework.homework.create/update` (assigned sections) | `{ id?, sectionIds, subjectId, title, instructions, attachmentKeys, dueOn, graded, maxMarks?, allowLate, publish: boolean }` | `{ id }` |
| `GET /api/v1/homework?student=&status=` | Route | `homework.homework.read` | — | `Page<HomeworkItem>` |
| `submitHomework` | Action | `homework.submission.create` (self) | `{ homeworkId, text?, attachmentKeys }` | `{ submissionId, isLate }` · `BUSINESS_RULE` when closed |
| `evaluateSubmission` | Action | `homework.submission.update` (assigned) | `{ submissionId, marks?, feedback }` | `{}` |
| `POST /api/v1/files/presign` | Route | any authenticated user, with a per-module check | `{ module, fileName, mime, size }` | `{ key, url, fields }` (a presigned POST, 5 min, size and type locked) |

## 8. Fees and finance

**Built on 2026-10-05:** `deleteFeeStructure(id)` needs `fees.structure.update` and soft-deletes a structure that is still `draft` (`BUSINESS_RULE` otherwise). Editing a draft is not built: delete it and add it again. The receipt page prints without the header, navigation, breadcrumb row and buttons, always in light mode.

| Name | Type | Permission | Input | Output |
|---|---|---|---|---|
| `upsertFeeHead` / `upsertFeeStructure` | Action | `fees.structure.update` | per schema | `{ id }` · `VALIDATION` if installment percents ≠ 100 |
| `approveFeeStructure` | Action | `fees.structure.approve` | `{ id }` | `{ invoicesScheduled }` |
| `upsertDiscount` | Action | `fees.discount.update` | per schema | `{ id }` |
| `nominateScholarship` / `decideScholarship` | Action | `fees.scholarship.create` / `.approve` | per schema | `{ id }` |
| `GET /api/v1/fees/students/{id}/open-invoices` | Route | `fees.invoice.read` | — | `{ data: InvoiceSummary[], totalDueMinor }` |
| `collectPayment` | Action | `fees.payment.create` | `CollectPayment` | `{ paymentId, receiptNo, receiptPdfUrl }` |
| `voidInvoice` | Action | `fees.invoice.delete` | `{ id, reason }` | `{}` · `BUSINESS_RULE` if any payment is allocated |
| `createCheckout` | Action | `fees.payment.create` (parent, ward invoices only) | `{ invoiceIds: Id[] }` | `{ provider: 'razorpay', orderId, amountMinor, keyId, prefill }` (an existing pending order for the same invoice set is reused) |
| `confirmCheckout` | Action | parent | `{ orderId, paymentId, signature }` | `{ status: 'captured' \| 'pending', receiptNo? }` (the signature is verified; the webhook is the source of truth) |
| `POST /api/webhooks/razorpay` | Route | HMAC signature (`X-Razorpay-Signature`) | Razorpay event | `200` always after the signature is verified and the event is stored (processing is async, idempotent on `event.id`) |
| `POST /api/webhooks/stripe` | Route | `Stripe-Signature` | Stripe event | `200` |
| `requestRefund` / `decideRefund` | Action | `fees.refund.create` / `.approve` | `{ paymentId, amountMinor, reason }` / `{ refundId, decision }` | `{ refundId }` |
| `sendDuesReminders` | Action | `fees.invoice.update` | `{ invoiceIds: Id[], channels: Channel[] }` | `{ queued, skippedRecentlyReminded }` |
| `GET /api/v1/fees/reconciliation?date=` | Route | `fees.payment.read` | — | `{ matched, mismatches: { paymentId?, gatewayId, issue }[] }` |
| `GET /api/v1/exports/{reportKey}?format=csv\|xlsx&...filters` | Route | per-report permission + `.export` | — | a streamed file; audited |
| `GET /verify/receipt/{receiptNo}` | Page | public | — | Valid / not valid + school + amount + date (no student name) |

```ts
const CollectPayment = z.object({
  studentId: Id,
  allocations: z.array(z.object({ invoiceId: Id, amountMinor: z.number().int().positive() })).min(1),
  method: z.enum(['cash', 'cheque', 'upi', 'card', 'bank_transfer']),
  reference: z.string().max(40).optional(),     // cheque no / UPI ref / bank ref
  bankName: z.string().max(80).optional(),
  note: z.string().max(200).optional(),
  idempotencyKey: z.string().uuid(),
}).refine(p => p.method !== 'cheque' || /^\d{6}$/.test(p.reference ?? ''), { path: ['reference'], message: 'fees.errors.chequeNo' });
```
**Built so far (fee setup and billing):** `upsertFeeHead({ name, code, gstRate })` and `upsertFeeStructure({ name, classIds, lines: { feeHeadId, amountMinor (rupees as typed) }[], installments: { label, dueDate, percent }[] })` create only and need `fees.structure.update` (accountant); a structure is saved as `draft`. `approveFeeStructure(id)` needs `fees.structure.approve` (principal) and returns `{ name, invoicesIssued }`: there is no worker yet, so approval itself issues **every** installment's invoice to every active student of the structure's classes, in one transaction with the invoice numbers (`INV/2026-27/000001`) taken from `counters`. Each line is split across installments by percent with the last installment absorbing the rounding, and GST is added per line. `/fees/invoices` lists invoices by invoice number with a status filter and cursor pagination. Not built: editing, discounts, scholarships, late fees, overdue marking, the counter, online payment, refunds and reports.

Server rules: each allocation ≤ the invoice balance; everything runs in one transaction (payment + invoice updates + counter increment + audit); the receipt number comes from `counters`.

**Built so far (the counter):** `collectPayment` returns `{ paymentId, receiptNo }` (no PDF yet; the receipt is the page `/fees/payments/{id}`, printed with the browser). The balance check is part of each invoice update, so two cashiers can't both collect the same dues (`BUSINESS_RULE`); an invoice of another student or school is `NOT_FOUND`. A request repeating an `idempotencyKey` returns the first receipt, including when the two arrive at the same moment. The audit entry is written just after the transaction commits, not inside it. `GET /api/v1/students/search?q=` needs `fees.payment.create` and returns up to 10 active students: an exact admission number, otherwise first or last names starting with the text (`guardianName` instead of `photoUrl`, since photos aren't built). `/fees/payments` lists receipts newest first (by receipt number, which is issued in order) with cursor pagination. `/fees/dues` lists unpaid invoices past their due date, oldest first, with ageing bands (1–15, 16–30, 31–60, over 60 days), the total overdue and a link to the counter for each student; overdue is computed from the due date because the nightly job that sets `status: overdue` is not built. Not built: `sendDuesReminders`, receipt PDF and email, advance payments, refunds, online payment and reconciliation.

## 9. Communication

**Section audiences and notices, built on 2026-10-06:** `publishAnnouncement` accepts `audience: { type: 'section', sectionIds }`, which reaches the accounts of those sections' students, their guardians and the class teachers, and `requiresAck: true`, which stores the announcement as a `notice`. `acknowledgeAnnouncement(id)` (needs `comms.announcement.read`) records the reader once; the author cannot acknowledge their own. A recipient sees whether they have confirmed; the author sees the count. People who can publish see every announcement of the school; everyone else sees those addressed to the school, their role, their sections, or written by them. Not built: branch and class audiences, scheduling, expiry, attachments, a list of who has not confirmed.

**Documents, built on 2026-10-06:** `POST /api/v1/students/{id}/documents` (multipart `type`, `file`; needs `sis.student.update`) stores a PDF, JPEG, PNG or WebP of up to 5 MB. The real type is read from the file's first bytes, the storage key is made by the server (`school/student/uuid.ext`), and the file name is sanitised. `GET /api/v1/students/{id}/documents/{documentId}` (needs `sis.document.read`: school admin, principal) downloads it as an attachment under a sandboxing CSP and writes `sis.document.read` to the audit log. `verifyStudentDocument` and `deleteStudentDocument` need `sis.student.update`. Files are kept on the server's disk in `.data/uploads` until S3 is connected (`src/server/storage/store.ts`). Not built: the admission checklist, virus scanning, a student photo on the profile.

**Collection report, built on 2026-10-06:** `/fees/reports?from=&to=` (needs `fees.payment.read`) shows captured payments between two dates (this month so far by default, at most 366 days) by method and by day in the school's time zone, with the total outstanding now. Not built: by fee head, concessions, export.

**Online payment, built on 2026-10-06:** `createCheckout({ studentId, invoiceIds })` is for a parent's own child and pays the chosen open invoices in full; a pending order for the same invoices and amount is reused. `handleGatewayEvent` is the single place an online payment becomes a receipt: the event is stored in `webhookEvents` first (unique per provider and event id), the order is claimed atomically, the amount and the current dues must both equal the order, and the receipt is written by the fee counter's own transaction with `method: 'online'`. If the money can't be applied the order is `failed` with the reason, for the office to refund. The only gateway is `dev`, a stand-in on `/pay/{orderId}` with Pay and Fail buttons. `POST /api/webhooks/razorpay` verifies `X-Razorpay-Signature` with `RAZORPAY_WEBHOOK_SECRET` and is off (503) without it; creating real Razorpay orders, `confirmCheckout`, refunds and reconciliation are not built.

**Alerts, built on 2026-10-06:** submitting daily attendance sends each absent student's primary guardian one SMS, and an in-app notification when that guardian has a portal account; a guardian hears once per child per day (`dedupeKey`), and a failed alert never fails the attendance save. `sendDuesReminders()` (needs `fees.payment.create`) sends one SMS per family with an overdue balance, at most once a day, and returns `{ sent, families }`. Both go through the `dev` provider for now. Not built: the configurable alert time, email and push channels, per-user preferences, quiet hours.

| Name | Type | Permission | Input | Output |
|---|---|---|---|---|
| `previewAudience` | Action | `comms.announcement.create` | `{ audience, channels }` | `{ recipients: { parents, students, staff }, smsParts, smsCredits }` |
| `upsertAnnouncement` | Action | `comms.announcement.create/update` (teachers limited to assigned sections) | `{ id?, kind, title, body, audience, channels, requiresAck, publishAt?, expiresAt?, attachmentKeys }` | `{ id }` |
| `publishAnnouncement` | Action | `comms.announcement.publish` | `{ id }` | `{ scheduledFor \| publishedAt, recipients }` |
| | | | **Built so far:** `previewAudience(audience)` returns `{ recipients }` and `publishAnnouncement({ title, body, audience })` publishes at once and returns `{ id, title, recipients }`; both need `comms.announcement.create` (school_admin, principal). `audience` is `{ type: 'school' }` or `{ type: 'role', roles }`; class and section audiences wait for parent and student accounts. In-app only. With no worker yet, the notifications are written in the request, one per recipient except the author, de-duplicated by `dedupeKey`. `markNotificationsRead('all' \| ids)` is for the signed-in user's own notifications. The unread count is rendered with the page (no SSE yet), so it refreshes on a full page load. Not built: drafts, scheduling, expiry, acknowledgement, attachments, Markdown rendering, email/SMS/push | |
| `acknowledgeNotice` | Action | recipient | `{ announcementId }` | `{}` |
| `startThread` | Action | `comms.message.create` (allowed pairs only, per the matrix) | `{ participantIds, studentId?, subject, body }` | `{ threadId }` · `FORBIDDEN` if the pair isn't allowed |
| `sendMessage` | Action | participant | `{ threadId, body, attachmentKeys?, idempotencyKey }` | `{ messageId, notifyAt }` |
| `GET /api/v1/threads?cursor=` / `GET /api/v1/threads/{id}/messages?cursor=` | Route | participant | — | `Page<Thread>` / `Page<Message>` |
| `markNotificationsRead` | Action | self | `{ ids?: Id[], all?: true }` | `{}` |
| `GET /api/v1/events` | Route (SSE) | self | — | `event: unread\ndata: {"count":3}` |
| `savePushSubscription` | Action | self | `{ endpoint, keys: { p256dh, auth } }` | `{}` |
| `updateNotificationPrefs` | Action | self | `{ prefs: { category, channel, enabled }[] }` | `{}` |
| `createPtmEvent` | Action | `comms.ptm.create` | `{ title, date, sectionIds, slotMinutes, mode, windows: { teacherId, start, end }[] }` | `{ id, slots }` |
| `bookPtmSlot` | Action | `comms.ptm.create` (parent, ward) | `{ slotId, studentId }` | `{}` · `CONFLICT` if taken |
| `POST /api/webhooks/msg91` | Route | a shared secret in a header + IP allow-list | a delivery report | `200` |
| `POST /api/webhooks/ses` | Route | SNS message signature | a bounce or complaint notification | `200` |

## 10. Library, transport, hostel and inventory

| Name | Type | Permission | Input | Output |
|---|---|---|---|---|
| `GET /api/v1/library/barcode/{code}` | Route | `library.loan.read` | — | `{ type: 'member' \| 'copy', ... }` · `NOT_FOUND` |
| `issueBook` | Action | `library.loan.create` | `{ copyId, memberType, memberId }` | `{ loanId, dueOn }` · `BUSINESS_RULE` for the limit or copy status |
| `returnBook` | Action | `library.loan.update` | `{ copyId }` | `{ loanId, fineMinor }` |
| `upsertBook` / `addCopies` | Action | `library.catalogue.update` | per schema / `{ bookId, count }` | `{ id }` / `{ accessionNos }` |
| `GET /api/v1/library/isbn/{isbn}` | Route | `library.catalogue.update` | — | Prefill from Open Library (cached 30 days) |
| `upsertVehicle` / `upsertRoute` / `upsertStop` | Action | `transport.*.update` | per schema | `{ id }` |
| `assignTransport` | Action | `transport.assignment.create` | `{ studentId, routeId, stopId, startDate }` | `{ id, feeLineAddedFrom }` · `BUSINESS_RULE` at capacity (override with a reason) |
| `notifyRoute` | Action | `transport.route.update` | `{ routeId, templateKey, params }` | `{ notified }` |
| `POST /api/v1/devices/gps` (v2) | Route | device key | `{ pings: { at, lat, lng, speed }[] }` | `{ accepted }` |
| `GET /api/v1/transport/routes/{id}/live` (v2) | Route | `transport.live.read` (ward route only for parents) | — | `{ location, updatedAt, etaToStop? }` |
| `allocateBed` / `recordStockMovement` | Action | `hostel.allocation.create` / `inventory.stock.create` | per schema | `{ id }` |

## 11. Calendar

**Events, built on 2026-10-05:** `upsertEvent({ id?, title, type, start, end })` changes the event when `id` is given and otherwise creates an all-day, whole-school event (dates are `YYYY-MM-DD`; type cannot be `holiday`) and `deleteEvent(id)` soft-deletes it; both need `calendar.event.update` (school admin, principal). Everyone can read (`calendar.event.read`). `/calendar/events?month=YYYY-MM` lists the month's events and holidays together. Not built: timed events, audiences, editing, the `GET /api/v1/calendar` route.

| Name | Type | Permission | Input | Output |
|---|---|---|---|---|
| `upsertEvent` / `deleteEvent` | Action | `calendar.event.*` | `{ title, type, start, end, allDay, audience }` | `{ id }` |
| `upsertHoliday` | Action | `calendar.holiday.update` | `{ date, name, branchIds? }` | `{ id, affectedAttendanceRecords: number }` (a warning if attendance already exists) |
| `deleteHoliday` | Action | `calendar.holiday.update` | holiday id | `{ name }` (a soft delete; the day becomes a working day again). `NOT_FOUND` outside the tenant |
| | | | **Built so far:** `upsertHoliday({ date, name })` creates only, school-wide (no `branchIds`), returns `{ name, affectedAttendanceRecords }`, and gives `CONFLICT` when the day is already a holiday. Both are audited | |
| `GET /api/v1/calendar?from=&to=` | Route | `calendar.event.read` | — | `{ data: CalendarItem[] }` |
| `GET /api/v1/calendar/ical/{token}.ics` | Route | the tokenised per-user link | — | `text/calendar` |

## 12. Reports and dashboards

**Student and parent home, built on 2026-10-05:** for roles `student` and `parent` (`portal.self.read`) the home page shows the student's attendance for the last 60 days, fees due with open installments, homework due today or later, today's classes, and upcoming events. A parent with several children picks one with `?student=`; an id that is not theirs falls back to their first child. The ids always come from the signed-in account, never from the request alone. Not built: online payment, homework submission, messaging, the student's full timetable and attendance history pages.

| Name | Type | Permission | Input | Output |
|---|---|---|---|---|
| `GET /api/v1/dashboard/{widgetKey}` | Route | per widget | filters | Widget data (used for client refresh; the first render is RSC) |
| `GET /api/v1/reports/{reportKey}?...` | Route | per report | filters, cursor | `Page<Row>` + `totals` |
| `GET /api/v1/exports/{reportKey}` | Route | per report `.export` | filters, `format` | a streamed CSV/XLSX; PDF via a job for print reports |

Report keys: `attendance.daily`, `attendance.monthly`, `attendance.lowAttendance`, `fees.collection`, `fees.dues`, `fees.concessions`, `fees.headwise`, `admissions.funnel`, `exams.results`, `exams.subjectAnalysis`, `staff.attendance`, `staff.leave`, `library.overdue`, `transport.routeStrength`.

## 13. Settings, audit and import/export

**Settings and export, built on 2026-10-05:**
- `updateSchoolSettings({ name, affiliationNo?, logoUrl?, address, workingDays })` (`logoUrl` is an `https` address of an image, shown as a circle in the header; uploading a file is not built) and `updatePeriods([{ start, end }])` need `settings.school.update` (school admin). The school is always the one in the session. Periods are 1 to 12, in order, each ending after it starts and not overlapping the one before; removing a period the timetable still uses gives `BUSINESS_RULE`. They are stored in `periodDefinitions` (one document per school, breaks are simply gaps); until a school saves its own, 8 periods of 40 minutes from 08:00 apply.
- `GET /api/v1/export/{students|dues|payments}` returns a UTF-8 CSV (with BOM) of active students, overdue dues or payments. It needs the list's read permission, is refused for `assigned` scope, is capped at 10,000 rows, neutralises cells that a spreadsheet would run as formulas, and is audited as `data.export`. XLSX, filters and background export jobs are not built.

**Users, built on 2026-10-05** (`users.user.read` for school admin and principal; `users.user.create` and `users.user.update` for school admin):
- `createUser({ name, email, role, staffId? })` replaces `inviteUser` until email is connected: it creates an active account for a staff role (never `super_admin`, `student` or `parent`) with a random 14-character temporary password, returned once and stored only as an argon2id hash. `CONFLICT` when the email exists or the staff record already has an account. A teacher gets scope `assigned`; other roles get `school`.
- `resetUserPassword(id)` issues a new temporary password and deletes the user's sessions. `setUserStatus({ id, status: 'active' | 'disabled' })` disables or re-enables sign-in; disabling deletes sessions. Neither works on your own account or on a user of another school.
- `createPortalAccount({ studentId, guardianId?, email })` (needs `users.user.create`) creates the student's own account (role `student`, scope `self`) or a guardian's (role `parent`, scope `ward`), linked by `User.studentId` / `User.guardianId`. One account per person.
- Not built: invitations by email or SMS, forcing a password change at first sign-in, several roles per user, the role switcher.

**Academic year and promotion, built on 2026-10-05** (all need `sis.enrollment.update`, school admin):
- `createAcademicYear({ label, startDate, endDate })` plans the next year (one at a time, starting after the current year ends) and copies the current year's classes and sections into it, without students or class teachers. Terms are not built.
- `promoteStudents({ sectionId, decisions: { studentId, action, toSectionId? }[] })` works one section at a time in one transaction. `promote` needs a next-year section of the class above, `detain` one of the same class; both create the new enrollment with the section's next roll number and mark the old one `promoted` or `detained`. `graduate` marks the enrollment `completed` and the student `alumni`; `leave` marks them `transferred` and `withdrawn`. Only students still actively enrolled in that section are touched, so a repeat changes nothing. Returns `{ section, promoted, detained, graduated, left }`.
- `closeAcademicYear()` makes the planned year current and the current one closed. `BUSINESS_RULE` while any student is still enrolled in the current year. No other blockers are checked yet (open invoices, unsubmitted attendance).

| Name | Type | Permission | Input | Output |
|---|---|---|---|---|
| `updateSchoolSettings` | Action | `settings.school.update` | `Partial<SchoolSettings>` per section | `{}` |
| `updateBranding` | Action | `settings.school.update` | `{ primaryColor, logoKey? }` | `{}` · `VALIDATION` "contrast" with a suggested colour |
| `GET /api/v1/audit?filter=&cursor=` | Route | `audit.log.read` | — | `Page<AuditEntry>` |
| `startImport` | Action | `data.import.create` | `{ kind, fileKey }` | `{ importJobId }` (runs validation) |
| `commitImport` | Action | `data.import.create` | `{ importJobId }` | `{ jobId }` |
| `GET /api/v1/imports/{id}` | Route | owner | — | `ImportJob` summary + the first 100 errors |
| `requestFullExport` | Action | `data.export.create` (school_admin) | — | `{ jobId }` → notified with a download link (24 h) |
| `createDataRequest` | Action | a parent (their ward) or school_admin | `{ studentId, type: 'access' \| 'correction' \| 'erasure', details }` | `{ id }` |

## 14. Insights and AI (v2)

| Name | Type | Permission | Input | Output |
|---|---|---|---|---|
| `GET /api/v1/insights/at-risk?level=&cursor=` | Route | `insights.risk.read` (teacher: assigned) | — | `Page<{ studentId, name, section, score, level, topFactors }>` |
| `GET /api/v1/insights/students/{id}` | Route | same | — | `{ score, level, factors[], history[] }` |
| `acknowledgeRisk` | Action | `insights.risk.read` | `{ riskScoreId, followUp?: { assigneeId, note, dueOn } }` | `{}` |
| `draftRemarks` | Action | `exams.reportCard.update` + the school's `llmSummariesEnabled` | `{ studentId, examIds }` | `{ draft: string }` (the teacher edits it before saving; no PII leaves: only pseudonymised performance data is sent) |

## Rate limits (per IP + per user; Redis sliding window)

| Endpoint group | Limit |
|---|---|
| `requestOtp` | 3 / 15 min per phone; 20 / hour per IP |
| Password sign-in | 10 failures → a 15 min lock per account; 50 / hour per IP |
| Public apply | 10 / hour per IP |
| Search and autosuggest | 60 / min per user |
| Exports | 10 / hour per user |
| Everything else | 300 / min per user |

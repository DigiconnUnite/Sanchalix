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

| Name | Type | Permission | Input | Output |
|---|---|---|---|---|
| `createStaff` / `updateStaff` | Action | `hr.staff.create/update` | `StaffInput` | `{ id, employeeNo }` |
| `checkIn` | Action | `hr.attendance.create` (self) | `{ method: 'manual' \| 'qr', qrToken? }` | `{ checkIn }` · `BUSINESS_RULE` if already checked in |
| `applyLeave` | Action | `hr.leave.create` (self) | `{ leaveTypeCode, from, to, halfDay?, reason, attachmentKey? }` | `{ id, status: 'pending' }` · `BUSINESS_RULE` for insufficient balance |
| `decideLeave` | Action | `hr.leave.approve` | `{ id, decision: 'approved' \| 'rejected', comment?, substitutions?: { timetableSlotId, date, substituteTeacherId }[] }` | `{}` |
| `GET /api/v1/timetable/free-teachers?date=&period=` | Route | `academics.timetable.read` | — | `{ data: { teacherId, name, sameSubject: boolean }[] }` |
| `computePayroll` | Action | `hr.payroll.create` | `{ branchId, month: 'YYYY-MM' }` | `{ payrollRunId, exceptions: { staffId, issue }[] }` (the job runs async; the status is polled) |
| `approvePayroll` / `markPayrollPaid` | Action | `hr.payroll.approve` / `hr.payroll.publish` | `{ payrollRunId }` | `{ bankFileUrl? }` |
| `GET /api/v1/payslips/{id}/pdf` | Route | self or `hr.payroll.read` | — | `302` → a presigned S3 URL (60 s) |

## 4. Academics

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

| Name | Type | Permission | Input | Output |
|---|---|---|---|---|
| `upsertHomework` | Action | `homework.homework.create/update` (assigned sections) | `{ id?, sectionIds, subjectId, title, instructions, attachmentKeys, dueOn, graded, maxMarks?, allowLate, publish: boolean }` | `{ id }` |
| `GET /api/v1/homework?student=&status=` | Route | `homework.homework.read` | — | `Page<HomeworkItem>` |
| `submitHomework` | Action | `homework.submission.create` (self) | `{ homeworkId, text?, attachmentKeys }` | `{ submissionId, isLate }` · `BUSINESS_RULE` when closed |
| `evaluateSubmission` | Action | `homework.submission.update` (assigned) | `{ submissionId, marks?, feedback }` | `{}` |
| `POST /api/v1/files/presign` | Route | any authenticated user, with a per-module check | `{ module, fileName, mime, size }` | `{ key, url, fields }` (a presigned POST, 5 min, size and type locked) |

## 8. Fees and finance

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

**Built so far (the counter):** `collectPayment` returns `{ paymentId, receiptNo }` (no PDF yet; the receipt is the page `/fees/payments/{id}`, printed with the browser). The balance check is part of each invoice update, so two cashiers can't both collect the same dues (`BUSINESS_RULE`); an invoice of another student or school is `NOT_FOUND`. A request repeating an `idempotencyKey` returns the first receipt, including when the two arrive at the same moment. The audit entry is written just after the transaction commits, not inside it. `GET /api/v1/students/search?q=` needs `fees.payment.create` and returns up to 10 active students: an exact admission number, otherwise first or last names starting with the text (`guardianName` instead of `photoUrl`, since photos aren't built). Not built: the payments list, receipt PDF and email, advance payments, refunds, online payment and reconciliation.

## 9. Communication

| Name | Type | Permission | Input | Output |
|---|---|---|---|---|
| `previewAudience` | Action | `comms.announcement.create` | `{ audience, channels }` | `{ recipients: { parents, students, staff }, smsParts, smsCredits }` |
| `upsertAnnouncement` | Action | `comms.announcement.create/update` (teachers limited to assigned sections) | `{ id?, kind, title, body, audience, channels, requiresAck, publishAt?, expiresAt?, attachmentKeys }` | `{ id }` |
| `publishAnnouncement` | Action | `comms.announcement.publish` | `{ id }` | `{ scheduledFor \| publishedAt, recipients }` |
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

| Name | Type | Permission | Input | Output |
|---|---|---|---|---|
| `upsertEvent` / `deleteEvent` | Action | `calendar.event.*` | `{ title, type, start, end, allDay, audience }` | `{ id }` |
| `upsertHoliday` | Action | `calendar.holiday.update` | `{ date, name, branchIds? }` | `{ id, affectedAttendanceRecords: number }` (a warning if attendance already exists) |
| `deleteHoliday` | Action | `calendar.holiday.update` | holiday id | `{ name }` (a soft delete; the day becomes a working day again). `NOT_FOUND` outside the tenant |
| | | | **Built so far:** `upsertHoliday({ date, name })` creates only, school-wide (no `branchIds`), returns `{ name, affectedAttendanceRecords }`, and gives `CONFLICT` when the day is already a holiday. Both are audited | |
| `GET /api/v1/calendar?from=&to=` | Route | `calendar.event.read` | — | `{ data: CalendarItem[] }` |
| `GET /api/v1/calendar/ical/{token}.ics` | Route | the tokenised per-user link | — | `text/calendar` |

## 12. Reports and dashboards

| Name | Type | Permission | Input | Output |
|---|---|---|---|---|
| `GET /api/v1/dashboard/{widgetKey}` | Route | per widget | filters | Widget data (used for client refresh; the first render is RSC) |
| `GET /api/v1/reports/{reportKey}?...` | Route | per report | filters, cursor | `Page<Row>` + `totals` |
| `GET /api/v1/exports/{reportKey}` | Route | per report `.export` | filters, `format` | a streamed CSV/XLSX; PDF via a job for print reports |

Report keys: `attendance.daily`, `attendance.monthly`, `attendance.lowAttendance`, `fees.collection`, `fees.dues`, `fees.concessions`, `fees.headwise`, `admissions.funnel`, `exams.results`, `exams.subjectAnalysis`, `staff.attendance`, `staff.leave`, `library.overdue`, `transport.routeStrength`.

## 13. Settings, audit and import/export

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

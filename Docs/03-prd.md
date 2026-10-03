# 03 · Product Requirements (PRD)

Requirements for every Vidyawan module. Each module lists its features with MoSCoW priority and target release (MVP, v1 or v2, see [05-roadmap.md](05-roadmap.md)), then its key user stories with acceptance criteria in Given/When/Then form. Roles and permissions: [02-personas-and-roles.md](02-personas-and-roles.md). Entities: [14-data-model.md](14-data-model.md). Screens: [10-screen-specs.md](10-screen-specs.md). Endpoints: [15-api-spec.md](15-api-spec.md).

**MoSCoW:** **M** Must · **S** Should · **C** Could · **W** Won't (this cycle).

**Cross-cutting acceptance criteria.** These apply to every story and are not repeated below:
- **X1** The screen has designed loading, empty, error and success states ([06-ux-principles.md](06-ux-principles.md#p3-four-states-always)).
- **X2** It is keyboard operable and screen-reader labelled, meeting WCAG 2.2 AA ([11-accessibility.md](11-accessibility.md)).
- **X3** Every mutation is authorised on the server and written to the audit log with the actor, before and after.
- **X4** All user-visible strings come from the message catalogue. It is English-only for now; `hi` is added before the pilot go-live ([ADR-018](23-decision-log.md#adr-018-english-only-until-the-core-modules-are-built)).
- **X5** Tables filter, sort and paginate on the server, and their state lives in the URL.
- **X6** It works at 360px wide.

---

## 1. Authentication, RBAC and tenancy

| Feature | MoSCoW | Release |
|---|---|---|
| Email/phone + password sign-in (argon2id) | M | MVP |
| SMS OTP sign-in (parents, students) | M | MVP |
| Google sign-in for staff (Workspace schools) | S | MVP |
| TOTP 2FA, mandatory for super_admin, school_admin, principal and accountant | M | MVP |
| Invite users by email or SMS with a one-time link (72h) | M | MVP |
| Forgot password / reset | M | MVP |
| Nine fixed roles with scoped assignments | M | MVP |
| Multiple roles per user + role switcher | M | MVP |
| Organization → School → Branch hierarchy; school switcher for multi-school users | M | MVP |
| Active sessions list + "Sign out other devices" | S | MVP |
| Account lockout after 10 failed attempts (15 min) | M | MVP |
| Super Admin "View as" (read-only, time-boxed, audited) | S | v1 |
| Break-glass PII access for Super Admin | S | v1 |
| SSO via SAML/OIDC for enterprise organizations | C | v2 |
| Custom roles built from permission sets | C | v2 |
| Passkeys (WebAuthn) | C | v2 |

**US-1.1 Parent OTP sign-in.** As a parent, I want to sign in with a code sent to my phone so I don't need to remember a password.
- Given a guardian phone number that is registered with the school, when I enter it and tap "Send code", then I receive a 6-digit SMS within 30 s and see "Enter the 6-digit code sent to +91 98xxxxxx21".
- Given I enter the right code within 5 minutes, then I am signed in, and I land on the Home of my first child, with the child switcher showing all my children across the organization.
- Given 5 wrong codes, then the challenge is invalidated and I see "Too many attempts. Request a new code in 15 minutes."
- Given an unregistered number, then I see the same "code sent" screen (no account enumeration), and no SMS is sent.

**US-1.2 Multi-role switch.** As a teacher who is also a parent, I want to switch between my teacher and parent views.
- Given a user with `teacher` and `parent` assignments, then the top navigation shows the `switchRole` control labelled with the active role.
- When I switch role, then the navigation, dashboard and default landing page change, the URL stays valid if the new role can see it (otherwise I go to the dashboard), and `sessions.activeRole` updates.

**US-1.3 Mandatory 2FA.** As a school, I want accountants to use 2FA so fee data is protected.
- Given an accountant without TOTP set up, when they sign in, then they must set up TOTP (QR + manual key + 10 recovery codes) before reaching any page.

**US-1.4 Tenant isolation.** As a school admin, I must never see another school's data.
- Given any API request, then the server derives `schoolId` from the session (never from the client), and a query without `schoolId` fails in the tenant plugin ([14-data-model.md](14-data-model.md#tenant-plugin)).

---

## 2. Student information system

| Feature | MoSCoW | Release |
|---|---|---|
| Admission pipeline (enquiry → accepted) with a status board | M | MVP |
| Public online admission form per school (`/apply/{schoolCode}`) | S | v1 |
| Document checklist and upload, with verification | M | MVP |
| Accept → create Student + Guardians + Enrollment in one step; admission number auto-generated | M | MVP |
| Student profile with tabs (overview, attendance, academics, fees, documents, guardians, history) | M | MVP |
| Bulk import students + guardians (CSV/XLSX) with dry run and row errors | M | MVP |
| Sibling linking (shared guardians) | M | MVP |
| Year-end promotion wizard (promote, detain, graduate, per section) | M | MVP |
| Section transfer within a year | M | MVP |
| Transfer out + TC generation | M | MVP |
| Bonafide and character certificates (PDF with QR verification) | S | v1 |
| ID card printing (PDF, 8 per A4) | S | v1 |
| Alumni directory | C | v2 |
| Admission assessment scheduling | C | v1 |
| Admission enquiry follow-up reminders | C | v2 |

**US-2.1 Accept an admission.** As a school admin, I want to accept an application and have the student ready for day one.
- Given an application in `offered` with all required documents verified, when I choose "Accept and enroll", then a `Wizard` asks for the section (showing each section's current strength against its capacity) and the fee structure (pre-selected for the class).
- When I confirm, then in one transaction a Student is created with admission number `{SCHOOLCODE}-2026-00412`, Guardians are created or linked (matched on phone), an Enrollment is created with the next roll number, and the first-installment invoice is issued.
- Then a `Flashbar` says "Aarav Sharma enrolled in 7-B. Admission number VWN-2026-00412." with "View profile" and "Print admission letter".
- Given a required document is not verified, then "Accept and enroll" is disabled with `disabledReason` "Verify all required documents first (2 remaining)".

**US-2.2 Bulk import.** As a Super Admin onboarding a school, I want to import 1,200 students from their old spreadsheet.
- Given an uploaded XLSX, when validation runs (dry run), then I see a `ProgressBar`, then "1,176 rows ready · 24 rows with errors", with a table of errors (row, column, message) and "Download error file".
- When I choose "Import 1,176 valid rows", then they import in the background, and I can leave the page and get a notification when it is done.
- Given the same file is imported twice, then the admission number / (name + DOB + guardian phone) match prevents duplicates, and those rows are reported as "Already exists".

**US-2.3 Promotion.** As a school admin, I want to promote all students at year end without doing it one by one.
- Given the next academic year exists with classes and sections, when I open the promotion wizard for "Class 7", then every student defaults to "Promote to Class 8, same section letter", and students with a final result of fail default to "Detain", flagged for review.
- When I confirm, then new Enrollments are created, the old ones are marked `promoted` or `detained`, and nothing changes in the closed year's records.

**US-2.4 Transfer certificate.** As a school admin, I want to issue a TC when a student leaves.
- Given a student with unpaid dues, when I start "Transfer out", then I see a warning `Alert` showing the dues amount with a link to the fee counter, and I can proceed only with the `principal`'s approval.
- When approved, then the student's status becomes `transferred`, the TC PDF is generated with a serial number and a QR verification link, and the student disappears from active lists.

---

## 3. Staff and HR

| Feature | MoSCoW | Release |
|---|---|---|
| Staff directory and profiles (qualifications, subjects, documents) | M | MVP |
| Staff attendance: manual, QR self check-in | M | MVP |
| Staff attendance: biometric device integration | C | v2 |
| Leave types, quotas, balances | M | MVP |
| Leave apply → approve with balance check; auto-marks attendance | M | MVP |
| Substitution suggestions for approved leave (free teachers that period) | S | v1 |
| Salary structures (earnings/deductions components) | S | v1 |
| Monthly payroll run (LOP from attendance), payslip PDFs, bank export | S | v1 |
| Appraisal cycles (goals, self-review, reviewer rating) | C | v1 |
| Statutory reports (PF, ESI, TDS summaries) | C | v2 |

**US-3.1 Apply for leave.** As a teacher, I want to apply for leave from my phone.
- Given I choose "Apply for leave", then I see my balances per leave type ("CL: 6 of 12 left").
- When I pick dates that exceed my balance, then I see the inline error "You have 2 days of CL left. Choose fewer days or a different leave type."
- When I submit, then the principal gets a notification with Approve and Reject actions, and my request shows "Pending approval".

**US-3.2 Approve leave with substitution.** As a principal, I want to approve leave and cover the teacher's classes in one place.
- Given a pending request covering 4 periods, when I open it, then I see the affected periods, each with suggested substitutes (free that period, same subject first).
- When I approve, then the leave balance is deducted, staff attendance for those days is set to `leave`, and substitutions are created and notified.

**US-3.3 Run payroll.** As an accountant, I want to run the monthly payroll in minutes.
- Given the month is closed for attendance, when I choose "Run payroll for Sept 2026", then payslips are computed (LOP days from attendance) and shown in a table with totals and exceptions ("3 staff with missing bank details").
- When the principal approves and I mark the run as paid, then payslip PDFs are released to staff and a bank upload file (CSV) is generated.

---

## 4. Academics

| Feature | MoSCoW | Release |
|---|---|---|
| Academic years and terms; exactly one current | M | MVP |
| Classes, sections (capacity, class teacher), subjects | M | MVP |
| Class ↔ subject mapping, optional subjects per student | M | MVP |
| Period definitions (bell schedule) per branch | M | MVP |
| Timetable editor (drag-free grid: pick a cell → subject + teacher) with clash detection | M | MVP |
| Automatic timetable generation (constraints: teacher load, subject periods/week, no clashes, teacher unavailability) | S | v1 |
| Publish timetable → notify teachers, students and parents | M | MVP |
| Substitutions (daily) | S | v1 |
| Curriculum (units → topics, planned periods) | S | v1 |
| Lesson plans with principal review | S | v1 |
| Syllabus coverage tracking (delivered vs. planned) | C | v2 |

**US-4.1 Timetable clash prevention.** As a school admin, I want the system to stop me double-booking a teacher.
- Given Ms. Priya teaches 7-B in Monday period 3, when I assign her to 8-A Monday period 3, then the cell shows the error "Priya Nair already teaches 7-B at this time", and saving is blocked.
- The unique index on the published teacher-day-period enforces this on the server as well ([14-data-model.md](14-data-model.md#timetableslots)).

**US-4.2 Generate a timetable.** As a school admin, I want a timetable generated from constraints.
- Given subject periods-per-week for each class and teacher assignments, when I run "Generate", then it runs as a background job with progress, and produces a draft or a list of unsatisfiable constraints in plain language ("Mathematics for 9-A needs 7 periods but Mr. Khan has only 5 free periods").
- The draft is editable before publishing. Nothing publishes automatically.

---

## 5. Attendance

| Feature | MoSCoW | Release |
|---|---|---|
| Daily attendance by the class teacher (default all Present, tap exceptions) | M | MVP |
| Period-wise attendance by the subject teacher | S | MVP |
| Offline capture in the PWA with sync | M | v1 |
| Absence alert to guardians (in-app + SMS/push) by a configurable time | M | MVP |
| Attendance register (month grid), exports | M | MVP |
| Corrections after submission (principal, audited, reason) | M | MVP |
| Parent "Report absence" (creates a student leave request) | S | v1 |
| QR check-in (student ID QR scanned by the teacher's phone, or a kiosk) | C | v2 |
| Biometric device ingestion | C | v2 |
| Bus boarding attendance by the transport attendant | C | v2 |
| Holiday and non-working day blocking | M | MVP |

**US-5.1 Take attendance fast.** As a class teacher, I want to mark attendance for 40 students in under a minute.
- Given I open Attendance at 08:05 on a working day, then the page opens on my class section for today, with every student set to Present and a sticky summary "40 present · 0 absent · 0 late".
- When I tap a student's status, then it cycles through Present → Absent → Late (a long press or the menu offers Half day and Leave), and the summary updates live.
- Given a student has an approved leave for today, then they are pre-set to "On leave" with a note.
- When I tap "Submit attendance", then it saves in one request, and I see "Attendance for 7-B submitted. 38 present, 2 absent. Guardians of absent students will be notified at 09:30."
- Given today is a holiday, then I see an `Alert` "Today is a holiday (Gandhi Jayanti). Attendance is not needed." and no form.
- Given I'm offline (v1), then submit saves locally, and the status shows "Saved on this device. Will sync when online." and syncs on reconnect, without creating duplicates (idempotency key).

**US-5.2 Absence alert.** As a parent, I want to know the same morning if my child is absent.
- Given my child is marked absent and the school's alert time is 09:30, then at 09:30 I receive a push (if enabled) or an SMS "Kabir was marked absent today (30 Sep). If this is wrong, contact the class teacher." and an in-app notification linking to the attendance calendar.
- Given the teacher corrects the mark to Present before 09:30, then no alert is sent.

---

## 6. Examinations

| Feature | MoSCoW | Release |
|---|---|---|
| Grading schemes (CBSE 9-point, percentage, custom) | M | v1 |
| Exams with schedules per class and subject (date, time, max marks, components) | M | v1 |
| Exam timetable publishing → students and parents | M | v1 |
| Marks entry grid (keyboard-first, autosave, absent flag, validation) | M | v1 |
| Marks entry progress tracking per schedule | M | v1 |
| Moderation and lock by the principal | M | v1 |
| Report card templates (CBSE term-wise, generic) | M | v1 |
| Bulk report card generation (PDF) and publishing | M | v1 |
| Co-scholastic grades and remarks | S | v1 |
| Transcripts (multi-year) | S | v2 |
| Rank and percentile (opt-in per school) | C | v1 |
| Hall tickets | C | v2 |
| Online exams | W | — |

**US-6.1 Enter marks.** As a teacher, I want to enter marks for my section like a spreadsheet, without losing work.
- Given a schedule with `marks_open` status, when I open marks entry for 7-B Mathematics, then I see a grid of students (roll number order) × components (Theory /80, Internal /20), with a Total column and a Grade column.
- When I type a value and press Enter or Tab, then focus moves down (Enter) or right (Tab), and the value autosaves within 1 s, with a subtle "Saved" status per row.
- Given I type 85 in a /80 column, then the cell shows the error "Must be 0–80", and it is not saved.
- Given I mark a student absent, then their components clear and show "AB".
- When all rows are filled, then "Submit for review" is enabled. Submitting changes the status to `submitted`.

**US-6.2 Lock and publish.** As a principal, I want to review and lock marks, then publish report cards.
- Given all schedules for an exam and class are submitted, then I can review the distribution per subject (a histogram and the pass %), and choose "Lock marks".
- When I publish report cards, then PDFs are generated in the background, and students and guardians are notified "Half-Yearly results for 7-B are out". Report cards become visible in their portal at the same moment.

---

## 7. Homework and assignments

| Feature | MoSCoW | Release |
|---|---|---|
| Create homework for one or more sections, with attachments and a due date | M | MVP |
| Student view: due today, upcoming, overdue | M | MVP |
| Online submissions (text + up to 5 files, camera capture) | S | v1 |
| Graded assignments with evaluation and feedback | S | v1 |
| Submission tracking (submitted, late, missing) per student | S | v1 |
| Reminders to students the evening before the due date | S | v1 |
| Plagiarism checks | W | — |

**US-7.1 Set homework.** As a teacher, I want to set homework for two sections at once.
- When I create homework and select 7-B and 7-C, then one homework record targets both, and students and guardians of both sections get one notification each.
- Given a due date in the past, then the error is "Choose a due date from today onwards."

**US-7.2 Submit with a photo.** As a student, I want to submit handwritten work by photographing it.
- Given a homework item that allows submissions, when I tap "Submit" and "Take photo", then the camera opens. Images are compressed on the device to ≤ 1.5 MB each before upload.
- After the due date, submissions are accepted and marked "Late" only if `allowLate` is true. Otherwise "Submissions closed on 29 Sep".

---

## 8. Fees and finance

| Feature | MoSCoW | Release |
|---|---|---|
| Fee heads (with GST rate) and fee structures per class and year, with installments | M | MVP |
| Automatic invoice generation per installment | M | MVP |
| Discounts (sibling, staff ward, custom) auto-applied | M | MVP |
| Scholarships with nomination → approval | S | v1 |
| Fee counter: search → select dues → collect (cash, cheque, UPI, card) → print receipt | M | MVP |
| Online payment by parents (Razorpay: UPI, cards, netbanking) | M | MVP |
| Stripe for international schools | C | v2 |
| Immutable, gap-free receipt numbering; receipt PDF + public QR verification | M | MVP |
| Late fee rules | S | MVP |
| Dues report with ageing, and bulk reminders (SMS, email, push) | M | MVP |
| Automated reminder schedule (7 days before, due day, 7 days after) | S | v1 |
| Refunds with principal approval | S | v1 |
| Gateway reconciliation (webhooks + daily settlement report match) | M | MVP |
| Finance reports (collection by day/method/head, concessions, outstanding) | M | MVP |
| Export to Tally/Zoho (CSV voucher format) | S | v1 |
| Partial payments | M | MVP |
| Fee structure approval by the principal | S | MVP |
| Auto-debit / e-mandate | C | v2 |

**US-8.1 Collect at the counter.** As an accountant, I want to take a payment and print a receipt in under 30 seconds.
- Given the fee counter, when I type an admission number or name, then an `Autosuggest` shows matches with photo, class and section, and guardian name. Enter selects the first.
- Then the student's open invoices are listed, oldest first, with the oldest overdue preselected and the total to collect filled in.
- When I choose "Cash" and "Collect ₹12,500", then a Payment is created with the next receipt number, allocated oldest-first, and the receipt PDF opens in the print dialog. The `Flashbar` says "Receipt RCPT/2026-27/000871 created for ₹12,500."
- Given I click Collect twice quickly, then only one payment is created (idempotency key per form instance).

**US-8.2 Pay online.** As a parent, I want to pay all dues for both children in one go.
- Given I have dues for two children, then the Fees page shows the dues per child, "Total due ₹24,300", and one "Pay now" button.
- When I pay through Razorpay Checkout (UPI), then on success I return to "Payment received. Receipt RCPT/2026-27/000902 has been emailed to you." and my dues show ₹0.
- Given the browser closes before the redirect, then the Razorpay webhook still captures the payment, and the receipt appears within 1 minute. No double charge on retry: the order is reused while it is pending.
- Given a payment fails, then I see "Payment didn't go through. You haven't been charged. Try again or use another method."

**US-8.3 Chase dues.** As an accountant, I want to remind all parents with dues over 15 days in one action.
- Given the dues report filtered to "Overdue > 15 days", when I select all and choose "Send reminder", then I see a preview of the SMS template with the character count and the SMS credit estimate, and I confirm.
- Then reminders queue with per-guardian delivery status, quiet hours are respected, and nobody gets more than one reminder per 72 h.

---

## 9. Communication

| Feature | MoSCoW | Release |
|---|---|---|
| Announcements to the school, branch, class, section or role, with scheduling and expiry | M | MVP |
| Notices with attachment and acknowledgement tracking | S | MVP |
| In-app notifications centre + drawer | M | MVP |
| Channels: in-app, email, SMS, web push, with per-user category preferences | M | MVP |
| Quiet hours | M | MVP |
| Parent ↔ teacher messaging (threads in the context of a student) | M | v1 |
| Student ↔ teacher messaging (off by default, school setting) | C | v1 |
| Teacher office hours (messages outside them get an auto-reply) | C | v1 |
| PTM events: slot generation, parent booking, reminders, online meeting link | S | v1 |
| WhatsApp Business channel | C | v2 |
| Emergency broadcast (bypasses quiet hours, principal + school_admin only) | S | v1 |

**US-9.1 Announcement.** As a principal, I want to tell Class 9 parents about a schedule change.
- When I create an announcement with the audience "Class 9 · Parents" and the channels In-app + SMS, then before publishing I see "This will reach 164 parents. SMS: 164 messages (1 credit each)."
- Given the body is over 160 characters and SMS is on, then SMS sends a shortened text + a link, and I see a preview of the exact SMS.

**US-9.2 Message a teacher.** As a parent, I want to message my child's class teacher without knowing their number.
- Given I open Messages → "New message", then I can pick only teachers who teach my child (class teacher first).
- Given I send a message at 22:30, then it is delivered in-app immediately but notified to the teacher at 07:00 (quiet hours), and I see "Ms. Nair will be notified at 7:00 AM."

**US-9.3 Book a PTM slot.** As a parent, I want to book a slot with each of my child's teachers.
- Given a PTM is open, then I see each teacher's free 10-minute slots. Booking one holds it immediately, and double-booking is impossible (a unique index).
- I get a reminder 1 hour before, with the room or the meeting link.

---

## 10. Library, transport, hostel and inventory

| Feature | MoSCoW | Release |
|---|---|---|
| Library catalogue (ISBN lookup), copies with accession numbers and barcodes | M | v1 |
| Circulation: issue and return by scan, loan limits by member type | M | v1 |
| Overdue tracking, fines, reminders | S | v1 |
| Book reservations | C | v2 |
| Vehicles, drivers, documents with expiry alerts | M | v1 |
| Routes, ordered stops, stop pickup/drop times | M | v1 |
| Student transport assignment → transport fee invoice lines | M | v1 |
| "Notify route" (delay/breakdown message to the route's guardians) | S | v1 |
| Live GPS tracking and ETA for parents | C | v2 |
| Bus boarding attendance | C | v2 |
| Hostels, rooms, beds, allocations, hostel fee | S | v2 |
| Hostel attendance (night roll call), outpass | C | v2 |
| Inventory items, stock in/out, reorder alerts | S | v2 |
| Purchase requests with approval | C | v2 |

**US-10.1 Issue a book.** As a librarian, I want to issue a book with two scans.
- Given the circulation screen with focus in the scan input, when I scan a student's ID card and then a book's barcode, then the loan is created with the due date (14 days, per settings), and I hear no sound but see "Issued 'Wings of Fire' to Kabir Mehta (9-A). Due 14 Oct."
- Given the student already has the maximum loans (2), then I see "Kabir has 2 books already (limit 2). Return one first."

**US-10.2 Vehicle document expiry.** As a transport manager, I want to know before a vehicle's insurance lapses.
- Given insurance expiring within 30 days, then the dashboard attention list shows "KA-01-AB-1234: insurance expires 15 Oct", and I get a notification 30, 7 and 1 days before.

---

## 11. Events, calendar and academic year

| Feature | MoSCoW | Release |
|---|---|---|
| School calendar (month, week, agenda) with events and holidays | M | MVP |
| Holidays block attendance and shift due dates if configured | M | MVP |
| Events with an audience; exams and PTM appear automatically | S | MVP |
| Subscribe to the calendar via iCal link (per user, tokenised) | C | v1 |
| Academic year setup wizard and year closing (locks records, carries balances forward) | M | MVP |

**US-11.1 Close the academic year.** As a school admin, I want to close 2025–26 safely.
- Given pending items (unsubmitted marks, unpromoted students, open invoices), when I start "Close year", then I see a checklist of blockers with links. I can't close while blockers remain, except open invoices, which carry forward as opening balances.
- When closed, then the year becomes read-only, and 2026–27 becomes current.

---

## 12. Dashboards, analytics and reports

| Feature | MoSCoW | Release |
|---|---|---|
| A role dashboard for all 9 roles (see [10-screen-specs.md](10-screen-specs.md#dashboards)) | M | MVP |
| "Needs your attention" list for the principal, school_admin and accountant | M | MVP |
| KPI tiles that drill down to filtered tables | M | MVP |
| Standard reports: attendance, fees, admissions, exam results, staff, library, transport | M | MVP (v1 for the v1 modules) |
| Export to CSV and XLSX; PDF for print-oriented reports | M | MVP |
| Scheduled reports by email (weekly) | C | v1 |
| Rearrangeable dashboard boards (staff) | C | v1 |
| Custom report builder | W | — |

**US-12.1 Drill down.** As a principal, I want to click "Attendance today 91.4%" and see who is absent.
- When I click the tile, then I land on the attendance register filtered to today, status = absent, grouped by section, with the URL reflecting the filter.

---

## 13. Audit, settings, import/export and backups

| Feature | MoSCoW | Release |
|---|---|---|
| Append-only audit log of every mutation and every sensitive read (medical, Aadhaar, exports) | M | MVP |
| Record history tab (who changed what) on student, staff, invoice and marks | M | MVP |
| School settings (profile, branding, attendance, fees, notifications, modules on/off) | M | MVP |
| Data import (students, guardians, staff, opening balances, marks, books) | M | MVP |
| Data export (every table view; the full school export as a ZIP of CSVs for portability) | M | MVP |
| Automated backups (continuous with point-in-time recovery), and restore by the platform team | M | MVP |
| A per-school restore to a sandbox for investigation | C | v2 |
| Data subject requests (access, correction, erasure) workflow | S | v1 |

**US-13.1 See who changed a mark.** As a principal, I want to see the history of a changed mark.
- Given a mark was edited after submission, then the marks grid shows an "Edited" badge. The History tab shows "Priya Nair changed Theory from 56 to 65 on 3 Oct 10:42. Reason: re-evaluation."

---

## 14. Advanced

| Feature | MoSCoW | Release |
|---|---|---|
| Student and parent self-service portal (fees, results, attendance, documents, certificate requests, leave) | M | MVP (grows with the modules) |
| Installable PWA with push notifications | M | v1 |
| Offline attendance and homework viewing | S | v1 |
| Multi-language UI (en, hi) with RTL-ready layout | M | MVP |
| Additional languages (mr, ta, te, kn, bn) | C | v2 |
| At-risk student insights (rule-based, explainable) | S | v2 |
| Performance trends (per student, subject, section across exams) | S | v2 |
| AI-written narrative summaries for the principal (opt-in, no PII sent) | C | v2 |
| AI draft of report card remarks for teachers to edit | C | v2 |
| Chatbot for parents | W | — |

**US-14.1 At-risk list.** As a principal, I want a weekly list of students who may need help, and to know why.
- Given insights are enabled, then every Monday the list shows students with a risk level of Medium or High, sorted by score, each showing its top factors in plain language ("Attendance 71% in the last 30 days (school avg 92%)", "Maths fell from 68% to 41% between Unit Test 1 and Half-Yearly").
- When I open "Why?", then I see every factor, its weight and the data behind it. There is no hidden score.
- When I choose "Acknowledge" and assign a follow-up to the class teacher, then it's recorded, and the student leaves the new list until their score changes by ≥ 10.
- The feature never shows the score or level to students or parents ([ADR-008](23-decision-log.md#adr-008-rule-based-explainable-risk-scoring-first)).

**US-14.2 Hindi UI.** As a parent, I want the app in Hindi.
- Given I choose हिन्दी in the profile or sign-in page, then every screen, notification, SMS template and PDF receipt (bilingual) is in Hindi. Names and numbers are shown as entered. Dates use the Indian format (30 सितंबर 2026).

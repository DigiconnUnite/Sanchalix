# 10 · Screen Specifications

Specifications for every key Vidyawan screen: purpose, roles, URL, Cloudscape components, icons (keys from [09-iconography.md](09-iconography.md#5-complete-icon-map)), the four states, validation and microcopy. URLs follow [07-information-architecture.md](07-information-architecture.md#url-structure). Principles: [06-ux-principles.md](06-ux-principles.md). Words: [12-content-and-microcopy.md](12-content-and-microcopy.md). Data: [14-data-model.md](14-data-model.md). Endpoints: [15-api-spec.md](15-api-spec.md).

## State patterns

Shared by every screen unless the spec overrides them.

| State | Default implementation |
|---|---|
| Loading (first load) | Server-rendered shell (nav, header, breadcrumbs) + region skeletons: `Table loading loadingText="Loading students"`, `Container` with a `Spinner` for cards |
| Loading (refetch) | Keep the current data visible; `Table loading` overlay only if it takes > 300 ms |
| Empty (none yet) | `Box textAlign="center"` + `Icon size="large"` (module icon) + `Box variant="h3"` heading + one line + primary `Button` |
| Empty (filtered) | "No matches" + "No students match these filters." + `Button` "Clear filters" |
| Error (region) | `Alert type="error" header="Couldn't load students"` + reason + `Button iconSvg={svg('refresh')}` "Retry"; the request ID in small text for support |
| Error (action) | `Flashbar` error with the object name + what to do; form input kept |
| Error (field) | `FormField errorText` shown on blur and on submit; the first invalid field receives focus |
| Success | `Flashbar` success naming the object + a follow-up action; auto-dismiss after 10 s unless it has an action |
| 403 | `ContentLayout` with an `Alert type="info"`: "You don't have access to this page." + "Go to dashboard" |
| 404 | "We couldn't find that student. It may have been removed or you may have followed an old link." + "Back to students" |
| Read-only | `Alert type="info"` at the top explaining why ("2025–26 is closed. Records are read-only.") and edit actions hidden |
| Offline (PWA) | `Alert type="warning"` with the `offline` icon; queued actions show "Saved on this device" |

---

## Shell

### S01 · App shell
- **Purpose:** consistent navigation and context on every authenticated page.
- **Components:** `TopNavigation` (identity, utilities), `AppLayout` (`navigation` = `SideNavigation`, `breadcrumbs` = `BreadcrumbGroup`, `notifications` = `Flashbar`, `drawers` = Help + Notifications), `ContentLayout`.
- **Icons:** `notifications`, `switchRole`, `profile`, `school`, `academicYear`, `help`, `themeToggle` (the mode toggle); side nav items per role ([07-information-architecture.md](07-information-architecture.md#navigation-per-role)), the active one Filled.
- **Behaviour:** the nav state (collapsed or open) persists per user. The notifications badge updates via SSE every 30 s. `/` focuses search.
- **Microcopy:** profile menu: "My profile", "Appearance", "Density", "Language", "Keyboard shortcuts", "Contact support", "Sign out".

### Global search
- **Purpose:** jump to any student, staff member, invoice, receipt or page.
- **Components:** the `TopNavigation` search slot → `Autosuggest` with grouped options (`Students`, `Staff`, `Invoices and receipts`, `Pages`); each student option shows the photo, "7-B · VWN-2026-00412".
- **States:** loading "Searching…"; empty "No results for "aarav". Try an admission number or phone number."; error "Search isn't available right now. Try again."
- **Validation:** minimum 2 characters; debounced 250 ms.

### S02 · Sign in
- **URL:** `/signin`, `/signin/otp`. **Roles:** all.
- **Components:** centred `Container` (max 440), `Tabs` ("Phone" | "Email"), `FormField` + `Input`, `Button variant="primary"` "Send code" / "Sign in", `Button` "Continue with Google" (staff only), a `Select` for language at the top right.
- **Icons:** `signIn`, `language`.
- **States:** sending "Sending code…"; wrong code "That code isn't right. 3 attempts left."; locked "Too many attempts. Try again in 15 minutes."; success redirects to the role dashboard or the deep link.
- **Validation:** phone is 10 digits for +91 (the country code is selectable); OTP is 6 digits and auto-submits when complete; the OTP field has `autocomplete="one-time-code"`.
- **Microcopy:** "Sign in to {schoolName}". Resend: "Didn't get it? Resend in 0:28".

### S03 · 2FA setup and challenge
- **Components:** `Wizard` (Scan QR → Enter code → Save recovery codes); `CopyToClipboard` for the manual key and recovery codes; `Button iconSvg={svg('download')}` "Download codes".
- **Icons:** `security`, `password`.
- **Validation:** a 6-digit TOTP within ±1 step.
- **Microcopy:** "Save these codes somewhere safe. Each one works once if you lose your phone."

---

## Dashboards

Built with `Board` (staff, rearrangeable in v1) or `Grid` (student, parent). Every KPI links to a filtered list (P5). The first widget is always the role's primary action or its attention list.

### S04 · Principal dashboard
- **Widgets:**
  1. **Needs your attention** (`Container` + list): pending approvals by type with counts ("4 leave requests", "2 refunds"); "3 sections haven't submitted attendance"; "7 marks schedules overdue"; each row links to its filtered queue. Icons: `leave`, `refund`, `attendance`, `marksEntry`.
  2. **Today's attendance** KPI: "94.1%", a trend icon (`trendUp`/`trendDown`) + "Up 1.2% from last week"; → the register filtered to today.
  3. **Fee collection this month**: "₹18.4L of ₹22.0L (84%)" `ProgressBar`; → the finance report.
  4. **Attendance trend** (30 days) `CartesianChart` line, with "View as table".
  5. **At-risk students (v2)**: count by level + top 5, icon `atRisk`.
  6. **Upcoming**: the next 5 events from the calendar.
- **Empty:** "All clear. Nothing needs your attention right now." with `success` icon 32px.

### S05 · Teacher "Today"
- **Widgets:** **Now/Next** card (current period: "Period 3 · 7-B · Mathematics · Room 204" + primary `Button iconSvg={svg('attendance')}` "Take attendance"); today's timetable (a list with the current item highlighted); "Homework to check: 12 submissions"; "Marks due: Half-Yearly 7-B Maths by 10 Oct"; unread messages.
- **Empty (no periods today):** "No classes today" + the next working day's first period.
- **Mobile:** single column; the Now/Next card is sticky.

### S06 · Parent home
- **Header:** child switcher (`SegmentedControl` for ≤ 3 children, `Select` above that) with each child's photo and class.
- **Cards:** **Today** ("Kabir is at school · marked present at 8:04" / "Absent today" / "Attendance not yet taken"); **Fees** ("₹12,500 due by 10 Oct" + primary "Pay now"; or "No dues" with `success`); **Homework due** (3); **Latest announcement**; **Next event**.
- **Icons:** `students`, `attendance`, `fees`, `homework`, `announcements`, `calendar`.
- **Empty:** a new parent sees "Welcome to Vidyawan" + "Your child's attendance, fees and homework will appear here."

### S07 · Accountant dashboard
- **Widgets:** "Collected today ₹3,42,000 · 57 receipts" (split by method in a `PieChart`); "Pending reconciliation: 2 payments" (→ reconciliation); dues ageing (0–15, 16–30, 31–60, 60+) as a bar chart with click-through; primary action `collectPayment` "Open fee counter".

### S08 · Student "Today"
- Timetable for today, homework due (with "Submit"), announcements, and the attendance % this month. Bottom tab bar on mobile.

### S09 · School admin, librarian, transport manager and super admin dashboards
- **School admin:** admissions funnel (enquiry → accepted this month), today's attendance, pending documents, TC requests, import jobs.
- **Librarian:** loans today, overdue count (→ list), primary action "Open circulation".
- **Transport manager:** routes at capacity, document expiries within 30 days, today's delay notices.
- **Super admin:** schools by status, onboarding checklist progress per school, platform error rate, SMS credit balance per school.

---

## Students

### S10 · Student list
- **URL:** `/students`. **Roles:** school_admin, principal, teacher (assigned sections only).
- **Components:** `Header` (counter "(1,176)", actions: `ButtonDropdown` "Actions" [Promote, Transfer section, Print ID cards, Export], `Button variant="primary"` "Add student"); `Table` with `PropertyFilter` (Class, Section, Status, Gender, Transport, Has dues), `Pagination`, `CollectionPreferences`. `Cards` on mobile.
- **Columns:** photo + name (link), admission no., class-section, roll no., primary guardian + phone, attendance % (this month), dues (₹), status (`StatusIndicator`).
- **Icons:** `students` (empty state), `add`, `export`, `promote`, `idCard`.
- **Empty:** "No students yet" + "Add students one by one or import them from a spreadsheet." + primary "Import students" + secondary "Add student".
- **Microcopy:** bulk bar "3 students selected".
- **Built so far:** name (a link to the profile), admission no., class-section, roll no., parent + phone and status; a status `Select` filter; "Add student" for roles with `sis.student.create`. Not yet: photo, attendance %, dues, `PropertyFilter`, bulk actions, import.

### S11 · Student profile
- **URL:** `/students/{id}?tab=`. **Roles:** per matrix; parents see a reduced version (no history or internal notes).
- **Components:** `Header` (photo, name, "7-B · Roll 12 · VWN-2026-00412" + `CopyToClipboard`, actions: "Edit", `ButtonDropdown` [Issue certificate, Transfer section, Transfer out, Print ID card, Download transcript]); `Container` with `KeyValuePairs` (DOB, gender, blood group, guardians, transport stop, house); `Tabs`: Overview · Attendance (calendar heatmap + list) · Academics (exam results, trend chart) · Fees (invoices + payments tables) · Documents (`FileUpload` + table with verify actions) · Guardians · Medical (restricted) · History (audit).
- **Icons:** `certificate`, `transfer`, `idCard`, `transcript`, `documents`, `guardians`, `auditLog`, `atRisk` badge (v2).
- **Security UX:** the Medical and Aadhaar fields are masked ("•••• 4821") with a "Show" button that logs a sensitive read and shows "Viewing is recorded in the audit log."
- **Error:** 404 as in the state patterns.
- **Built so far:** the header (name, "7-B · Roll no. 12"), and the tabs Overview (`KeyValuePairs`), Parents and History (roles with `audit.log.read`), synced to `?tab=`. `/students/new` is a single `Form` with Student, Parent or guardian and Address containers. Not yet: photo, edit, the action menu, and the Attendance, Academics, Fees, Documents and Medical tabs.

### S12 · Admission pipeline
- **URL:** `/admissions`. **Components:** `SegmentedControl` (Board | Table). The board view is a `Board` with one column per status, cards showing the applicant, the class sought and the documents progress ("3/5"). The table view has `PropertyFilter` (status, class, source, date).
- **Primary action:** `admissions` "New enquiry".
- **Detail (`/admissions/{id}`):** a `Steps` status timeline; `KeyValuePairs`; a Documents checklist (`Table` with Verify / Request actions); `Header` actions by status ("Schedule assessment", "Make offer", "Accept and enroll" (primary), "Reject").
- **Validation:** DOB gives an age that suits the class sought (a warning, not an error): "Age 5y 2m is below the usual 6+ for Class 1."

### S13 · Accept and enroll wizard
- **Steps:** 1 Section (`Tiles` with each section's strength "36 / 40" and class teacher) · 2 Fees (fee structure `Select` pre-filled, discounts auto-detected: "Sibling discount 10% applies (Kabir Mehta, 9-A)") · 3 Review (`KeyValuePairs`) → "Accept and enroll".
- **Success:** a `Flashbar` + redirect to the new profile.

### S14 · Promotion wizard
- **Steps:** 1 Choose class and target year · 2 Review students (a `Table` with inline `Select` per row: Promote to 8-B / Detain / Graduate / Leave; bulk "Set all") · 3 Confirm (a summary: 38 promote, 2 detain).
- **Validation:** the target year must exist with sections; a detained student must have a reason.

---

## Attendance

### S15 · Take attendance
- **URL:** `/attendance/take?section=&date=&period=`. **Roles:** teacher (assigned), school_admin.
- **Components:** `Header` with a section `Select`, `DatePicker` (future dates disabled, holidays marked) and the period (period mode); a sticky summary `Box` ("38 present · 2 absent · 0 late"); a `SegmentedControl` "Grid | List"; **List view (default on mobile):** a `Cards`-style list, each row with the photo, roll number and name, and a `SegmentedControl` (P / A / L) plus a "More" `ButtonDropdown` (Half day, Leave, Add note); **Grid view (desktop):** a compact tile grid, where clicking cycles the status; "Mark all present" and "Mark all absent" in the header dropdown; primary `Button` "Submit attendance".
- **Icons:** `attendance`, `qrAttendance` (v2 "Scan QR"), `offline`, `holiday`.
- **States:** loading shows the roster skeleton; empty "No students in 7-B yet. Ask the office to add students."; holiday: an `Alert` "Today is a holiday (Gandhi Jayanti). Attendance isn't needed." with no form; already submitted: read-only view + "Edit attendance" (within the edit window of the same day, then principal only, with a reason); offline: "Saved on this device. We'll sync it when you're back online."; success: "Attendance for 7-B submitted. 38 present, 2 absent. Guardians of absent students will be notified at 9:30 AM."
- **Keyboard:** ↑/↓ moves between students; P, A, L and H set the status; Ctrl+Enter submits.
- **Validation:** every student has a status (they default to present, so this is always true); a note is ≤ 200 characters.
- **Built so far:** one `Table` (roll no., name, a five-option `SegmentedControl` per student that Cloudscape turns into a `Select` on narrow screens), a section `Select` and `DatePicker` in the header, the live summary, "Mark all present", and "Submit attendance" / "Update attendance". Holiday, non-working day, future date, already submitted and read-only (principal) states show an `Alert`. Not yet: the grid view, notes, period mode, keyboard shortcuts, offline, and the absence-alert sentence in the success message.

### S16 · Attendance register
- **URL:** `/attendance/register?section=&month=`. A `Table` with students × days (sticky first column), cell values P/A/L/H/½ with `StatusIndicator`-coloured text + a letter (never colour alone); a totals column; the export action. On mobile: a per-student `Cards` list with the month %.
- **Built so far:** the students × days `Table` with the first two columns sticky, coloured letters (P, A, L, ½, Lv) explained by a legend line, H for holidays and — for non-working days, Present / Absent / Attendance % totals, a section `Select` and a month `DatePicker`, and the mobile `Cards`. Not yet: export.

### S16b · Holidays
- **URL:** `/calendar/holidays`, `/calendar/holidays/new`. **Roles:** school_admin and principal.
- **Components:** a `Table` (date, holiday name, an icon-only delete button with the holiday's name in its `ariaLabel`), "Add holiday" as the primary action, and a short `Form` (date, name).
- **States:** empty "No holidays yet"; success "Gandhi Jayanti added. Attendance is blocked on that day."; a warning instead when attendance was already taken that day; delete is confirmed in a `Modal` ("Delete holiday Gandhi Jayanti?").
- **Icons:** `holiday`, `delete`.

---

## Exams

### S17 · Exams and schedules
- `/exams`: a `Table` of exams (name, term, classes, status). `/exams/{id}`: `Tabs` Schedule (a `Table` of class × subject × date × max marks, inline edit) · Marks progress (`ProgressBar` per section-subject, "32 of 40 entered") · Report cards.
- **Icons:** `exams`, `grading`, `reportCard`, `marksEntry`.

### S18 · Marks entry grid
- **URL:** `/exams/{id}/marks?class=&subject=&section=`. **Roles:** teacher (assigned), principal (moderation).
- **Components:** `Header` ("Half-Yearly 2026 · 7-B · Mathematics", status `StatusIndicator` "Marks open · closes 10 Oct"); a `Table` with inline editing (`editConfig`): Roll · Name · Theory (/80) · Internal (/20) · Total · Grade · Absent (`Checkbox`); a per-row save status (`StatusIndicator type="success"` "Saved" / `loading` "Saving" / `error` "Not saved – retry"); a footer summary "Class average 64.2 · Highest 96 · 3 absent"; primary "Submit for review".
- **Keyboard:** Enter saves and moves down, Tab moves right, Esc cancels a cell edit; typing a number starts editing.
- **Validation:** 0 ≤ marks ≤ max, up to 0.5 steps (a school setting), with the inline error "Must be between 0 and 80"; Absent clears the marks.
- **States:** locked: read-only, with an `Alert` "Marks are locked by the principal on 12 Oct. Ask the principal to unlock them for changes."; an autosave failure keeps the value in the cell with the error status and a "Retry" action; success: "Marks for 7-B Mathematics submitted for review."
- **Principal extras:** a `CartesianChart` distribution histogram, "Lock marks" (confirmation `Modal`: "Lock marks for 7-B Mathematics? Teachers won't be able to change them.").

### S19 · Report card generation and publishing
- A `Wizard`: Select exam(s) + sections → Check readiness (a `Table` of blockers: missing marks, missing remarks, with links) → Preview (a PDF preview of one student via an iframe) → Generate (a `ProgressBar` "Generating 312 of 1,176") → Publish (a `Modal`: "Publish results to 1,176 students and their parents? They'll be notified right away.").

---

## Homework

### S20 · Homework list and create
- **Teacher list:** a `Table` (title, sections, due, submissions "28/40", status). The primary action `homework` is "Set homework".
- **Create form:** Title (≤120), Sections (`Multiselect` of assigned sections), Subject (pre-filled), Instructions (`Textarea` with Markdown), Attachments (`FileUpload`, ≤ 5 × 10 MB), Due date (`DatePicker`, ≥ today), Graded (`Toggle` → Max marks), Allow late submissions (`Checkbox`).
- **Student list:** `Cards` grouped "Due today", "Upcoming", "Overdue", "Submitted"; the empty state uses `homework` 48px: "No homework due. Enjoy your evening!"

### S21 · Homework detail and submissions
- **Teacher:** `Tabs` Details · Submissions (a `Table`: student, status Submitted/Late/Missing, submitted at, marks; row click → the `splitPanel` with the attachments preview, marks `Input` and feedback `Textarea`, then "Save and next").
- **Student:** instructions + attachments + a submission area (`Textarea`, `FileUpload` with "Take photo" using `accept="image/*" capture="environment"`) + "Submit". Success: "Submitted to Ms. Nair at 5:42 PM."

---

## Fees

### S22 · Fee counter
- **URL:** `/fees/counter?student=`. **Role:** accountant.
- **Components:** a large `Autosuggest` student search, autofocused (options show the photo, name, class, admission number and guardian); after selection: a `Container` student summary (`KeyValuePairs`: class, guardian, phone, concessions), and a `Table` of open invoices with selection (the oldest overdue preselected; columns: invoice no., installment, due date, amount, paid, balance, status); the payment panel: Amount (`Input`, pre-filled with the selected balance, editable for partial), Method (`Tiles`: Cash `cash`, UPI, Card `onlinePayment`, Cheque, Bank transfer), with the conditional fields (cheque number and bank, UPI reference), a Note; primary `Button iconSvg={svg('collectPayment')}` "Collect ₹12,500".
- **Recent:** the last 5 students served, shown as `TokenGroup` chips for quick re-selection.
- **States:** no dues: the `success` icon (32px) + "No dues for Aarav Sharma."; success: a `Flashbar` "Receipt RCPT/2026-27/000871 created for ₹12,500." with "Print again" and "Email to guardian", and the print dialog opens automatically (school setting).
- **Validation:** the amount must be > 0 and ≤ the total selected balance ("Amount can't be more than the ₹12,500 due. For advance payments, use Settings → Fees → Allow advance."); a cheque number is 6 digits.
- **Keyboard:** `/` focuses the search; Alt+C collects.

### S23 · Invoices, payments and receipts
- Standard collection pages (`Table` + `PropertyFilter`: status, class, installment, due date range, method). The invoice detail shows the line items, concessions, late fee, payments allocated and history. The payment detail has the receipt preview, the refunds (`Steps`), and actions: Print (`print`), Email (`email`), Request refund (`refund`). **No edit or delete action exists on receipts.**

### S24 · Dues and reminders
- A `Table` with ageing filters (a `SegmentedControl`: All, 1–15, 16–30, 31–60, 60+ days), the total outstanding in the header; select → "Send reminder" (`send`) → a `Modal` preview: channels, the rendered template per channel, the recipient count, the SMS credit estimate, and "Skipped: 12 guardians reminded in the last 72 hours."

### S25 · Parent checkout
- **URL:** `/fees/pay?invoices=`. A per-child `Container` of dues with checkboxes (all selected), the total, the concessions shown, and a primary "Pay ₹24,300" → Razorpay Checkout (modal) → a return page.
- **States:** pending "Confirming your payment…" (polls for up to 60 s, then "This is taking longer than usual. We'll notify you when it's confirmed; you won't be charged twice."); success: a receipt summary + "Download receipt"; failure: "Payment didn't go through. You haven't been charged." + "Try again".

### S26 · Fee structure editor
- A `Wizard`: Basics (name, year, classes) → Fee lines (an inline-editable `Table` of fee head × amount, with a GST column shown for taxable heads) → Installments (a `Table` label/due date/percent with the running total "must equal 100%") → Review → "Submit for approval".

---

## Communication

### S27 · Announcement composer
- **Form:** Title, Body (`Tabs` Write | Preview), Audience (`Tiles`: Whole school / Classes / Sections / Roles → a conditional `Multiselect`), Channels (`Checkbox` In-app (always on, disabled with `disabledReason` "Every announcement appears in the app"), Email `email`, SMS `sms`, Push `push`), Requires acknowledgement (`Checkbox`), Schedule (`DatePicker` + `TimeInput`, or "Publish now"), Attachments.
- **Reach preview** (live, in the side `Container`): "Reaches 164 parents and 172 students. SMS: 164 messages × 1 credit." plus a rendered SMS preview with a character count.
- **Primary:** "Publish" / "Schedule". Success: "Announcement 'PTM on 12 Oct' published to 336 people."

### S28 · Messages
- **Desktop:** a two-pane layout (thread list `Table` / `Cards` on the left in `AppLayout` content, the thread in the `splitPanel`). **Mobile:** list → thread.
- **Thread:** messages with the sender, time and read state; the composer is a `Textarea` + `attach` + `send`; a quiet-hours notice under the composer: "Ms. Nair will be notified at 7:00 AM."
- **Empty:** `messages` 48px, "No messages yet" + "Message your child's teacher" (parent).

### S29 · Notifications drawer and page
- The drawer lists the latest 20 grouped by Today/Earlier, with unread styling (`Box fontWeight="bold"`) and "Mark all as read". Each item: the category icon, the title, a relative time and a link. `/notifications` has the full `Table` with a category filter.

### S30 · PTM booking (parent)
- Pick a child → the list of that child's teachers → for each, a `Cards` grid of free slots (time as the button label); booking → "Booked: Ms. Nair, 12 Oct 10:20–10:30, Room 204." Taken slots update live (a 409 conflict shows "That slot was just taken. Pick another.").

---

## Operations

### S31 · Library circulation
- **Components:** a scan `Input` (autofocus, `scanBarcode` icon button; barcode scanners type and press Enter); the member panel (`KeyValuePairs` + a current loans `Table`); the action result `Flashbar`.
- **Flow:** scan the member → scan books (each creates a loan) → "Done" clears the panel. A return is a single scan of the book when no member is selected.
- **States:** unknown barcode "No book or member with barcode 00923. Check the label or search manually."; limit reached (see US-10.1).

### S32 · Route detail (transport)
- `KeyValuePairs` (vehicle, driver, capacity bar "38 / 40"), a stops `Table` (order, stop, pickup, drop, students count), a students `Table`; actions: "Notify route" (`route`), "Edit stops"; v2: a live map tab.

---

## Settings and admin

### S33 · Settings
- A settings `SideNavigation` (School profile · Branches · Academic years · Users and roles · Notifications · Integrations · Data import and export · Audit log · Modules). Each section is a `Form` with `Container`s; save per section; unsaved-changes guard.
- **Branding:** a hex colour `Input` (Cloudscape has no colour picker, and a hex field is keyboard- and screen-reader-friendly) + a live preview `Container` showing a primary button and a link + the contrast check result ("Contrast 3.1:1: too low for buttons. Try #1F5FAD (4.8:1).").

### S34 · Users and roles
- A `Table` of users (name, roles as `Badge`s, scope, status, last sign-in); "Invite user" `Modal` (name, email/phone, role `Select`, scope `Select`); a detail view shows the permissions in effect (read-only list grouped by module, icon `roles`).

### S35 · Data import
- A `Wizard`: choose the type → download the template → upload (`FileUpload`, XLSX/CSV ≤ 10 MB) → validate (`ProgressBar`) → review (valid/invalid counts, an errors `Table`, "Download error file") → import → the done summary. The job continues if the user leaves.

### S36 · Audit log
- A `Table` (time, actor, role, action, entity (link), IP); `PropertyFilter` (actor, action, entity type, date range); a row expands via `ExpandableSection` to the before/after diff (`KeyValuePairs`, redacted fields shown as "Hidden (sensitive)"). Export CSV.

### S37 · Insights (v2)
- A `Table` of at-risk students (name, section, level `StatusIndicator` warning/error with text "Medium"/"High", top factor text, trend); row → the `splitPanel` "Why?" with the factor breakdown `KeyValuePairs` + mini-charts; actions: "Acknowledge", "Assign follow-up". A header `Alert type="info"`: "Scores are guidance to help you notice students early. They are never shown to students or parents."

---

## Built on 2026-10-05

- **Navigation** is grouped: People (Students, Admissions, Staff), Academics (Classes, Subjects, Timetable, Attendance, Homework, Holidays), Fees and Communication. The user menu has Profile and Sign out.
- **Student profile:** Edit and Withdraw student in the header (school admin); tabs Overview, Parents, Attendance, Fees, History. `/students/[id]/edit` reuses the Add student form without the section and guardian parts.
- **Import students** (`/students/import`): download the template, choose a CSV, Check file, then Import. Row errors are listed with row, column and problem.
- **Admissions** (`/admissions`, `/admissions/new`, `/admissions/[id]`): a list filtered by stage in the URL, a detail page whose primary button is the next stage, and a dialog that asks for the section and address when admitting.
- **Subjects** (`/academics/subjects`) and **Timetable** (`/academics/timetable?section=`): a periods-by-days grid per section; the office sets or clears a period in a dialog.
- **Homework** (`/homework`, `/homework/new`).
- **Leave** (`/leave`, `/leave/new`): staff see their own requests; the principal and school admin see all and decide in a dialog with an optional comment.
- **Student profile actions:** an Actions menu with Change section and Withdraw student, next to Edit.
- **Settings** (`/settings?tab=school|periods`): School (profile and working days) and Bell schedule (an `AttributeEditor` of periods with `TimeInput`), each with its own Save changes.
- **Export CSV** button on the Students, Dues and Payments tables.
- **Users** (`/users`, `/users/new`): the temporary password is shown once in a success alert with a copy button.
- **Student profile, Portal access tab:** the student and each guardian with their account email or "No account", and Create account.
- **Home for students and parents:** a summary (attendance, fees due, homework due), today's classes, homework, fees to pay, coming up. Parents with several children get a child selector in the header.
- **Calendar** (`/calendar/events?month=`): a month list of events and holidays with Previous and Next; Add event in a dialog.
- **Promotion** (`/promotion`): first a form to plan the next year; then a section picker and a table with a decision per student; Close year in the header, enabled when nobody is left in the current year.
- **Profile** (`/profile`): account details, density, change password.

## Form validation rules (shared)

| Field type | Rule | Error text |
|---|---|---|
| Required | Not empty after trimming | "Enter the student's first name" (a specific noun) |
| Phone (IN) | 10 digits starting 6–9 | "Enter a 10-digit mobile number" |
| Email | RFC 5322 basic | "Enter an email address like name@example.com" |
| Date of birth | Past date; age 2–25 for students | "Date of birth must be in the past" |
| Money | ≥ 0, up to 2 decimals in rupees; stored as paise | "Enter an amount in rupees, like 12500 or 12500.50" |
| Marks | 0 ≤ x ≤ max | "Must be between 0 and 80" |
| Files | Type and size | "This file is 14 MB. Upload a file up to 10 MB." |
| Pincode | 6 digits | "Enter a 6-digit pincode" |
| Dates in a range | End ≥ start | "End date must be on or after the start date" |

Errors show on blur for format and on submit for required fields; on submit, the first invalid field is focused, and a `Form errorText` summarises "Fix 2 fields to continue."

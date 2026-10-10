# 12 · Content and Microcopy

How Sanchalix speaks. Every string in the UI, notifications, SMS, emails and PDFs follows these rules, in English and Hindi. Defined terms are in [22-glossary.md](22-glossary.md). Screen-specific copy is in [10-screen-specs.md](10-screen-specs.md).

## Voice and tone

**Voice (constant):** clear, calm, respectful, helpful. Like a capable school office colleague, not a bank and not a chatbot.

| Situation | Tone | Example |
|---|---|---|
| Routine success | Brief, specific | "Attendance for 7-B submitted." |
| Money | Precise, reassuring | "Payment received. Receipt RCPT/2026-27/000902 has been emailed to you." |
| Errors | Calm, no blame, the fix first | "Payment didn't go through. You haven't been charged. Try again or use another method." |
| About a child (to parents) | Warm, factual, never alarming | "Kabir was marked absent today (30 Sep). If this is wrong, contact the class teacher." |
| Empty states | Encouraging, action-oriented | "No homework due. Enjoy your evening!" |
| Irreversible actions | Serious, explicit consequences | "Lock marks for 7-B Mathematics? Teachers won't be able to change them." |
| Insights (at-risk) | Careful, non-labelling | "May need support" (never "failing", "weak" or "problem student") |

## Writing rules

1. **Use sentence case** everywhere: "Take attendance", not "Take Attendance".
2. **Buttons are verb + noun**: "Collect payment", "Publish announcement", "Add guardian". Never "Submit", "OK", "Yes" or "Click here". A confirmation modal's primary button repeats the action ("Lock marks").
3. **Name the object** in success and error messages: "Receipt RCPT/2026-27/000871 created", not "Saved successfully".
4. **Say what happens next** when it isn't obvious: "Guardians of absent students will be notified at 9:30 AM."
5. **Address the user as "you"**. Refer to the system in the passive or as "we" sparingly ("We'll notify you when it's confirmed").
6. **No jargon**: no "record", "entity", "sync failed (409)" or "invalid input". Error codes appear only in small "Reference: req_8f3a…" text for support.
7. **No exclamation marks**, except in celebratory empty states (at most one per screen).
8. **Use numbers as digits**: "3 students", "₹12,500". Use Indian digit grouping (1,17,600) in `en-IN` and `hi-IN`.
9. **Keep it short**: headings ≤ 6 words, descriptions ≤ 2 sentences, SMS ≤ 160 characters (GSM-7) or 70 (Unicode/Hindi) per part.
10. **Don't use placeholder text as instructions.** Use `FormField description` or `constraintText`.
11. **Don't expose other families' data** in any message (e.g. no sibling names in reminders to a different guardian).
12. **Be inclusive**: "guardian" in forms (not only "father's name"), gender options include "Other" and "Prefer not to say".

## Formats

| Thing | Format (en-IN) | Format (hi-IN) |
|---|---|---|
| Date (short) | 30 Sep | 30 सित॰ |
| Date (full) | 30 Sep 2026 | 30 सितंबर 2026 |
| Date + time | 30 Sep 2026, 9:30 AM | 30 सितंबर 2026, सुबह 9:30 |
| Relative | 5 min ago, Yesterday | 5 मिनट पहले, कल |
| Money | ₹12,500 · ₹1,17,600 · ₹18.4L (dashboards only) | ₹12,500 |
| Phone | +91 98765 43210 (display), masked +91 98xxx xx210 | same |
| Class and section | 7-B | 7-B |
| Academic year | 2026–27 (en dash) | 2026–27 |
| Percent | 94.1% | 94.1% |
| Names | As entered; never translated or transliterated automatically | as entered |

All formatting goes through `Intl` with the user's locale. Never concatenate strings; use ICU messages with plurals: `{count, plural, one {# student} other {# students}}`.

## Terminology

Use the left column. Never use the right.

| Use | Don't use | Notes |
|---|---|---|
| Student | Pupil, learner, kid | |
| Parent | Guardian (in the UI), user | "Guardian" only in forms that capture relation ("Guardian name") |
| Class 7 | Grade 7, Std 7 | Schools can relabel in settings (e.g. "Grade") for international boards; the key stays `Class` |
| Section, 7-B | Division, batch | |
| Roll no. | Serial no. | |
| Admission no. | Student ID, enrollment ID | |
| Class teacher | Homeroom teacher | |
| Attendance | Presence | |
| Present / Absent / Late / Half day / On leave | P/A (except in the register grid, with labels) | |
| Homework | Home task | "Assignment" is used when the item is graded |
| Marks | Scores, points | |
| Report card | Result card, mark sheet | |
| Exam | Test (unless the type is "Unit test") | |
| Fees | Charges, billing | |
| Dues | Arrears, outstanding | "Outstanding" is allowed in finance reports only |
| Concession | Waiver | The umbrella term for discount + scholarship |
| Receipt | Voucher | |
| Invoice | Bill, challan | |
| Announcement | Circular, post | "Notice" when acknowledgement is required |
| Message | Chat, DM | |
| PTM | Parent meeting | Expanded on first use per screen: "Parent-teacher meeting (PTM)" |
| Transfer certificate (TC) | Leaving certificate | |
| Sign in / Sign out | Log in, logout | |
| Academic year | Session | Many schools say "session". Offered as a school setting label, but the key stays "Academic year" |

## Error messages

**Pattern:** *What happened* + *why (if helpful)* + *what to do*. Keep the user's input. Never blame.

| Situation | Message |
|---|---|
| Required field | "Enter the student's date of birth" |
| Format | "Enter a 10-digit mobile number" |
| Out of range | "Must be between 0 and 80" |
| Business rule | "You have 2 days of CL left. Choose fewer days or a different leave type." |
| Conflict (timetable) | "Priya Nair already teaches 7-B at this time" |
| Conflict (stale data, 409) | "Someone else changed this invoice while you were editing. Reload to see the latest version." (with a "Reload" button) |
| Permission (403) | "You don't have access to this page. If you think you should, ask your school admin." |
| Not found (404) | "We couldn't find that student. It may have been removed or you may have followed an old link." |
| Network / offline | "You're offline. We'll save your changes on this device and sync them when you're back online." |
| Server error (500) | "Something went wrong on our side. Your changes weren't saved. Try again in a moment. Reference: req_8f3a21." |
| Sign-in failed | "That email or password isn't right. Check both and try again." (the same for a wrong password and an unknown email) |
| Rate limit | "Too many attempts. Try again in 15 minutes." |
| Upload too large | "This file is 14 MB. Upload a file up to 10 MB." |
| Upload type | "Upload a PDF, JPG or PNG file" |
| Payment failed | "Payment didn't go through. You haven't been charged. Try again or use another method." |
| Payment pending | "This is taking longer than usual. We'll notify you when it's confirmed. You won't be charged twice." |
| Session expired | "You were signed out after 30 minutes of inactivity. Sign in again to continue. Your draft was saved." |

Form summary on submit: "Fix {count, plural, one {# field} other {# fields}} to continue."

## Empty states

| Screen | Heading | Body | Action |
|---|---|---|---|
| Student list (new school) | No students yet | Add students one by one or import them from a spreadsheet. | Import students |
| Filtered, no results | No matches | No students match these filters. | Clear filters |
| Teacher homework | No homework set | Homework you set for your classes appears here. | Set homework |
| Student homework | No homework due | Enjoy your evening! | — |
| Parent fees | No dues | You're all paid up. | View receipts |
| Messages | No messages yet | Messages with your child's teachers appear here. | Message a teacher |
| Principal attention | All clear | Nothing needs your attention right now. | — |
| Notifications | You're all caught up | New notifications appear here. | — |
| Library overdue | No overdue books | Every loaned book is within its due date. | — |

## Confirmation modals

- **Title** = the action as a question: "Void invoice INV/2026-27/004512?"
- **Body** = the consequence: "The student will no longer owe ₹12,500 for Q2. This can't be undone. Payments are not affected."
- **Buttons:** `Cancel` (normal) + the action (primary): "Void invoice".
- Deleting important records requires typing the name: "Type 7-B to confirm."

## Notification and SMS templates

Templates are keyed and versioned in `src/server/notifications/templates/{key}.{locale}.ts`. SMS templates must match the DLT-registered text exactly ([21-notifications-and-integrations.md](21-notifications-and-integrations.md#sms-msg91)).

| Key | Channel | English | Hindi |
|---|---|---|---|
| `attendance.absent` | SMS | "{school}: {studentFirst} was marked absent today ({date}). If this is wrong, contact the class teacher. -Sanchalix" | "{school}: {studentFirst} आज ({date}) अनुपस्थित दर्ज हुए। गलत हो तो कक्षा अध्यापक से संपर्क करें। -Sanchalix" |
| `fees.due_soon` | SMS | "{school}: {amount} fees for {studentFirst} due on {dueDate}. Pay: {link} -Sanchalix" | "{school}: {studentFirst} की फीस {amount} {dueDate} तक देय। भुगतान: {link} -Sanchalix" |
| `fees.receipt` | Email subject | "Receipt {receiptNo} for {amount}" | "रसीद {receiptNo}: {amount}" |
| `exams.results_published` | Push | "{examName} results for {studentFirst} are out" | "{studentFirst} का {examName} परिणाम जारी" |
| `homework.due_tomorrow` | Push | "Due tomorrow: {subject} – {title}" | "कल जमा करें: {subject} – {title}" |
| `transport.delay` | SMS | "{school}: Bus on {route} is running about {minutes} min late. -Sanchalix" | "{school}: {route} की बस लगभग {minutes} मिनट देर से है। -Sanchalix" |

## Hindi localisation notes

- Translation is done by a native speaker familiar with school terms, not machine translation. Keep common English school words where parents use them ("फीस", "होमवर्क", "PTM", "रिपोर्ट कार्ड").
- Hindi strings run 20–40% longer, so layouts must not truncate labels (use wrapping, not ellipsis, for buttons).
- The number and date formats use `hi-IN` with Latin digits (the default); Devanagari digits are not used.
- Translators get the glossary + screenshots. Every key has a description comment in the catalogue for context.

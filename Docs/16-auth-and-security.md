# 16 · Authentication and Security

How Vidyawan authenticates users, authorises every action, protects children's data, and mitigates the OWASP Top 10. Vidyawan holds minors' personal data, so security and privacy rank first in the UX tie-breakers ([06-ux-principles.md](06-ux-principles.md#how-ux-decisions-get-made)). Target: **OWASP ASVS Level 2**. Roles and scopes: [02-personas-and-roles.md](02-personas-and-roles.md). Endpoints: [15-api-spec.md](15-api-spec.md).

## Authentication

| Method | Who | Details |
|---|---|---|
| Email or phone + password | Staff; parents who choose it | argon2id (`m=19456, t=2, p=1`), a minimum of 10 characters, checked against a top-100k breached password list, no composition rules (NIST 800-63B) |
| SMS OTP | Parents, students (primary) | 6 digits, 5 min expiry, 5 attempts, hashed (SHA-256 + pepper) in `otpChallenges`, 3 sends per 15 min per phone. The response is the same whether or not the phone exists |
| Google OAuth | Staff at Google Workspace schools | Allowed only for users whose email already exists (no self-signup); the `hd` claim is checked against the school's allowed domains |
| TOTP 2FA (switched off by default with `TWO_FACTOR_ENABLED=false` during development, [ADR-019](23-decision-log.md#adr-019-two-step-verification-switched-off-during-development); it must be on before real data) | **Mandatory** for super_admin, school_admin, principal and accountant; optional for the rest | RFC 6238, a ±1 step window, 10 single-use recovery codes (hashed). Wrong codes count towards the account lockout. **Current state:** the code is asked at every sign-in (the 30-day trusted device is not built), a code can be reused within its 90-second window (no replay protection yet), and the secret is encrypted in the application with AES-256-GCM keyed from `AUTH_SECRET` until CSFLE is set up |
| Passkeys (v2) | All | WebAuthn as a primary or second factor |
| Device keys (v2) | Biometric/GPS devices | Random 256-bit, hashed at rest, scoped to one school + device, rotatable |

### Sessions
- **Database sessions** (the `sessions` collection) so they can be revoked, written by `src/server/auth/session.ts` ([ADR-017](23-decision-log.md#adr-017-password-sign-in-writes-sessions-directly-without-authjs)). The cookie holds an opaque random token (only its SHA-256 hash is stored): `__Host-vw.session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`. Local development uses `vw.session` without `Secure`, because `http://localhost` can't carry a `__Host-` cookie in every browser.
- **Idle timeout:** 30 min for staff roles handling money or PII (accountant, school_admin, principal); 8 h for teachers; 30 days (sliding) for parents and students on the installed PWA. Warning 2 min before expiry ([11-accessibility.md](11-accessibility.md), 2.2.1).
- **Absolute lifetime:** 12 h for 2FA roles, 90 days for others.
- The session ID rotates on sign-in, on a role switch, and on privilege change. Changing a password or disabling a user revokes all their sessions.
- Profile → Security → Active sessions lists the device, IP city and last active time, with "Sign out" per session and "Sign out all other devices".

### Account lifecycle
Invite (a one-time link, 72 h, single use) → Active → Locked (10 failed attempts set `lockedUntil`; auto-unlocks after 15 min, or a school admin unlocks) → Disabled (keeps the history; can't sign in). Staff exit: disabling the user revokes their sessions and removes their role assignments on the same day, which is a checklist item in the staff "Resigned" flow.

## Authorization (RBAC)

### Model
- **Role → permissions** (static, in `src/server/auth/permissions.ts`), e.g. `teacher: ['attendance.record.create', 'attendance.record.read', 'homework.homework.create', ...]`.
- **Assignment → scope**: `{ role, schoolId, branchId?, scope }` on `User.roles`.
- **Resource check**: for `assigned`, `ward`, `self` and `route` scopes, the guard loads the relationship: e.g. a teacher may take attendance for section S only if `Section.classTeacherId = staffId` (daily mode) or a `TimetableSlot` exists for (S, teacher, day, period) (period mode).

Permission modules: `users`, `settings`, `sis`, `hr`, `academics`, `attendance`, `exams`, `homework`, `fees`, `comms`, `library`, `transport`, `hostel`, `inventory`, `calendar`, `reports`, `audit`, `data`, `insights`.

### Enforcement points (defence in depth)
| Layer | What it checks |
|---|---|
| `proxy.ts` | Authenticated for `(app)` routes; redirects to `/signin?next=`. **Not** trusted for authorization, only for convenience. |
| Page (RSC) | `requirePermission` before querying. Unauthorised → the 403 page. The navigation hides what the role can't use. |
| Server Action / Route Handler | `requirePermission(perm, resource)` is the **first line** of every action. This is the real gate, enforced by a lint rule and a unit test that scans actions. |
| Service | Receives `ctx`; scope-filters queries (e.g. `sectionId ∈ ctx.assignedSectionIds`) |
| Database | The tenant plugin forces `schoolId`. Unique indexes enforce invariants. |
| Field level | Projection helpers strip fields by role (`medical`, `aadhaarNo`, `salary`, `bank`) before data leaves the service |

```ts
export async function submitAttendance(input: unknown): Promise<ActionResult<Summary>> {
  const ctx = await requirePermission('attendance.record.create', { sectionId: (input as { sectionId?: string })?.sectionId });
  const data = SubmitAttendance.parse(input);
  return attendanceService.submit(ctx, data);
}
```

### Cross-tenant access
An ID from another school returns `NOT_FOUND` (not `FORBIDDEN`), so IDs can't be probed. `super_admin` has no implicit PII access. Break-glass requires a reason, lasts 60 minutes, notifies the school admin, and writes a high-severity audit entry.

## Encryption

| Data | Protection |
|---|---|
| In transit | TLS 1.2+ everywhere (CloudFront, ALB, Atlas, Redis in-transit encryption); HSTS `max-age=63072000; includeSubDomains; preload` |
| At rest (DB) | Atlas encryption at rest with a customer-managed AWS KMS key |
| Field-level 🔒 (Aadhaar, medical, bank, PAN, TOTP secret) | MongoDB Client-Side Field Level Encryption (CSFLE), AEAD_AES_256_CBC_HMAC_SHA_512. Deterministic for Aadhaar (equality lookup for duplicates), random for the rest. Data keys wrapped by KMS |
| Files (S3) | SSE-KMS, Block Public Access on, bucket policy denies non-TLS; access only via presigned URLs (60 s GET, 5 min POST) |
| Backups | Encrypted by Atlas; snapshots copied to a second region within India (ap-south-2, Hyderabad) |
| Secrets | AWS Secrets Manager, injected as ECS task secrets; never in the repo or images |

## OWASP Top 10 (2021) mitigations

| Risk | Vidyawan mitigation |
|---|---|
| **A01 Broken Access Control** | `requirePermission` first in every action and handler (lint-enforced); the tenant plugin; resource scope checks; 404 for cross-tenant IDs; field projection by role; an E2E permission matrix test per role ([18-testing-strategy.md](18-testing-strategy.md#security-tests)) |
| **A02 Cryptographic Failures** | TLS everywhere; KMS; CSFLE for sensitive fields; argon2id; no custom crypto; secrets in Secrets Manager |
| **A03 Injection** | Mongoose with Zod-validated, typed inputs; `sanitizeFilter` on; no `$where` or `$function`; user input never becomes an operator key (the PropertyFilter is translated through an allow-list of fields and operators); Markdown rendered with a sanitiser (no raw HTML); CSV exports neutralise formula injection (prefix `'` for `= + - @`) |
| **A04 Insecure Design** | Threat model per module (STRIDE) in the PR template for new modules; immutable receipts; idempotency keys; approval workflows for money (refunds, fee structures); rate limits on OTP and sign-in |
| **A05 Security Misconfiguration** | Security headers from `proxy.ts`: CSP with nonces (`default-src 'self'`; scripts `'self' 'nonce-…' checkout.razorpay.com js.stripe.com`; frames Razorpay and Stripe only), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), geolocation=(self), microphone=()`, `frame-ancestors 'none'`; infrastructure as code; no default credentials; `NODE_ENV=production`; error responses never include stack traces |
| **A06 Vulnerable Components** | Dependabot + `npm audit --omit=dev` in CI (fail on high); lockfile committed; monthly dependency update window; container image scanning (ECR/Inspector) |
| **A07 Identification and Authentication Failures** | Mandatory 2FA for privileged roles; lockout; breached password check; session rotation; OTP limits; no user enumeration on sign-in, OTP or password reset |
| **A08 Software and Data Integrity Failures** | Signed webhooks (HMAC verified with constant-time compare, and timestamp tolerance for Stripe); `npm ci` from the lockfile; CI builds signed images; branch protection with required reviews |
| **A09 Security Logging and Monitoring Failures** | The append-only `auditLogs` (DB user has insert/find only); security events (failed sign-ins, 403s, break-glass, exports, sensitive reads) go to CloudWatch with alarms (e.g. > 50 failed sign-ins per 5 min per school, any break-glass); logs contain no PII or secrets (pino redaction paths) |
| **A10 SSRF** | The server fetches only allow-listed hosts (Razorpay, Stripe, MSG91, SES, Open Library, the Claude API); no user-provided URLs are fetched; the VPC egress is restricted by security groups + a NAT allow-list |

Additional: **CSRF**: Server Actions check the `Origin` header (Next.js built-in), and route handlers that mutate require same-origin + `SameSite=Lax` cookies. **XSS**: React escaping, no `dangerouslySetInnerHTML` except in the Reicon library itself (static, vendor-controlled SVG) and the sanitised Markdown renderer. **File uploads**: type is checked by magic bytes, the size is limited by the presigned policy, uploads are scanned with ClamAV in the worker before becoming visible (`status: 'scanning' → 'clean'`), and file names are served with `Content-Disposition: attachment` unless they are images or PDFs.

## Data privacy (DPDP Act 2023)

Vidyawan is a **Data Processor**, and each school is the **Data Fiduciary**. Children's data (under 18) gets the Act's heightened protections.

| Obligation | Implementation |
|---|---|
| **Verifiable parental consent** for processing a child's data | At admission acceptance, the guardian receives the consent notice (in their language) and gives consent by OTP. The consent record (version, time, phone, IP) is stored on the student. Optional processing (photos in public event galleries, AI insights) gets separate toggles |
| **Notice** | A plain-language privacy notice per school, in en + hi, linked from sign-in and the admission form |
| **Purpose limitation** | Each role sees only the fields its work needs (the minimum-data rule in [02-personas-and-roles.md](02-personas-and-roles.md#rules-that-the-matrix-alone-does-not-capture)) |
| **No tracking, profiling or targeted advertising of children** | No third-party analytics or ad scripts; product analytics are first-party, aggregated and never tied to a student profile; at-risk insights are for school staff only, opt-in per school, explainable, and never shown to the child or used for automated decisions |
| **Data principal rights** (access, correction, erasure, grievance) | The `createDataRequest` workflow, tracked with an SLA of 30 days; the full export of a student's record as a ZIP; erasure respects legal retention (financial records are kept 8 years; everything else is purged or anonymised) |
| **Retention and deletion** | The schedule in [14-data-model.md](14-data-model.md#data-lifecycle), enforced by the `maintenance.purgeExpiredPII` job |
| **Breach notification** | An incident runbook: notify the school (fiduciary) within 24 h of detection with the details they need to inform the Data Protection Board and affected people ([20-devops-and-deployment.md](20-devops-and-deployment.md#incident-response)) |
| **Data residency** | All personal data is stored and processed in India (ap-south-1 / ap-south-2) |
| **Processors** | A DPA with each sub-processor (MongoDB, AWS, Razorpay, MSG91); listed in the school contract |

### AI and privacy (v2)
- Risk scoring runs inside Vidyawan's infrastructure. It is rule-based, so no data leaves.
- LLM features (narrative summaries, remark drafts) are **off by default**, enabled per school by the school_admin, with a notice. Requests contain only pseudonymised IDs and numeric or aggregated performance data. Names, photos, contact details, health and category data are never sent. Output is shown to staff for editing and never sent to parents automatically. The Claude API is used under a zero-data-retention agreement. Without one in place, the LLM features stay disabled.

## Audit logging

- Built so far: `auth.signIn`, `auth.signIn.recoveryCode`, `auth.totp.enable`, `sis.student.create`, `academics.class.create`, `academics.section.create`, `attendance.record.create`, `attendance.record.update`, `calendar.holiday.create`, `calendar.holiday.delete`, `fees.feeHead.create`, `fees.structure.create`, `fees.structure.approve`, `fees.payment.create`, `comms.announcement.publish`, `hr.staff.create`, `academics.section.update`, `sis.student.update`, `sis.student.withdraw`, `sis.student.import`, `sis.admission.create`, `sis.admission.update`, `sis.admission.accept`, `hr.staff.update`, `fees.structure.delete`, `academics.subject.create`, `academics.timetable.update`, `academics.timetable.clear`, `comms.announcement.acknowledge`, `auth.role.switch`, `sis.guardian.update`, `attendance.record.correct`, `auth.signIn.google`, `sis.document.create`, `sis.document.read`, `sis.document.verify`, `sis.document.delete`, `fees.checkout.create`, `auth.password.reset`, `auth.signIn.otp`, `fees.reminder.create`, `exams.reportCard.generate`, `exams.reportCard.update`, `exams.reportCard.publish`, `exams.exam.create`, `exams.schedule.create`, `exams.mark.update` (counts only, never the marks), `exams.mark.lock`, `exams.mark.unlock`, `exams.exam.publish`, `hr.attendance.update`, `settings.school.update`, `settings.periods.update`, `data.export`, `users.user.create`, `users.user.update`, `users.user.resetPassword`, `calendar.event.create`, `calendar.event.delete`, `settings.academicYear.create`, `settings.academicYear.close`, `sis.enrollment.promote`, `sis.student.transfer`, `hr.leave.create`, `hr.leave.approve`, `hr.leave.cancel`, `homework.assignment.create`, `homework.assignment.delete` and `auth.password.change`, written by `audit()` in `src/server/audit.ts`. Failed sign-ins are not yet logged.
- Logged: every mutation (the action permission string, entity, a before/after diff), sensitive reads (`revealSensitive`, exports, break-glass, "View as"), sign-ins and failures, role changes, settings changes.
- Diffs redact 🔒 fields ("changed", no values).
- The UI: Settings → Audit log, and the per-record History tab ([10-screen-specs.md](10-screen-specs.md#s36--audit-log)).
- Integrity: an append-only DB role; a daily hash chain (each day's entries are hashed with the previous day's hash, stored in S3 with Object Lock) to detect tampering.

## Security operations

| Practice | Cadence |
|---|---|
| Dependency and image scanning | Every CI run + daily |
| SAST (CodeQL) | Every PR |
| DAST (OWASP ZAP baseline) against staging | Nightly |
| Third-party penetration test | Before MVP go-live, then yearly and after major releases |
| Access review (AWS, Atlas, GitHub, provider consoles) | Quarterly |
| Secrets rotation | 90 days (automated where supported) |
| Restore drill | Quarterly ([20-devops-and-deployment.md](20-devops-and-deployment.md#backups-and-disaster-recovery)) |
| Security training for the team | Yearly + onboarding |
| Responsible disclosure | `security@vidyawan.app`, `/.well-known/security.txt` |

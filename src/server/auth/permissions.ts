import 'server-only';

export const ROLE_KEYS = [
  'super_admin',
  'school_admin',
  'principal',
  'teacher',
  'student',
  'parent',
  'accountant',
  'librarian',
  'transport_manager',
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const TOTP_REQUIRED_ROLES: readonly RoleKey[] = ['super_admin', 'school_admin', 'principal', 'accountant'];

export const SCOPES = ['platform', 'school', 'branch', 'assigned', 'route', 'self', 'ward'] as const;
export type Scope = (typeof SCOPES)[number];

export type Permission =
  | 'sis.student.read'
  | 'sis.student.create'
  | 'sis.student.update'
  | 'sis.certificate.create'
  | 'sis.certificate.approve'
  | 'academics.class.read'
  | 'academics.class.create'
  | 'academics.timetable.read'
  | 'academics.timetable.update'
  | 'homework.assignment.read'
  | 'homework.assignment.create'
  | 'sis.admission.read'
  | 'sis.admission.update'
  | 'sis.student.import'
  | 'sis.document.read'
  | 'attendance.record.read'
  | 'attendance.record.create'
  | 'attendance.record.update'
  | 'calendar.holiday.read'
  | 'calendar.holiday.update'
  | 'fees.structure.read'
  | 'fees.structure.update'
  | 'fees.structure.approve'
  | 'fees.invoice.read'
  | 'fees.discount.read'
  | 'fees.discount.update'
  | 'fees.discount.approve'
  | 'fees.payment.read'
  | 'fees.payment.create'
  | 'comms.announcement.read'
  | 'comms.announcement.create'
  | 'hr.staff.read'
  | 'hr.staff.create'
  | 'hr.staff.update'
  | 'exams.exam.read'
  | 'exams.exam.update'
  | 'exams.exam.publish'
  | 'exams.mark.update'
  | 'exams.mark.approve'
  | 'exams.reportCard.read'
  | 'exams.reportCard.create'
  | 'exams.reportCard.update'
  | 'exams.reportCard.publish'
  | 'hr.attendance.read'
  | 'hr.attendance.update'
  | 'hr.checkin.create'
  | 'hr.leave.read'
  | 'hr.leave.create'
  | 'hr.leave.approve'
  | 'users.user.read'
  | 'users.user.create'
  | 'users.user.update'
  | 'calendar.event.read'
  | 'calendar.event.update'
  | 'sis.enrollment.update'
  | 'portal.self.read'
  | 'settings.school.update'
  | 'settings.export'
  | 'platform.school.read'
  | 'platform.school.create'
  | 'platform.school.update'
  | 'platform.audit.read'
  | 'messaging.outbox.read'
  | 'audit.log.read';

const EVERYONE: readonly Permission[] = ['comms.announcement.read', 'calendar.event.read'];
const OWN_LEAVE: readonly Permission[] = ['hr.leave.read', 'hr.leave.create'];
// Staff mark themselves present by scanning the code at the entrance.
const OWN_CHECKIN: readonly Permission[] = ['hr.checkin.create'];

const ROLE_PERMISSIONS: Record<RoleKey, readonly Permission[]> = {
  super_admin: ['platform.school.read', 'platform.school.create', 'platform.school.update', 'platform.audit.read'],
  school_admin: [
    ...EVERYONE,
    'exams.reportCard.read',
    'exams.reportCard.create',
    'exams.exam.read',
    'exams.exam.update',
    'hr.staff.read',
    'hr.staff.create',
    'hr.staff.update',
    'hr.attendance.read',
    'hr.attendance.update',
    ...OWN_CHECKIN,
    'hr.leave.read',
    'hr.leave.approve',
    'settings.school.update',
    'settings.export',
    'messaging.outbox.read',
    'users.user.read',
    'users.user.create',
    'users.user.update',
    'calendar.event.update',
    'sis.enrollment.update',
    'comms.announcement.create',
    'sis.student.read',
    'sis.student.create',
    'sis.student.update',
    'sis.certificate.create',
    'sis.student.import',
    'sis.document.read',
    'sis.admission.read',
    'sis.admission.update',
    'academics.class.read',
    'academics.class.create',
    'academics.timetable.read',
    'academics.timetable.update',
    'homework.assignment.read',
    'attendance.record.read',
    'attendance.record.create',
    'calendar.holiday.read',
    'calendar.holiday.update',
    'fees.structure.read',
    'fees.discount.read',
    'fees.invoice.read',
    'fees.payment.read',
    'audit.log.read',
  ],
  principal: [
    ...EVERYONE,
    'exams.reportCard.read',
    'exams.reportCard.update',
    'exams.reportCard.publish',
    'exams.exam.read',
    'exams.exam.update',
    'exams.exam.publish',
    'exams.mark.update',
    'exams.mark.approve',
    'users.user.read',
    'calendar.event.update',
    'hr.staff.read',
    'hr.attendance.read',
    ...OWN_CHECKIN,
    'hr.leave.read',
    'hr.leave.approve',
    'comms.announcement.create',
    'sis.student.read',
    'sis.certificate.create',
    'sis.certificate.approve',
    'sis.document.read',
    'sis.admission.read',
    'academics.class.read',
    'academics.timetable.read',
    'homework.assignment.read',
    'attendance.record.read',
    'attendance.record.update',
    'calendar.holiday.read',
    'calendar.holiday.update',
    'fees.structure.read',
    'fees.structure.approve',
    'fees.discount.read',
    'fees.discount.approve',
    'fees.invoice.read',
    'fees.payment.read',
    'audit.log.read',
  ],
  teacher: [
    ...EVERYONE,
    'exams.reportCard.read',
    'exams.reportCard.update',
    'exams.exam.read',
    'exams.mark.update',
    ...OWN_LEAVE,
    ...OWN_CHECKIN,
    'sis.student.read',
    'attendance.record.read',
    'attendance.record.create',
    'academics.timetable.read',
    'homework.assignment.read',
    'homework.assignment.create',
  ],
  student: [...EVERYONE, 'portal.self.read'],
  parent: [...EVERYONE, 'portal.self.read'],
  accountant: [
    ...EVERYONE,
    ...OWN_LEAVE,
    ...OWN_CHECKIN,
    'fees.structure.read',
    'fees.structure.update',
    'fees.discount.read',
    'fees.discount.update',
    'fees.invoice.read',
    'fees.payment.read',
    'fees.payment.create',
  ],
  librarian: [...EVERYONE, ...OWN_LEAVE, ...OWN_CHECKIN],
  transport_manager: [...EVERYONE, ...OWN_LEAVE, ...OWN_CHECKIN],
};

export const can = (role: RoleKey, permission: Permission) => ROLE_PERMISSIONS[role].includes(permission);

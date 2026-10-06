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
  | 'messaging.outbox.read'
  | 'audit.log.read';

const EVERYONE: readonly Permission[] = ['comms.announcement.read', 'calendar.event.read'];
const OWN_LEAVE: readonly Permission[] = ['hr.leave.read', 'hr.leave.create'];

const ROLE_PERMISSIONS: Record<RoleKey, readonly Permission[]> = {
  super_admin: [],
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
    'hr.leave.read',
    'hr.leave.approve',
    'settings.school.update',
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
    'hr.leave.read',
    'hr.leave.approve',
    'comms.announcement.create',
    'sis.student.read',
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
    'fees.structure.read',
    'fees.structure.update',
    'fees.invoice.read',
    'fees.payment.read',
    'fees.payment.create',
  ],
  librarian: [...EVERYONE, ...OWN_LEAVE],
  transport_manager: [...EVERYONE, ...OWN_LEAVE],
};

export const can = (role: RoleKey, permission: Permission) => ROLE_PERMISSIONS[role].includes(permission);

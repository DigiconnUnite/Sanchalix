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
  | 'academics.class.read'
  | 'academics.class.create'
  | 'attendance.record.read'
  | 'attendance.record.create'
  | 'calendar.holiday.read'
  | 'calendar.holiday.update'
  | 'fees.structure.read'
  | 'fees.structure.update'
  | 'fees.structure.approve'
  | 'fees.invoice.read'
  | 'fees.payment.read'
  | 'fees.payment.create'
  | 'audit.log.read';

const ROLE_PERMISSIONS: Record<RoleKey, readonly Permission[]> = {
  super_admin: [],
  school_admin: [
    'sis.student.read',
    'sis.student.create',
    'academics.class.read',
    'academics.class.create',
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
    'sis.student.read',
    'academics.class.read',
    'attendance.record.read',
    'calendar.holiday.read',
    'calendar.holiday.update',
    'fees.structure.read',
    'fees.structure.approve',
    'fees.invoice.read',
    'fees.payment.read',
    'audit.log.read',
  ],
  teacher: ['sis.student.read', 'attendance.record.read', 'attendance.record.create'],
  student: [],
  parent: [],
  accountant: [
    'fees.structure.read',
    'fees.structure.update',
    'fees.invoice.read',
    'fees.payment.read',
    'fees.payment.create',
  ],
  librarian: [],
  transport_manager: [],
};

export const can = (role: RoleKey, permission: Permission) => ROLE_PERMISSIONS[role].includes(permission);

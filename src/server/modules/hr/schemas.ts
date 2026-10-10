import 'server-only';
import { z } from 'zod';
import type { LeaveBalance } from './leave';
import { STAFF_STATUSES, STAFF_TYPES } from '@/server/models/staff';

const E = 'hr.errors';

export const StaffInput = z.object({
  name: z.string().trim().min(1, `${E}.name`).max(120, `${E}.name`),
  designation: z.string().trim().min(1, `${E}.designation`).max(80, `${E}.designation`),
  department: z.string().trim().max(80, `${E}.department`).default(''),
  type: z.enum(STAFF_TYPES, `${E}.type`),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, `${E}.phone`)
    .transform((digits) => `+91${digits}`),
  email: z.union([z.literal('').transform(() => undefined), z.email(`${E}.email`)]).optional(),
  joinedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${E}.joinedOn`)
    .refine((date) => !Number.isNaN(Date.parse(date)), `${E}.joinedOn`),
});
export type StaffInput = z.infer<typeof StaffInput>;

export const StaffUpdate = StaffInput.extend({
  id: z.string().regex(/^[0-9a-f]{24}$/, `${E}.notFound`),
  status: z.enum(STAFF_STATUSES, `${E}.status`),
});
export type StaffUpdate = z.infer<typeof StaffUpdate>;

/** What the edit form starts from. The phone is the 10 digits the form asks for, without +91. */
export type StaffMember = {
  id: string;
  name: string;
  designation: string;
  department: string;
  type: string;
  phone: string;
  email: string;
  joinedOn: string;
  status: string;
};

export type StaffProfile = {
  id: string;
  name: string;
  employeeNo: string;
  designation: string;
  department: string | null;
  type: (typeof STAFF_TYPES)[number];
  phone: string;
  email: string | null;
  joinedOn: string;
  status: (typeof STAFF_STATUSES)[number];
  hasAccount: boolean;
  classTeacherOf: string[];
  teaches: { subject: string; sections: string; periods: number }[];
  leave: LeaveBalance[];
};

export const ListStaff = z.object({
  cursor: z.string().optional().catch(undefined),
  pageSize: z.coerce
    .number()
    .refine((size) => [10, 25, 50, 100].includes(size))
    .catch(25),
});
export type ListStaff = z.infer<typeof ListStaff>;

export type StaffRow = {
  id: string;
  name: string;
  employeeNo: string;
  designation: string;
  type: (typeof STAFF_TYPES)[number];
  phone: string;
  status: (typeof STAFF_STATUSES)[number];
};

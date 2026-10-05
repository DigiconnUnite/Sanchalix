import 'server-only';
import { z } from 'zod';
import { STUDENT_STATUSES } from '@/server/models/student';

export type StudentStatus = (typeof STUDENT_STATUSES)[number];

export const GENDERS = ['female', 'male', 'other', 'undisclosed'] as const;
export const RELATIONS = ['mother', 'father', 'guardian', 'other'] as const;
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

const Id = z.string().regex(/^[0-9a-f]{24}$/, 'sis.students.errors.section');
const required = (key: string, max: number) => z.string().trim().min(1, key).max(max, key);
const ageOn = (dob: string) => (Date.now() - Date.parse(dob)) / (365.25 * 24 * 60 * 60 * 1000);

export const ListStudents = z.object({
  status: z.enum(STUDENT_STATUSES).catch('active'),
  cursor: z.string().optional().catch(undefined),
  pageSize: z.coerce
    .number()
    .refine((size) => [10, 25, 50, 100].includes(size))
    .catch(25),
});
export type ListStudents = z.infer<typeof ListStudents>;

export const StudentInput = z.object({
  firstName: required('sis.students.errors.firstName', 60),
  lastName: z.string().trim().max(60, 'sis.students.errors.lastName').default(''),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'sis.students.errors.dob')
    .refine((dob) => !Number.isNaN(Date.parse(dob)) && ageOn(dob) > 0, 'sis.students.errors.dob')
    .refine((dob) => ageOn(dob) >= 2 && ageOn(dob) <= 25, 'sis.students.errors.dobAge'),
  gender: z.enum(GENDERS, 'sis.students.errors.gender'),
  sectionId: Id,
  bloodGroup: z.enum(BLOOD_GROUPS).optional(),
  guardians: z
    .array(
      z.object({
        name: required('sis.students.errors.guardianName', 120),
        relation: z.enum(RELATIONS, 'sis.students.errors.relation'),
        phone: z
          .string()
          .trim()
          .regex(/^[6-9]\d{9}$/, 'sis.students.errors.phone')
          .transform((digits) => `+91${digits}`),
        email: z.union([z.literal('').transform(() => undefined), z.email('sis.students.errors.email')]).optional(),
      }),
    )
    .min(1)
    .max(4),
  primaryGuardianIndex: z.number().int().min(0).default(0),
  address: z.object({
    line1: required('sis.students.errors.addressLine1', 120),
    city: required('sis.students.errors.city', 60),
    state: required('sis.students.errors.state', 60),
    pincode: z.string().trim().regex(/^\d{6}$/, 'sis.students.errors.pincode'),
  }),
});
export type StudentInput = z.infer<typeof StudentInput>;

export const StudentUpdate = StudentInput.pick({
  firstName: true,
  lastName: true,
  dob: true,
  gender: true,
  bloodGroup: true,
  address: true,
}).extend({ id: Id, version: z.iso.datetime() });
export type StudentUpdate = z.infer<typeof StudentUpdate>;

export const ImportStudents = z.object({ csv: z.string().max(1_000_000), dryRun: z.boolean() });

export const TransferStudent = z.object({ id: Id, sectionId: Id });

export const WithdrawStudent = z.object({ id: Id, reason: required('sis.students.errors.reason', 200) });

export type StudentRow = {
  id: string;
  name: string;
  admissionNo: string;
  classSection: string | null;
  rollNo: number | null;
  guardianName: string | null;
  guardianPhone: string | null;
  status: StudentStatus;
};

export type StudentProfile = {
  id: string;
  name: string;
  admissionNo: string;
  dob: string;
  gender: (typeof GENDERS)[number];
  bloodGroup: string | null;
  status: StudentStatus;
  classSection: string | null;
  rollNo: number | null;
  address: string | null;
  /** The raw values the edit form starts from, and the version that guards against overwriting someone else's change. */
  editable: {
    firstName: string;
    lastName: string;
    line1: string;
    city: string;
    state: string;
    pincode: string;
    version: string;
  };
  guardians: {
    id: string;
    name: string;
    relation: (typeof RELATIONS)[number];
    phone: string;
    email: string | null;
    isPrimary: boolean;
  }[];
};

export type HistoryEntry = { id: string; at: string; actor: string; action: string };

export type StudentAttendance = {
  present: number;
  absent: number;
  percent: number | null;
  days: { date: string; status: string }[];
  /** Period attendance in the same 60 days, per subject. Empty when the school takes only whole-day attendance. */
  bySubject: { subject: string; attended: number; total: number; percent: number }[];
};

export type StudentFees = {
  dueMinor: number;
  invoices: {
    id: string;
    invoiceNo: string;
    installment: string;
    dueDate: string;
    totalMinor: number;
    balanceMinor: number;
    status: string;
  }[];
  payments: { id: string; receiptNo: string; collectedAt: string; method: string; amountMinor: number }[];
};

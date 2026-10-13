import 'server-only';
import { z } from 'zod';
import { toMinor } from '@/lib/money';
import { INVOICE_STATUSES } from '@/server/models/invoice';

const Id = (message: string) => z.string().regex(/^[0-9a-f]{24}$/, message);
const E = 'fees.errors';

export const FeeHeadInput = z.object({
  name: z.string().trim().min(1, `${E}.headName`).max(60, `${E}.headName`),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,10}$/, `${E}.headCode`),
  gstRate: z.enum(['0', '5', '12', '18'], `${E}.gstRate`).transform((rate) => Number(rate) as 0 | 5 | 12 | 18),
  discountable: z.boolean().default(false),
});
export const FeeHeadDiscountable = z.object({ id: Id(`${E}.lineHead`), discountable: z.boolean() });
export type FeeHeadInput = z.infer<typeof FeeHeadInput>;

export const FeeStructureInput = z.object({
  name: z.string().trim().min(1, `${E}.structureName`).max(80, `${E}.structureName`),
  classIds: z.array(Id(`${E}.classes`)).min(1, `${E}.classes`),
  lines: z
    .array(
      z.object({
        feeHeadId: Id(`${E}.lineHead`),
        amountMinor: z
          .string()
          .transform((rupees) => toMinor(rupees) ?? 0)
          .refine((amount) => amount > 0, `${E}.amount`),
      }),
    )
    .min(1, `${E}.lines`)
    .refine((lines) => new Set(lines.map((line) => line.feeHeadId)).size === lines.length, `${E}.duplicateHead`),
  installments: z
    .array(
      z.object({
        label: z.string().trim().min(1, `${E}.installmentLabel`).max(40, `${E}.installmentLabel`),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${E}.dueDate`),
        percent: z.coerce.number().int(`${E}.percent`).min(1, `${E}.percent`).max(100, `${E}.percent`),
      }),
    )
    .min(1, `${E}.installments`)
    .max(12, `${E}.installments`)
    .refine((items) => items.reduce((sum, item) => sum + item.percent, 0) === 100, `${E}.percentTotal`),
});
export type FeeStructureInput = z.infer<typeof FeeStructureInput>;

export const FeeStructureId = Id(`${E}.structureNotFound`);

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const ListInvoices = z.object({
  status: z.enum(INVOICE_STATUSES).optional().catch(undefined),
  cursor: z.string().optional().catch(undefined),
  pageSize: z.coerce
    .number()
    .refine((size) => [10, 25, 50, 100].includes(size))
    .catch(25),
});
export type ListInvoices = z.infer<typeof ListInvoices>;

export const COUNTER_METHODS = ['cash', 'upi', 'card', 'cheque', 'bank_transfer'] as const;
export type CounterMethod = (typeof COUNTER_METHODS)[number];

export const CollectPayment = z
  .object({
    studentId: Id(`${E}.student`),
    allocations: z
      .array(z.object({ invoiceId: Id(`${E}.allocation`), amountMinor: z.number().int().positive(`${E}.payAmount`) }))
      .min(1, `${E}.payAmount`),
    method: z.enum(COUNTER_METHODS, `${E}.method`),
    reference: z.string().trim().max(40, `${E}.reference`).optional(),
    bankName: z.string().trim().max(80, `${E}.bankName`).optional(),
    note: z.string().trim().max(200, `${E}.note`).optional(),
    idempotencyKey: z.uuid(),
  })
  .refine((payment) => payment.method !== 'cheque' || /^\d{6}$/.test(payment.reference ?? ''), {
    path: ['reference'],
    message: `${E}.chequeNo`,
  })
  .refine(
    (payment) => new Set(payment.allocations.map((a) => a.invoiceId)).size === payment.allocations.length,
    { path: ['allocations'], message: `${E}.allocation` },
  );
export type CollectPayment = z.infer<typeof CollectPayment>;

export type CounterStudent = {
  id: string;
  name: string;
  admissionNo: string;
  classSection: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  today: string;
  totalDueMinor: number;
  invoices: { id: string; invoiceNo: string; installment: string; dueDate: string; totalMinor: number; paidMinor: number; balanceMinor: number }[];
};

export type StudentMatch = { id: string; name: string; admissionNo: string; classSection: string | null; guardianName: string | null };

export type Receipt = {
  id: string;
  studentId: string;
  receiptNo: string;
  collectedAt: string;
  collectedBy: string;
  studentName: string;
  admissionNo: string;
  classSection: string | null;
  schoolName: string;
  method: string;
  reference: string | null;
  bankName: string | null;
  note: string | null;
  amountMinor: number;
  allocations: { invoiceNo: string; installment: string; amountMinor: number }[];
};

export type FeeHeadRow = { id: string; name: string; code: string; gstRate: number; discountable: boolean };

export type FeeStructureRow = {
  id: string;
  name: string;
  classes: string;
  totalMinor: number;
  installments: number;
  status: 'draft' | 'approved' | 'active';
};

export type InvoiceRow = {
  id: string;
  invoiceNo: string;
  studentName: string;
  admissionNo: string;
  installment: string;
  dueDate: string;
  totalMinor: number;
  balanceMinor: number;
  status: InvoiceStatus;
};

export const ListPayments = z.object({
  cursor: z.string().optional().catch(undefined),
  pageSize: z.coerce
    .number()
    .refine((size) => [10, 25, 50, 100].includes(size))
    .catch(25),
});
export type ListPayments = z.infer<typeof ListPayments>;

export type PaymentRow = {
  id: string;
  receiptNo: string;
  collectedAt: string;
  studentName: string;
  admissionNo: string;
  method: string;
  amountMinor: number;
};

export const AGEING = ['all', '1-15', '16-30', '31-60', '60+'] as const;
export type Ageing = (typeof AGEING)[number];

export const ListDues = z.object({
  ageing: z.enum(AGEING).catch('all'),
  cursor: z.string().optional().catch(undefined),
  pageSize: z.coerce
    .number()
    .refine((size) => [10, 25, 50, 100].includes(size))
    .catch(25),
});
export type ListDues = z.infer<typeof ListDues>;

export type DueRow = {
  id: string;
  invoiceNo: string;
  studentId: string;
  studentName: string;
  admissionNo: string;
  installment: string;
  dueDate: string;
  daysOverdue: number;
  balanceMinor: number;
};

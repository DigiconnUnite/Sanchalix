import 'server-only';
import type { RequestContext } from '@/server/auth/context';
import { paginate } from '@/server/db/paginate';
import { Class } from '@/server/models/class';
import { FeeHead } from '@/server/models/feeHead';
import { FeeStructure } from '@/server/models/feeStructure';
import { Invoice } from '@/server/models/invoice';
import { Student } from '@/server/models/student';
import { getCurrentYearId } from '@/server/modules/academics/queries';
import { Types } from 'mongoose';
import { daysBefore, todayIn } from '@/lib/dates';
import { Enrollment } from '@/server/models/enrollment';
import { Guardian } from '@/server/models/guardian';
import { Payment } from '@/server/models/payment';
import { School } from '@/server/models/school';
import { Section } from '@/server/models/section';
import { User } from '@/server/models/user';
import type {
  CounterStudent,
  DueRow,
  FeeHeadRow,
  FeeStructureRow,
  InvoiceRow,
  ListDues,
  ListInvoices,
  ListPayments,
  PaymentRow,
  Receipt,
  StudentMatch,
} from './schemas';

export async function listFeeHeads(ctx: RequestContext): Promise<FeeHeadRow[]> {
  const heads = await FeeHead.find({ schoolId: ctx.schoolId }).sort({ name: 1 }).select('name code gstRate').lean();
  return heads.map((head) => ({ id: String(head._id), name: head.name, code: head.code, gstRate: head.gstRate }));
}

export async function listFeeStructures(ctx: RequestContext): Promise<FeeStructureRow[]> {
  const { schoolId } = ctx;
  const academicYearId = await getCurrentYearId(ctx);
  if (!academicYearId) return [];
  const [structures, classes] = await Promise.all([
    FeeStructure.find({ schoolId, academicYearId }).sort({ name: 1 }).lean(),
    Class.find({ schoolId, academicYearId }).sort({ order: 1 }).select('name').lean(),
  ]);
  return structures.map((structure) => ({
    id: String(structure._id),
    name: structure.name,
    classes: classes
      .filter((schoolClass) => structure.classIds.some((id) => id.equals(schoolClass._id)))
      .map((schoolClass) => schoolClass.name)
      .join(', '),
    totalMinor: structure.lines.reduce((sum, line) => sum + line.amountMinor, 0),
    installments: structure.installments.length,
    status: structure.status,
  }));
}

export async function listInvoices(ctx: RequestContext, query: ListInvoices) {
  const { schoolId } = ctx;
  const { rows, ...page } = await paginate(
    Invoice,
    { schoolId, ...(query.status && { status: query.status }) },
    {
      sortField: 'invoiceNo',
      select: ['invoiceNo', 'studentId', 'installmentLabel', 'dueDate', 'totalMinor', 'balanceMinor', 'status'],
      limit: query.pageSize,
      cursor: query.cursor,
    },
  );
  const students = await Student.find({ schoolId, _id: { $in: rows.map((invoice) => invoice.studentId) } })
    .setOptions({ withDeleted: true })
    .select('firstName lastName admissionNo')
    .lean();
  const studentById = new Map(students.map((student) => [String(student._id), student]));

  const invoices: InvoiceRow[] = rows.map((invoice) => {
    const student = studentById.get(String(invoice.studentId));
    return {
      id: String(invoice._id),
      invoiceNo: invoice.invoiceNo,
      studentName: student ? `${student.firstName} ${student.lastName}`.trim() : '',
      admissionNo: student?.admissionNo ?? '',
      installment: invoice.installmentLabel,
      dueDate: invoice.dueDate,
      totalMinor: invoice.totalMinor,
      balanceMinor: invoice.balanceMinor,
      status: invoice.status,
    };
  });
  return { rows: invoices, ...page };
}

const OPEN = ['issued', 'partially_paid', 'overdue'] as const;
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fullName = (student: { firstName: string; lastName?: string | null }) =>
  `${student.firstName} ${student.lastName ?? ''}`.trim();

async function classSectionOf(ctx: RequestContext, enrollmentIds: unknown[]) {
  const { schoolId } = ctx;
  const enrollments = await Enrollment.find({ schoolId, _id: { $in: enrollmentIds } }).select('sectionId').lean();
  const sections = await Section.find({ schoolId, _id: { $in: enrollments.map((e) => e.sectionId) } })
    .select('displayName')
    .lean();
  const nameBySection = new Map(sections.map((section) => [String(section._id), section.displayName]));
  return new Map(enrollments.map((e) => [String(e._id), nameBySection.get(String(e.sectionId)) ?? null]));
}

/** Up to 10 active students for the counter search: an exact admission number first, otherwise names starting with the text. */
export async function searchStudents(ctx: RequestContext, text: string): Promise<StudentMatch[]> {
  const { schoolId } = ctx;
  const query = text.trim();
  if (query.length < 2) return [];
  const select = 'firstName lastName admissionNo primaryGuardianId currentEnrollmentId';
  const exact = await Student.find({ schoolId, status: 'active', admissionNo: query.toUpperCase() }).select(select).lean();
  const prefix = new RegExp(`^${escapeRegex(query)}`, 'i');
  const students = exact.length
    ? exact
    : await Student.find({ schoolId, status: 'active', $or: [{ firstName: prefix }, { lastName: prefix }] })
        .sort({ lastName: 1 })
        .limit(10)
        .select(select)
        .lean();

  const [sectionByEnrollment, guardians] = await Promise.all([
    classSectionOf(ctx, students.map((student) => student.currentEnrollmentId)),
    Guardian.find({ schoolId, _id: { $in: students.map((student) => student.primaryGuardianId) } })
      .select('name')
      .lean(),
  ]);
  const guardianById = new Map(guardians.map((guardian) => [String(guardian._id), guardian.name]));
  return students.map((student) => ({
    id: String(student._id),
    name: fullName(student),
    admissionNo: student.admissionNo,
    classSection: sectionByEnrollment.get(String(student.currentEnrollmentId)) ?? null,
    guardianName: guardianById.get(String(student.primaryGuardianId)) ?? null,
  }));
}

export async function getCounterStudent(ctx: RequestContext, studentId: string): Promise<CounterStudent | null> {
  if (!Types.ObjectId.isValid(studentId)) return null;
  const { schoolId } = ctx;
  const student = await Student.findOne({ schoolId, _id: studentId })
    .select('firstName lastName admissionNo primaryGuardianId currentEnrollmentId')
    .lean();
  if (!student) return null;

  const [sectionByEnrollment, guardian, invoices, school] = await Promise.all([
    classSectionOf(ctx, [student.currentEnrollmentId]),
    Guardian.findOne({ schoolId, _id: student.primaryGuardianId }).select('name phone').lean(),
    Invoice.find({ schoolId, studentId: student._id, status: { $in: OPEN } })
      .sort({ dueDate: 1, invoiceNo: 1 })
      .select('invoiceNo installmentLabel dueDate totalMinor paidMinor balanceMinor')
      .lean(),
    School.findById(schoolId).select('timezone').lean(),
  ]);
  return {
    id: String(student._id),
    name: fullName(student),
    admissionNo: student.admissionNo,
    classSection: sectionByEnrollment.get(String(student.currentEnrollmentId)) ?? null,
    guardianName: guardian?.name ?? null,
    guardianPhone: guardian?.phone ?? null,
    today: todayIn(school?.timezone ?? 'Asia/Kolkata'),
    totalDueMinor: invoices.reduce((sum, invoice) => sum + invoice.balanceMinor, 0),
    invoices: invoices.map((invoice) => ({
      id: String(invoice._id),
      invoiceNo: invoice.invoiceNo,
      installment: invoice.installmentLabel,
      dueDate: invoice.dueDate,
      totalMinor: invoice.totalMinor,
      paidMinor: invoice.paidMinor,
      balanceMinor: invoice.balanceMinor,
    })),
  };
}

export async function getReceipt(ctx: RequestContext, paymentId: string): Promise<Receipt | null> {
  if (!Types.ObjectId.isValid(paymentId)) return null;
  const { schoolId } = ctx;
  const payment = await Payment.findOne({ schoolId, _id: paymentId }).lean();
  if (!payment) return null;

  const [student, invoices, collector, school] = await Promise.all([
    Student.findOne({ schoolId, _id: payment.studentId })
      .setOptions({ withDeleted: true })
      .select('firstName lastName admissionNo currentEnrollmentId')
      .lean(),
    Invoice.find({ schoolId, _id: { $in: payment.allocations.map((allocation) => allocation.invoiceId) } })
      .select('invoiceNo installmentLabel')
      .lean(),
    User.findById(payment.collectedBy).select('name').lean(),
    School.findById(schoolId).select('name').lean(),
  ]);
  const sectionByEnrollment = await classSectionOf(ctx, [student?.currentEnrollmentId]);
  const invoiceById = new Map(invoices.map((invoice) => [String(invoice._id), invoice]));

  return {
    id: String(payment._id),
    receiptNo: payment.receiptNo,
    collectedAt: payment.createdAt.toISOString(),
    collectedBy: collector?.name ?? '',
    studentName: student ? fullName(student) : '',
    admissionNo: student?.admissionNo ?? '',
    classSection: sectionByEnrollment.get(String(student?.currentEnrollmentId)) ?? null,
    schoolName: school?.name ?? '',
    method: payment.method,
    reference: payment.chequeNo ?? payment.reference ?? null,
    bankName: payment.bankName ?? null,
    note: payment.note ?? null,
    amountMinor: payment.amountMinor,
    allocations: payment.allocations.map((allocation) => ({
      invoiceNo: invoiceById.get(String(allocation.invoiceId))?.invoiceNo ?? '',
      installment: invoiceById.get(String(allocation.invoiceId))?.installmentLabel ?? '',
      amountMinor: allocation.amountMinor,
    })),
  };
}

async function studentsById(ctx: RequestContext, ids: unknown[]) {
  const students = await Student.find({ schoolId: ctx.schoolId, _id: { $in: ids } })
    .setOptions({ withDeleted: true })
    .select('firstName lastName admissionNo')
    .lean();
  return new Map(students.map((student) => [String(student._id), student]));
}

/** Receipts, newest first. Receipt numbers are issued in order, so sorting by number is sorting by time. */
export async function listPayments(ctx: RequestContext, query: ListPayments) {
  const { rows, ...page } = await paginate(
    Payment,
    { schoolId: ctx.schoolId },
    {
      sortField: 'receiptNo',
      descending: true,
      select: ['receiptNo', 'studentId', 'method', 'amountMinor', 'createdAt'],
      limit: query.pageSize,
      cursor: query.cursor,
    },
  );
  const students = await studentsById(ctx, rows.map((payment) => payment.studentId));
  const payments: PaymentRow[] = rows.map((payment) => {
    const student = students.get(String(payment.studentId));
    return {
      id: String(payment._id),
      receiptNo: payment.receiptNo,
      collectedAt: payment.createdAt.toISOString(),
      studentName: student ? fullName(student) : '',
      admissionNo: student?.admissionNo ?? '',
      method: payment.method,
      amountMinor: payment.amountMinor,
    };
  });
  return { rows: payments, ...page };
}

const DAY_MS = 86_400_000;

/** Unpaid balances past their due date, oldest first, optionally limited to an ageing band of days overdue. */
export async function listDues(ctx: RequestContext, query: ListDues) {
  const { schoolId } = ctx;
  const school = await School.findById(schoolId).select('timezone').lean();
  const today = todayIn(school?.timezone ?? 'Asia/Kolkata');
  const bands = {
    all: { $lt: today },
    '1-15': { $lt: today, $gte: daysBefore(today, 15) },
    '16-30': { $lt: daysBefore(today, 15), $gte: daysBefore(today, 30) },
    '31-60': { $lt: daysBefore(today, 30), $gte: daysBefore(today, 60) },
    '60+': { $lt: daysBefore(today, 60) },
  };
  const filter = { schoolId, status: { $in: [...OPEN] }, dueDate: bands[query.ageing] };

  const [{ rows, ...page }, totals] = await Promise.all([
    paginate(Invoice, filter, {
      sortField: 'dueDate',
      select: ['invoiceNo', 'studentId', 'installmentLabel', 'dueDate', 'balanceMinor'],
      limit: query.pageSize,
      cursor: query.cursor,
    }),
    Invoice.aggregate<{ outstandingMinor: number; count: number }>([
      { $match: filter },
      { $group: { _id: null, outstandingMinor: { $sum: '$balanceMinor' }, count: { $sum: 1 } } },
    ]),
  ]);
  const students = await studentsById(ctx, rows.map((invoice) => invoice.studentId));
  const dues: DueRow[] = rows.map((invoice) => {
    const student = students.get(String(invoice.studentId));
    return {
      id: String(invoice._id),
      invoiceNo: invoice.invoiceNo,
      studentId: String(invoice.studentId),
      studentName: student ? fullName(student) : '',
      admissionNo: student?.admissionNo ?? '',
      installment: invoice.installmentLabel,
      dueDate: invoice.dueDate,
      daysOverdue: Math.round((Date.parse(today) - Date.parse(invoice.dueDate)) / DAY_MS),
      balanceMinor: invoice.balanceMinor,
    };
  });
  return {
    rows: dues,
    ...page,
    outstandingMinor: totals[0]?.outstandingMinor ?? 0,
    count: totals[0]?.count ?? 0,
  };
}

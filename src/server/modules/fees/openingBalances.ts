import 'server-only';
import { AppError } from '@/lib/appError';
import { toMinor } from '@/lib/money';
import type { RequestContext } from '@/server/auth/context';
import { withTransaction } from '@/server/db/transaction';
import { AcademicYear } from '@/server/models/academicYear';
import { Counter } from '@/server/models/counter';
import { FeeHead } from '@/server/models/feeHead';
import { Invoice } from '@/server/models/invoice';
import { Student } from '@/server/models/student';
import { type ImportReport, readImportFile } from '@/server/modules/sis/importService';

export const OPENING_BALANCE_COLUMNS = ['admissionNo', 'amount', 'dueDate'] as const;
const E = 'fees.openingBalances.errors';
const HEAD_CODE = 'OPENBAL';

/**
 * Brings in what each student still owed when the school started using the system: one invoice per student, under
 * no fee structure, that the counter and the dues list then treat like any other. A student can have only one, so
 * importing the same file twice changes nothing. Every row is checked first; the invoices are written together.
 */
export async function importOpeningBalances(ctx: RequestContext, csv: string, dryRun: boolean, label: string): Promise<ImportReport> {
  const { schoolId } = ctx;
  const rows = readImportFile(csv, OPENING_BALANCE_COLUMNS);
  const year = await AcademicYear.findOne({ schoolId, status: 'current' }).select('label').lean();
  if (!year) throw new AppError('BUSINESS_RULE', 'fees.errors.noYear');

  const students = await Student.find({ schoolId, admissionNo: { $in: rows.map((row) => row.admissionNo) }, status: 'active' })
    .select('admissionNo branchId')
    .lean();
  const studentOf = new Map(students.map((student) => [student.admissionNo, student]));
  const already = await Invoice.distinct('studentId', {
    schoolId,
    studentId: { $in: students.map((student) => student._id) },
    installmentId: null,
  });
  const billed = new Set(already.map(String));

  const errors: ImportReport['errors'] = [];
  const seen = new Set<string>();
  const invoices = rows.flatMap((row, index) => {
    const fail = (field: string, key: string) => errors.push({ row: index + 2, field, messageKey: `${E}.${key}` });
    const student = studentOf.get(row.admissionNo ?? '');
    const amountMinor = toMinor(row.amount ?? '');
    const dueDate = row.dueDate ?? '';
    if (!student) fail('admissionNo', 'student');
    else if (billed.has(String(student._id))) fail('admissionNo', 'already');
    else if (seen.has(row.admissionNo ?? '')) fail('admissionNo', 'repeated');
    seen.add(row.admissionNo ?? '');
    if (!amountMinor) fail('amount', 'amount');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(Date.parse(dueDate))) fail('dueDate', 'dueDate');
    return student && amountMinor ? [{ studentId: student._id, branchId: student.branchId, amountMinor, dueDate }] : [];
  });
  if (errors.length > 0 || dryRun) return { total: rows.length, imported: 0, errors };

  const yearLabel = year.label.replace('–', '-');
  await withTransaction(async (session) => {
    const head = await FeeHead.findOneAndUpdate(
      { schoolId, code: HEAD_CODE },
      { $setOnInsert: { name: label, taxable: false, gstRate: 0, discountable: false, createdBy: ctx.userId, updatedBy: ctx.userId } },
      { upsert: true, returnDocument: 'after', session },
    ).lean();
    // One increment reserves the whole block of numbers; it rolls back with the transaction, so there are no gaps.
    const counter = await Counter.findOneAndUpdate(
      { _id: `${schoolId.toString()}:invoice:${yearLabel}` },
      { $inc: { seq: invoices.length } },
      { upsert: true, returnDocument: 'after', session },
    ).lean();
    let seq = counter.seq - invoices.length;
    await Invoice.insertMany(
      invoices.map(({ studentId, branchId, amountMinor, dueDate }) => {
        seq += 1;
        return {
          schoolId,
          branchId,
          academicYearId: year._id,
          invoiceNo: `INV/${yearLabel}/${String(seq).padStart(6, '0')}`,
          studentId,
          installmentLabel: label,
          lines: [{ feeHeadId: head._id, description: label, amountMinor, taxMinor: 0 }],
          totalMinor: amountMinor,
          balanceMinor: amountMinor,
          dueDate,
          status: 'issued' as const,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        };
      }),
      { session },
    );
  });
  return { total: rows.length, imported: invoices.length, errors };
}

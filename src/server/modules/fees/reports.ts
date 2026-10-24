import 'server-only';
import { startOfDayIn, todayIn } from '@/lib/dates';
import type { RequestContext } from '@/server/auth/context';
import type { Types } from 'mongoose';
import { AcademicYear } from '@/server/models/academicYear';
import { Class } from '@/server/models/class';
import { Enrollment } from '@/server/models/enrollment';
import { FeeHead } from '@/server/models/feeHead';
import { Invoice } from '@/server/models/invoice';
import { Payment } from '@/server/models/payment';
import { School } from '@/server/models/school';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const MAX_DAYS = 366;

export type BillingReport = {
  year: string;
  billedMinor: number;
  lateFeesMinor: number;
  concessionsMinor: number;
  /** Unpaid balances of earlier years. They stay payable at the counter and in the dues list after a year closes. */
  carriedForwardMinor: number;
  byHead: { name: string; billedMinor: number }[];
  concessions: { name: string; students: number; amountMinor: number }[];
  outstandingByClass: { name: string; students: number; dueMinor: number }[];
};

export type CollectionReport = {
  from: string;
  to: string;
  totalMinor: number;
  receipts: number;
  outstandingMinor: number;
  byDay: { date: string; amountMinor: number; receipts: number }[];
  byMethod: { method: string; amountMinor: number; receipts: number }[];
};

/**
 * What this academic year's invoices add up to: billed per fee head (GST included, concessions not yet taken off),
 * the concessions given and the late fees added, and what is still owed, class by class. Void invoices are left out.
 */
export async function getBillingReport(ctx: RequestContext): Promise<BillingReport | null> {
  const { schoolId } = ctx;
  const year = await AcademicYear.findOne({ schoolId, status: 'current' }).select('label').lean();
  if (!year) return null;
  const match = { schoolId, deletedAt: null, academicYearId: year._id, status: { $ne: 'void' as const } };
  const [heads, concessions, totals, owing, carried] = await Promise.all([
    Invoice.aggregate<{ _id: Types.ObjectId; billedMinor: number }>([
      { $match: match },
      { $unwind: '$lines' },
      { $group: { _id: '$lines.feeHeadId', billedMinor: { $sum: { $add: ['$lines.amountMinor', '$lines.taxMinor'] } } } },
    ]),
    Invoice.aggregate<{ _id: string; students: Types.ObjectId[]; amountMinor: number }>([
      { $match: match },
      { $unwind: '$concessions' },
      { $group: { _id: '$concessions.description', students: { $addToSet: '$studentId' }, amountMinor: { $sum: '$concessions.amountMinor' } } },
    ]),
    Invoice.aggregate<{ _id: null; lateFeesMinor: number }>([
      { $match: match },
      { $group: { _id: null, lateFeesMinor: { $sum: '$lateFeeMinor' } } },
    ]),
    Invoice.aggregate<{ _id: Types.ObjectId; dueMinor: number }>([
      { $match: { ...match, status: { $in: ['issued', 'partially_paid', 'overdue'] }, balanceMinor: { $gt: 0 } } },
      { $group: { _id: '$studentId', dueMinor: { $sum: '$balanceMinor' } } },
    ]),
    Invoice.aggregate<{ _id: null; dueMinor: number }>([
      {
        $match: {
          schoolId,
          deletedAt: null,
          academicYearId: { $ne: year._id },
          status: { $in: ['issued', 'partially_paid', 'overdue'] },
          balanceMinor: { $gt: 0 },
        },
      },
      { $group: { _id: null, dueMinor: { $sum: '$balanceMinor' } } },
    ]),
  ]);

  const [headNames, enrollments] = await Promise.all([
    FeeHead.find({ schoolId, _id: { $in: heads.map((head) => head._id) } }).setOptions({ withDeleted: true }).select('name').lean(),
    Enrollment.find({ schoolId, academicYearId: year._id, studentId: { $in: owing.map((row) => row._id) }, status: 'active' })
      .select('studentId classId')
      .lean(),
  ]);
  const classes = await Class.find({ schoolId, _id: { $in: enrollments.map((enrollment) => enrollment.classId) } })
    .sort({ order: 1 })
    .select('name')
    .lean();
  const classOf = new Map(enrollments.map((enrollment) => [String(enrollment.studentId), String(enrollment.classId)]));
  const nameOf = new Map(headNames.map((head) => [String(head._id), head.name]));

  return {
    year: year.label,
    billedMinor: heads.reduce((sum, head) => sum + head.billedMinor, 0),
    lateFeesMinor: totals[0]?.lateFeesMinor ?? 0,
    concessionsMinor: concessions.reduce((sum, row) => sum + row.amountMinor, 0),
    carriedForwardMinor: carried[0]?.dueMinor ?? 0,
    byHead: heads
      .map((head) => ({ name: nameOf.get(String(head._id)) ?? '', billedMinor: head.billedMinor }))
      .sort((a, b) => b.billedMinor - a.billedMinor),
    concessions: concessions
      .map((row) => ({ name: row._id, students: row.students.length, amountMinor: row.amountMinor }))
      .sort((a, b) => b.amountMinor - a.amountMinor),
    // Students whose class this year isn't known (an opening balance for someone since withdrawn) are left out here.
    outstandingByClass: classes.flatMap((schoolClass) => {
      const own = owing.filter((row) => classOf.get(String(row._id)) === String(schoolClass._id));
      return own.length ? [{ name: schoolClass.name, students: own.length, dueMinor: own.reduce((sum, row) => sum + row.dueMinor, 0) }] : [];
    }),
  };
}

/** Fees collected between two dates (this month so far by default), by day and by method, in the school's time zone. */
export async function getCollectionReport(
  ctx: RequestContext,
  requestedFrom: string | undefined,
  requestedTo: string | undefined,
): Promise<CollectionReport> {
  const { schoolId } = ctx;
  const school = await School.findById(schoolId).select('timezone').lean();
  const timezone = school?.timezone ?? 'Asia/Kolkata';
  const today = todayIn(timezone);
  const valid = (date: string | undefined) => (date && DAY.test(date) && !Number.isNaN(Date.parse(date)) ? date : null);
  const to = valid(requestedTo) ?? today;
  const asked = valid(requestedFrom) ?? `${to.slice(0, 7)}-01`;
  // A reversed or very long range is pulled back, so the report always answers and never scans years of receipts.
  const earliest = new Date(Date.parse(to) - (MAX_DAYS - 1) * DAY_MS).toISOString().slice(0, 10);
  const from = asked > to ? to : asked < earliest ? earliest : asked;
  const dayAfter = new Date(Date.parse(to) + DAY_MS).toISOString().slice(0, 10);
  const match = {
    schoolId,
    deletedAt: null,
    status: 'captured',
    createdAt: { $gte: startOfDayIn(timezone, from), $lt: startOfDayIn(timezone, dayAfter) },
  };
  const sum = { amountMinor: { $sum: '$amountMinor' }, receipts: { $sum: 1 } };

  const [byDay, byMethod, outstanding] = await Promise.all([
    Payment.aggregate<{ _id: string; amountMinor: number; receipts: number }>([
      { $match: match },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone } }, ...sum } },
      { $sort: { _id: -1 } },
    ]),
    Payment.aggregate<{ _id: string; amountMinor: number; receipts: number }>([
      { $match: match },
      { $group: { _id: '$method', ...sum } },
      { $sort: { amountMinor: -1 } },
    ]),
    Invoice.aggregate<{ _id: null; dueMinor: number }>([
      { $match: { schoolId, deletedAt: null, status: { $in: ['issued', 'partially_paid', 'overdue'] } } },
      { $group: { _id: null, dueMinor: { $sum: '$balanceMinor' } } },
    ]),
  ]);
  return {
    from,
    to,
    totalMinor: byDay.reduce((total, day) => total + day.amountMinor, 0),
    receipts: byDay.reduce((total, day) => total + day.receipts, 0),
    outstandingMinor: outstanding[0]?.dueMinor ?? 0,
    byDay: byDay.map(({ _id, ...rest }) => ({ date: _id, ...rest })),
    byMethod: byMethod.map(({ _id, ...rest }) => ({ method: _id, ...rest })),
  };
}

import 'server-only';
import { startOfDayIn, todayIn } from '@/lib/dates';
import type { RequestContext } from '@/server/auth/context';
import { Invoice } from '@/server/models/invoice';
import { Payment } from '@/server/models/payment';
import { School } from '@/server/models/school';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const MAX_DAYS = 366;

export type CollectionReport = {
  from: string;
  to: string;
  totalMinor: number;
  receipts: number;
  outstandingMinor: number;
  byDay: { date: string; amountMinor: number; receipts: number }[];
  byMethod: { method: string; amountMinor: number; receipts: number }[];
};

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

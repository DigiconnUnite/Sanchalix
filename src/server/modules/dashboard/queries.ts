import 'server-only';
import { Types } from 'mongoose';
import { daysBefore, startOfDayIn, todayIn } from '@/lib/dates';
import type { RequestContext } from '@/server/auth/context';
import { AttendanceRecord } from '@/server/models/attendanceRecord';
import { FeeStructure } from '@/server/models/feeStructure';
import { Invoice } from '@/server/models/invoice';
import { Payment } from '@/server/models/payment';
import { School } from '@/server/models/school';
import { getDayState, getSchoolCalendar, listAttendanceSections } from '@/server/modules/attendance/queries';

export const AGEING_BANDS = ['1-15', '16-30', '31-60', '60+'] as const;

/** Today's attendance across the sections this user can see: a teacher's own section, or the whole school. */
export async function getAttendanceToday(ctx: RequestContext) {
  const [day, sections] = await Promise.all([getDayState(ctx), listAttendanceSections(ctx)]);
  const records = await AttendanceRecord.find({
    schoolId: ctx.schoolId,
    date: day.today,
    mode: 'daily',
    sectionId: { $in: sections.map((section) => section.id) },
  })
    .select('sectionId entries.status')
    .lean();

  const statuses = records.flatMap((record) => record.entries.map((entry) => entry.status));
  const attended = statuses.reduce(
    (sum, status) => sum + (status === 'present' || status === 'late' ? 1 : status === 'half_day' ? 0.5 : 0),
    0,
  );
  const submitted = new Set(records.map((record) => String(record.sectionId)));
  return {
    state: day.state,
    holidayName: day.holidayName,
    sections: sections.length,
    submitted: submitted.size,
    firstPending: sections.find((section) => !submitted.has(section.id)) ?? null,
    absent: statuses.filter((status) => status === 'absent').length,
    percent: statuses.length ? Math.round((attended / statuses.length) * 1000) / 10 : null,
  };
}

/** Daily attendance % for each of the last 30 days it was taken, oldest first, across the sections this user can see. */
export async function getAttendanceTrend(ctx: RequestContext) {
  const [{ today }, sections] = await Promise.all([getSchoolCalendar(ctx), listAttendanceSections(ctx)]);
  const days = await AttendanceRecord.aggregate<{ _id: string; attended: number; marked: number }>([
    {
      $match: {
        schoolId: ctx.schoolId,
        deletedAt: null,
        mode: 'daily',
        date: { $gt: daysBefore(today, 30), $lte: today },
        sectionId: { $in: sections.map((section) => new Types.ObjectId(section.id)) },
      },
    },
    { $unwind: '$entries' },
    {
      $group: {
        _id: '$date',
        marked: { $sum: 1 },
        attended: {
          $sum: {
            $switch: {
              branches: [
                { case: { $in: ['$entries.status', ['present', 'late']] }, then: 1 },
                { case: { $eq: ['$entries.status', 'half_day'] }, then: 0.5 },
              ],
              default: 0,
            },
          },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return days.map((day) => ({ date: day._id, percent: Math.round((day.attended / day.marked) * 1000) / 10 }));
}

/** Unpaid balances past their due date, by the same days-overdue bands as the dues list. */
export async function getDuesAgeing(ctx: RequestContext) {
  const { today } = await getSchoolCalendar(ctx);
  const since = (days: number) => ({ $gte: ['$dueDate', daysBefore(today, days)] });
  const bands = await Invoice.aggregate<{ _id: string; amountMinor: number; invoices: number }>([
    {
      $match: {
        schoolId: ctx.schoolId,
        deletedAt: null,
        status: { $in: ['issued', 'partially_paid', 'overdue'] },
        dueDate: { $lt: today },
      },
    },
    {
      $group: {
        _id: {
          $switch: {
            branches: [
              { case: since(15), then: '1-15' },
              { case: since(30), then: '16-30' },
              { case: since(60), then: '31-60' },
            ],
            default: '60+',
          },
        },
        amountMinor: { $sum: '$balanceMinor' },
        invoices: { $sum: 1 },
      },
    },
  ]);
  return AGEING_BANDS.map((band) => {
    const found = bands.find((candidate) => candidate._id === band);
    return { band, amountMinor: found?.amountMinor ?? 0, invoices: found?.invoices ?? 0 };
  });
}

export async function getFeesSummary(ctx: RequestContext) {
  const { schoolId } = ctx;
  const school = await School.findById(schoolId).select('timezone').lean();
  const timeZone = school?.timezone ?? 'Asia/Kolkata';
  const today = todayIn(timeZone);
  const collectedSince = (date: string) =>
    Payment.aggregate<{ amountMinor: number; receipts: number }>([
      { $match: { schoolId, status: 'captured', createdAt: { $gte: startOfDayIn(timeZone, date) } } },
      { $group: { _id: null, amountMinor: { $sum: '$amountMinor' }, receipts: { $sum: 1 } } },
    ]);

  const [todayTotals, monthTotals, overdue, draftStructures] = await Promise.all([
    collectedSince(today),
    collectedSince(`${today.slice(0, 7)}-01`),
    Invoice.aggregate<{ amountMinor: number; invoices: number }>([
      { $match: { schoolId, status: { $in: ['issued', 'partially_paid', 'overdue'] }, dueDate: { $lt: today } } },
      { $group: { _id: null, amountMinor: { $sum: '$balanceMinor' }, invoices: { $sum: 1 } } },
    ]),
    FeeStructure.countDocuments({ schoolId, status: 'draft' }),
  ]);
  return {
    collectedTodayMinor: todayTotals[0]?.amountMinor ?? 0,
    receiptsToday: todayTotals[0]?.receipts ?? 0,
    collectedMonthMinor: monthTotals[0]?.amountMinor ?? 0,
    overdueMinor: overdue[0]?.amountMinor ?? 0,
    overdueInvoices: overdue[0]?.invoices ?? 0,
    draftStructures,
  };
}

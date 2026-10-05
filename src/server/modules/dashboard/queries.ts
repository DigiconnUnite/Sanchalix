import 'server-only';
import { startOfDayIn, todayIn } from '@/lib/dates';
import type { RequestContext } from '@/server/auth/context';
import { AttendanceRecord } from '@/server/models/attendanceRecord';
import { FeeStructure } from '@/server/models/feeStructure';
import { Invoice } from '@/server/models/invoice';
import { Payment } from '@/server/models/payment';
import { School } from '@/server/models/school';
import { getDayState, listAttendanceSections } from '@/server/modules/attendance/queries';

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

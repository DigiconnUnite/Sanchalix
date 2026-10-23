import 'server-only';
import type { RequestContext } from '@/server/auth/context';
import { weekdayOf } from '@/lib/dates';
import { Holiday } from '@/server/models/holiday';
import { Staff } from '@/server/models/staff';
import { StaffAttendance } from '@/server/models/staffAttendance';
import { getSchoolCalendar } from '@/server/modules/attendance/queries';
import type { StaffMark } from './staffAttendance';

export type StaffRegister = {
  month: string;
  days: { date: string; day: number; kind: 'working' | 'holiday' | 'nonWorking' }[];
  staff: { id: string; name: string; employeeNo: string; marks: Record<string, StaffMark>; present: number; absent: number; leave: number }[];
};

/** One month of staff attendance: a row per staff member, a column per day. A half day counts as half present. */
export async function getStaffRegister(ctx: RequestContext, requestedMonth: string | undefined): Promise<StaffRegister> {
  const { schoolId } = ctx;
  const { today, workingDays } = await getSchoolCalendar(ctx);
  const month = requestedMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) ? requestedMonth : today.slice(0, 7);
  const inMonth = { $gte: `${month}-01`, $lte: `${month}-31` };
  const [staff, records, holidays] = await Promise.all([
    Staff.find({ schoolId, ...(ctx.scope === 'branch' && ctx.branchId && { branchId: ctx.branchId }), status: { $in: ['active', 'on_leave'] } })
      .sort({ name: 1 })
      .select('name employeeNo')
      .lean(),
    StaffAttendance.find({ schoolId, date: inMonth }).select('staffId date status').lean(),
    Holiday.find({ schoolId, date: inMonth }).select('date').lean(),
  ]);
  const holidayDates = new Set(holidays.map((holiday) => holiday.date));
  const [year, monthNumber] = month.split('-').map(Number);
  const dayCount = new Date(Date.UTC(year ?? 0, monthNumber ?? 1, 0)).getUTCDate();
  const marksOf = new Map<string, Record<string, StaffMark>>();
  for (const record of records) {
    const own = marksOf.get(String(record.staffId)) ?? {};
    own[record.date] = record.status as StaffMark;
    marksOf.set(String(record.staffId), own);
  }
  return {
    month,
    days: Array.from({ length: dayCount }, (_, index) => {
      const date = `${month}-${String(index + 1).padStart(2, '0')}`;
      const kind = holidayDates.has(date) ? 'holiday' : workingDays.includes(weekdayOf(date)) ? 'working' : 'nonWorking';
      return { date, day: index + 1, kind };
    }),
    staff: staff.map((member) => {
      const marks = marksOf.get(String(member._id)) ?? {};
      const statuses = Object.values(marks);
      const count = (status: StaffMark) => statuses.filter((mark) => mark === status).length;
      return {
        id: String(member._id),
        name: member.name,
        employeeNo: member.employeeNo,
        marks,
        present: count('present') + count('half_day') * 0.5,
        absent: count('absent'),
        leave: count('leave'),
      };
    }),
  };
}

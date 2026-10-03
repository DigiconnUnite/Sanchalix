import 'server-only';
import { AppError } from '@/lib/appError';
import type { RequestContext } from '@/server/auth/context';
import { AttendanceRecord } from '@/server/models/attendanceRecord';
import { Holiday } from '@/server/models/holiday';
import type { HolidayInput, HolidayRow } from './schemas';

export async function listHolidays(ctx: RequestContext): Promise<HolidayRow[]> {
  const holidays = await Holiday.find({ schoolId: ctx.schoolId }).sort({ date: 1 }).select('date name').lean();
  return holidays.map((holiday) => ({ id: String(holiday._id), date: holiday.date, name: holiday.name }));
}

export async function addHoliday(ctx: RequestContext, input: HolidayInput) {
  const { schoolId } = ctx;
  if (await Holiday.exists({ schoolId, date: input.date })) {
    throw new AppError('CONFLICT', 'calendar.holidays.errors.taken');
  }
  const holiday = await Holiday.create({ schoolId, ...input, createdBy: ctx.userId, updatedBy: ctx.userId });
  // Attendance already taken that day is kept; the caller warns the user so they can decide what to do with it.
  const affectedAttendanceRecords = await AttendanceRecord.countDocuments({ schoolId, date: input.date });
  return { id: holiday._id, name: holiday.name, affectedAttendanceRecords };
}

export async function removeHoliday(ctx: RequestContext, id: string) {
  const holiday = await Holiday.findOneAndUpdate(
    { schoolId: ctx.schoolId, _id: id },
    { deletedAt: new Date(), updatedBy: ctx.userId },
  )
    .select('date name')
    .lean();
  if (!holiday) throw new AppError('NOT_FOUND', 'calendar.holidays.errors.notFound');
  return { id: holiday._id, date: holiday.date, name: holiday.name };
}

import 'server-only';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AppError } from '@/lib/appError';
import type { RequestContext } from '@/server/auth/context';
import { LeaveRequest } from '@/server/models/leaveRequest';
import { Staff } from '@/server/models/staff';
import { StaffAttendance } from '@/server/models/staffAttendance';
import { getDayState } from '@/server/modules/attendance/queries';

const E = 'hr.attendance.errors';
const Id = z.string().regex(/^[0-9a-f]{24}$/, `${E}.roster`);
export const STAFF_MARKS = ['present', 'absent', 'half_day', 'leave'] as const;
export type StaffMark = (typeof STAFF_MARKS)[number];

export const SaveStaffAttendance = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${E}.date`),
  entries: z.array(z.object({ staffId: Id, status: z.enum(STAFF_MARKS) })).min(1, `${E}.roster`).max(1000),
});
export type SaveStaffAttendance = z.infer<typeof SaveStaffAttendance>;

export type StaffSheet = {
  date: string;
  today: string;
  state: 'open' | 'future' | 'nonWorking' | 'holiday';
  holidayName: string | null;
  saved: boolean;
  staff: { id: string; name: string; employeeNo: string; status: StaffMark; onApprovedLeave: boolean }[];
};

const scopeOf = (ctx: RequestContext) => ({
  schoolId: ctx.schoolId,
  ...(ctx.scope === 'branch' && ctx.branchId && { branchId: ctx.branchId }),
});

const roster = (ctx: RequestContext) =>
  Staff.find({ ...scopeOf(ctx), status: { $in: ['active', 'on_leave'] } })
    .sort({ name: 1 })
    .select('name employeeNo branchId')
    .lean();

/** The day's staff sheet. Until it is saved, someone on approved leave that day starts as "leave", everyone else as present. */
export async function getStaffSheet(ctx: RequestContext, requestedDate: string | undefined): Promise<StaffSheet> {
  const { schoolId } = ctx;
  const day = await getDayState(ctx, requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : undefined);
  const staff = await roster(ctx);
  const ids = staff.map((member) => member._id);
  const [records, leave] = await Promise.all([
    StaffAttendance.find({ schoolId, date: day.date, staffId: { $in: ids } }).select('staffId status').lean(),
    LeaveRequest.find({
      schoolId,
      requesterType: 'staff',
      requesterId: { $in: ids },
      status: 'approved',
      from: { $lte: day.date },
      to: { $gte: day.date },
    })
      .select('requesterId halfDay')
      .lean(),
  ]);
  const marked = new Map(records.map((record) => [String(record.staffId), record.status]));
  const onLeave = new Map(leave.map((request) => [String(request.requesterId), request.halfDay]));
  return {
    date: day.date,
    today: day.today,
    state: day.state,
    holidayName: day.holidayName,
    saved: records.length > 0,
    staff: staff.map((member) => {
      const id = String(member._id);
      const fallback = onLeave.has(id) ? (onLeave.get(id) ? 'half_day' : 'leave') : 'present';
      return {
        id,
        name: member.name,
        employeeNo: member.employeeNo,
        status: (marked.get(id) ?? fallback) as StaffMark,
        onApprovedLeave: onLeave.has(id),
      };
    }),
  };
}

export async function saveStaffAttendance(ctx: RequestContext, { date, entries }: SaveStaffAttendance) {
  const { schoolId } = ctx;
  const day = await getDayState(ctx, date);
  if (day.state !== 'open') throw new AppError('BUSINESS_RULE', `attendance.errors.${day.state}`);

  const staff = await roster(ctx);
  const branchOf = new Map(staff.map((member) => [String(member._id), member.branchId]));
  const ids = new Set(entries.map((entry) => entry.staffId));
  if (ids.size !== entries.length || entries.some((entry) => !branchOf.has(entry.staffId))) {
    throw new AppError('VALIDATION', `${E}.roster`);
  }

  // bulkWrite skips the tenant plugin's query hooks, so every filter names the school itself.
  await StaffAttendance.bulkWrite(
    entries.map(({ staffId, status }) => ({
      updateOne: {
        filter: { schoolId, staffId: new Types.ObjectId(staffId), date },
        update: {
          $set: { status, source: 'manual' as const, updatedBy: ctx.userId },
          $setOnInsert: { branchId: branchOf.get(staffId) as Types.ObjectId, createdBy: ctx.userId, deletedAt: null },
        },
        upsert: true,
      },
    })),
  );
  const count = (status: StaffMark) => entries.filter((entry) => entry.status === status).length;
  return { date, present: count('present') + count('half_day'), absent: count('absent'), leave: count('leave') };
}

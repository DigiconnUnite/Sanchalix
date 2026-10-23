import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '@/lib/appError';
import { env } from '@/lib/env';
import type { RequestContext } from '@/server/auth/context';
import { Staff } from '@/server/models/staff';
import { StaffAttendance } from '@/server/models/staffAttendance';
import { getDayState } from '@/server/modules/attendance/queries';

const E = 'hr.checkIn.errors';

export const CheckInInput = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{22}$/, `${E}.token`) });

// The code is the school's and the day's, so a photo of it taken on Monday is no use on Tuesday, and one school's
// code is no use in another.
const sign = (schoolId: string, date: string) =>
  createHmac('sha256', env.AUTH_SECRET).update(`checkin:${schoolId}:${date}`).digest('base64url').slice(0, 22);

/** The address printed as today's QR code at the school's entrance. */
export const checkInUrl = (schoolId: string, date: string) => `${env.APP_URL}/checkin?s=${sign(schoolId, date)}`;

/**
 * Records that the signed-in staff member arrived, from the code at the entrance. It only works for today, on a
 * working day, for someone on the staff record of this school, and it keeps the first arrival of the day. Someone the
 * office has already marked absent is marked present: they are plainly here.
 */
export async function checkInStaff(ctx: RequestContext, { token }: z.infer<typeof CheckInInput>) {
  const { schoolId } = ctx;
  if (!ctx.staffId) throw new AppError('FORBIDDEN', 'errors.forbidden');
  const day = await getDayState(ctx);
  if (day.state !== 'open') throw new AppError('BUSINESS_RULE', `attendance.errors.${day.state}`);
  const expected = sign(String(schoolId), day.date);
  if (token.length !== expected.length || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
    throw new AppError('VALIDATION', `${E}.token`);
  }
  const member = await Staff.findOne({ schoolId, _id: ctx.staffId, status: { $in: ['active', 'on_leave'] } })
    .select('branchId')
    .lean();
  if (!member) throw new AppError('FORBIDDEN', 'errors.forbidden');

  const arrived = new Date();
  const own = { schoolId, staffId: ctx.staffId, date: day.date };
  const first = async () => {
    const existing = await StaffAttendance.findOne(own).select('checkIn status').lean();
    if (existing?.checkIn) return { at: existing.checkIn, already: true };
    if (existing) {
      await StaffAttendance.updateOne(own, {
        checkIn: arrived,
        source: 'qr',
        ...(existing.status === 'absent' && { status: 'present' }),
        updatedBy: ctx.userId,
      });
      return { at: arrived, already: false };
    }
    await StaffAttendance.create({
      ...own,
      branchId: member.branchId,
      checkIn: arrived,
      status: 'present',
      source: 'qr',
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    });
    return { at: arrived, already: false };
  };
  try {
    return { ...(await first()), date: day.date };
  } catch (error) {
    // Two scans at the same moment: the other one wrote the record first.
    if (error instanceof Error && 'code' in error && error.code === 11000) return { ...(await first()), date: day.date };
    throw error;
  }
}

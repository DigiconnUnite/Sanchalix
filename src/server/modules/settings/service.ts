import 'server-only';
import { z } from 'zod';
import { AppError } from '@/lib/appError';
import type { RequestContext } from '@/server/auth/context';
import { PeriodDefinition } from '@/server/models/periodDefinition';
import { School } from '@/server/models/school';
import { TimetableSlot } from '@/server/models/timetableSlot';
import { getPeriods } from '@/server/modules/timetable/service';

const E = 'settings.errors';
const text = (key: string, max: number) => z.string().trim().min(1, `${E}.${key}`).max(max, `${E}.${key}`);

export const SchoolInput = z.object({
  name: text('name', 120),
  affiliationNo: z.string().trim().max(40, `${E}.affiliationNo`).default(''),
  address: z.object({
    line1: text('line1', 120),
    city: text('city', 60),
    state: text('state', 60),
    pincode: z.string().trim().regex(/^\d{6}$/, `${E}.pincode`),
  }),
  workingDays: z
    .array(z.number().int().min(0).max(6))
    .min(1, `${E}.workingDays`)
    .transform((days) => [...new Set(days)].sort()),
});
export type SchoolInput = z.infer<typeof SchoolInput>;

const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${E}.time`);
export const PeriodsInput = z
  .array(z.object({ start: Time, end: Time }))
  .min(1, `${E}.noPeriods`)
  .max(12, `${E}.tooManyPeriods`)
  .superRefine((periods, issue) => {
    periods.forEach((period, index) => {
      // HH:mm compares correctly as text. Each period must end after it starts and start no earlier than the last ended.
      if (period.end <= period.start) issue.addIssue({ code: 'custom', path: [index, 'end'], message: `${E}.endBeforeStart` });
      const previous = periods[index - 1];
      if (previous && period.start < previous.end) {
        issue.addIssue({ code: 'custom', path: [index, 'start'], message: `${E}.overlap` });
      }
    });
  });
export type PeriodsInput = z.infer<typeof PeriodsInput>;

export type SchoolSettings = SchoolInput & { code: string; board: string; periods: { start: string; end: string }[] };

export async function getSettings(ctx: RequestContext): Promise<SchoolSettings | null> {
  const [school, periods] = await Promise.all([
    School.findById(ctx.schoolId).select('name code board affiliationNo address settings.workingDays').lean(),
    getPeriods(ctx),
  ]);
  if (!school) return null;
  return {
    name: school.name,
    code: school.code,
    board: school.board,
    affiliationNo: school.affiliationNo ?? '',
    address: {
      line1: school.address.line1,
      city: school.address.city,
      state: school.address.state,
      pincode: school.address.pincode,
    },
    workingDays: school.settings?.workingDays ?? [1, 2, 3, 4, 5, 6],
    periods: periods.map(({ start, end }) => ({ start, end })),
  };
}

export async function updateSchool(ctx: RequestContext, input: SchoolInput) {
  // The school is the tenant itself, so it is addressed by the id in the session, never by one from the request.
  const before = await School.findOneAndUpdate(
    { _id: ctx.schoolId },
    {
      name: input.name,
      affiliationNo: input.affiliationNo || null,
      'address.line1': input.address.line1,
      'address.city': input.address.city,
      'address.state': input.address.state,
      'address.pincode': input.address.pincode,
      'settings.workingDays': input.workingDays,
    },
    { runValidators: true },
  )
    .select('name settings.workingDays')
    .lean();
  if (!before) throw new AppError('NOT_FOUND', `${E}.notFound`);
  return { name: input.name, before: { name: before.name, workingDays: before.settings?.workingDays ?? [] } };
}

export async function savePeriods(ctx: RequestContext, periods: PeriodsInput) {
  const { schoolId } = ctx;
  const inUse = await TimetableSlot.findOne({ schoolId, period: { $gt: periods.length } })
    .sort({ period: -1 })
    .select('period')
    .lean();
  if (inUse) throw new AppError('BUSINESS_RULE', `${E}.periodInUse`, { number: inUse.period });
  const saved = await PeriodDefinition.findOneAndUpdate(
    { schoolId, branchId: null },
    {
      $set: {
        periods: periods.map((period, index) => ({ number: index + 1, ...period, isBreak: false })),
        updatedBy: ctx.userId,
      },
      $setOnInsert: { createdBy: ctx.userId },
    },
    { upsert: true, returnDocument: 'after' },
  )
    .select('_id')
    .lean();
  return { id: saved._id, count: periods.length };
}

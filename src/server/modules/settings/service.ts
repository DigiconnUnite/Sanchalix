import 'server-only';
import { z } from 'zod';
import { AppError } from '@/lib/appError';
import type { RequestContext } from '@/server/auth/context';
import { AcademicYear } from '@/server/models/academicYear';
import { Exam } from '@/server/models/exam';
import { DEFAULT_LEAVE_QUOTAS } from '@/server/modules/hr/leave';
import { PeriodDefinition } from '@/server/models/periodDefinition';
import { School } from '@/server/models/school';
import { TimetableSlot } from '@/server/models/timetableSlot';
import { getPeriods } from '@/server/modules/timetable/service';

const E = 'settings.errors';
const text = (key: string, max: number) => z.string().trim().min(1, `${E}.${key}`).max(max, `${E}.${key}`);

export const SchoolInput = z.object({
  name: text('name', 120),
  affiliationNo: z.string().trim().max(40, `${E}.affiliationNo`).default(''),
  // https only: the address is loaded by every signed-in browser of the school.
  logoUrl: z.union([z.literal(''), z.url({ protocol: /^https$/, error: `${E}.logoUrl` }).max(300, `${E}.logoUrl`)]).default(''),
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
  shiftDueDates: z.boolean().default(false),
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

export const LeaveQuotasInput = z.object({
  CL: z.coerce.number().int(`${E}.quota`).min(0, `${E}.quota`).max(366, `${E}.quota`),
  SL: z.coerce.number().int(`${E}.quota`).min(0, `${E}.quota`).max(366, `${E}.quota`),
  EL: z.coerce.number().int(`${E}.quota`).min(0, `${E}.quota`).max(366, `${E}.quota`),
});
export type LeaveQuotasInput = z.infer<typeof LeaveQuotasInput>;

export const AlertTimeInput = z.object({ absenceAlertTime: Time });
export type AlertTimeInput = z.infer<typeof AlertTimeInput>;

export const QuietHoursInput = z
  .object({ start: Time, end: Time })
  .refine(({ start, end }) => start !== end, `${E}.quietSame`);
export type QuietHoursInput = z.infer<typeof QuietHoursInput>;

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${E}.date`);
export const TermsInput = z
  .array(
    z.object({
      // The id of a term that already exists, so exams tied to it stay tied when its name or dates change.
      id: z.string().regex(/^[0-9a-f]{24}$/).optional(),
      name: text('termName', 40),
      startDate: Day,
      endDate: Day,
    }),
  )
  .max(6, `${E}.tooManyTerms`)
  .superRefine((terms, issue) => {
    terms.forEach((term, index) => {
      // YYYY-MM-DD compares correctly as text. A term ends after it starts, and starts after the one before it ended.
      if (term.endDate <= term.startDate) issue.addIssue({ code: 'custom', path: [index, 'endDate'], message: `${E}.termEnd` });
      const previous = terms[index - 1];
      if (previous && term.startDate <= previous.endDate) {
        issue.addIssue({ code: 'custom', path: [index, 'startDate'], message: `${E}.termOverlap` });
      }
    });
  });
export type TermsInput = z.infer<typeof TermsInput>;

export type SchoolSettings = SchoolInput & {
  code: string;
  board: string;
  periods: { start: string; end: string }[];
  quietHours: QuietHoursInput;
  absenceAlertTime: string;
  leaveQuotas: LeaveQuotasInput;
  /** The current academic year and its terms. Null until a year is set up. */
  year: { label: string; startDate: string; endDate: string; terms: TermsInput } | null;
};

export async function getSettings(ctx: RequestContext): Promise<SchoolSettings | null> {
  const [school, periods, year] = await Promise.all([
    School.findById(ctx.schoolId).select('name code board affiliationNo logoUrl address settings.workingDays settings.shiftDueDates settings.quietHours settings.leaveQuotas settings.absenceAlertTime').lean(),
    getPeriods(ctx),
    AcademicYear.findOne({ schoolId: ctx.schoolId, status: 'current' }).select('label startDate endDate terms').lean(),
  ]);
  if (!school) return null;
  return {
    name: school.name,
    code: school.code,
    board: school.board,
    affiliationNo: school.affiliationNo ?? '',
    logoUrl: school.logoUrl ?? '',
    address: {
      line1: school.address.line1,
      city: school.address.city,
      state: school.address.state,
      pincode: school.address.pincode,
    },
    workingDays: school.settings?.workingDays ?? [1, 2, 3, 4, 5, 6],
    shiftDueDates: school.settings?.shiftDueDates ?? false,
    periods: periods.map(({ start, end }) => ({ start, end })),
    quietHours: { start: school.settings?.quietHours?.start ?? '21:00', end: school.settings?.quietHours?.end ?? '07:00' },
    absenceAlertTime: school.settings?.absenceAlertTime ?? '09:30',
    leaveQuotas: { ...DEFAULT_LEAVE_QUOTAS, ...school.settings?.leaveQuotas },
    year: year && {
      label: year.label,
      startDate: year.startDate,
      endDate: year.endDate,
      terms: year.terms.map((term) => ({
        id: String(term._id),
        name: term.name,
        startDate: term.startDate ?? '',
        endDate: term.endDate ?? '',
      })),
    },
  };
}

export async function updateSchool(ctx: RequestContext, input: SchoolInput) {
  // The school is the tenant itself, so it is addressed by the id in the session, never by one from the request.
  const before = await School.findOneAndUpdate(
    { _id: ctx.schoolId },
    {
      name: input.name,
      affiliationNo: input.affiliationNo || null,
      logoUrl: input.logoUrl || null,
      'address.line1': input.address.line1,
      'address.city': input.address.city,
      'address.state': input.address.state,
      'address.pincode': input.address.pincode,
      'settings.workingDays': input.workingDays,
      'settings.shiftDueDates': input.shiftDueDates,
    },
    { runValidators: true },
  )
    .select('name settings.workingDays settings.shiftDueDates')
    .lean();
  if (!before) throw new AppError('NOT_FOUND', `${E}.notFound`);
  return {
    name: input.name,
    before: { name: before.name, workingDays: before.settings?.workingDays ?? [], shiftDueDates: before.settings?.shiftDueDates ?? false },
  };
}

/** Replaces the terms of the current academic year. Every term has to fall inside the year. */
export async function saveTerms(ctx: RequestContext, terms: TermsInput) {
  const { schoolId } = ctx;
  const year = await AcademicYear.findOne({ schoolId, status: 'current' }).select('startDate endDate terms').lean();
  if (!year) throw new AppError('BUSINESS_RULE', `${E}.noYear`);
  if (terms.some((term) => term.startDate < year.startDate || term.endDate > year.endDate)) {
    throw new AppError('BUSINESS_RULE', `${E}.termOutsideYear`);
  }
  const kept = new Set(terms.flatMap((term) => term.id ?? []));
  const removed = year.terms.filter((term) => !kept.has(String(term._id))).map((term) => term._id);
  if (removed.length > 0 && (await Exam.exists({ schoolId, termId: { $in: removed } }))) {
    throw new AppError('BUSINESS_RULE', `${E}.termInUse`);
  }
  await AcademicYear.updateOne(
    { schoolId, _id: year._id },
    { terms: terms.map(({ id, ...term }) => ({ ...(id && { _id: id }), ...term })), updatedBy: ctx.userId },
  );
  return { id: year._id, count: terms.length, before: year.terms.length };
}

/** Texts that aren't urgent wait until these hours are over. Sign-in codes and absence alerts ignore them. */
export async function saveQuietHours(ctx: RequestContext, quiet: QuietHoursInput) {
  const before = await School.findOneAndUpdate({ _id: ctx.schoolId }, { 'settings.quietHours': quiet })
    .select('settings.quietHours')
    .lean();
  if (!before) throw new AppError('NOT_FOUND', `${E}.notFound`);
  return { before: before.settings?.quietHours ?? null };
}

/** The time parents are told about an absence. A register saved earlier waits for it. */
export async function saveAlertTime(ctx: RequestContext, { absenceAlertTime }: AlertTimeInput) {
  const before = await School.findOneAndUpdate({ _id: ctx.schoolId }, { 'settings.absenceAlertTime': absenceAlertTime })
    .select('settings.absenceAlertTime')
    .lean();
  if (!before) throw new AppError('NOT_FOUND', `${E}.notFound`);
  return { before: before.settings?.absenceAlertTime ?? '09:30' };
}

/** A new allowance applies from now. Days already taken are kept, so someone can end up with a negative balance. */
export async function saveLeaveQuotas(ctx: RequestContext, quotas: LeaveQuotasInput) {
  const before = await School.findOneAndUpdate({ _id: ctx.schoolId }, { 'settings.leaveQuotas': quotas })
    .select('settings.leaveQuotas')
    .lean();
  if (!before) throw new AppError('NOT_FOUND', `${E}.notFound`);
  return { before: { ...DEFAULT_LEAVE_QUOTAS, ...before.settings?.leaveQuotas } };
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

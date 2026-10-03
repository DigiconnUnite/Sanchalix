import 'server-only';
import { AppError } from '@/lib/appError';
import type { RequestContext } from '@/server/auth/context';
import { AttendanceRecord } from '@/server/models/attendanceRecord';
import { Enrollment } from '@/server/models/enrollment';
import { findAttendanceSection, getDayState } from './queries';
import { type AttendanceSummary, MARKABLE_STATUSES, type SubmitAttendance } from './schemas';

function summarise(entries: { status: string }[]): AttendanceSummary {
  const summary = Object.fromEntries(MARKABLE_STATUSES.map((status) => [status, 0])) as AttendanceSummary;
  for (const { status } of entries) if (status in summary) summary[status as keyof AttendanceSummary] += 1;
  return summary;
}

export async function submitAttendance(ctx: RequestContext, input: SubmitAttendance) {
  const { schoolId } = ctx;
  const section = await findAttendanceSection(ctx, input.sectionId);
  if (!section) throw new AppError('NOT_FOUND', 'attendance.errors.section');

  const day = await getDayState(ctx, input.date);
  if (day.state !== 'open') throw new AppError('BUSINESS_RULE', `attendance.errors.${day.state}`);

  const key = { schoolId, sectionId: section._id, date: input.date, mode: 'daily' as const, period: null };
  const existing = await AttendanceRecord.findOne(key).select('entries idempotencyKey').lean();
  const result = (record: { _id: unknown; entries: { status: string }[] }, before: AttendanceSummary | null) => ({
    recordId: record._id,
    sectionName: section.displayName,
    summary: summarise(record.entries),
    before,
  });
  // A retried request (double click, flaky network) returns the first result instead of writing again.
  if (existing?.idempotencyKey === input.idempotencyKey) return result(existing, null);
  if (existing && input.date !== day.today) throw new AppError('BUSINESS_RULE', 'attendance.errors.locked');

  const enrollments = await Enrollment.find({ schoolId, sectionId: section._id, status: 'active' })
    .select('studentId')
    .lean();
  const enrolled = new Set(enrollments.map((enrollment) => String(enrollment.studentId)));
  const marked = new Set(input.entries.map((entry) => entry.studentId));
  if (marked.size !== input.entries.length || marked.size !== enrolled.size || [...marked].some((id) => !enrolled.has(id))) {
    throw new AppError('VALIDATION', 'attendance.errors.roster');
  }

  const now = new Date();
  const record = await AttendanceRecord.findOneAndUpdate(
    key,
    {
      $set: {
        entries: input.entries.map(({ studentId, status, note }) => ({
          studentId,
          status,
          source: 'manual' as const,
          note: note ?? null,
          at: now,
        })),
        idempotencyKey: input.idempotencyKey,
        editedAfterSubmit: Boolean(existing),
        takenBy: ctx.staffId ?? null,
        updatedBy: ctx.userId,
      },
      $setOnInsert: {
        branchId: section.branchId,
        academicYearId: section.academicYearId,
        submittedAt: now,
        createdBy: ctx.userId,
      },
    },
    { upsert: true, returnDocument: 'after' },
  )
    .select('entries')
    .lean();

  return result(record, existing ? summarise(existing.entries) : null);
}

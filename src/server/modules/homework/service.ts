import 'server-only';
import { AppError } from '@/lib/appError';
import { todayIn } from '@/lib/dates';
import type { RequestContext } from '@/server/auth/context';
import { paginate } from '@/server/db/paginate';
import { Homework } from '@/server/models/homework';
import { School } from '@/server/models/school';
import { Section } from '@/server/models/section';
import { Staff } from '@/server/models/staff';
import { Subject } from '@/server/models/subject';
import { getCurrentYearId } from '@/server/modules/academics/queries';
import { listTaughtSectionIds } from '@/server/modules/timetable/service';
import type { HomeworkInput, HomeworkRow, ListHomework } from './schemas';

const today = async (ctx: RequestContext) =>
  todayIn((await School.findById(ctx.schoolId).select('timezone').lean())?.timezone ?? 'Asia/Kolkata');

/** Sections the signed-in teacher may set homework for: their own class and every section they teach. */
export async function listHomeworkSections(ctx: RequestContext) {
  const academicYearId = await getCurrentYearId(ctx);
  if (!academicYearId || !ctx.staffId) return [];
  const taught = await listTaughtSectionIds(ctx);
  const sections = await Section.find({ schoolId: ctx.schoolId, academicYearId })
    .and([{ $or: [{ classTeacherId: ctx.staffId }, { _id: { $in: taught } }] }])
    .select('displayName')
    .lean();
  return sections
    .map((section) => ({ id: String(section._id), name: section.displayName }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
}

export async function createHomework(ctx: RequestContext, input: HomeworkInput) {
  const { schoolId } = ctx;
  if (!ctx.staffId) throw new AppError('BUSINESS_RULE', 'homework.errors.notTeacher');
  const [allowed, subject, assignedOn] = await Promise.all([
    listHomeworkSections(ctx),
    Subject.findOne({ schoolId, _id: input.subjectId }).select('name').lean(),
    today(ctx),
  ]);
  const allowedIds = new Set(allowed.map((section) => section.id));
  if (!input.sectionIds.every((id) => allowedIds.has(id))) {
    throw new AppError('FORBIDDEN', 'homework.errors.sections');
  }
  if (!subject) throw new AppError('NOT_FOUND', 'homework.errors.subject');
  if (input.dueOn < assignedOn) throw new AppError('BUSINESS_RULE', 'homework.errors.dueOnPast');

  const homework = await Homework.create({
    schoolId,
    ...input,
    teacherId: ctx.staffId,
    assignedOn,
    status: 'published',
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  });
  return { id: homework._id, title: homework.title };
}

export async function listHomework(ctx: RequestContext, query: ListHomework) {
  const { schoolId } = ctx;
  const { rows, ...page } = await paginate(
    Homework,
    { schoolId, ...(ctx.scope === 'assigned' && { teacherId: ctx.staffId ?? null }) },
    {
      sortField: 'dueOn',
      select: ['title', 'instructions', 'subjectId', 'sectionIds', 'teacherId', 'assignedOn', 'dueOn'],
      limit: 25,
      cursor: query.cursor,
      descending: true,
    },
  );
  const [subjects, sections, teachers, now] = await Promise.all([
    Subject.find({ schoolId, _id: { $in: rows.map((row) => row.subjectId) } })
      .setOptions({ withDeleted: true })
      .select('name')
      .lean(),
    Section.find({ schoolId, _id: { $in: rows.flatMap((row) => row.sectionIds) } })
      .select('displayName')
      .lean(),
    Staff.find({ schoolId, _id: { $in: rows.map((row) => row.teacherId) } })
      .setOptions({ withDeleted: true })
      .select('name')
      .lean(),
    today(ctx),
  ]);
  const nameOf = new Map<string, string>([
    ...subjects.map((doc) => [String(doc._id), doc.name] as const),
    ...teachers.map((doc) => [String(doc._id), doc.name] as const),
    ...sections.map((doc) => [String(doc._id), doc.displayName] as const),
  ]);
  const homework: HomeworkRow[] = rows.map((row) => ({
    id: String(row._id),
    title: row.title,
    instructions: row.instructions,
    subject: nameOf.get(String(row.subjectId)) ?? '',
    sections: row.sectionIds.map((id) => nameOf.get(String(id)) ?? '').join(', '),
    teacher: nameOf.get(String(row.teacherId)) ?? '',
    assignedOn: row.assignedOn,
    dueOn: row.dueOn,
    isPastDue: row.dueOn < now,
    isMine: Boolean(ctx.staffId) && String(row.teacherId) === String(ctx.staffId),
  }));
  return { rows: homework, ...page };
}

/** A teacher removes their own homework. Nobody else's. */
export async function deleteHomework(ctx: RequestContext, id: string) {
  if (!ctx.staffId) throw new AppError('NOT_FOUND', 'homework.errors.notFound');
  const homework = await Homework.findOneAndUpdate(
    { schoolId: ctx.schoolId, _id: id, teacherId: ctx.staffId },
    { deletedAt: new Date(), updatedBy: ctx.userId },
  )
    .select('title')
    .lean();
  if (!homework) throw new AppError('NOT_FOUND', 'homework.errors.notFound');
  return { id: homework._id, title: homework.title };
}

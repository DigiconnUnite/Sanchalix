import 'server-only';
import { AppError } from '@/lib/appError';
import { todayIn } from '@/lib/dates';
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import type { RequestContext } from '@/server/auth/context';
import { can } from '@/server/auth/permissions';
import { Enrollment } from '@/server/models/enrollment';
import { ownStudentIds } from '@/server/modules/portal/own';
import { detectFileKind, getFile, putFile, safeFileName } from '@/server/storage/store';
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
      select: ['title', 'instructions', 'subjectId', 'sectionIds', 'teacherId', 'assignedOn', 'dueOn', 'attachments'],
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
    attachments: (row.attachments ?? []).map((file) => ({ id: String(file._id), fileName: file.fileName })),
  }));
  return { rows: homework, ...page };
}

const MAX_ATTACHMENTS = 3;

/** A teacher attaches a worksheet (PDF or image, up to 5 MB) to their own homework. */
export async function addAttachment(ctx: RequestContext, homeworkId: string, input: { fileName: string; bytes: Uint8Array }) {
  const { schoolId } = ctx;
  const kind = detectFileKind(input.bytes);
  if (!kind) throw new AppError('VALIDATION', 'homework.errors.file');
  const homework =
    ctx.staffId && Types.ObjectId.isValid(homeworkId)
      ? await Homework.findOne({ schoolId, _id: homeworkId, teacherId: ctx.staffId }).select('attachments').lean()
      : null;
  if (!homework) throw new AppError('NOT_FOUND', 'homework.errors.notFound');
  if ((homework.attachments ?? []).length >= MAX_ATTACHMENTS) {
    throw new AppError('BUSINESS_RULE', 'homework.errors.tooManyFiles', { max: MAX_ATTACHMENTS });
  }
  const key = `${schoolId.toString()}/${homeworkId}/${randomUUID()}.${kind.ext}`;
  await putFile(key, input.bytes);
  const fileName = safeFileName(input.fileName, kind.ext);
  await Homework.updateOne(
    { schoolId, _id: homework._id },
    { $push: { attachments: { key, fileName, mime: kind.mime, size: input.bytes.length } }, updatedBy: ctx.userId },
  );
  return { id: homework._id, fileName };
}

/**
 * A homework file, for whoever can see the homework: its teacher, the office and principal, and a student or parent
 * whose section it was set for.
 */
export async function readAttachment(ctx: RequestContext, homeworkId: string, attachmentId: string) {
  const { schoolId } = ctx;
  if (!Types.ObjectId.isValid(homeworkId) || !Types.ObjectId.isValid(attachmentId)) {
    throw new AppError('NOT_FOUND', 'homework.errors.notFound');
  }
  const homework = await Homework.findOne({ schoolId, _id: homeworkId, 'attachments._id': attachmentId })
    .select('teacherId sectionIds attachments')
    .lean();
  const file = homework?.attachments.find((candidate) => String(candidate._id) === attachmentId);
  if (!homework || !file) throw new AppError('NOT_FOUND', 'homework.errors.notFound');

  let allowed = false;
  if (can(ctx.role, 'homework.assignment.read')) {
    allowed = ctx.scope !== 'assigned' || String(homework.teacherId) === String(ctx.staffId);
  } else {
    const students = await ownStudentIds(ctx);
    allowed =
      students.length > 0 &&
      Boolean(
        await Enrollment.exists({
          schoolId,
          studentId: { $in: students },
          sectionId: { $in: homework.sectionIds },
          status: 'active',
        }),
      );
  }
  if (!allowed) throw new AppError('NOT_FOUND', 'homework.errors.notFound');
  return { fileName: file.fileName, mime: file.mime, bytes: await getFile(file.key) };
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

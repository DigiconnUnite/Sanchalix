import 'server-only';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AppError } from '@/lib/appError';
import type { RequestContext } from '@/server/auth/context';
import { can } from '@/server/auth/permissions';
import { Enrollment } from '@/server/models/enrollment';
import { ReportCard } from '@/server/models/reportCard';
import { School } from '@/server/models/school';
import { Section } from '@/server/models/section';
import { Student } from '@/server/models/student';
import { getCurrentYearId } from '@/server/modules/academics/queries';
import { ownStudentIds } from '@/server/modules/portal/own';
import { getStudentAttendance } from '@/server/modules/sis/queries';
import { getStudentResults, type StudentResult } from './service';

const E = 'exams.reportCards.errors';
const Id = z.string().regex(/^[0-9a-f]{24}$/, `${E}.notFound`);
const Remark = z.string().trim().max(300, `${E}.remark`);

export const SectionId = Id;
export const RemarksInput = z.object({ id: Id, classTeacherRemark: Remark.optional(), principalRemark: Remark.optional() });
export type RemarksInput = z.infer<typeof RemarksInput>;

/** What a published card shows. It is copied at generation time, so later edits to marks don't change a card. */
export type Snapshot = {
  studentName: string;
  admissionNo: string;
  classSection: string;
  rollNo: number;
  exams: StudentResult[];
  total: number;
  maxTotal: number;
  percent: number | null;
  attendancePercent: number | null;
};

type Status = 'none' | 'draft' | 'published' | 'withdrawn';
export type ReportCardRow = {
  studentId: string;
  cardId: string | null;
  name: string;
  rollNo: number;
  percent: number | null;
  status: Status;
  classTeacherRemark: string;
  principalRemark: string;
};
export type ReportCardList = {
  sections: { id: string; name: string }[];
  section: { id: string; name: string } | null;
  rows: ReportCardRow[];
  isClassTeacher: boolean;
};
export type ReportCardDetail = Snapshot & {
  id: string;
  schoolName: string;
  status: Exclude<Status, 'none'>;
  classTeacherRemark: string;
  principalRemark: string;
  publishedAt: string | null;
};

/** Sections whose report cards this user works with: a teacher only where they are the class teacher. */
async function sectionsFor(ctx: RequestContext) {
  const academicYearId = await getCurrentYearId(ctx);
  if (!academicYearId) return { academicYearId: null, sections: [] };
  const sections = await Section.find({
    schoolId: ctx.schoolId,
    academicYearId,
    ...(ctx.scope === 'branch' && ctx.branchId && { branchId: ctx.branchId }),
    ...(ctx.scope === 'assigned' && { classTeacherId: ctx.staffId ?? null }),
  })
    .select('displayName classTeacherId')
    .lean();
  sections.sort((a, b) => a.displayName.localeCompare(b.displayName, 'en', { numeric: true }));
  return { academicYearId, sections };
}

async function sectionOf(ctx: RequestContext, sectionId: string) {
  const { academicYearId, sections } = await sectionsFor(ctx);
  const section = sections.find((candidate) => String(candidate._id) === sectionId);
  if (!academicYearId || !section) throw new AppError('NOT_FOUND', `${E}.section`);
  return { academicYearId, section };
}

export async function listReportCards(ctx: RequestContext, sectionId?: string): Promise<ReportCardList> {
  const { schoolId } = ctx;
  const { sections } = await sectionsFor(ctx);
  const option = (section: { _id: unknown; displayName: string }) => ({ id: String(section._id), name: section.displayName });
  const section = sections.find((candidate) => String(candidate._id) === sectionId) ?? null;
  if (!section) return { sections: sections.map(option), section: null, rows: [], isClassTeacher: false };

  const enrollments = await Enrollment.find({ schoolId, sectionId: section._id, status: 'active' })
    .sort({ rollNo: 1 })
    .select('studentId rollNo')
    .lean();
  const ids = enrollments.map((enrollment) => enrollment.studentId);
  const [students, cards] = await Promise.all([
    Student.find({ schoolId, _id: { $in: ids } }).select('firstName lastName').lean(),
    ReportCard.find({ schoolId, sectionId: section._id, studentId: { $in: ids } })
      .select('studentId status snapshot.percent classTeacherRemark principalRemark')
      .lean(),
  ]);
  const nameOf = new Map(students.map((student) => [String(student._id), `${student.firstName} ${student.lastName ?? ''}`.trim()]));
  const cardOf = new Map(cards.map((card) => [String(card.studentId), card]));
  return {
    sections: sections.map(option),
    section: option(section),
    isClassTeacher: Boolean(ctx.staffId && section.classTeacherId?.equals(ctx.staffId)),
    rows: enrollments.map((enrollment) => {
      const id = String(enrollment.studentId);
      const card = cardOf.get(id);
      return {
        studentId: id,
        cardId: card ? String(card._id) : null,
        name: nameOf.get(id) ?? '',
        rollNo: enrollment.rollNo,
        percent: (card?.snapshot as Snapshot | undefined)?.percent ?? null,
        status: card?.status ?? 'none',
        classTeacherRemark: card?.classTeacherRemark ?? '',
        principalRemark: card?.principalRemark ?? '',
      };
    }),
  };
}

/**
 * Builds or refreshes the draft card of every student in the section from this year's published results.
 * A published card is left as it is: what a family has been given doesn't change underneath them.
 */
export async function generateReportCards(ctx: RequestContext, sectionId: string) {
  const { schoolId } = ctx;
  const { academicYearId, section } = await sectionOf(ctx, sectionId);
  const enrollments = await Enrollment.find({ schoolId, sectionId: section._id, status: 'active' })
    .select('studentId rollNo')
    .lean();
  const [students, published] = await Promise.all([
    Student.find({ schoolId, _id: { $in: enrollments.map((enrollment) => enrollment.studentId) } })
      .select('firstName lastName admissionNo')
      .lean(),
    ReportCard.distinct('studentId', { schoolId, academicYearId, termId: null, status: 'published' }),
  ]);
  const studentOf = new Map(students.map((student) => [String(student._id), student]));
  const frozen = new Set(published.map(String));
  let generated = 0;
  let withoutResults = 0;

  for (const enrollment of enrollments) {
    const id = String(enrollment.studentId);
    const student = studentOf.get(id);
    if (!student || frozen.has(id)) continue;
    const [exams, attendance] = await Promise.all([
      getStudentResults(ctx, id, true, academicYearId),
      getStudentAttendance(ctx, id),
    ]);
    if (exams.length === 0) {
      withoutResults += 1;
      continue;
    }
    const total = exams.reduce((sum, exam) => sum + exam.total, 0);
    const maxTotal = exams.reduce((sum, exam) => sum + exam.maxTotal, 0);
    const snapshot: Snapshot = {
      studentName: `${student.firstName} ${student.lastName ?? ''}`.trim(),
      admissionNo: student.admissionNo,
      classSection: section.displayName,
      rollNo: enrollment.rollNo,
      exams,
      total,
      maxTotal,
      percent: maxTotal ? Math.round((total / maxTotal) * 1000) / 10 : null,
      attendancePercent: attendance.percent,
    };
    await ReportCard.findOneAndUpdate(
      { schoolId, studentId: enrollment.studentId, academicYearId, termId: null, status: { $ne: 'published' } },
      {
        $set: {
          sectionId: section._id,
          examIds: exams.map((exam) => new Types.ObjectId(exam.examId)),
          snapshot,
          status: 'draft',
          updatedBy: ctx.userId,
        },
        $setOnInsert: { createdBy: ctx.userId },
      },
      { upsert: true },
    );
    generated += 1;
  }
  if (generated === 0 && frozen.size === 0) throw new AppError('BUSINESS_RULE', `${E}.noResults`);
  return { sectionId: section._id, section: section.displayName, generated, withoutResults, alreadyPublished: frozen.size };
}

export async function saveRemarks(ctx: RequestContext, { id, classTeacherRemark, principalRemark }: RemarksInput) {
  const { schoolId } = ctx;
  const card = await ReportCard.findOne({ schoolId, _id: id }).select('sectionId status').lean();
  if (!card) throw new AppError('NOT_FOUND', `${E}.notFound`);
  if (card.status === 'published') throw new AppError('BUSINESS_RULE', `${E}.published`);
  // A teacher writes the class teacher's remark for their own section only. The principal may write either.
  const isPrincipal = can(ctx.role, 'exams.reportCard.publish');
  if (!isPrincipal) {
    const own = ctx.staffId && (await Section.exists({ schoolId, _id: card.sectionId, classTeacherId: ctx.staffId }));
    if (!own || principalRemark !== undefined) throw new AppError('FORBIDDEN', 'errors.forbidden');
  }
  await ReportCard.updateOne(
    { schoolId, _id: card._id, status: { $ne: 'published' } },
    {
      ...(classTeacherRemark !== undefined && { classTeacherRemark }),
      ...(principalRemark !== undefined && { principalRemark }),
      updatedBy: ctx.userId,
    },
  );
  return { id: card._id };
}

export async function publishReportCards(ctx: RequestContext, sectionId: string) {
  const { section } = await sectionOf(ctx, sectionId);
  const result = await ReportCard.updateMany(
    { schoolId: ctx.schoolId, sectionId: section._id, status: 'draft' },
    { status: 'published', publishedAt: new Date(), updatedBy: ctx.userId },
  );
  if (result.modifiedCount === 0) throw new AppError('BUSINESS_RULE', `${E}.nothingToPublish`);
  return { sectionId: section._id, section: section.displayName, published: result.modifiedCount };
}

/** Staff see a card of a section they work with, drafts included. A student or parent sees only their own, once published. */
export async function getReportCard(ctx: RequestContext, id: string): Promise<ReportCardDetail | null> {
  const { schoolId } = ctx;
  const card = Types.ObjectId.isValid(id) ? await ReportCard.findOne({ schoolId, _id: id }).lean() : null;
  if (!card) return null;
  if (can(ctx.role, 'exams.reportCard.read')) {
    const { sections } = await sectionsFor(ctx);
    if (!sections.some((section) => section._id.equals(card.sectionId))) return null;
  } else {
    const own = await ownStudentIds(ctx);
    if (card.status !== 'published' || !own.some((studentId) => studentId.equals(card.studentId))) return null;
  }
  const school = await School.findById(schoolId).select('name').lean();
  return {
    ...(card.snapshot as Snapshot),
    id: String(card._id),
    schoolName: school?.name ?? '',
    status: card.status,
    classTeacherRemark: card.classTeacherRemark,
    principalRemark: card.principalRemark,
    publishedAt: card.publishedAt?.toISOString() ?? null,
  };
}

/** The student's newest published card, for the portal home. */
export async function latestPublishedCardId(ctx: RequestContext, studentId: string) {
  const card = await ReportCard.findOne({ schoolId: ctx.schoolId, studentId, status: 'published' })
    .sort({ publishedAt: -1 })
    .select('_id')
    .lean();
  return card ? String(card._id) : null;
}

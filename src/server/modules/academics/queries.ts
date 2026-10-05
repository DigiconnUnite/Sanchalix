import 'server-only';
import type { RequestContext } from '@/server/auth/context';
import { AcademicYear } from '@/server/models/academicYear';
import { Class } from '@/server/models/class';
import { Enrollment } from '@/server/models/enrollment';
import { Section } from '@/server/models/section';
import { Staff } from '@/server/models/staff';
import type { SectionRow } from './schemas';

export async function getCurrentYearId(ctx: RequestContext) {
  const year = await AcademicYear.findOne({ schoolId: ctx.schoolId, status: 'current' }).select('_id').lean();
  return year?._id ?? null;
}

const branchFilter = (ctx: RequestContext) =>
  ctx.scope === 'branch' && ctx.branchId ? { branchId: ctx.branchId } : {};

export async function listClasses(ctx: RequestContext) {
  const academicYearId = await getCurrentYearId(ctx);
  if (!academicYearId) return [];
  const classes = await Class.find({ schoolId: ctx.schoolId, academicYearId, ...branchFilter(ctx) })
    .sort({ order: 1 })
    .select('name order')
    .lean();
  return classes.map((schoolClass) => ({ id: String(schoolClass._id), name: schoolClass.name, order: schoolClass.order }));
}

export async function listSections(ctx: RequestContext): Promise<SectionRow[]> {
  const { schoolId } = ctx;
  const academicYearId = await getCurrentYearId(ctx);
  if (!academicYearId) return [];

  const [classes, sections] = await Promise.all([
    listClasses(ctx),
    Section.find({ schoolId, academicYearId, ...branchFilter(ctx) })
      .select('classId displayName capacity room classTeacherId')
      .lean(),
  ]);
  const strengths = await Enrollment.aggregate<{ _id: unknown; students: number }>([
    { $match: { schoolId, status: 'active', sectionId: { $in: sections.map((section) => section._id) } } },
    { $group: { _id: '$sectionId', students: { $sum: 1 } } },
  ]);
  const teachers = await Staff.find({ schoolId, _id: { $in: sections.map((section) => section.classTeacherId) } })
    .setOptions({ withDeleted: true })
    .select('name')
    .lean();
  const teacherById = new Map(teachers.map((teacher) => [String(teacher._id), teacher.name]));
  const strengthById = new Map(strengths.map((row) => [String(row._id), row.students]));
  const classById = new Map(classes.map((schoolClass) => [schoolClass.id, schoolClass]));

  const orderOf = (section: (typeof sections)[number]) => classById.get(String(section.classId))?.order ?? 0;
  return sections
    .sort((a, b) => orderOf(a) - orderOf(b) || a.displayName.localeCompare(b.displayName))
    .map((section) => ({
      id: String(section._id),
      className: classById.get(String(section.classId))?.name ?? '',
      name: section.displayName,
      strength: strengthById.get(String(section._id)) ?? 0,
      capacity: section.capacity,
      room: section.room || null,
      classTeacher: teacherById.has(String(section.classTeacherId))
        ? { id: String(section.classTeacherId), name: teacherById.get(String(section.classTeacherId)) ?? '' }
        : null,
    }));
}

export async function listCurrentSections(ctx: RequestContext) {
  return (await listSections(ctx)).map(({ id, name }) => ({ id, name }));
}

import 'server-only';
import { AppError } from '@/lib/appError';
import type { RequestContext } from '@/server/auth/context';
import { Branch } from '@/server/models/branch';
import { Class } from '@/server/models/class';
import { Section } from '@/server/models/section';
import { Staff } from '@/server/models/staff';
import { getCurrentYearId } from './queries';
import type { ClassInput, SectionInput } from './schemas';

const isDuplicateKey = (error: unknown) => error instanceof Error && 'code' in error && error.code === 11000;

export async function createClass(ctx: RequestContext, input: ClassInput) {
  const { schoolId } = ctx;
  const [academicYearId, branch] = await Promise.all([
    getCurrentYearId(ctx),
    ctx.branchId ? { _id: ctx.branchId } : Branch.findOne({ schoolId, isDefault: true }).select('_id').lean(),
  ]);
  if (!academicYearId || !branch) throw new AppError('BUSINESS_RULE', 'academics.classes.errors.noYear');

  try {
    const created = await Class.create({
      schoolId,
      branchId: branch._id,
      academicYearId,
      ...input,
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    });
    return { id: created._id, name: created.name };
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError('CONFLICT', 'academics.classes.errors.orderTaken', input);
    throw error;
  }
}

export async function createSection(ctx: RequestContext, input: SectionInput) {
  const { schoolId } = ctx;
  const schoolClass = await Class.findOne({ schoolId, _id: input.classId }).lean();
  if (!schoolClass || (ctx.scope === 'branch' && !schoolClass.branchId.equals(ctx.branchId))) {
    throw new AppError('NOT_FOUND', 'academics.classes.errors.class');
  }
  // "Class 7" + "B" is shown as "7-B"; a class without that prefix keeps its own name, like "Nursery-A".
  const displayName = `${schoolClass.name.replace(/^Class\s+/i, '')}-${input.name}`;

  try {
    const created = await Section.create({
      schoolId,
      branchId: schoolClass.branchId,
      academicYearId: schoolClass.academicYearId,
      classId: schoolClass._id,
      name: input.name,
      displayName,
      capacity: input.capacity,
      room: input.room,
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    });
    return { id: created._id, name: displayName };
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError('CONFLICT', 'academics.classes.errors.sectionTaken', { name: displayName });
    throw error;
  }
}

/** Sets or clears a section's class teacher, the person who takes its daily attendance. */
export async function assignClassTeacher(ctx: RequestContext, sectionId: string, staffId: string | null) {
  const { schoolId } = ctx;
  const teacher = staffId
    ? await Staff.findOne({ schoolId, _id: staffId, status: 'active', type: 'teaching' }).select('name').lean()
    : null;
  if (staffId && !teacher) throw new AppError('NOT_FOUND', 'academics.classes.errors.teacher');

  const section = await Section.findOneAndUpdate(
    { schoolId, _id: sectionId, ...(ctx.scope === 'branch' && ctx.branchId && { branchId: ctx.branchId }) },
    { classTeacherId: teacher?._id ?? null, updatedBy: ctx.userId },
  )
    .select('displayName classTeacherId')
    .lean();
  if (!section) throw new AppError('NOT_FOUND', 'academics.classes.errors.section');
  return {
    id: section._id,
    name: section.displayName,
    teacherName: teacher?.name ?? null,
    previousTeacherId: section.classTeacherId ?? null,
  };
}

import 'server-only';
import type { RequestContext } from '@/server/auth/context';
import { AcademicYear } from '@/server/models/academicYear';
import { Admission, ADMISSION_SOURCES, ADMISSION_STATUSES } from '@/server/models/admission';
import { Class } from '@/server/models/class';
import { Staff, STAFF_STATUSES, STAFF_TYPES } from '@/server/models/staff';

type Count<Key extends string = string> = { key: Key; count: number };

export type AdmissionsReport = {
  year: string;
  total: number;
  byStage: Count<(typeof ADMISSION_STATUSES)[number]>[];
  bySource: Count<(typeof ADMISSION_SOURCES)[number]>[];
  byClass: { name: string; total: number; admitted: number }[];
};

export type StaffReport = {
  total: number;
  withAccount: number;
  byType: Count<(typeof STAFF_TYPES)[number]>[];
  byStatus: Count<(typeof STAFF_STATUSES)[number]>[];
  byDepartment: { name: string | null; count: number }[];
};

const scopeOf = (ctx: RequestContext) => ({
  schoolId: ctx.schoolId,
  deletedAt: null,
  ...(ctx.scope === 'branch' && ctx.branchId && { branchId: ctx.branchId }),
});
const tally = <Key extends string>(keys: readonly Key[], rows: { _id: string; count: number }[]) =>
  keys.map((key) => ({ key, count: rows.find((row) => row._id === key)?.count ?? 0 }));

/** This year's applications: how many are at each stage, where they came from and which classes they want. */
export async function getAdmissionsReport(ctx: RequestContext): Promise<AdmissionsReport | null> {
  const year = await AcademicYear.findOne({ schoolId: ctx.schoolId, status: 'current' }).select('label').lean();
  if (!year) return null;
  const match = { ...scopeOf(ctx), academicYearId: year._id };
  const group = (field: string) =>
    Admission.aggregate<{ _id: string; count: number }>([{ $match: match }, { $group: { _id: field, count: { $sum: 1 } } }]);
  const [stages, sources, classes] = await Promise.all([
    group('$status'),
    group('$source'),
    Admission.aggregate<{ _id: unknown; total: number; admitted: number }>([
      { $match: match },
      {
        $group: {
          _id: '$applicant.classSought',
          total: { $sum: 1 },
          admitted: { $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] } },
        },
      },
    ]),
  ]);
  const names = await Class.find({ schoolId: ctx.schoolId, _id: { $in: classes.map((row) => row._id) } })
    .sort({ order: 1 })
    .select('name')
    .lean();
  return {
    year: year.label,
    total: stages.reduce((sum, row) => sum + row.count, 0),
    byStage: tally(ADMISSION_STATUSES, stages),
    bySource: tally(ADMISSION_SOURCES, sources),
    byClass: names.flatMap((schoolClass) => {
      const row = classes.find((candidate) => String(candidate._id) === String(schoolClass._id));
      return row ? [{ name: schoolClass.name, total: row.total, admitted: row.admitted }] : [];
    }),
  };
}

/** The staff on record: how many teach, how many are working, and how they are spread across departments. */
export async function getStaffReport(ctx: RequestContext): Promise<StaffReport> {
  const match = scopeOf(ctx);
  const working = { ...match, status: { $in: ['active' as const, 'on_leave' as const] } };
  const group = (filter: object, field: string) =>
    Staff.aggregate<{ _id: string; count: number }>([{ $match: filter }, { $group: { _id: field, count: { $sum: 1 } } }]);
  const [types, statuses, departments, withAccount] = await Promise.all([
    group(working, '$type'),
    group(match, '$status'),
    group(working, '$department'),
    Staff.countDocuments({ ...working, userId: { $ne: null } }),
  ]);
  return {
    total: types.reduce((sum, row) => sum + row.count, 0),
    withAccount,
    byType: tally(STAFF_TYPES, types),
    byStatus: tally(STAFF_STATUSES, statuses),
    byDepartment: departments
      .map((row) => ({ name: row._id || null, count: row.count }))
      .sort((a, b) => b.count - a.count || (a.name ?? '').localeCompare(b.name ?? '')),
  };
}

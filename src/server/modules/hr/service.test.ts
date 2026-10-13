import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { RequestContext } from '@/server/auth/context';
import { connectDb } from '@/server/db/connect';
import { AcademicYear } from '@/server/models/academicYear';
import { Branch } from '@/server/models/branch';
import { Section } from '@/server/models/section';
import { Staff } from '@/server/models/staff';
import { listSections } from '@/server/modules/academics/queries';
import { assignClassTeacher } from '@/server/modules/academics/service';
import { findAttendanceSection } from '@/server/modules/attendance/queries';
import { importStaff, STAFF_IMPORT_COLUMNS } from './importService';
import { StaffInput } from './schemas';
import { getAdmissionsReport, getStaffReport } from '@/server/modules/reports/service';
import { createStaff, getStaffProfile, listStaff, listTeachers } from './service';

const ADDRESS = { line1: '12 School Road', city: 'Bhopal', state: 'Madhya Pradesh', pincode: '462001', country: 'IN' };
let ctx: RequestContext;
let other: RequestContext;
let sectionId: string;

async function seedSchool(): Promise<RequestContext> {
  const schoolId = new Types.ObjectId();
  await Branch.create({ schoolId, name: 'Main campus', code: 'MAIN', address: ADDRESS, isDefault: true });
  await AcademicYear.create({ schoolId, label: '2026–27', startDate: '2026-04-01', endDate: '2027-03-31', status: 'current' });
  return { userId: new Types.ObjectId(), name: 'Meena Joshi', role: 'school_admin', scope: 'school', schoolId };
}

const input = (overrides: Record<string, unknown> = {}) =>
  StaffInput.parse({
    name: 'Priya Nair',
    designation: 'TGT Mathematics',
    type: 'teaching',
    phone: '9876543210',
    email: '',
    joinedOn: '2022-04-01',
    ...overrides,
  });

beforeAll(async () => {
  await connectDb();
  await Staff.init();
  [ctx, other] = await Promise.all([seedSchool(), seedSchool()]);
  const year = await AcademicYear.findOne({ schoolId: ctx.schoolId }).lean();
  const section = await Section.create({
    schoolId: ctx.schoolId,
    branchId: new Types.ObjectId(),
    academicYearId: year?._id ?? new Types.ObjectId(),
    classId: new Types.ObjectId(),
    name: 'B',
    displayName: '7-B',
  });
  sectionId = String(section._id);
});

afterAll(() => mongoose.disconnect());

it('rejects a bad phone, a missing type and a missing joining date', () => {
  const result = StaffInput.safeParse({ name: 'X', designation: 'Y', phone: '12345', joinedOn: '' });
  const paths = result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
  expect(paths).toEqual(expect.arrayContaining(['phone', 'type', 'joinedOn']));
});

it('adds staff with the next employee number, per school', async () => {
  const first = await createStaff(ctx, input());
  const second = await createStaff(ctx, input({ name: 'Anil Kumar', designation: 'Office assistant', type: 'non_teaching' }));
  expect([first.employeeNo, second.employeeNo]).toEqual(['EMP-0001', 'EMP-0002']);
  expect((await createStaff(other, input({ name: 'Zoya Khan' }))).employeeNo).toBe('EMP-0001');

  const { rows } = await listStaff(ctx, { pageSize: 25 });
  expect(rows.map((row) => [row.name, row.type, row.phone])).toEqual([
    ['Anil Kumar', 'non_teaching', '+919876543210'],
    ['Priya Nair', 'teaching', '+919876543210'],
  ]);
  expect((await listStaff(other, { pageSize: 25 })).rows.map((row) => row.name)).toEqual(['Zoya Khan']);
});

it('offers only active teaching staff as class teachers', async () => {
  expect((await listTeachers(ctx)).map((teacher) => teacher.name)).toEqual(['Priya Nair']);
});

it('assigns and clears a class teacher, which decides who may take the section’s attendance', async () => {
  const [priya] = await listTeachers(ctx);
  const teacher: RequestContext = {
    ...ctx,
    role: 'teacher',
    scope: 'assigned',
    staffId: new Types.ObjectId(priya?.id),
  };
  expect(await findAttendanceSection(teacher, sectionId)).toBeNull();

  expect(await assignClassTeacher(ctx, sectionId, priya?.id ?? '')).toMatchObject({ name: '7-B', teacherName: 'Priya Nair' });
  expect((await listSections(ctx))[0]?.classTeacher).toEqual({ id: priya?.id, name: 'Priya Nair' });
  expect(await findAttendanceSection(teacher, sectionId)).not.toBeNull();

  await assignClassTeacher(ctx, sectionId, null);
  expect((await listSections(ctx))[0]?.classTeacher).toBeNull();
  expect(await findAttendanceSection(teacher, sectionId)).toBeNull();
});

it('refuses non-teaching staff, another school’s teacher and another school’s section', async () => {
  const anil = await Staff.findOne({ schoolId: ctx.schoolId, name: 'Anil Kumar' }).lean();
  const zoya = await Staff.findOne({ schoolId: other.schoolId }).lean();
  const [priya] = await listTeachers(ctx);
  await expect(assignClassTeacher(ctx, sectionId, String(anil?._id))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(assignClassTeacher(ctx, sectionId, String(zoya?._id))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(assignClassTeacher(other, sectionId, null)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(assignClassTeacher(other, sectionId, priya?.id ?? '')).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

it('shows a staff profile to its own school only, without pay or bank details', async () => {
  const { rows } = await listStaff(ctx, { pageSize: 10 });
  const id = rows[0]?.id ?? '';
  const profile = await getStaffProfile(ctx, id);
  expect(profile).toMatchObject({ id, hasAccount: false, classTeacherOf: [], teaches: [] });
  expect(profile?.leave.map((balance) => balance.type)).toEqual(['CL', 'SL', 'EL']);
  expect(profile).not.toHaveProperty('salary');
  expect(await getStaffProfile(other, id)).toBeNull();
});

it('counts staff and admissions for the reports, for this school only', async () => {
  const staff = await getStaffReport(ctx);
  expect(staff.total).toBeGreaterThan(0);
  expect(staff.byType.reduce((sum, row) => sum + row.count, 0)).toBe(staff.total);
  expect(staff.withAccount).toBe(0);
  expect((await getStaffReport({ ...ctx, schoolId: new Types.ObjectId() })).total).toBe(0);
  expect(await getAdmissionsReport({ ...ctx, schoolId: new Types.ObjectId() })).toBeNull();
});

it('imports staff from a file only when every row is right, and never the same person twice', async () => {
  const file = (...rows: string[]) => [STAFF_IMPORT_COLUMNS.join(','), ...rows].join('\n');
  const good = 'Imran Sheikh,PGT Physics,Science,Teaching,9811100011,,2024-06-10';
  await expect(importStaff(ctx, 'name,phone\nx,y', true)).rejects.toMatchObject({ code: 'VALIDATION' });

  const bad = await importStaff(ctx, file(good, 'No Phone,Clerk,,non_teaching,12345,,2024-06-10', good), false);
  expect(bad.imported).toBe(0);
  expect(bad.errors.map((error) => [error.row, error.field])).toEqual([
    [3, 'phone'],
    [4, 'phone'],
  ]);

  const before = (await listStaff(ctx, { pageSize: 100 })).rows.length;
  expect(await importStaff(ctx, file(good), true)).toMatchObject({ total: 1, imported: 0, errors: [] });
  expect((await listStaff(ctx, { pageSize: 100 })).rows).toHaveLength(before);
  expect(await importStaff(ctx, file(good), false)).toMatchObject({ imported: 1 });
  expect((await listStaff(ctx, { pageSize: 100 })).rows).toHaveLength(before + 1);
  expect((await importStaff(ctx, file(good), false)).errors).toMatchObject([{ row: 2, field: 'phone' }]);
});

import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { RequestContext } from '@/server/auth/context';
import { connectDb } from '@/server/db/connect';
import { Enrollment } from '@/server/models/enrollment';
import { Guardian } from '@/server/models/guardian';
import { Section } from '@/server/models/section';
import { Student } from '@/server/models/student';
import { countStudents, listStudents } from './queries';

const schoolA = new Types.ObjectId();
const schoolB = new Types.ObjectId();
const classTeacher = new Types.ObjectId();

const context = (overrides: Partial<RequestContext>): RequestContext => ({
  userId: new Types.ObjectId(),
  name: 'Test user',
  role: 'school_admin',
  scope: 'school',
  schoolId: schoolA,
  ...overrides,
});

async function addStudent(schoolId: Types.ObjectId, lastName: string, sectionId: Types.ObjectId, rollNo: number) {
  const ids = { student: new Types.ObjectId(), guardian: new Types.ObjectId(), enrollment: new Types.ObjectId() };
  const shared = { schoolId, branchId: new Types.ObjectId() };
  await Guardian.create({ _id: ids.guardian, schoolId, name: `Sunita ${lastName}`, relation: 'mother', phone: '+919000000001' });
  await Student.create({
    ...shared,
    _id: ids.student,
    admissionNo: `ADM-${lastName}`,
    firstName: 'Aarav',
    lastName,
    dob: '2014-05-15',
    gender: 'male',
    guardianIds: [ids.guardian],
    primaryGuardianId: ids.guardian,
    currentEnrollmentId: ids.enrollment,
  });
  await Enrollment.create({
    ...shared,
    _id: ids.enrollment,
    studentId: ids.student,
    academicYearId: new Types.ObjectId(),
    classId: new Types.ObjectId(),
    sectionId,
    rollNo,
  });
}

beforeAll(async () => {
  await connectDb();

  const section = (schoolId: Types.ObjectId, displayName: string, classTeacherId?: Types.ObjectId) =>
    Section.create({
      schoolId,
      branchId: new Types.ObjectId(),
      academicYearId: new Types.ObjectId(),
      classId: new Types.ObjectId(),
      name: displayName.slice(-1),
      displayName,
      ...(classTeacherId && { classTeacherId }),
    });
  const [sevenA, sevenB, other] = await Promise.all([
    section(schoolA, '7-A'),
    section(schoolA, '7-B', classTeacher),
    section(schoolB, '5-A'),
  ]);

  await addStudent(schoolA, 'Mehta', sevenA._id, 1);
  await addStudent(schoolA, 'Das', sevenA._id, 2);
  await addStudent(schoolA, 'Verma', sevenB._id, 1);
  await addStudent(schoolB, 'Khan', other._id, 1);
});

afterAll(() => mongoose.disconnect());

const names = (rows: { name: string }[]) => rows.map((row) => row.name);

it('lists only the school’s own students, sorted by last name, with class and parent', async () => {
  const { rows } = await listStudents(context({}), { status: 'active', pageSize: 25 });
  expect(names(rows)).toEqual(['Aarav Das', 'Aarav Mehta', 'Aarav Verma']);
  expect(rows[0]).toMatchObject({ classSection: '7-A', rollNo: 2, guardianName: 'Sunita Das' });
  expect(await countStudents(context({}), 'active')).toBe(3);
});

it('never returns another school’s students', async () => {
  const { rows } = await listStudents(context({ schoolId: schoolB }), { status: 'active', pageSize: 25 });
  expect(names(rows)).toEqual(['Aarav Khan']);
});

it('pages forwards and backwards with cursors', async () => {
  const first = await listStudents(context({}), { status: 'active', pageSize: 2 });
  expect(names(first.rows)).toEqual(['Aarav Das', 'Aarav Mehta']);
  expect(first.prevCursor).toBeNull();

  const second = await listStudents(context({}), { status: 'active', pageSize: 2, cursor: first.nextCursor ?? '' });
  expect(names(second.rows)).toEqual(['Aarav Verma']);
  expect(second).toMatchObject({ page: 2, nextCursor: null });

  const back = await listStudents(context({}), { status: 'active', pageSize: 2, cursor: second.prevCursor ?? '' });
  expect(names(back.rows)).toEqual(['Aarav Das', 'Aarav Mehta']);
  expect(back).toMatchObject({ page: 1, prevCursor: null });
  expect(back.nextCursor).not.toBeNull();
});

it('limits a teacher to the sections they are class teacher of', async () => {
  const teacher = context({ role: 'teacher', scope: 'assigned', staffId: classTeacher });
  const { rows } = await listStudents(teacher, { status: 'active', pageSize: 25 });
  expect(names(rows)).toEqual(['Aarav Verma']);
});

it('refuses scopes that have no student list', async () => {
  const parent = context({ role: 'parent', scope: 'ward' });
  await expect(listStudents(parent, { status: 'active', pageSize: 25 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

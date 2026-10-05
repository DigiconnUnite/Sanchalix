import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { RequestContext } from '@/server/auth/context';
import { connectDb } from '@/server/db/connect';
import { AcademicYear } from '@/server/models/academicYear';
import { Homework } from '@/server/models/homework';
import { School } from '@/server/models/school';
import { Section } from '@/server/models/section';
import { Staff } from '@/server/models/staff';
import { Subject } from '@/server/models/subject';
import { TimetableSlot } from '@/server/models/timetableSlot';
import { createHomework, deleteHomework, listHomework } from '@/server/modules/homework/service';
import { clearSlot, createSubject, getTimetable, setSlot } from './service';

const ADDRESS = { line1: '12 School Road', city: 'Bhopal', state: 'Madhya Pradesh', pincode: '462001', country: 'IN' };
let admin: RequestContext;
let otherSchool: RequestContext;
let teacher: RequestContext;
let otherTeacher: RequestContext;
let sections: string[];
let maths: string;

async function seedSchool(code: string) {
  const school = await School.create({ organizationId: new Types.ObjectId(), name: code, code, board: 'CBSE', address: ADDRESS });
  const schoolId = school._id;
  const branchId = new Types.ObjectId();
  const year = await AcademicYear.create({
    schoolId,
    label: '2026–27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    status: 'current',
  });
  const classId = new Types.ObjectId();
  const created = await Section.create(
    ['A', 'B', 'C'].map((name) => ({
      schoolId,
      branchId,
      academicYearId: year._id,
      classId,
      name,
      displayName: `7-${name}`,
    })),
  );
  const member = (name: string, index: number) =>
    Staff.create({
      schoolId,
      branchId,
      employeeNo: `EMP-000${index + 1}`,
      name,
      phone: `+91981000000${index}`,
      designation: 'TGT',
      type: 'teaching',
      joinedOn: '2024-04-01',
    });
  const staff = [await member('Anita Desai', 0), await member('Rohit Kulkarni', 1)] as const;
  const context = (role: RequestContext['role'], staffId?: Types.ObjectId): RequestContext => ({
    userId: new Types.ObjectId(),
    name: 'Test User',
    role,
    scope: role === 'teacher' ? 'assigned' : 'school',
    schoolId,
    ...(staffId && { staffId }),
  });
  return { context, sectionIds: created.map((section) => String(section._id)), staff };
}

beforeAll(async () => {
  await connectDb();
  await Promise.all([TimetableSlot, Subject, Homework, Staff, Section, AcademicYear, School].map((model) => model.init()));
  const stamp = Date.now().toString(36).slice(-5).toUpperCase();
  const first = await seedSchool(`E${stamp}`);
  admin = first.context('school_admin');
  teacher = first.context('teacher', first.staff[0]._id);
  otherTeacher = first.context('teacher', first.staff[1]._id);
  sections = first.sectionIds;
  otherSchool = (await seedSchool(`F${stamp}`)).context('school_admin');
  maths = String((await createSubject(admin, { name: 'Mathematics', code: 'MATH', type: 'scholastic' })).id);
});

afterAll(() => mongoose.disconnect());

it('refuses a duplicate subject code in the same school only', async () => {
  const again = { name: 'Maths', code: 'MATH', type: 'scholastic' as const };
  await expect(createSubject(admin, again)).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(createSubject(otherSchool, again)).resolves.toMatchObject({ name: 'Maths' });
});

it('never puts a teacher in two sections in the same period', async () => {
  const teacherId = String(teacher.staffId);
  const slot = (sectionId: string) => ({ sectionId, day: 1, period: 1, subjectId: maths, teacherId });

  await setSlot(admin, slot(sections[0] ?? ''));
  await setSlot(admin, slot(sections[0] ?? ''));
  await expect(setSlot(admin, slot(sections[1] ?? ''))).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(setSlot(otherSchool, slot(sections[0] ?? ''))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect((await getTimetable(admin, sections[0] ?? '')).cells['1-1']).toMatchObject({
    subject: 'Mathematics',
    teacher: 'Anita Desai',
  });

  await expect(clearSlot(otherSchool, { sectionId: sections[0] ?? '', day: 1, period: 1 })).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  await clearSlot(admin, { sectionId: sections[0] ?? '', day: 1, period: 1 });
  await expect(setSlot(admin, slot(sections[1] ?? ''))).resolves.toMatchObject({ section: '7-B' });
});

it('lets a teacher set homework only for sections they teach, and delete only their own', async () => {
  const input = (sectionId: string) => ({
    title: 'Fractions worksheet',
    instructions: '',
    subjectId: maths,
    sectionIds: [sectionId],
    dueOn: '2099-01-10',
  });
  await expect(createHomework(teacher, input(sections[2] ?? ''))).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(createHomework(admin, input(sections[1] ?? ''))).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
  const homework = await createHomework(teacher, input(sections[1] ?? ''));

  expect((await listHomework(teacher, {})).rows).toMatchObject([{ sections: '7-B', isMine: true, isPastDue: false }]);
  expect((await listHomework(otherTeacher, {})).rows).toHaveLength(0);
  expect((await listHomework(admin, {})).rows).toHaveLength(1);
  expect((await listHomework(otherSchool, {})).rows).toHaveLength(0);

  await expect(deleteHomework(otherTeacher, String(homework.id))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await deleteHomework(teacher, String(homework.id));
  expect((await listHomework(admin, {})).rows).toHaveLength(0);
});

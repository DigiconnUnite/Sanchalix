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
import { Enrollment } from '@/server/models/enrollment';
import { Guardian } from '@/server/models/guardian';
import {
  addAttachment,
  createHomework,
  deleteHomework,
  listHomework,
  readAttachment,
} from '@/server/modules/homework/service';
import { Notification } from '@/server/models/notification';
import { User } from '@/server/models/user';
import { clearSlot, createSubject, getTimetable, notifyTimetable, setSlot } from './service';

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

it('keeps homework files to the teacher who set it, the office, and that section’s families', async () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
  const homework = await createHomework(teacher, {
    title: 'Worksheet',
    instructions: '',
    subjectId: maths,
    sectionIds: [sections[1] ?? ''],
    dueOn: '2099-02-01',
  });
  const id = String(homework.id);
  const attach = (ctx: RequestContext, bytes = pdf) => addAttachment(ctx, id, { fileName: 'sheet one.pdf', bytes });

  await expect(attach(otherTeacher)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(attach(admin)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(attach(teacher, new Uint8Array([0x4d, 0x5a]))).rejects.toMatchObject({ code: 'VALIDATION' });
  for (let count = 0; count < 3; count += 1) await attach(teacher);
  await expect(attach(teacher)).rejects.toMatchObject({ code: 'BUSINESS_RULE' });

  const [row] = (await listHomework(teacher, {})).rows;
  expect(row?.attachments).toHaveLength(3);
  const fileId = row?.attachments[0]?.id ?? '';

  // A child in the section the homework was set for, and a parent of nobody in it.
  const studentId = new Types.ObjectId();
  const guardianId = new Types.ObjectId();
  await Enrollment.collection.insertOne({
    schoolId: admin.schoolId,
    studentId,
    sectionId: new Types.ObjectId(sections[1]),
    academicYearId: new Types.ObjectId(),
    rollNo: 99,
    status: 'active',
    deletedAt: null,
  });
  await Guardian.collection.insertOne({ _id: guardianId, schoolId: admin.schoolId, name: 'Parent', studentIds: [studentId], deletedAt: null });
  const parent = (guardian: Types.ObjectId): RequestContext => ({ ...admin, role: 'parent', scope: 'ward', guardianId: guardian });

  expect(new Uint8Array((await readAttachment(teacher, id, fileId)).bytes)).toEqual(pdf);
  await expect(readAttachment(admin, id, fileId)).resolves.toMatchObject({ mime: 'application/pdf' });
  await expect(readAttachment(parent(guardianId), id, fileId)).resolves.toMatchObject({ fileName: 'sheet one.pdf' });
  await expect(readAttachment(parent(new Types.ObjectId()), id, fileId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(readAttachment(otherTeacher, id, fileId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(readAttachment(otherSchool, id, fileId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

it('tells a section’s teachers its timetable is ready, once a day, and only in its own school', async () => {
  const sectionId = sections[2] ?? '';
  const stamp = Date.now().toString(36);
  await User.create({
    name: 'Anita Desai',
    email: `anita-${stamp}@example.test`,
    roles: [{ role: 'teacher', schoolId: admin.schoolId, scope: 'assigned' }],
    ...(teacher.staffId && { staffId: teacher.staffId }),
    status: 'active',
  });
  await setSlot(admin, { sectionId, day: 2, period: 1, subjectId: maths, teacherId: String(teacher.staffId) });

  await expect(notifyTimetable(otherSchool, sectionId, 'Updated')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(await notifyTimetable(admin, sectionId, 'Updated')).toMatchObject({ sectionName: '7-C', recipients: 1, told: 1 });
  expect(await Notification.countDocuments({ schoolId: admin.schoolId, dedupeKey: { $regex: `^timetable:${sectionId}:` } })).toBe(1);
  expect(await notifyTimetable(admin, sectionId, 'Updated')).toMatchObject({ recipients: 1, told: 0 });
  expect(await Notification.countDocuments({ schoolId: admin.schoolId, dedupeKey: { $regex: `^timetable:${sectionId}:` } })).toBe(1);
});

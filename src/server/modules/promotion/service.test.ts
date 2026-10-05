import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { RequestContext } from '@/server/auth/context';
import { verifyPassword } from '@/server/auth/service';
import { connectDb } from '@/server/db/connect';
import { AcademicYear } from '@/server/models/academicYear';
import { Class } from '@/server/models/class';
import { Enrollment } from '@/server/models/enrollment';
import { Event } from '@/server/models/event';
import { School } from '@/server/models/school';
import { Section } from '@/server/models/section';
import { Session } from '@/server/models/session';
import { Student } from '@/server/models/student';
import { User } from '@/server/models/user';
import { addEvent, EventInput, getMonth, removeEvent } from '@/server/modules/calendar/events';
import { StudentInput } from '@/server/modules/sis/schemas';
import { createStudent } from '@/server/modules/sis/service';
import { createUser, listUsers, resetUserPassword, setUserStatus, UserInput } from '@/server/modules/users/service';
import { closeYear, createNextYear, getPromotionSheet, getPromotionState, promoteSection } from './service';

const ADDRESS = { line1: '12 School Road', city: 'Bhopal', state: 'Madhya Pradesh', pincode: '462001' };
let ctx: RequestContext;
let otherSchool: RequestContext;
let nineA: string;
let tenA: string;
const students: string[] = [];

async function seedSchool(code: string) {
  const school = await School.create({
    organizationId: new Types.ObjectId(),
    name: code,
    code,
    board: 'CBSE',
    address: { ...ADDRESS, country: 'IN' },
  });
  const schoolId = school._id;
  const year = await AcademicYear.create({
    schoolId,
    label: '2026–27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    status: 'current',
  });
  const common = { schoolId, branchId: new Types.ObjectId(), academicYearId: year._id };
  const nine = await Class.create({ ...common, name: 'Class 9', order: 9 });
  const ten = await Class.create({ ...common, name: 'Class 10', order: 10 });
  const sectionNine = await Section.create({ ...common, classId: nine._id, name: 'A', displayName: '9-A' });
  const sectionTen = await Section.create({ ...common, classId: ten._id, name: 'A', displayName: '10-A' });
  const context: RequestContext = {
    userId: new Types.ObjectId(),
    name: 'Meena Joshi',
    role: 'school_admin',
    scope: 'school',
    schoolId,
  };
  return { context, nineA: String(sectionNine._id), tenA: String(sectionTen._id) };
}

const student = (firstName: string, sectionId: string, phone: string) =>
  StudentInput.parse({
    firstName,
    lastName: 'Test',
    dob: '2012-05-15',
    gender: 'female',
    sectionId,
    guardians: [{ name: `Parent of ${firstName}`, relation: 'mother', phone, email: '' }],
    address: ADDRESS,
  });

beforeAll(async () => {
  await connectDb();
  await Promise.all(
    [AcademicYear, Class, Section, Enrollment, Student, Event, User, School].map((model) => model.init()),
  );
  const stamp = Date.now().toString(36).slice(-5).toUpperCase();
  ({ context: ctx, nineA, tenA } = await seedSchool(`G${stamp}`));
  ({ context: otherSchool } = await seedSchool(`H${stamp}`));
  for (const [name, section, phone] of [
    ['Asha', nineA, '9800000001'],
    ['Bela', nineA, '9800000002'],
    ['Chitra', nineA, '9800000003'],
    ['Deepa', tenA, '9800000004'],
  ] as const) {
    students.push(String((await createStudent(ctx, student(name, section, phone))).id));
  }
});

afterAll(() => mongoose.disconnect());

it('plans the next year once, with this year’s classes and sections copied', async () => {
  const state = await getPromotionState(ctx);
  expect(state).toMatchObject({ current: { label: '2026–27' }, next: null, remaining: 4 });
  expect(state.suggested).toEqual({ label: '2027–28', startDate: '2027-04-01', endDate: '2028-03-31' });

  await expect(createNextYear(ctx, { ...state.suggested, startDate: '2027-03-01' })).rejects.toMatchObject({
    code: 'BUSINESS_RULE',
  });
  expect(await createNextYear(ctx, state.suggested)).toMatchObject({ label: '2027–28', classes: 2, sections: 2 });
  await expect(createNextYear(ctx, state.suggested)).rejects.toMatchObject({ code: 'CONFLICT' });
  expect((await getPromotionState(otherSchool)).next).toBeNull();
});

it('promotes, detains and releases students, and does nothing on a repeat', async () => {
  const sheet = await getPromotionSheet(ctx, nineA);
  expect(sheet.students.map(({ name }) => name)).toEqual(['Asha Test', 'Bela Test', 'Chitra Test']);
  expect(sheet.promoteTo.map(({ name }) => name)).toEqual(['10-A']);
  expect(sheet.detainIn.map(({ name }) => name)).toEqual(['9-A']);
  const [asha = '', bela = '', chitra = ''] = students;
  const decisions = [
    { studentId: asha, action: 'promote' as const, toSectionId: sheet.promoteTo[0]?.id },
    { studentId: bela, action: 'detain' as const, toSectionId: sheet.detainIn[0]?.id },
    { studentId: chitra, action: 'leave' as const },
  ];

  await expect(
    promoteSection(ctx, { sectionId: nineA, decisions: [{ studentId: asha, action: 'promote', toSectionId: tenA }] }),
  ).rejects.toMatchObject({ code: 'VALIDATION' });
  await expect(promoteSection(otherSchool, { sectionId: nineA, decisions })).rejects.toMatchObject({
    code: 'BUSINESS_RULE',
  });

  expect(await promoteSection(ctx, { sectionId: nineA, decisions })).toMatchObject({ promoted: 1, detained: 1, left: 1 });
  expect(await promoteSection(ctx, { sectionId: nineA, decisions })).toMatchObject({ promoted: 0, detained: 0, left: 0 });

  const enrollments = await Enrollment.find({ schoolId: ctx.schoolId, studentId: asha }).sort({ createdAt: 1 }).lean();
  expect(enrollments.map(({ status }) => status)).toEqual(['promoted', 'active']);
  expect(String(enrollments[1]?.sectionId)).toBe(sheet.promoteTo[0]?.id);
  expect((await Student.findOne({ schoolId: ctx.schoolId, _id: chitra }).lean())?.status).toBe('withdrawn');
  expect((await Student.findOne({ schoolId: ctx.schoolId, _id: bela }).lean())?.status).toBe('active');
});

it('closes the year only when nobody is left in it', async () => {
  await expect(closeYear(ctx)).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
  const sheet = await getPromotionSheet(ctx, tenA);
  expect(sheet.promoteTo).toEqual([]);
  await promoteSection(ctx, { sectionId: tenA, decisions: [{ studentId: students[3] ?? '', action: 'graduate' }] });
  expect((await Student.findOne({ schoolId: ctx.schoolId, _id: students[3] }).lean())?.status).toBe('alumni');

  expect(await closeYear(ctx)).toMatchObject({ closed: '2026–27', current: '2027–28' });
  const state = await getPromotionState(ctx);
  expect(state).toMatchObject({ current: { label: '2027–28' }, next: null, remaining: 2 });
  await expect(closeYear(ctx)).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
});

it('keeps calendar events inside the school and the month', async () => {
  const sports = await addEvent(ctx, EventInput.parse({ title: 'Sports day', type: 'sports', start: '2026-12-18', end: '2026-12-19' }));
  await addEvent(ctx, EventInput.parse({ title: 'Winter fair', type: 'cultural', start: '2026-11-28', end: '2026-12-01' }));
  expect(EventInput.safeParse({ title: 'Bad', type: 'exam', start: '2026-12-02', end: '2026-12-01' }).success).toBe(false);

  expect((await getMonth(ctx, '2026-12')).items.map(({ title }) => title)).toEqual(['Winter fair', 'Sports day']);
  expect((await getMonth(ctx, '2026-10')).items).toEqual([]);
  expect((await getMonth(otherSchool, '2026-12')).items).toEqual([]);
  expect(await getMonth(ctx, '2026-12')).toMatchObject({ previous: '2026-11', next: '2027-01' });

  await expect(removeEvent(otherSchool, String(sports.id))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await removeEvent(ctx, String(sports.id));
  expect((await getMonth(ctx, '2026-12')).items).toHaveLength(1);
});

it('creates a sign-in with a one-time password, and resets or disables it only within the school', async () => {
  const email = `teacher.${Date.now()}@greenvalley.example`;
  const input = UserInput.parse({ name: 'Farah Khan', email: email.toUpperCase(), role: 'teacher', staffId: '' });
  const created = await createUser(ctx, input);
  expect(created.password).toHaveLength(14);
  await expect(createUser(otherSchool, input)).rejects.toMatchObject({ code: 'CONFLICT' });

  const stored = await User.findById(created.id).select('+passwordHash').lean();
  expect(stored).toMatchObject({ email, status: 'active', roles: [{ role: 'teacher', scope: 'assigned' }] });
  expect(await verifyPassword(stored?.passwordHash ?? '', created.password)).toBe(true);
  expect((await listUsers(ctx, {})).rows).toMatchObject([{ name: 'Farah Khan', role: 'teacher', isSelf: false }]);
  expect((await listUsers(otherSchool, {})).rows).toEqual([]);

  const id = String(created.id);
  await Session.create({
    sessionToken: `test-${Date.now()}`,
    userId: created.id,
    activeRole: 'teacher',
    activeSchoolId: ctx.schoolId,
    expires: new Date(Date.now() + 60_000),
  });
  await expect(resetUserPassword(otherSchool, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  const reset = await resetUserPassword(ctx, id);
  expect(reset.password).not.toBe(created.password);
  expect(await Session.countDocuments({ userId: created.id })).toBe(0);

  await expect(setUserStatus(otherSchool, id, 'disabled')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(setUserStatus(ctx, String(ctx.userId), 'disabled')).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
  await setUserStatus(ctx, id, 'disabled');
  expect((await User.findById(created.id).lean())?.status).toBe('disabled');
});

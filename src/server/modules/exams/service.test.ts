import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { RequestContext } from '@/server/auth/context';
import { connectDb } from '@/server/db/connect';
import { AcademicYear } from '@/server/models/academicYear';
import { Class } from '@/server/models/class';
import { Enrollment } from '@/server/models/enrollment';
import { Exam, ExamSchedule, Mark } from '@/server/models/exam';
import { Section } from '@/server/models/section';
import { Subject } from '@/server/models/subject';
import { TimetableSlot } from '@/server/models/timetableSlot';
import {
  addSchedule,
  createExam,
  getExam,
  getMarksSheet,
  getStudentResults,
  gradeFor,
  LockInput,
  publishResults,
  saveMarks,
  ScheduleInput,
  setLock,
} from './service';

const schoolId = new Types.ObjectId();
const person = (role: RequestContext['role'], school = schoolId, staffId?: Types.ObjectId): RequestContext => ({
  userId: new Types.ObjectId(),
  name: 'Test User',
  role,
  scope: role === 'teacher' ? 'assigned' : 'school',
  schoolId: school,
  ...(staffId && { staffId }),
});
const admin = person('school_admin');
const principal = person('principal');
const mathsTeacher = person('teacher', schoolId, new Types.ObjectId());
const otherTeacher = person('teacher', schoolId, new Types.ObjectId());
const otherSchool = person('principal', new Types.ObjectId());
const students = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
let classId: string;
let sectionA: string;
let sectionB: string;
let maths: string;
let examId: string;
let paperId: string;

beforeAll(async () => {
  await connectDb();
  await Promise.all([Exam, ExamSchedule, Mark, Subject, TimetableSlot, Enrollment].map((model) => model.init()));
  const year = await AcademicYear.create({
    schoolId,
    label: '2026–27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    status: 'current',
  });
  const common = { schoolId, branchId: new Types.ObjectId(), academicYearId: year._id };
  const eight = await Class.create({ ...common, name: 'Class 8', order: 8 });
  const a = await Section.create({ ...common, classId: eight._id, name: 'A', displayName: '8-A' });
  const b = await Section.create({ ...common, classId: eight._id, name: 'B', displayName: '8-B' });
  const subject = await Subject.create({ schoolId, name: 'Mathematics', code: 'MATH', type: 'scholastic' });
  [classId, sectionA, sectionB, maths] = [String(eight._id), String(a._id), String(b._id), String(subject._id)];
  await TimetableSlot.create({
    ...common,
    sectionId: a._id,
    day: 1,
    period: 1,
    subjectId: subject._id,
    teacherId: mathsTeacher.staffId ?? new Types.ObjectId(),
  });
  await Enrollment.insertMany(
    students.map((studentId, index) => ({ ...common, studentId, classId: eight._id, sectionId: a._id, rollNo: index + 1 })),
  );
});

afterAll(() => mongoose.disconnect());

const entries = (marks: (number | null)[], absent: number[] = []) =>
  students.map((id, index) => ({ studentId: String(id), marks: marks[index] ?? null, isAbsent: absent.includes(index) }));

it('grades on the 9-point scale', () => {
  expect([95, 81, 50, 33, 32, 0].map((marks) => gradeFor(marks, 100))).toEqual(['A1', 'A2', 'C2', 'D', 'E', 'E']);
  expect(gradeFor(18.5, 20)).toBe('A1');
});

it('sets one paper per class and subject, inside the exam’s classes and school', async () => {
  const exam = await createExam(admin, { name: 'Unit test 1', type: 'unit_test', classIds: [classId] });
  examId = String(exam.id);
  await expect(createExam(otherSchool, { name: 'X', type: 'term', classIds: [classId] })).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  const paper = ScheduleInput.parse({ examId, classId, subjectId: maths, date: '2026-11-20', maxMarks: '20', passMarks: '7' });
  expect(ScheduleInput.safeParse({ ...paper, passMarks: 25 }).success).toBe(false);

  await expect(addSchedule(otherSchool, paper)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await addSchedule(admin, paper);
  await expect(addSchedule(admin, paper)).rejects.toMatchObject({ code: 'CONFLICT' });
  const detail = await getExam(admin, examId);
  expect(detail?.schedules).toMatchObject([{ className: 'Class 8', subject: 'Mathematics', maxMarks: 20, locked: false }]);
  paperId = detail?.schedules[0]?.id ?? '';
  expect(await getExam(otherSchool, examId)).toBeNull();
});

it('lets only the teacher of that subject and section enter valid marks', async () => {
  const sheet = await getMarksSheet(mathsTeacher, paperId);
  expect(sheet).toMatchObject({ canEdit: true, section: { name: '8-A' }, sections: [{ name: '8-A' }] });
  expect((await getMarksSheet(otherTeacher, paperId)).section).toBeNull();
  await expect(getMarksSheet(otherSchool, paperId)).rejects.toMatchObject({ code: 'NOT_FOUND' });

  const save = (ctx: RequestContext, sectionId: string, list: ReturnType<typeof entries>) =>
    saveMarks(ctx, { examScheduleId: paperId, sectionId, entries: list });
  await expect(save(otherTeacher, sectionA, entries([10, 10, 10]))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(save(mathsTeacher, sectionB, entries([10, 10, 10]))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(save(mathsTeacher, sectionA, entries([21, 10, 10]))).rejects.toMatchObject({ code: 'VALIDATION' });
  await expect(save(mathsTeacher, sectionA, entries([10.3, 10, 10]))).rejects.toMatchObject({ code: 'VALIDATION' });
  await expect(save(mathsTeacher, sectionA, entries([10, 10, 10], [0]))).rejects.toMatchObject({ code: 'VALIDATION' });
  await expect(
    save(mathsTeacher, sectionA, [{ studentId: String(new Types.ObjectId()), marks: 5, isAbsent: false }]),
  ).rejects.toMatchObject({ code: 'VALIDATION' });

  expect(await save(mathsTeacher, sectionA, entries([18.5, 6, null], [2]))).toMatchObject({ saved: 3, cleared: 0 });
  expect(await save(mathsTeacher, sectionA, entries([18.5, null, null], [2]))).toMatchObject({ saved: 2, cleared: 1 });
  await save(mathsTeacher, sectionA, entries([18.5, 6, null], [2]));
  expect((await getMarksSheet(admin, paperId, sectionA)).students).toMatchObject([
    { marks: 18.5, grade: 'A1', isAbsent: false },
    { marks: 6, grade: 'E', isAbsent: false },
    { marks: null, grade: null, isAbsent: true },
  ]);
  expect(await Mark.countDocuments({ schoolId })).toBe(3);
});

it('freezes marks once locked, and shows families only published results', async () => {
  const [first = new Types.ObjectId()] = students;
  expect(await getStudentResults(admin, String(first), true)).toEqual([]);
  expect(await getStudentResults(admin, String(first), false)).toMatchObject([
    { exam: 'Unit test 1', total: 18.5, maxTotal: 20, percent: 92.5, papers: [{ subject: 'Mathematics', passed: true }] },
  ]);

  await expect(publishResults(principal, examId)).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
  expect(LockInput.safeParse({ examScheduleId: paperId, locked: false }).success).toBe(false);
  await expect(setLock(otherSchool, LockInput.parse({ examScheduleId: paperId, locked: true }))).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  await setLock(principal, LockInput.parse({ examScheduleId: paperId, locked: true }));
  await expect(
    saveMarks(mathsTeacher, { examScheduleId: paperId, sectionId: sectionA, entries: entries([1, 1, 1]) }),
  ).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
  expect((await getMarksSheet(mathsTeacher, paperId)).canEdit).toBe(false);

  await expect(publishResults(otherSchool, examId)).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
  expect(await publishResults(principal, examId)).toMatchObject({ name: 'Unit test 1', papers: 1 });
  await expect(publishResults(principal, examId)).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
  await expect(
    setLock(principal, LockInput.parse({ examScheduleId: paperId, locked: false, reason: 'Typo' })),
  ).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
  expect(await getStudentResults(admin, String(first), true)).toHaveLength(1);
  expect(await getStudentResults(otherSchool, String(first), false)).toEqual([]);
});

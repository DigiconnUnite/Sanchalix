import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { RequestContext } from '@/server/auth/context';
import { connectDb } from '@/server/db/connect';
import { AcademicYear } from '@/server/models/academicYear';
import { Class } from '@/server/models/class';
import { Exam, ExamSchedule, Mark } from '@/server/models/exam';
import { Subject } from '@/server/models/subject';
import { getExamResultsReport } from './results';

const schoolId = new Types.ObjectId();
const ctx: RequestContext = { userId: new Types.ObjectId(), name: 'Principal', role: 'principal', scope: 'school', schoolId };
const yearId = new Types.ObjectId();
const classId = new Types.ObjectId();
const subjectId = new Types.ObjectId();
const examId = new Types.ObjectId();
const paperId = new Types.ObjectId();

beforeAll(async () => {
  await connectDb();
  const common = { schoolId, deletedAt: null };
  await AcademicYear.collection.insertOne({ ...common, _id: yearId, label: '2026–27', startDate: '2026-04-01', endDate: '2027-03-31', status: 'current' });
  await Class.collection.insertOne({ ...common, _id: classId, name: 'Class 4', order: 4, academicYearId: yearId });
  await Subject.collection.insertOne({ ...common, _id: subjectId, name: 'Maths', code: 'MAT', type: 'scholastic' });
  await Exam.collection.insertOne({ ...common, _id: examId, academicYearId: yearId, name: 'Half-yearly', type: 'term', classIds: [classId], status: 'results_published' });
  await ExamSchedule.collection.insertOne({ ...common, _id: paperId, examId, classId, subjectId, date: '2026-09-14', maxMarks: 50, passMarks: 20 });
  const mark = (total: number | null, isAbsent = false) => ({ ...common, examScheduleId: paperId, studentId: new Types.ObjectId(), sectionId: new Types.ObjectId(), total, isAbsent });
  await Mark.collection.insertMany([mark(40), mark(30), mark(10), mark(null, true)]);
});

afterAll(async () => {
  await Promise.all([AcademicYear, Class, Subject, Exam, ExamSchedule, Mark].map((model) => model.collection.deleteMany({ schoolId })));
  await mongoose.disconnect();
});

it('works out who sat each paper, who passed and the average', async () => {
  const report = await getExamResultsReport(ctx, undefined);
  expect(report.selected).toBe(String(examId));
  expect(report.papers).toEqual([
    { id: String(paperId), subject: 'Maths', className: 'Class 4', appeared: 3, absent: 1, passPercent: 66.7, averagePercent: 53.3 },
  ]);
  expect((await getExamResultsReport({ ...ctx, schoolId: new Types.ObjectId() }, undefined)).exams).toEqual([]);
});

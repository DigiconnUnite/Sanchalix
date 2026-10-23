import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { RequestContext } from '@/server/auth/context';
import { connectDb } from '@/server/db/connect';
import { Exam, ExamSchedule } from '@/server/models/exam';
import { School } from '@/server/models/school';
import { getMonth } from './events';

const schoolId = new Types.ObjectId();
const ctx: RequestContext = { userId: new Types.ObjectId(), name: 'Office', role: 'school_admin', scope: 'school', schoolId };
const examIds = { open: new Types.ObjectId(), draft: new Types.ObjectId() };

beforeAll(async () => {
  await connectDb();
  await School.collection.insertOne({ _id: schoolId, name: 'S', code: `C${Date.now()}`, timezone: 'Asia/Kolkata' });
  const base = { schoolId, academicYearId: new Types.ObjectId(), type: 'term', classIds: [], deletedAt: null };
  await Exam.collection.insertMany([
    { ...base, _id: examIds.open, name: 'Half-yearly', status: 'scheduled' },
    { ...base, _id: examIds.draft, name: 'Draft test', status: 'draft' },
  ]);
  const paper = (examId: Types.ObjectId, date: string) => ({ schoolId, examId, classId: new Types.ObjectId(), subjectId: new Types.ObjectId(), date, maxMarks: 100, passMarks: 33, deletedAt: null });
  await ExamSchedule.collection.insertMany([
    paper(examIds.open, '2026-09-14'),
    paper(examIds.open, '2026-09-18'),
    paper(examIds.open, '2026-10-02'),
    paper(examIds.draft, '2026-09-15'),
  ]);
});

afterAll(async () => {
  await Promise.all([Exam, ExamSchedule].map((model) => model.collection.deleteMany({ schoolId })));
  await School.collection.deleteMany({ _id: schoolId });
  await mongoose.disconnect();
});

it('shows a scheduled exam on the calendar from its first paper to its last in the month, and hides a draft', async () => {
  const { items } = await getMonth(ctx, '2026-09');
  expect(items.filter((item) => item.type === 'exam')).toEqual([
    { id: null, title: 'Half-yearly', type: 'exam', start: '2026-09-14', end: '2026-09-18' },
  ]);
  expect((await getMonth({ ...ctx, schoolId: new Types.ObjectId() }, '2026-09')).items).toEqual([]);
});

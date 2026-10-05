'use server';

import 'server-only';
import { Types } from 'mongoose';
import { withAction } from '@/server/action';
import { audit } from '@/server/audit';
import { requirePermission } from '@/server/auth/context';
import {
  addSchedule,
  createExam,
  ExamId,
  ExamInput,
  LockInput,
  publishResults,
  SaveMarks,
  saveMarks as save,
  ScheduleInput,
  setLock,
} from './service';

export async function upsertExam(input: unknown) {
  return withAction('exams.exam.update', async () => {
    const ctx = await requirePermission('exams.exam.update');
    const data = ExamInput.parse(input);
    const exam = await createExam(ctx, data);
    await audit(ctx, 'exams.exam.create', { type: 'exam', id: exam.id }, {
      after: { name: data.name, type: data.type, classes: data.classIds.length },
    });
    return { id: String(exam.id), name: exam.name };
  });
}

export async function upsertExamSchedule(input: unknown) {
  return withAction('exams.schedule.create', async () => {
    const ctx = await requirePermission('exams.exam.update');
    const data = ScheduleInput.parse(input);
    const schedule = await addSchedule(ctx, data);
    await audit(ctx, 'exams.schedule.create', { type: 'examSchedule', id: schedule.id }, { after: data });
    return { added: true };
  });
}

export async function saveMarks(input: unknown) {
  return withAction('exams.mark.update', async () => {
    const ctx = await requirePermission('exams.mark.update');
    const data = SaveMarks.parse(input);
    const result = await save(ctx, data);
    // The counts are audited, not the marks: a child's marks are not copied into the audit log.
    await audit(ctx, 'exams.mark.update', { type: 'examSchedule', id: result.id }, {
      after: { sectionId: data.sectionId, saved: result.saved, cleared: result.cleared },
    });
    return { section: result.section, saved: result.saved };
  });
}

export async function lockMarks(input: unknown) {
  return withAction('exams.mark.approve', async () => {
    const ctx = await requirePermission('exams.mark.approve');
    const data = LockInput.parse(input);
    const schedule = await setLock(ctx, data);
    await audit(ctx, data.locked ? 'exams.mark.lock' : 'exams.mark.unlock', { type: 'examSchedule', id: schedule.id }, {
      after: { locked: data.locked },
      ...(data.reason && { reason: data.reason }),
    });
    return { locked: data.locked };
  });
}

export async function publishExamResults(input: unknown) {
  return withAction('exams.exam.publish', async () => {
    const ctx = await requirePermission('exams.exam.publish');
    const id = ExamId.parse(input);
    const exam = await publishResults(ctx, id);
    await audit(ctx, 'exams.exam.publish', { type: 'exam', id: new Types.ObjectId(id) }, {
      after: { status: 'results_published', papers: exam.papers },
    });
    return { name: exam.name };
  });
}

'use server';

import 'server-only';
import { Types } from 'mongoose';
import { withAction } from '@/server/action';
import { audit } from '@/server/audit';
import { requirePermission } from '@/server/auth/context';
import { getTranslations } from 'next-intl/server';
import { ClearSlot, NotifySection, SlotInput, SubjectInput } from './schemas';
import { clearSlot, createSubject, notifyTimetable, setSlot } from './service';

export async function upsertSubject(input: unknown) {
  return withAction('academics.subject.create', async () => {
    const ctx = await requirePermission('academics.class.create');
    const data = SubjectInput.parse(input);
    const subject = await createSubject(ctx, data);
    await audit(ctx, 'academics.subject.create', { type: 'subject', id: subject.id }, { after: data });
    return { name: subject.name };
  });
}

export async function upsertTimetableSlot(input: unknown) {
  return withAction('academics.timetable.update', async () => {
    const ctx = await requirePermission('academics.timetable.update');
    const data = SlotInput.parse(input);
    const slot = await setSlot(ctx, data);
    await audit(ctx, 'academics.timetable.update', { type: 'section', id: slot.sectionId }, { after: data });
    return { section: slot.section, subject: slot.subject, teacher: slot.teacher };
  });
}

export async function publishTimetable(input: unknown) {
  return withAction('academics.timetable.publish', async () => {
    const ctx = await requirePermission('academics.timetable.update');
    const { sectionId } = NotifySection.parse(input);
    const t = await getTranslations('academics.timetable.notice');
    const result = await notifyTimetable(ctx, sectionId, t('title', { section: '' }).trim());
    await audit(ctx, 'academics.timetable.publish', { type: 'section', id: new Types.ObjectId(sectionId) }, {
      after: { recipients: result.recipients },
    });
    return result;
  });
}

export async function clearTimetableSlot(input: unknown) {
  return withAction('academics.timetable.clear', async () => {
    const ctx = await requirePermission('academics.timetable.update');
    const data = ClearSlot.parse(input);
    const slot = await clearSlot(ctx, data);
    await audit(ctx, 'academics.timetable.clear', { type: 'timetableSlot', id: slot.id }, {
      before: { ...data, subjectId: slot.subjectId, teacherId: slot.teacherId },
    });
    return { cleared: true };
  });
}

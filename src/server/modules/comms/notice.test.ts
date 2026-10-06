import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { RequestContext } from '@/server/auth/context';
import type { RoleKey, Scope } from '@/server/auth/permissions';
import { connectDb } from '@/server/db/connect';
import { Announcement } from '@/server/models/announcement';
import { Enrollment } from '@/server/models/enrollment';
import { Guardian } from '@/server/models/guardian';
import { Section } from '@/server/models/section';
import { User } from '@/server/models/user';
import { acknowledgeAnnouncement, getAnnouncement, listAnnouncements, publishAnnouncement } from './service';

const schoolId = new Types.ObjectId();
const stamp = Date.now();
const ids = { section: new Types.ObjectId(), student: new Types.ObjectId(), guardian: new Types.ObjectId(), teacher: new Types.ObjectId() };
let principal: RequestContext;
let parent: RequestContext;
let outsider: RequestContext;
let teacher: RequestContext;

beforeAll(async () => {
  await connectDb();
  const common = { schoolId, branchId: new Types.ObjectId(), academicYearId: new Types.ObjectId(), classId: new Types.ObjectId() };
  await Section.create({ ...common, _id: ids.section, name: 'A', displayName: '3-A', classTeacherId: ids.teacher });
  await Enrollment.create({ ...common, studentId: ids.student, sectionId: ids.section, rollNo: 1 });
  // Raw inserts: only the links an audience follows, not full records.
  await Guardian.collection.insertMany([
    { _id: ids.guardian, schoolId, name: 'In Section', studentIds: [ids.student], deletedAt: null },
  ]);
  const account = async (name: string, role: RoleKey, scope: Scope, link: Record<string, Types.ObjectId> = {}) => {
    const user = await User.create({
      name,
      email: `${name.replaceAll(' ', '.')}.${stamp}@example.com`.toLowerCase(),
      roles: [{ role, schoolId, scope }],
      status: 'active',
      ...link,
    });
    return { userId: user._id, name, role, scope, schoolId, ...link } as RequestContext;
  };
  principal = await account('The Principal', 'principal', 'school');
  parent = await account('Section Parent', 'parent', 'ward', { guardianId: ids.guardian });
  teacher = await account('Class Teacher', 'teacher', 'assigned', { staffId: ids.teacher });
  outsider = await account('Other Parent', 'parent', 'ward', { guardianId: new Types.ObjectId() });
  await account('The Student', 'student', 'self', { studentId: ids.student });
});

afterAll(() => mongoose.disconnect());

it('sends a section notice to that section’s families and class teacher, and counts who confirmed', async () => {
  const notice = await publishAnnouncement(principal, {
    title: 'Picnic consent',
    body: 'Please confirm that your child may join the class picnic.',
    audience: { type: 'section', sectionIds: [String(ids.section)] },
    requiresAck: true,
  });
  expect(notice.recipients).toBe(3);
  const id = String(notice.id);
  expect((await Announcement.findOne({ schoolId, _id: notice.id }).lean())?.kind).toBe('notice');

  expect(await getAnnouncement(outsider, id)).toBeNull();
  expect((await listAnnouncements(outsider)).map(({ title }) => title)).not.toContain('Picnic consent');
  expect(await getAnnouncement(teacher, id)).toMatchObject({ acknowledged: false });
  expect(await getAnnouncement(parent, id)).toMatchObject({
    audience: { type: 'section', sections: ['3-A'] },
    requiresAck: true,
    acknowledged: false,
    ackCount: null,
  });

  await expect(acknowledgeAnnouncement(outsider, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(acknowledgeAnnouncement(principal, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await acknowledgeAnnouncement(parent, id);
  await acknowledgeAnnouncement(parent, id);
  expect((await getAnnouncement(parent, id))?.acknowledged).toBe(true);
  expect(await getAnnouncement(principal, id)).toMatchObject({ recipients: 3, ackCount: 1, acknowledged: null });
});

it('has nothing to confirm on an ordinary announcement', async () => {
  const plain = await publishAnnouncement(principal, { title: 'Holiday', body: 'School is closed on Friday.', audience: { type: 'school' } });
  expect(await getAnnouncement(parent, String(plain.id))).toMatchObject({ requiresAck: false, acknowledged: null });
  await expect(acknowledgeAnnouncement(parent, String(plain.id))).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

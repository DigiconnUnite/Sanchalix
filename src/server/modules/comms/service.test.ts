import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { RequestContext } from '@/server/auth/context';
import type { RoleKey } from '@/server/auth/permissions';
import { connectDb } from '@/server/db/connect';
import { Announcement } from '@/server/models/announcement';
import { Notification } from '@/server/models/notification';
import { User } from '@/server/models/user';
import { AnnouncementInput } from './schemas';
import {
  countRecipients,
  countUnread,
  getAnnouncement,
  listAnnouncements,
  listNotifications,
  markRead,
  publishAnnouncement,
  publishDueAnnouncements,
} from './service';

const schoolA = new Types.ObjectId();
const schoolB = new Types.ObjectId();
const people = new Map<string, RequestContext>();

async function addUser(key: string, role: RoleKey, schoolId: Types.ObjectId, status: 'active' | 'disabled' = 'active') {
  const user = await User.create({
    name: key,
    email: `${key}-${schoolId.toString()}@school.example`,
    roles: [{ role, schoolId, scope: 'school' }],
    status,
  });
  people.set(key, { userId: user._id, name: key, role, scope: 'school', schoolId });
}
const as = (key: string) => people.get(key) as RequestContext;

beforeAll(async () => {
  await connectDb();
  await Notification.init();
  await addUser('principal', 'principal', schoolA);
  await addUser('teacher', 'teacher', schoolA);
  await addUser('accountant', 'accountant', schoolA);
  await addUser('former', 'teacher', schoolA, 'disabled');
  await addUser('outsider', 'teacher', schoolB);
});

afterAll(() => mongoose.disconnect());

it('validates the title, body and audience', () => {
  expect(AnnouncementInput.safeParse({ title: '', body: 'x', audience: { type: 'school' } }).success).toBe(false);
  expect(AnnouncementInput.safeParse({ title: 'x', body: 'x', audience: { type: 'role', roles: [] } }).success).toBe(false);
  expect(AnnouncementInput.safeParse({ title: 'x', body: 'x', audience: { type: 'section' } }).success).toBe(false);
});

it('counts only active users of the same school in the audience', async () => {
  expect(await countRecipients(as('principal'), { type: 'school' })).toBe(3);
  expect(await countRecipients(as('principal'), { type: 'role', roles: ['teacher'] })).toBe(1);
});

it('notifies everyone in the audience except the author, once each', async () => {
  const published = await publishAnnouncement(as('principal'), {
    title: 'PTM on 12 Oct',
    body: 'Parent-teacher meetings run from 9 AM to 1 PM.',
    audience: { type: 'school' },
  });
  expect(published.recipients).toBe(2);
  expect(await countUnread(as('teacher'))).toBe(1);
  expect(await countUnread(as('principal'))).toBe(0);
  expect(await countUnread(as('outsider'))).toBe(0);

  const [notification] = await listNotifications(as('teacher'));
  expect(notification).toMatchObject({
    title: 'PTM on 12 Oct',
    read: false,
    link: `/communication/announcements/${String(published.id)}`,
  });
  expect((await getAnnouncement(as('principal'), String(published.id)))?.recipients).toBe(2);
  expect((await getAnnouncement(as('teacher'), String(published.id)))?.recipients).toBeNull();
});

it('shows a role announcement only to that role and its author', async () => {
  const published = await publishAnnouncement(as('principal'), {
    title: 'Marks entry closes Friday',
    body: 'Enter half-yearly marks by Friday 5 PM.',
    audience: { type: 'role', roles: ['teacher'] },
  });
  const id = String(published.id);
  const titles = async (key: string) => (await listAnnouncements(as(key))).map((row) => row.title);

  expect(await titles('teacher')).toEqual(['Marks entry closes Friday', 'PTM on 12 Oct']);
  expect(await titles('accountant')).toEqual(['PTM on 12 Oct']);
  expect(await titles('principal')).toHaveLength(2);
  expect(await titles('outsider')).toEqual([]);

  expect(await getAnnouncement(as('accountant'), id)).toBeNull();
  expect(await getAnnouncement(as('outsider'), id)).toBeNull();
  expect(await getAnnouncement(as('teacher'), id)).toMatchObject({ author: 'principal', audience: { type: 'role' } });
  expect(await countUnread(as('accountant'))).toBe(1);
});

it('marks one notification read, then all, and never another user’s', async () => {
  const [first] = await listNotifications(as('teacher'));
  expect(await countUnread(as('teacher'))).toBe(2);

  await expect(markRead(as('accountant'), [first?.id ?? ''])).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(await markRead(as('teacher'), [first?.id ?? ''])).toEqual({ marked: 1 });
  expect(await countUnread(as('teacher'))).toBe(1);
  expect(await markRead(as('teacher'), 'all')).toEqual({ marked: 1 });
  expect(await countUnread(as('teacher'))).toBe(0);
  expect(await countUnread(as('accountant'))).toBe(1);
});

it('holds a scheduled announcement until its day, then tells the audience once, and hides it after its last day', async () => {
  const unreadBefore = await countUnread(as('teacher'));
  const held = await publishAnnouncement(as('principal'), {
    title: 'Sports day',
    body: 'Sports day is on the 20th.',
    audience: { type: 'school' },
    publishOn: '2099-01-01',
    expiresOn: '2099-01-05',
  });
  const id = String(held.id);
  expect(held).toMatchObject({ scheduled: true, recipients: 2 });
  expect(await countUnread(as('teacher'))).toBe(unreadBefore);
  expect(await getAnnouncement(as('teacher'), id)).toBeNull();
  expect(await getAnnouncement(as('principal'), id)).toMatchObject({ scheduled: true });
  expect(await publishDueAnnouncements(schoolA)).toBe(0);

  await Announcement.updateOne({ schoolId: schoolA, _id: id }, { publishAt: new Date(Date.now() - 1000) });
  expect(await publishDueAnnouncements(schoolB)).toBe(0);
  expect(await publishDueAnnouncements(schoolA)).toBe(1);
  expect(await publishDueAnnouncements(schoolA)).toBe(0);
  expect(await countUnread(as('teacher'))).toBe(unreadBefore + 1);
  expect(await getAnnouncement(as('teacher'), id)).toMatchObject({ scheduled: false });

  await Announcement.updateOne({ schoolId: schoolA, _id: id }, { expiresAt: new Date(Date.now() - 1000) });
  expect(await getAnnouncement(as('teacher'), id)).toBeNull();
  expect(await getAnnouncement(as('principal'), id)).not.toBeNull();
  await expect(
    publishAnnouncement(as('principal'), { title: 'x', body: 'x', audience: { type: 'school' }, publishOn: '2099-02-02', expiresOn: '2099-02-01' }),
  ).rejects.toMatchObject({ code: 'VALIDATION' });
});

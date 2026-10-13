import 'server-only';
import { Types } from 'mongoose';
import { AppError } from '@/lib/appError';
import { startOfDayIn, todayIn } from '@/lib/dates';
import type { RequestContext } from '@/server/auth/context';
import { can, type RoleKey } from '@/server/auth/permissions';
import { Announcement } from '@/server/models/announcement';
import { Enrollment } from '@/server/models/enrollment';
import { Guardian } from '@/server/models/guardian';
import { Notification } from '@/server/models/notification';
import { School } from '@/server/models/school';
import { Section } from '@/server/models/section';
import { User } from '@/server/models/user';
import { ownStudentIds } from '@/server/modules/portal/own';
import type {
  AnnouncementDetail,
  AnnouncementInput,
  AnnouncementRow,
  Audience,
  NotificationRow,
} from './schemas';

const EXCERPT = 140;

/** Accounts tied to the sections: their students, those students' guardians, and the class teachers. */
async function sectionRecipientIds(ctx: Pick<RequestContext, 'schoolId'>, sectionIds: string[]) {
  const { schoolId } = ctx;
  const [students, sections] = await Promise.all([
    Enrollment.distinct('studentId', { schoolId, sectionId: { $in: sectionIds }, status: 'active' }),
    Section.find({ schoolId, _id: { $in: sectionIds } }).select('classTeacherId').lean(),
  ]);
  const guardians = await Guardian.distinct('_id', { schoolId, studentIds: { $in: students } });
  const users = await User.find({
    status: 'active',
    roles: { $elemMatch: { schoolId } },
    $or: [
      { studentId: { $in: students as Types.ObjectId[] } },
      { guardianId: { $in: guardians as Types.ObjectId[] } },
      { staffId: { $in: sections.flatMap((section) => (section.classTeacherId ? [section.classTeacherId] : [])) } },
    ],
  })
    .select('_id')
    .lean();
  return users.map((user) => user._id);
}

/** The active users of this school that an audience reaches. */
async function recipientIds(ctx: Pick<RequestContext, 'schoolId'>, audience: Audience) {
  if (audience.type === 'section') return sectionRecipientIds(ctx, audience.sectionIds);
  const users = await User.find({
    status: 'active',
    roles: {
      $elemMatch: { schoolId: ctx.schoolId, ...(audience.type === 'role' && { role: { $in: audience.roles } }) },
    },
  })
    .select('_id')
    .lean();
  return users.map((user) => user._id);
}

export const countRecipients = async (ctx: RequestContext, audience: Audience) =>
  (await recipientIds(ctx, audience)).length;

type Published = { _id: Types.ObjectId; title: string; body: string; authorId: Types.ObjectId };

// ponytail: written in the request because there is no queue. Fine for a school-sized audience; batch it when one
// announcement reaches tens of thousands of accounts.
async function notify(schoolId: Types.ObjectId, announcement: Published, recipients: Types.ObjectId[]) {
  const others = recipients.filter((userId) => !userId.equals(announcement.authorId));
  if (others.length > 0) {
    await Notification.insertMany(
      others.map((userId) => ({
        schoolId,
        userId,
        category: 'announcements' as const,
        title: announcement.title,
        body: announcement.body.slice(0, EXCERPT),
        link: `/communication/announcements/${announcement._id.toString()}`,
        deliveries: [{ channel: 'in_app' as const, status: 'sent' as const, at: new Date() }],
        dedupeKey: `announcement:${announcement._id.toString()}:${userId.toString()}`,
      })),
    );
  }
  return others.length;
}

/**
 * Publishes the school's announcements whose day has come and tells their audience, worked out now, not when it
 * was written. Each one is claimed first, so two runs at once can't both send it.
 */
export async function publishDueAnnouncements(schoolId: Types.ObjectId) {
  let published = 0;
  for (;;) {
    const due = await Announcement.findOneAndUpdate(
      { schoolId, status: 'scheduled', publishAt: { $lte: new Date() } },
      { status: 'published' },
    ).lean();
    if (!due) return published;
    const audience: Audience =
      due.audience?.type === 'role'
        ? { type: 'role', roles: due.audience.roles as RoleKey[] }
        : due.audience?.type === 'section'
          ? { type: 'section', sectionIds: due.audience.ids.map(String) }
          : { type: 'school' };
    await notify(schoolId, due, await recipientIds({ schoolId }, audience));
    published += 1;
  }
}

export async function publishAnnouncement(
  ctx: RequestContext,
  input: Omit<AnnouncementInput, 'requiresAck'> & { requiresAck?: boolean },
) {
  const { schoolId } = ctx;
  const school = await School.findById(schoolId).select('timezone').lean();
  const timezone = school?.timezone ?? 'Asia/Kolkata';
  const today = todayIn(timezone);
  const scheduled = Boolean(input.publishOn && input.publishOn > today);
  if (input.expiresOn && input.expiresOn < (input.publishOn && scheduled ? input.publishOn : today)) {
    throw new AppError('VALIDATION', 'comms.errors.expiresBeforePublish');
  }
  const recipients = await recipientIds(ctx, input.audience);
  const announcement = await Announcement.create({
    schoolId,
    title: input.title,
    body: input.body,
    kind: input.requiresAck ? 'notice' : 'announcement',
    requiresAck: Boolean(input.requiresAck),
    audience:
      input.audience.type === 'role'
        ? input.audience
        : input.audience.type === 'section'
          ? { type: 'section', ids: input.audience.sectionIds, roles: [] }
          : { type: 'school', roles: [] },
    channels: ['in_app'],
    status: scheduled ? 'scheduled' : 'published',
    publishAt: scheduled && input.publishOn ? startOfDayIn(timezone, input.publishOn) : new Date(),
    // Shown through the end of that day, so the stored moment is the start of the next one.
    ...(input.expiresOn && { expiresAt: new Date(startOfDayIn(timezone, input.expiresOn).getTime() + 86_400_000) }),
    authorId: ctx.userId,
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  });

  const others = recipients.filter((userId) => !userId.equals(ctx.userId)).length;
  if (!scheduled) await notify(schoolId, announcement, recipients);
  return { id: announcement._id, title: announcement.title, recipients: others, scheduled };
}

/** The sections a person belongs to: their own or their children's, or the ones they are class teacher of. */
async function ownSectionIds(ctx: RequestContext) {
  const { schoolId } = ctx;
  const students = await ownStudentIds(ctx);
  const [enrolled, taught] = await Promise.all([
    students.length ? Enrollment.distinct('sectionId', { schoolId, studentId: { $in: students }, status: 'active' }) : [],
    ctx.staffId ? Section.distinct('_id', { schoolId, classTeacherId: ctx.staffId }) : [],
  ]);
  return [...enrolled, ...taught] as Types.ObjectId[];
}

async function visibleTo(ctx: RequestContext) {
  // People who publish announcements see all of them; everyone else sees what was addressed to them.
  const everything = can(ctx.role, 'comms.announcement.create');
  return {
    schoolId: ctx.schoolId,
    // A scheduled or expired announcement is the publishers' business only.
    ...(everything
      ? { status: { $in: ['published' as const, 'scheduled' as const] } }
      : { status: 'published' as const, $and: [{ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }] }),
    $or: [
      { 'audience.type': 'school' as const },
      { 'audience.type': 'role' as const, 'audience.roles': ctx.role },
      { 'audience.type': 'section' as const, 'audience.ids': { $in: everything ? [] : await ownSectionIds(ctx) } },
      { authorId: ctx.userId },
      // Always true for publishers, so the list is the whole school's.
      ...(everything ? [{ schoolId: ctx.schoolId }] : []),
    ],
  };
}

type Stored = {
  _id: Types.ObjectId;
  title: string;
  body: string;
  authorId: Types.ObjectId;
  publishAt?: Date | null;
  expiresAt?: Date | null;
  status?: string | null;
  audience?: { type: string; roles?: string[] | null; ids?: Types.ObjectId[] | null } | null;
  requiresAck?: boolean | null;
};

async function toRows(ctx: RequestContext, announcements: Stored[]): Promise<(AnnouncementRow & { body: string })[]> {
  const authors = await User.find({ _id: { $in: announcements.map((a) => a.authorId) } }).select('name').lean();
  const sections = await Section.find({
    schoolId: ctx.schoolId,
    _id: { $in: announcements.flatMap((a) => (a.audience?.type === 'section' ? (a.audience.ids ?? []) : [])) },
  })
    .select('displayName')
    .lean();
  const sectionName = new Map(sections.map((section) => [String(section._id), section.displayName]));
  const nameById = new Map(authors.map((author) => [String(author._id), author.name]));
  return announcements.map((announcement) => ({
    id: String(announcement._id),
    title: announcement.title,
    body: announcement.body,
    excerpt: announcement.body.slice(0, EXCERPT),
    author: nameById.get(String(announcement.authorId)) ?? '',
    publishedAt: (announcement.publishAt ?? new Date(0)).toISOString(),
    audience:
      announcement.audience?.type === 'role'
        ? { type: 'role', roles: (announcement.audience.roles ?? []) as RoleKey[] }
        : announcement.audience?.type === 'section'
          ? {
              type: 'section',
              sections: (announcement.audience.ids ?? []).map((id) => sectionName.get(String(id)) ?? '').filter(Boolean),
            }
          : { type: 'school' },
    requiresAck: Boolean(announcement.requiresAck),
    scheduled: announcement.status === 'scheduled',
    // Stored as the start of the day after; the day shown is the one before that moment.
    expiresOn: announcement.expiresAt ? new Date(announcement.expiresAt.getTime() - 1).toISOString() : null,
  }));
}

export async function listAnnouncements(ctx: RequestContext): Promise<AnnouncementRow[]> {
  const announcements = await Announcement.find(await visibleTo(ctx)).sort({ publishAt: -1 }).limit(50).lean();
  return (await toRows(ctx, announcements)).map(({ body: _body, ...row }) => row);
}

export async function getAnnouncement(ctx: RequestContext, id: string): Promise<AnnouncementDetail | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const announcement = await Announcement.findOne(await visibleTo(ctx)).and([{ _id: id }]).lean();
  if (!announcement) return null;
  const [row] = await toRows(ctx, [announcement]);
  if (!row) return null;
  const isAuthor = announcement.authorId.equals(ctx.userId);
  const recipients = isAuthor
    ? await Notification.countDocuments({ schoolId: ctx.schoolId, link: `/communication/announcements/${id}` })
    : null;
  const acks = announcement.acks ?? [];
  return {
    ...row,
    recipients,
    ackCount: isAuthor && announcement.requiresAck ? acks.length : null,
    acknowledged:
      announcement.requiresAck && !isAuthor ? acks.some((ack) => ack.userId.equals(ctx.userId)) : null,
  };
}

/** A recipient confirms they have read a notice. Confirming twice changes nothing. */
export async function acknowledgeAnnouncement(ctx: RequestContext, id: string) {
  const announcement = await Announcement.findOne(await visibleTo(ctx))
    .and([{ _id: id, requiresAck: true }])
    .select('authorId')
    .lean();
  if (!announcement || announcement.authorId.equals(ctx.userId)) throw new AppError('NOT_FOUND', 'comms.errors.notFound');
  await Announcement.updateOne(
    { schoolId: ctx.schoolId, _id: announcement._id, 'acks.userId': { $ne: ctx.userId } },
    { $push: { acks: { userId: ctx.userId, at: new Date() } } },
  );
  return { id: announcement._id };
}

export async function listNotifications(ctx: RequestContext, limit = 50): Promise<NotificationRow[]> {
  const notifications = await Notification.find({ schoolId: ctx.schoolId, userId: ctx.userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('title body link readAt createdAt')
    .lean();
  return notifications.map((notification) => ({
    id: String(notification._id),
    title: notification.title,
    body: notification.body ?? null,
    link: notification.link ?? null,
    createdAt: notification.createdAt.toISOString(),
    read: Boolean(notification.readAt),
  }));
}

export const countUnread = (ctx: RequestContext) =>
  Notification.countDocuments({ schoolId: ctx.schoolId, userId: ctx.userId, readAt: null });

export async function markRead(ctx: RequestContext, ids: 'all' | string[]) {
  const result = await Notification.updateMany(
    { schoolId: ctx.schoolId, userId: ctx.userId, readAt: null, ...(ids !== 'all' && { _id: { $in: ids } }) },
    { readAt: new Date() },
  );
  if (ids !== 'all' && result.matchedCount === 0 && ids.length > 0) {
    const exists = await Notification.exists({ schoolId: ctx.schoolId, userId: ctx.userId, _id: { $in: ids } });
    if (!exists) throw new AppError('NOT_FOUND', 'comms.errors.notificationNotFound');
  }
  return { marked: result.modifiedCount };
}

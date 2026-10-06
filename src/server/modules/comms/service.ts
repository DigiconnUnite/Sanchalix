import 'server-only';
import { Types } from 'mongoose';
import { AppError } from '@/lib/appError';
import type { RequestContext } from '@/server/auth/context';
import type { RoleKey } from '@/server/auth/permissions';
import { Announcement } from '@/server/models/announcement';
import { Notification } from '@/server/models/notification';
import { User } from '@/server/models/user';
import type {
  AnnouncementDetail,
  AnnouncementInput,
  AnnouncementRow,
  Audience,
  NotificationRow,
} from './schemas';

const EXCERPT = 140;

/** The active users of this school that an audience reaches. Parents and students join once they have accounts. */
async function recipientIds(ctx: RequestContext, audience: Audience) {
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

export async function publishAnnouncement(ctx: RequestContext, input: AnnouncementInput) {
  const { schoolId } = ctx;
  const recipients = await recipientIds(ctx, input.audience);
  const announcement = await Announcement.create({
    schoolId,
    ...input,
    audience: input.audience.type === 'role' ? input.audience : { type: 'school', roles: [] },
    channels: ['in_app'],
    status: 'published',
    publishAt: new Date(),
    authorId: ctx.userId,
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  });

  // ponytail: written in the request because there is no worker yet. Fine for staff-sized audiences; move to the
  // notifications queue before parents (thousands of recipients) get accounts.
  const others = recipients.filter((userId) => !userId.equals(ctx.userId));
  if (others.length > 0) {
    await Notification.insertMany(
      others.map((userId) => ({
        schoolId,
        userId,
        category: 'announcements' as const,
        title: input.title,
        body: input.body.slice(0, EXCERPT),
        link: `/communication/announcements/${announcement._id.toString()}`,
        deliveries: [{ channel: 'in_app' as const, status: 'sent' as const, at: new Date() }],
        dedupeKey: `announcement:${announcement._id.toString()}:${userId.toString()}`,
      })),
    );
  }
  return { id: announcement._id, title: announcement.title, recipients: others.length };
}

const visibleTo = (ctx: RequestContext) => ({
  schoolId: ctx.schoolId,
  status: 'published' as const,
  $or: [
    { 'audience.type': 'school' as const },
    { 'audience.type': 'role' as const, 'audience.roles': ctx.role },
    { authorId: ctx.userId },
  ],
});

type Stored = {
  _id: Types.ObjectId;
  title: string;
  body: string;
  authorId: Types.ObjectId;
  publishAt?: Date | null;
  audience?: { type: string; roles?: string[] | null } | null;
};

async function toRows(announcements: Stored[]): Promise<(AnnouncementRow & { body: string })[]> {
  const authors = await User.find({ _id: { $in: announcements.map((a) => a.authorId) } }).select('name').lean();
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
        : { type: 'school' },
  }));
}

export async function listAnnouncements(ctx: RequestContext): Promise<AnnouncementRow[]> {
  const announcements = await Announcement.find(visibleTo(ctx)).sort({ publishAt: -1 }).limit(50).lean();
  return (await toRows(announcements)).map(({ id, title, excerpt, author, publishedAt, audience }) => ({
    id,
    title,
    excerpt,
    author,
    publishedAt,
    audience,
  }));
}

export async function getAnnouncement(ctx: RequestContext, id: string): Promise<AnnouncementDetail | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const announcement = await Announcement.findOne(visibleTo(ctx)).and([{ _id: id }]).lean();
  if (!announcement) return null;
  const [row] = await toRows([announcement]);
  if (!row) return null;
  const isAuthor = announcement.authorId.equals(ctx.userId);
  const recipients = isAuthor
    ? await Notification.countDocuments({ schoolId: ctx.schoolId, link: `/communication/announcements/${id}` })
    : null;
  return { ...row, recipients };
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

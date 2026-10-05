'use server';

import 'server-only';
import { AppError } from '@/lib/appError';
import { withAction } from '@/server/action';
import { audit } from '@/server/audit';
import { getContext, requirePermission } from '@/server/auth/context';
import { AnnouncementInput, Audience, NotificationIds } from './schemas';
import { countRecipients, markRead, publishAnnouncement as publish } from './service';

export async function previewAudience(input: unknown) {
  return withAction('comms.announcement.create', async () => {
    const ctx = await requirePermission('comms.announcement.create');
    return { recipients: await countRecipients(ctx, Audience.parse(input)) };
  });
}

export async function publishAnnouncement(input: unknown) {
  return withAction('comms.announcement.publish', async () => {
    const ctx = await requirePermission('comms.announcement.create');
    const data = AnnouncementInput.parse(input);
    const announcement = await publish(ctx, data);
    await audit(ctx, 'comms.announcement.publish', { type: 'announcement', id: announcement.id }, {
      after: { title: data.title, audience: data.audience.type, recipients: announcement.recipients },
    });
    return { id: String(announcement.id), title: announcement.title, recipients: announcement.recipients };
  });
}

export async function markNotificationsRead(input: unknown) {
  return withAction('comms.notification.update', async () => {
    const ctx = await getContext();
    if (!ctx) throw new AppError('UNAUTHENTICATED', 'errors.unauthenticated');
    return markRead(ctx, NotificationIds.parse(input));
  });
}

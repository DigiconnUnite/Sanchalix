'use server';

import 'server-only';
import { AppError } from '@/lib/appError';
import { withAction } from '@/server/action';
import { audit } from '@/server/audit';
import { getContext, requirePermission } from '@/server/auth/context';
import { AnnouncementInput, Audience, NotificationIds } from './schemas';
import { z } from 'zod';
import { acknowledgeAnnouncement as acknowledge, countRecipients, markRead, publishAnnouncement as publish } from './service';

const AnnouncementId = z.string().regex(/^[0-9a-f]{24}$/);

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
      after: {
        title: data.title,
        audience: data.audience.type,
        requiresAck: data.requiresAck,
        channels: data.channels,
        recipients: announcement.recipients,
        ...(announcement.scheduled && { publishOn: data.publishOn }),
      },
    });
    return {
      id: String(announcement.id),
      title: announcement.title,
      recipients: announcement.recipients,
      scheduled: announcement.scheduled,
    };
  });
}

export async function acknowledgeAnnouncement(input: unknown) {
  return withAction('comms.announcement.acknowledge', async () => {
    const ctx = await requirePermission('comms.announcement.read');
    const announcement = await acknowledge(ctx, AnnouncementId.parse(input));
    await audit(ctx, 'comms.announcement.acknowledge', { type: 'announcement', id: announcement.id });
    return { acknowledged: true };
  });
}

export async function markNotificationsRead(input: unknown) {
  return withAction('comms.notification.update', async () => {
    const ctx = await getContext();
    if (!ctx) throw new AppError('UNAUTHENTICATED', 'errors.unauthenticated');
    return markRead(ctx, NotificationIds.parse(input));
  });
}

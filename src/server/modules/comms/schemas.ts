import 'server-only';
import { z } from 'zod';
import { ROLE_KEYS, type RoleKey } from '@/server/auth/permissions';

const E = 'comms.errors';

export const Audience = z.discriminatedUnion('type', [
  z.object({ type: z.literal('school') }),
  z.object({ type: z.literal('role'), roles: z.array(z.enum(ROLE_KEYS)).min(1, `${E}.roles`) }),
  z.object({
    type: z.literal('section'),
    sectionIds: z.array(z.string().regex(/^[0-9a-f]{24}$/, `${E}.sections`)).min(1, `${E}.sections`).max(30, `${E}.sections`),
  }),
]);
export type Audience = z.infer<typeof Audience>;

const OptionalDate = z
  .union([z.literal('').transform(() => undefined), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${E}.date`)])
  .optional();

export const AnnouncementInput = z.object({
  title: z.string().trim().min(1, `${E}.title`).max(120, `${E}.title`),
  body: z.string().trim().min(1, `${E}.body`).max(5000, `${E}.body`),
  audience: Audience,
  /** A notice: each recipient is asked to confirm they have read it. */
  requiresAck: z.boolean().default(false),
  /** Besides the app, which always gets it. People who have switched a channel off in Profile are skipped. */
  channels: z.array(z.enum(['email', 'sms'])).max(2).default([]),
  /** Leave empty to publish now. A later date holds it until that morning. */
  publishOn: OptionalDate,
  /** The last day it is shown. Empty means it stays. */
  expiresOn: OptionalDate,
});
export type AnnouncementInput = z.infer<typeof AnnouncementInput>;

export const NotificationIds = z.union([z.literal('all'), z.array(z.string().regex(/^[0-9a-f]{24}$/)).min(1).max(100)]);

export type AnnouncementRow = {
  id: string;
  title: string;
  excerpt: string;
  author: string;
  publishedAt: string;
  audience: { type: 'school' } | { type: 'role'; roles: RoleKey[] } | { type: 'section'; sections: string[] };
  requiresAck: boolean;
  /** Files the author attached, for everyone who can read the announcement. */
  attachments: { id: string; fileName: string }[];
  /** Waiting for its publish date. Only the people who publish announcements see these. */
  scheduled: boolean;
  /** The last day it is shown, if it has one. */
  expiresOn: string | null;
};

export type AnnouncementDetail = AnnouncementRow & {
  body: string;
  /** For the author: how many people it reached and how many have confirmed. Null for everyone else. */
  recipients: number | null;
  ackCount: number | null;
  /** For a recipient of a notice: whether they have confirmed. Null when there is nothing for them to confirm. */
  acknowledged: boolean | null;
};

export type NotificationRow = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
  read: boolean;
};

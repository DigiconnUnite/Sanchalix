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

export const AnnouncementInput = z.object({
  title: z.string().trim().min(1, `${E}.title`).max(120, `${E}.title`),
  body: z.string().trim().min(1, `${E}.body`).max(5000, `${E}.body`),
  audience: Audience,
  /** A notice: each recipient is asked to confirm they have read it. */
  requiresAck: z.boolean().default(false),
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

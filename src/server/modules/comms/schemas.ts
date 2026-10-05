import 'server-only';
import { z } from 'zod';
import { ROLE_KEYS, type RoleKey } from '@/server/auth/permissions';

const E = 'comms.errors';

export const Audience = z.discriminatedUnion('type', [
  z.object({ type: z.literal('school') }),
  z.object({ type: z.literal('role'), roles: z.array(z.enum(ROLE_KEYS)).min(1, `${E}.roles`) }),
]);
export type Audience = z.infer<typeof Audience>;

export const AnnouncementInput = z.object({
  title: z.string().trim().min(1, `${E}.title`).max(120, `${E}.title`),
  body: z.string().trim().min(1, `${E}.body`).max(5000, `${E}.body`),
  audience: Audience,
});
export type AnnouncementInput = z.infer<typeof AnnouncementInput>;

export const NotificationIds = z.union([z.literal('all'), z.array(z.string().regex(/^[0-9a-f]{24}$/)).min(1).max(100)]);

export type AnnouncementRow = {
  id: string;
  title: string;
  excerpt: string;
  author: string;
  publishedAt: string;
  audience: { type: 'school' } | { type: 'role'; roles: RoleKey[] };
};

export type AnnouncementDetail = AnnouncementRow & { body: string; recipients: number | null };

export type NotificationRow = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
  read: boolean;
};

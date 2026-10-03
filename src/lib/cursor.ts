import { z } from 'zod';

const Cursor = z.object({
  value: z.string(),
  id: z.string().regex(/^[0-9a-f]{24}$/),
  dir: z.enum(['next', 'prev']),
  page: z.number().int().min(1),
});

export type Cursor = z.infer<typeof Cursor>;

export const encodeCursor = (cursor: Cursor) => Buffer.from(JSON.stringify(cursor)).toString('base64url');

export function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  try {
    return Cursor.parse(JSON.parse(Buffer.from(raw, 'base64url').toString()));
  } catch {
    return null;
  }
}

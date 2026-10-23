import mongoose from 'mongoose';
import { afterAll, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }) }));

const { clientIp, withinLimit } = await import('./rateLimit');

afterAll(() => mongoose.disconnect());

it('reads the caller from the first forwarded address', async () => {
  expect(await clientIp()).toBe('203.0.113.7');
});

it('allows the limit, refuses the next call, and counts each caller and bucket apart', async () => {
  const who = `t-${Date.now()}`;
  expect(await withinLimit('test', who, 2, 600)).toBe(true);
  expect(await withinLimit('test', who, 2, 600)).toBe(true);
  expect(await withinLimit('test', who, 2, 600)).toBe(false);
  expect(await withinLimit('test', `${who}-other`, 2, 600)).toBe(true);
  expect(await withinLimit('another', who, 2, 600)).toBe(true);
});

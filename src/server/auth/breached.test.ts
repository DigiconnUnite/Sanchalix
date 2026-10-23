import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { isBreached } from './breached';

const rangeFor = (password: string) => createHash('sha1').update(password).digest('hex').toUpperCase().slice(5);

afterEach(() => vi.restoreAllMocks());

it('finds a password in the leaked list by its hash range, ignoring padding rows', async () => {
  const fetchMock = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(`${'0'.repeat(35)}:0\r\n${rangeFor('password1234')}:57\r\n`));
  expect(await isBreached('password1234')).toBe(true);
  expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
    `https://api.pwnedpasswords.com/range/${createHash('sha1').update('password1234').digest('hex').toUpperCase().slice(0, 5)}`,
  );
  expect(await isBreached('correct horse battery staple 91')).toBe(false);
});

it('lets the password through when the service is down', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
  expect(await isBreached('anything-at-all')).toBe(false);
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }));
  expect(await isBreached('anything-at-all')).toBe(false);
});

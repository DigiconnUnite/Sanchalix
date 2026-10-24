import 'server-only';
import { createHash } from 'node:crypto';

/**
 * Whether the password is in a public list of leaked passwords. Only the first five characters of its SHA-1 leave the
 * server (the k-anonymity range API), never the password. If the service can't be reached the answer is "no", so a
 * network problem never stops anyone changing their password.
 */
export async function isBreached(password: string) {
  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return false;
    const suffix = sha1.slice(5);
    return (await response.text()).split('\n').some((line) => {
      const [hash, count] = line.trim().split(':');
      return hash === suffix && Number(count) > 0;
    });
  } catch {
    return false;
  }
}

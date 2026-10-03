import { expect, it } from 'vitest';
import { formatMoney, splitByPercent, toMinor } from './money';

it('parses rupees into paise and rejects anything that is not an amount', () => {
  expect(toMinor('12500')).toBe(1_250_000);
  expect(toMinor(' 12500.5 ')).toBe(1_250_050);
  expect(toMinor('0.07')).toBe(7);
  for (const bad of ['', '-5', '12,500', '1.234', 'abc', '1e5']) expect(toMinor(bad)).toBeNull();
});

it('formats paise with Indian digit grouping and paise only when present', () => {
  expect(formatMoney(1_250_000)).toBe('₹12,500');
  expect(formatMoney(11_760_000)).toBe('₹1,17,600');
  expect(formatMoney(1_250_050)).toBe('₹12,500.50');
});

it('splits an amount so the parts always add up to the whole', () => {
  expect(splitByPercent(100_000, [25, 25, 25, 25])).toEqual([25_000, 25_000, 25_000, 25_000]);
  const thirds = splitByPercent(100_001, [33, 33, 34]);
  expect(thirds).toEqual([33_000, 33_000, 34_001]);
  expect(thirds.reduce((sum, part) => sum + part, 0)).toBe(100_001);
  expect(splitByPercent(999, [100])).toEqual([999]);
});
